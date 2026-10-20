-- Stage 5. All writes stay behind authenticated, allowlisted RPCs.
alter table public.categories add column version integer not null default 1 check(version>0);
grant select(version) on public.categories to authenticated;
create table private.category_guard(id boolean primary key default true check(id));
insert into private.category_guard values(true);
alter table private.category_guard enable row level security;
revoke all on private.category_guard from public,anon,authenticated;

-- A bounded, closed JSON grammar. Plain text is derived here, never trusted input.
create function private.document_text(document jsonb) returns text language plpgsql immutable set search_path='' as $$
declare block jsonb; node jsonb; mark jsonb; result text:=''; line text; seen text[]; block_count integer:=0;
begin
  if document is null or octet_length(document::text)>131072 or jsonb_typeof(document)<>'object'
    or document->>'type' is distinct from 'doc' or document-'type'-'content'<>'{}'::jsonb
    or jsonb_typeof(document->'content') is distinct from 'array' or jsonb_array_length(document->'content')>100 then
    raise exception using errcode='22023',message='INVALID_DOCUMENT';
  end if;
  for block in select value from jsonb_array_elements(document->'content') loop
    if jsonb_typeof(block)<>'object' or block->>'type' is null or block->>'type' not in ('paragraph','bullet','ordered')
      or block-'type'-'content'<>'{}'::jsonb or jsonb_typeof(block->'content') is distinct from 'array'
      or jsonb_array_length(block->'content')>200 then raise exception using errcode='22023',message='INVALID_DOCUMENT'; end if;
    line:='';
    for node in select value from jsonb_array_elements(block->'content') loop
      if jsonb_typeof(node)<>'object' or node->>'type' is distinct from 'text' or jsonb_typeof(node->'text') is distinct from 'string'
        or position(chr(13) in node->>'text')>0 or node-'type'-'text'-'marks'<>'{}'::jsonb then raise exception using errcode='22023',message='INVALID_DOCUMENT'; end if;
      if node ? 'marks' then
        if jsonb_typeof(node->'marks')<>'array' or jsonb_array_length(node->'marks')>3 then raise exception using errcode='22023',message='INVALID_DOCUMENT'; end if;
        seen:='{}';
        for mark in select value from jsonb_array_elements(node->'marks') loop
          if jsonb_typeof(mark)<>'object' or mark->>'type' is null or mark->>'type' not in ('bold','italic','link') or mark->>'type'=any(seen) then raise exception using errcode='22023',message='INVALID_DOCUMENT'; end if;
          seen:=array_append(seen,mark->>'type');
          if mark->>'type'='link' then
            if mark-'type'-'href'<>'{}'::jsonb or jsonb_typeof(mark->'href') is distinct from 'string' or char_length(mark->>'href')>2048
              or mark->>'href' !~ '^https?://[^[:space:][:cntrl:]]+$' then raise exception using errcode='22023',message='INVALID_LINK'; end if;
          elsif mark-'type'<>'{}'::jsonb then raise exception using errcode='22023',message='INVALID_DOCUMENT'; end if;
        end loop;
      end if;
      line:=line||(node->>'text');
    end loop;
    if block_count>0 then result:=result||E'\n'; end if;
    result:=result||line;block_count:=block_count+1;
  end loop;
  if char_length(result)>5000 then raise exception using errcode='22023',message='BODY_TOO_LONG'; end if;
  return result;
end;
$$;
create function private.content_invariants() returns trigger language plpgsql set search_path='' as $$
begin
  if new.id<>old.id or new.type<>old.type then raise exception using errcode='23514',message='POST_IDENTITY_IMMUTABLE'; end if;
  return new;
end;
$$;
create trigger post_identity before update on public.posts for each row execute function private.content_invariants();

create function private.lock_category() returns void language plpgsql security definer set search_path='' as $$
begin perform 1 from private.category_guard where id for share; end;
$$;
create function public.save_category(category_name text, position_value integer, target_id uuid default null, expected_version integer default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
  update private.admin_guard set revision=revision+1 where id;
  perform private.lock_active_member();
  if not private.is_admin() then raise exception using errcode='42501',message='ADMIN_REQUIRED'; end if;
  perform 1 from private.category_guard where id for update;
  if category_name is null or char_length(btrim(category_name)) not between 1 and 100 or position_value is null or position_value not between 0 and 10000 then raise exception using errcode='22023',message='INVALID_INPUT'; end if;
  if target_id is null then
    insert into public.categories(name,sort_order) values(btrim(category_name),position_value) returning id into result;
  else
    update public.categories set name=btrim(category_name),sort_order=position_value,version=version+1 where id=target_id and version=expected_version returning id into result;
    if not found then raise exception using errcode='40001',message='CONTENT_CONFLICT'; end if;
  end if;
  return result;
end;
$$;
create function public.delete_category(target_id uuid,expected_version integer,move_to uuid default null) returns void
language plpgsql security definer set search_path='' as $$
begin
  update private.admin_guard set revision=revision+1 where id;
  perform private.lock_active_member();
  if not private.is_admin() then raise exception using errcode='42501',message='ADMIN_REQUIRED'; end if;
  perform 1 from private.category_guard where id for update;
  if (select count(*) from public.categories)<=1 then raise exception using errcode='23514',message='LAST_CATEGORY'; end if;
  if not exists(select 1 from public.categories where id=target_id and version=expected_version) then raise exception using errcode='40001',message='CONTENT_CONFLICT'; end if;
  if exists(select 1 from public.posts where category_id=target_id) then
    if move_to is null or move_to=target_id or not exists(select 1 from public.categories where id=move_to) then raise exception using errcode='22023',message='CATEGORY_DESTINATION_REQUIRED'; end if;
    update public.posts set category_id=move_to,version=version+1,updated_at=clock_timestamp() where category_id=target_id;
  end if;
  delete from public.categories where id=target_id;
end;
$$;
create function public.move_post_category(target_id uuid,expected_version integer,category_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  update private.admin_guard set revision=revision+1 where id;
  perform private.lock_active_member();
  if not private.is_admin() then raise exception using errcode='42501',message='ADMIN_REQUIRED'; end if;
  perform private.lock_category();
  if not exists(select 1 from public.categories c where c.id=move_post_category.category_id) then raise exception using errcode='22023',message='INVALID_CATEGORY'; end if;
  update public.posts p set category_id=move_post_category.category_id,version=version+1,updated_at=clock_timestamp() where p.id=target_id and p.version=expected_version and p.status='published';
  if not found then raise exception using errcode='40001',message='CONTENT_CONFLICT'; end if;
end;
$$;
create function private.replace_post_images(target uuid, ids uuid[], caller uuid) returns void
language plpgsql security definer set search_path='' as $$
declare item uuid;
begin
  if ids is null or cardinality(ids)>4 or cardinality(ids)<>(select count(distinct value) from unnest(ids) value) then raise exception using errcode='22023',message='IMAGE_LIMIT'; end if;
  for item in select value from unnest(ids) value order by value loop
    perform 1 from public.assets a join private.asset_owners o on o.asset_id=a.id where a.id=item and a.status='ready' and a.storage_path like 'attachments/%' and o.user_id=caller for share of a;
    if not found then raise exception using errcode='22023',message='INVALID_ASSET'; end if;
  end loop;
  delete from public.post_images where post_id=target;
  insert into public.post_images(post_id,asset_id,position) select target,value,ordinality from unnest(ids) with ordinality as items(value,ordinality);
end;
$$;
create function public.create_post(request_id uuid,character_id uuid,category_id uuid,post_title text,document jsonb,image_ids uuid[] default '{}') returns uuid
language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.lock_active_member(); plain text;
begin
  if exists(select 1 from private.content_owners where content_kind='post' and content_id=request_id and user_id=caller) then return request_id; end if;
  perform private.lock_category();
  if request_id is null or post_title is null or char_length(btrim(post_title)) not between 1 and 100 then raise exception using errcode='22023',message='INVALID_INPUT'; end if;
  if not exists(select 1 from public.categories c where c.id=create_post.category_id) then raise exception using errcode='22023',message='INVALID_CATEGORY'; end if;
  plain:=private.document_text(document);
  insert into public.posts(id,category_id,type,title,body_json,body_text,author_character_id,author_name_snapshot)
    values(request_id,category_id,'general',btrim(post_title),document,plain,character_id,'server');
  perform private.replace_post_images(request_id,image_ids,caller);
  return request_id;
end;
$$;
create function public.update_post(target_id uuid,expected_version integer,category_id uuid,post_title text,document jsonb,image_ids uuid[] default '{}') returns void
language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.lock_active_member(); p public.posts%rowtype; plain text;
begin
  perform private.lock_category();
  select * into p from public.posts where id=target_id and status='published' for update;
  if not found or not exists(select 1 from private.content_owners where content_kind='post' and content_id=target_id and user_id=caller) then raise exception using errcode='42501',message='CONTENT_NOT_OWNED'; end if;
  if p.version is distinct from expected_version then raise exception using errcode='40001',message='CONTENT_CONFLICT'; end if;
  if post_title is null or char_length(btrim(post_title)) not between 1 and 100 then raise exception using errcode='22023',message='INVALID_INPUT'; end if;
  if not exists(select 1 from public.categories c where c.id=update_post.category_id) then raise exception using errcode='22023',message='INVALID_CATEGORY'; end if;
  plain:=private.document_text(document);
  perform private.replace_post_images(target_id,image_ids,caller);
  update public.posts set category_id=update_post.category_id,title=btrim(post_title),body_json=document,body_text=plain,version=version+1,updated_at=clock_timestamp() where id=target_id;
end;
$$;
create function public.delete_post(target_id uuid,expected_version integer) returns void
language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.lock_active_member(); p public.posts%rowtype;
begin
  select * into p from public.posts where id=target_id for update;
  if not found or not exists(select 1 from private.content_owners where content_kind='post' and content_id=target_id and user_id=caller) then raise exception using errcode='42501',message='CONTENT_NOT_OWNED'; end if;
  if p.status='author_deleted' then return; end if;
  if p.status<>'published' then raise exception using errcode='42501',message='CONTENT_UNAVAILABLE'; end if;
  if p.version is distinct from expected_version then raise exception using errcode='40001',message='CONTENT_CONFLICT'; end if;
  update public.posts set status='author_deleted',version=version+1,updated_at=clock_timestamp() where id=target_id;
end;
$$;
create function public.create_comment(request_id uuid,target_post uuid,character_id uuid,comment_body text,parent_comment uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.lock_active_member();
begin
  if exists(select 1 from private.content_owners where content_kind='comment' and content_id=request_id and user_id=caller) then return request_id; end if;
  perform 1 from public.posts where id=target_post and status='published' for share;
  if not found then raise exception using errcode='42501',message='CONTENT_UNAVAILABLE'; end if;
  if request_id is null or comment_body is null or char_length(btrim(replace(replace(comment_body,E'\r\n',E'\n'),E'\r',E'\n'))) not between 1 and 1000 then raise exception using errcode='22023',message='INVALID_INPUT'; end if;
  if parent_comment is not null then
    perform 1 from public.comments where id=parent_comment and post_id=target_post and parent_id is null and status='published' for share;
    if not found then raise exception using errcode='22023',message='INVALID_PARENT'; end if;
  end if;
  insert into public.comments(id,post_id,parent_id,body,author_character_id,author_name_snapshot)
    values(request_id,target_post,parent_comment,btrim(replace(replace(comment_body,E'\r\n',E'\n'),E'\r',E'\n')),character_id,'server');
  return request_id;
end;
$$;
create function public.change_comment(target_id uuid,expected_version integer,comment_body text default null,remove boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.lock_active_member(); c public.comments%rowtype;
begin
  -- Lock post before comment, matching creation and parent/reply operations.
  perform 1 from public.posts p join public.comments ch on ch.post_id=p.id where ch.id=target_id and p.status='published' for share of p;
  if not found then raise exception using errcode='42501',message='CONTENT_UNAVAILABLE'; end if;
  select * into c from public.comments where id=target_id for update;
  if not exists(select 1 from private.content_owners where content_kind='comment' and content_id=target_id and user_id=caller) then raise exception using errcode='42501',message='CONTENT_NOT_OWNED'; end if;
  if remove and c.status='author_deleted' then return; end if;
  if c.status<>'published' then raise exception using errcode='42501',message='CONTENT_UNAVAILABLE'; end if;
  if c.version is distinct from expected_version then raise exception using errcode='40001',message='CONTENT_CONFLICT'; end if;
  if remove is null or (not remove and (comment_body is null or char_length(btrim(replace(replace(comment_body,E'\r\n',E'\n'),E'\r',E'\n'))) not between 1 and 1000)) then raise exception using errcode='22023',message='INVALID_INPUT'; end if;
  update public.comments set body=case when remove then body else btrim(replace(replace(comment_body,E'\r\n',E'\n'),E'\r',E'\n')) end,status=case when remove then 'author_deleted' else 'published' end,version=version+1,updated_at=clock_timestamp() where id=target_id;
end;
$$;

-- DTOs include only account-relative ownership booleans, never account identifiers.
create function public.list_posts(category_filter uuid default null,before_time timestamptz default null,before_id uuid default null)
returns table(id uuid,category_id uuid,title text,excerpt text,author_character_id uuid,author_name_snapshot text,author_avatar_asset_id uuid,created_at timestamptz,updated_at timestamptz,version integer,image_id uuid,comment_count bigint)
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.is_active_member() then raise exception using errcode='42501',message='ACTIVE_MEMBER_REQUIRED'; end if;
  if (before_time is null)<>(before_id is null) then raise exception using errcode='22023',message='INVALID_CURSOR'; end if;
  return query select p.id,p.category_id,p.title,left(p.body_text,180),p.author_character_id,p.author_name_snapshot,p.author_avatar_asset_id,p.created_at,p.updated_at,p.version,
    (select i.asset_id from public.post_images i where i.post_id=p.id order by i.position limit 1),
    (select count(*) from public.comments c where c.post_id=p.id and c.status='published')
    from public.posts p where p.status='published' and (category_filter is null or p.category_id=category_filter)
    and (before_time is null or (p.created_at,p.id)<(before_time,before_id)) order by p.created_at desc,p.id desc limit 20;
end;
$$;
create function public.get_post(target_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not private.is_active_member() then raise exception using errcode='42501',message='ACTIVE_MEMBER_REQUIRED'; end if;
  select jsonb_build_object('id',p.id,'category_id',p.category_id,'type',p.type,'title',p.title,'body_json',p.body_json,'body_text',p.body_text,
    'author_character_id',p.author_character_id,'author_name_snapshot',p.author_name_snapshot,'author_avatar_asset_id',p.author_avatar_asset_id,
    'created_at',p.created_at,'updated_at',p.updated_at,'version',p.version,
    'can_edit',exists(select 1 from private.content_owners o where o.content_kind='post' and o.content_id=p.id and o.user_id=auth.uid()),
    'image_ids',coalesce((select jsonb_agg(i.asset_id order by i.position) from public.post_images i where i.post_id=p.id),'[]'::jsonb),
    'comment_count',(select count(*) from public.comments c where c.post_id=p.id and c.status='published')) into result from public.posts p where p.id=target_id and p.status='published';
  return result;
end;
$$;
create function public.list_comments(target_post uuid,after_time timestamptz default null,after_id uuid default null)
returns table(id uuid,parent_id uuid,body text,author_character_id uuid,author_name_snapshot text,author_avatar_asset_id uuid,created_at timestamptz,updated_at timestamptz,version integer,deleted boolean,can_edit boolean)
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.can_read_post(target_post) then raise exception using errcode='42501',message='CONTENT_UNAVAILABLE'; end if;
  if (after_time is null)<>(after_id is null) then raise exception using errcode='22023',message='INVALID_CURSOR'; end if;
  return query select c.id,c.parent_id,case when c.status='published' then c.body end,
    case when c.status='published' then c.author_character_id end,case when c.status='published' then c.author_name_snapshot end,
    case when c.status='published' then c.author_avatar_asset_id end,c.created_at,c.updated_at,c.version,c.status<>'published',
    c.status='published' and exists(select 1 from private.content_owners o where o.content_kind='comment' and o.content_id=c.id and o.user_id=auth.uid())
    from public.comments c where c.post_id=target_post and (c.status='published' or (c.parent_id is null and exists(select 1 from public.comments r where r.parent_id=c.id and r.status='published')))
    and (after_time is null or (c.created_at,c.id)>(after_time,after_id)) order by c.created_at,c.id limit 50;
end;
$$;

revoke all on function private.document_text(jsonb),private.content_invariants(),private.lock_category(),private.replace_post_images(uuid,uuid[],uuid) from public,anon,authenticated,service_role;
revoke all on function public.save_category(text,integer,uuid,integer),public.delete_category(uuid,integer,uuid),public.move_post_category(uuid,integer,uuid),public.create_post(uuid,uuid,uuid,text,jsonb,uuid[]),public.update_post(uuid,integer,uuid,text,jsonb,uuid[]),public.delete_post(uuid,integer),public.create_comment(uuid,uuid,uuid,text,uuid),public.change_comment(uuid,integer,text,boolean),public.list_posts(uuid,timestamptz,uuid),public.get_post(uuid),public.list_comments(uuid,timestamptz,uuid) from public,anon,service_role;
grant execute on function public.save_category(text,integer,uuid,integer),public.delete_category(uuid,integer,uuid),public.move_post_category(uuid,integer,uuid),public.create_post(uuid,uuid,uuid,text,jsonb,uuid[]),public.update_post(uuid,integer,uuid,text,jsonb,uuid[]),public.delete_post(uuid,integer),public.create_comment(uuid,uuid,uuid,text,uuid),public.change_comment(uuid,integer,text,boolean),public.list_posts(uuid,timestamptz,uuid),public.get_post(uuid),public.list_comments(uuid,timestamptz,uuid) to authenticated;
