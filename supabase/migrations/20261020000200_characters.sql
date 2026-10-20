-- Character mutations lock the account row before inspecting capacity/status.
alter table public.characters add column version integer not null default 1 check(version > 0);
grant select(version) on public.characters to authenticated;
create function private.lock_active_member() returns uuid
language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid(); member_status text;
begin
  select status into member_status from private.members where user_id=caller for update;
  if caller is null or member_status is distinct from 'active' then
    raise exception using errcode='42501', message='ACTIVE_MEMBER_REQUIRED';
  end if;
  return caller;
end;
$$;
create function private.check_avatar(asset_id uuid, caller uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if asset_id is not null and not exists(select 1 from public.assets a join private.asset_owners o on o.asset_id=a.id
    where a.id=check_avatar.asset_id and a.status='ready' and o.user_id=caller) then
    raise exception using errcode='22023', message='INVALID_AVATAR';
  end if;
end;
$$;
create function public.list_my_characters(page_offset integer default 0)
returns setof public.characters language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_active_member() then raise exception using errcode='42501', message='ACTIVE_MEMBER_REQUIRED'; end if;
  if page_offset is null or page_offset < 0 then raise exception using errcode='22023', message='INVALID_INPUT'; end if;
  return query select c.* from public.characters c join private.character_owners o on o.character_id=c.id
    where o.user_id=auth.uid() and c.status<>'deleted'
    order by (c.status='active') desc, c.created_at, c.id offset page_offset limit 50;
end;
$$;
create function public.create_character(character_name text, character_bio text default '', avatar_id uuid default null, request_id uuid default gen_random_uuid())
returns uuid language plpgsql security definer set search_path = '' as $$
declare caller uuid := private.lock_active_member();
begin
  -- The caller-generated UUID doubles as an idempotency key, never as ownership.
  if exists(select 1 from private.character_owners where character_id=request_id and user_id=caller) then return request_id; end if;
  if request_id is null or character_name is null or char_length(btrim(character_name)) not between 1 and 30
    or character_bio is null or char_length(replace(replace(character_bio,E'\r\n',E'\n'),E'\r',E'\n'))>300 then
    raise exception using errcode='22023', message='INVALID_INPUT';
  end if;
  if (select count(*) from public.characters c join private.character_owners o on o.character_id=c.id
      where o.user_id=caller and c.status='active') >= 6 then
    raise exception using errcode='23514', message='CHARACTER_LIMIT';
  end if;
  perform private.check_avatar(avatar_id, caller);
  insert into public.characters(id,name,bio,avatar_asset_id) values(request_id,btrim(character_name),replace(replace(character_bio,E'\r\n',E'\n'),E'\r',E'\n'),avatar_id);
  insert into private.character_owners(character_id,user_id) values(request_id,caller);
  return request_id;
end;
$$;
create function public.update_character(target_id uuid, expected_version integer, character_name text, character_bio text, avatar_id uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare caller uuid := private.lock_active_member(); c public.characters%rowtype;
begin
  select ch.* into c from public.characters ch join private.character_owners o on o.character_id=ch.id
    where ch.id=target_id and o.user_id=caller and ch.status<>'deleted' for update of ch;
  if not found then raise exception using errcode='42501', message='CHARACTER_NOT_OWNED'; end if;
  if expected_version is distinct from c.version then raise exception using errcode='40001', message='CHARACTER_CONFLICT'; end if;
  if character_name is null or char_length(btrim(character_name)) not between 1 and 30 or character_bio is null
    or char_length(replace(replace(character_bio,E'\r\n',E'\n'),E'\r',E'\n'))>300 then raise exception using errcode='22023', message='INVALID_INPUT'; end if;
  perform private.check_avatar(avatar_id,caller);
  update public.characters set name=btrim(character_name),bio=replace(replace(character_bio,E'\r\n',E'\n'),E'\r',E'\n'),avatar_asset_id=avatar_id,version=version+1,updated_at=clock_timestamp() where id=target_id;
end;
$$;
create function public.set_character_status(target_id uuid, expected_version integer, new_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare caller uuid := private.lock_active_member(); c public.characters%rowtype;
begin
  if new_status is null or new_status not in ('active','disabled','deleted') then raise exception using errcode='22023', message='INVALID_INPUT'; end if;
  select ch.* into c from public.characters ch join private.character_owners o on o.character_id=ch.id
    where ch.id=target_id and o.user_id=caller for update of ch;
  if not found then raise exception using errcode='42501', message='CHARACTER_NOT_OWNED'; end if;
  if c.status='deleted' and new_status='deleted' then return; end if;
  if c.status='deleted' then raise exception using errcode='22023', message='CHARACTER_DELETED'; end if;
  if expected_version is distinct from c.version then raise exception using errcode='40001', message='CHARACTER_CONFLICT'; end if;
  if new_status='active' and c.status<>'active' and (select count(*) from public.characters ch join private.character_owners o on o.character_id=ch.id
    where o.user_id=caller and ch.status='active')>=6 then raise exception using errcode='23514', message='CHARACTER_LIMIT'; end if;
  update public.characters set status=new_status,version=version+1,updated_at=clock_timestamp() where id=target_id;
end;
$$;

-- Server-generated authorship for future post/comment write RPCs. SQL-owner fixture
-- imports without an Auth identity remain possible; browser direct writes stay revoked.
create function private.capture_content_author() returns trigger
language plpgsql security definer set search_path = '' as $$
declare caller uuid; c public.characters%rowtype;
begin
  if auth.uid() is null and current_setting('role') not in ('anon','authenticated','service_role') then return new; end if;
  caller := private.lock_active_member();
  select ch.* into c from public.characters ch join private.character_owners o on o.character_id=ch.id
    where ch.id=new.author_character_id and ch.status='active' and o.user_id=caller for share of ch;
  if not found then raise exception using errcode='42501', message='CHARACTER_NOT_OWNED'; end if;
  new.author_name_snapshot := c.name;
  new.author_avatar_asset_id := c.avatar_asset_id;
  new.created_at := clock_timestamp();
  return new;
end;
$$;
create function private.capture_content_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null then
    insert into private.content_owners(content_kind,content_id,user_id) values(case when tg_table_name='posts' then 'post' else 'comment' end,new.id,auth.uid());
  end if;
  return new;
end;
$$;
create trigger posts_capture_author before insert on public.posts for each row execute function private.capture_content_author();
create trigger comments_capture_author before insert on public.comments for each row execute function private.capture_content_author();
create trigger posts_capture_owner after insert on public.posts for each row execute function private.capture_content_owner();
create trigger comments_capture_owner after insert on public.comments for each row execute function private.capture_content_owner();

-- Asset read API reveals only accessible paths, never the uploader's account.
create function public.get_asset_paths(asset_ids uuid[])
returns table(id uuid, storage_path text, thumbnail_path text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_active_member() then raise exception using errcode='42501', message='ACTIVE_MEMBER_REQUIRED'; end if;
  if coalesce(array_length(asset_ids,1),0)>50 then raise exception using errcode='22023', message='INVALID_INPUT'; end if;
  return query select a.id,a.storage_path,a.thumbnail_path from public.assets a where a.id=any(asset_ids) and a.status='ready'
    and (private.can_read_asset_path(a.storage_path) or (a.storage_path like 'profiles/%' and exists(select 1 from private.asset_owners o where o.asset_id=a.id and o.user_id=auth.uid())));
end;
$$;
create function private.can_read_owned_asset(object_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_active_member() and exists(select 1 from public.assets a join private.asset_owners o on o.asset_id=a.id
    where o.user_id=auth.uid() and a.status='ready' and a.storage_path like 'profiles/%' and (a.storage_path=object_path or a.thumbnail_path=object_path));
$$;
create policy own_asset_read on storage.objects for select to authenticated using(bucket_id='community' and private.can_read_owned_asset(name));
grant execute on function private.can_read_owned_asset(text) to authenticated;
revoke all on function private.lock_active_member(),private.check_avatar(uuid,uuid),private.capture_content_author(),private.capture_content_owner() from public,anon,authenticated,service_role;
revoke all on function public.list_my_characters(integer),public.create_character(text,text,uuid,uuid),public.update_character(uuid,integer,text,text,uuid),public.set_character_status(uuid,integer,text),public.get_asset_paths(uuid[]) from public,anon,service_role;
grant execute on function public.list_my_characters(integer),public.create_character(text,text,uuid,uuid),public.update_character(uuid,integer,text,text,uuid),public.set_character_status(uuid,integer,text),public.get_asset_paths(uuid[]) to authenticated;
revoke all on function private.can_read_owned_asset(text) from public,anon;
