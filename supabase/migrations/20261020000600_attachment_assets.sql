alter table public.assets drop constraint assets_status_check;
alter table public.assets add constraint assets_status_check check(status in ('pending','ready','rejected','deleting'));
create index asset_owners_user_idx on private.asset_owners(user_id);
create function public.reserve_post_asset() returns uuid language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.lock_active_member(); asset_id uuid:=gen_random_uuid();
begin
  if (select count(*) from public.assets a join private.asset_owners o on o.asset_id=a.id where o.user_id=caller and a.storage_path like 'attachments/%' and a.created_at>clock_timestamp()-interval '1 hour')>=60 then raise exception using errcode='54000',message='UPLOAD_RATE_LIMIT'; end if;
  insert into public.assets(id,storage_path,thumbnail_path,mime_type,size_bytes,status) values(asset_id,'attachments/'||asset_id||'/main.webp','attachments/'||asset_id||'/thumb.webp','image/webp',1,'pending');
  insert into private.asset_owners(asset_id,user_id) values(asset_id,caller);
  return asset_id;
end;
$$;
create function public.finalize_post_asset(target_id uuid,owner_id uuid,stored_bytes integer,accepted boolean) returns void language plpgsql security definer set search_path='' as $$
begin
  perform 1 from private.members where user_id=owner_id and status='active' for update;
  if not found then raise exception using errcode='42501',message='ACTIVE_MEMBER_REQUIRED'; end if;
  if accepted is null or stored_bytes is null or stored_bytes not between 1 and 5242880 then raise exception using errcode='22023',message='INVALID_INPUT'; end if;
  update public.assets a set status=case when accepted then 'ready' else 'rejected' end,size_bytes=stored_bytes where a.id=target_id and a.status='pending' and a.storage_path='attachments/'||target_id||'/main.webp' and exists(select 1 from private.asset_owners o where o.asset_id=a.id and o.user_id=owner_id);
  if not found then raise exception using errcode='22023',message='INVALID_ASSET'; end if;
end;
$$;
-- Owners may preview ready unattached uploads; hidden/deleted content does not grant access to others.
create or replace function private.can_read_owned_asset(object_path text) returns boolean
language sql stable security definer set search_path='' as $$
  select private.is_active_member() and exists(select 1 from public.assets a join private.asset_owners o on o.asset_id=a.id where o.user_id=auth.uid() and a.status='ready' and (a.storage_path like 'profiles/%' or a.storage_path like 'attachments/%') and (a.storage_path=object_path or a.thumbnail_path=object_path));
$$;
create or replace function public.get_asset_paths(asset_ids uuid[])
returns table(id uuid,storage_path text,thumbnail_path text) language plpgsql stable security definer set search_path='' as $$
begin
  if not private.is_active_member() then raise exception using errcode='42501',message='ACTIVE_MEMBER_REQUIRED'; end if;
  if coalesce(array_length(asset_ids,1),0)>50 then raise exception using errcode='22023',message='INVALID_INPUT'; end if;
  return query select a.id,a.storage_path,a.thumbnail_path from public.assets a where a.id=any(asset_ids) and a.status='ready' and (private.can_read_asset_path(a.storage_path) or private.can_read_owned_asset(a.storage_path));
end;
$$;
-- This lock participates in cleanup/attachment races, including profile snapshots.
create or replace function private.check_avatar(asset_id uuid,caller uuid) returns void language plpgsql security definer set search_path='' as $$
begin
  if asset_id is not null then
    perform 1 from public.assets a join private.asset_owners o on o.asset_id=a.id where a.id=check_avatar.asset_id and a.status='ready' and o.user_id=caller for share of a;
    if not found then raise exception using errcode='22023',message='INVALID_AVATAR'; end if;
  end if;
end;
$$;
create function private.asset_referenced(target uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.characters where avatar_asset_id=target)
    or exists(select 1 from public.posts where author_avatar_asset_id=target)
    or exists(select 1 from public.comments where author_avatar_asset_id=target)
    or exists(select 1 from public.post_images where asset_id=target)
    or exists(select 1 from private.poll_votes where author_avatar_asset_id=target);
$$;
-- Service-only two-phase cleanup. Claim under row lock, delete objects, then remove metadata.
-- Failed deletes stay 'deleting' and are retried. Old snapshots of content are retained too.
create function public.claim_unused_assets(apply_changes boolean default false)
returns table(id uuid,storage_path text,thumbnail_path text,temporary_path text) language plpgsql security definer set search_path='' as $$
declare a public.assets%rowtype;
begin
  if apply_changes is null then raise exception using errcode='22023',message='INVALID_INPUT'; end if;
  for a in select x.* from public.assets x where x.created_at<clock_timestamp()-interval '24 hours'
    and (x.storage_path like 'attachments/%' or x.storage_path like 'profiles/%')
    and not private.asset_referenced(x.id)
    order by x.id limit 100 for update skip locked loop
    if not private.asset_referenced(a.id) then
      if apply_changes then update public.assets set status='deleting' where assets.id=a.id; end if;
      id:=a.id;storage_path:=a.storage_path;thumbnail_path:=a.thumbnail_path;
      temporary_path:=case when a.storage_path like 'attachments/%' then 'temporary/'||a.id||'/source' else null end;
      return next;
    end if;
  end loop;
end;
$$;
create function public.finish_asset_cleanup(target_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.assets where id=target_id and status='deleting' for update;
  if not found or private.asset_referenced(target_id) then raise exception using errcode='22023',message='INVALID_ASSET'; end if;
  delete from public.assets where id=target_id;
end;
$$;
revoke all on function private.asset_referenced(uuid) from public,anon,authenticated,service_role;
revoke all on function public.reserve_post_asset() from public,anon,service_role;
grant execute on function public.reserve_post_asset() to authenticated;
revoke all on function public.finalize_post_asset(uuid,uuid,integer,boolean),public.claim_unused_assets(boolean),public.finish_asset_cleanup(uuid) from public,anon,authenticated;
grant execute on function public.finalize_post_asset(uuid,uuid,integer,boolean),public.claim_unused_assets(boolean),public.finish_asset_cleanup(uuid) to service_role;
