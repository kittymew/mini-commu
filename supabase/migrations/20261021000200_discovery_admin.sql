create extension if not exists pg_trgm with schema extensions;
create index posts_search_trgm on public.posts using gin (lower(title || ' ' || body_text) extensions.gin_trgm_ops) where status='published';
create index posts_pin_order on public.posts(pin_scope,pin_order,created_at desc,id desc) where status='published';
alter table private.moderation_logs add column target_kind text check(target_kind in ('post','comment'));
alter table private.moderation_logs add column target_id uuid;

create function public.set_post_notice(target_id uuid,expected_version integer,is_notice boolean,scope text,pin_position integer,reason text) returns void
language plpgsql security definer set search_path='' as $$
declare p public.posts%rowtype;
begin
  update private.admin_guard set revision=revision+1 where id;
  if not private.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if is_notice is null or scope is null or scope not in ('none','global','category') or pin_position is null or pin_position<0 or reason is null or char_length(btrim(reason)) not between 1 and 1000 then raise exception 'INVALID_INPUT'; end if;
  select * into p from public.posts where id=target_id and status='published' for update;
  if not found then raise exception 'CONTENT_UNAVAILABLE'; end if;
  if p.version is distinct from expected_version then raise exception 'CONTENT_CONFLICT'; end if;
  update public.posts set notice=is_notice,pin_scope=scope,pin_order=pin_position,version=version+1,updated_at=clock_timestamp() where id=target_id;
  insert into private.moderation_logs(actor_user_id,action,target_kind,target_id,reason) values(auth.uid(),'notice:'||is_notice||',pin:'||scope||':'||pin_position,'post',target_id,btrim(reason));
end;
$$;
create function public.moderate_content(kind text,target_id uuid,expected_version integer,new_status text,reason text) returns void
language plpgsql security definer set search_path='' as $$
declare previous text; current_version integer;
begin
  update private.admin_guard set revision=revision+1 where id;
  if not private.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if kind is null or kind not in ('post','comment') or new_status is null or new_status not in ('published','moderator_hidden','moderator_deleted') or reason is null or char_length(btrim(reason)) not between 1 and 1000 then raise exception 'INVALID_INPUT'; end if;
  if kind='post' then
    select status,version into previous,current_version from public.posts where id=target_id for update;
  else
    perform 1 from public.posts p join public.comments c on c.post_id=p.id where c.id=target_id for share of p;
    select status,version into previous,current_version from public.comments where id=target_id for update;
  end if;
  if previous is null or previous in ('author_deleted','moderator_deleted') then raise exception 'CONTENT_UNAVAILABLE'; end if;
  if current_version is distinct from expected_version then raise exception 'CONTENT_CONFLICT'; end if;
  if new_status='published' and previous<>'moderator_hidden' then raise exception 'INVALID_INPUT'; end if;
  if kind='post' then update public.posts set status=new_status,version=version+1,updated_at=clock_timestamp() where id=target_id;
  else update public.comments set status=new_status,version=version+1,updated_at=clock_timestamp() where id=target_id; end if;
  insert into private.moderation_logs(actor_user_id,action,target_kind,target_id,reason) values(auth.uid(),new_status,kind,target_id,btrim(reason));
end;
$$;
-- Pin rank is part of the cursor; a pinned post appears exactly once in its matching feed.
create function public.browse_posts(category_filter uuid default null,type_filter text default null,notice_only boolean default false,query_text text default '',character_filter uuid default null,cursor jsonb default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare pattern text; result jsonb;
begin
  if not private.is_active_member() then raise exception 'ACTIVE_MEMBER_REQUIRED'; end if;
  if (type_filter is not null and type_filter not in ('general','poll')) or query_text is null or char_length(query_text)>200 or notice_only is null then raise exception 'INVALID_INPUT'; end if;
  if cursor is not null and (jsonb_typeof(cursor)<>'object' or not cursor ?& array['rank','order','time','id']) then raise exception 'INVALID_CURSOR'; end if;
  pattern:='%'||replace(replace(replace(lower(btrim(query_text)),E'\\',E'\\\\'),'%',E'\\%'),'_',E'\\_')||'%';
  with candidates as (
    select p.*,case when p.pin_scope='global' and category_filter is null or p.pin_scope='category' and category_filter=p.category_id then 0 else 1 end as rank,
      case when p.pin_scope='global' and category_filter is null or p.pin_scope='category' and category_filter=p.category_id then p.pin_order else 0 end as ordering
    from public.posts p where p.status='published' and (category_filter is null or p.category_id=category_filter) and (type_filter is null or p.type=type_filter) and (not notice_only or p.notice) and (character_filter is null or p.author_character_id=character_filter)
      and lower(p.title||' '||p.body_text) like pattern
  ), page as (
    select * from candidates p where cursor is null or p.rank>(cursor->>'rank')::integer or p.rank=(cursor->>'rank')::integer and (p.ordering>(cursor->>'order')::integer or p.ordering=(cursor->>'order')::integer and (p.created_at,p.id)<((cursor->>'time')::timestamptz,(cursor->>'id')::uuid))
    order by rank,ordering,created_at desc,id desc limit 20
  ) select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'category_id',p.category_id,'type',p.type,'notice',p.notice,'pinned',p.rank=0,'title',p.title,'excerpt',left(p.body_text,180),'author_character_id',p.author_character_id,'author_name_snapshot',p.author_name_snapshot,'author_avatar_asset_id',p.author_avatar_asset_id,'created_at',p.created_at,
    'image_id',(select i.asset_id from public.post_images i where i.post_id=p.id order by i.position limit 1),'comment_count',(select count(*) from public.comments c where c.post_id=p.id and c.status='published'),
    'cursor',jsonb_build_object('rank',p.rank,'order',p.ordering,'time',p.created_at,'id',p.id)) order by p.rank,p.ordering,p.created_at desc,p.id desc),'[]'::jsonb) into result from page p;
  return result;
end;
$$;
create function public.list_my_activity(kind_filter text default 'post',character_filter uuid default null,before_time timestamptz default null,before_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not private.is_active_member() then raise exception 'ACTIVE_MEMBER_REQUIRED'; end if;
  if kind_filter is null or kind_filter not in ('post','comment') or (before_time is null)<>(before_id is null) then raise exception 'INVALID_INPUT'; end if;
  with items as (
    select p.id,p.id as post_id,p.title as text,p.author_character_id,p.author_name_snapshot,p.created_at from public.posts p join private.content_owners o on o.content_kind='post' and o.content_id=p.id and o.user_id=auth.uid() where kind_filter='post' and p.status='published'
    union all
    select c.id,c.post_id,c.body,c.author_character_id,c.author_name_snapshot,c.created_at from public.comments c join public.posts p on p.id=c.post_id join private.content_owners o on o.content_kind='comment' and o.content_id=c.id and o.user_id=auth.uid() where kind_filter='comment' and c.status='published' and p.status='published'
  ), page as (select * from items where (character_filter is null or author_character_id=character_filter) and (before_time is null or (created_at,id)<(before_time,before_id)) order by created_at desc,id desc limit 20)
  select coalesce(jsonb_agg(to_jsonb(page) order by created_at desc,id desc),'[]'::jsonb) into result from page;
  return result;
end;
$$;
create function public.list_members(before_time timestamptz default null,before_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not private.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if (before_time is null)<>(before_id is null) then raise exception 'INVALID_CURSOR'; end if;
  select coalesce(jsonb_agg(to_jsonb(page) order by created_at desc,id desc),'[]'::jsonb) into result from (
    select m.user_id as id,u.email,m.role,m.status,m.created_at from private.members m join auth.users u on u.id=m.user_id where before_time is null or (m.created_at,m.user_id)<(before_time,before_id) order by m.created_at desc,m.user_id desc limit 20
  ) page;
  return result;
end;
$$;
create function public.list_admin_logs(before_id bigint default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not private.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  select coalesce(jsonb_agg(to_jsonb(page) order by id desc),'[]'::jsonb) into result from (
    select l.id,l.actor_user_id,u.email as actor_email,l.action,l.target_user_id,t.email as target_email,l.target_kind,l.target_id,l.reason,l.created_at from private.moderation_logs l left join auth.users u on u.id=l.actor_user_id left join auth.users t on t.id=l.target_user_id where before_id is null or l.id<before_id order by l.id desc limit 20
  ) page;
  return result;
end;
$$;
-- Dedicated moderation listing exposes metadata only; deleted/hidden bodies stay inaccessible.
create function public.list_hidden_content(kind_filter text default 'post',before_time timestamptz default null,before_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not private.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if kind_filter is null or kind_filter not in ('post','comment') or (before_time is null)<>(before_id is null) then raise exception 'INVALID_INPUT'; end if;
  with items as (
    select id,id as post_id,status,version,updated_at from public.posts where kind_filter='post' and status in ('moderator_hidden','moderator_deleted')
    union all select id,post_id,status,version,updated_at from public.comments where kind_filter='comment' and status in ('moderator_hidden','moderator_deleted')
  ), page as (select * from items where before_time is null or (updated_at,id)<(before_time,before_id) order by updated_at desc,id desc limit 20)
  select coalesce(jsonb_agg(to_jsonb(page) order by updated_at desc,id desc),'[]'::jsonb) into result from page;
  return result;
end;
$$;
revoke all on function public.set_post_notice(uuid,integer,boolean,text,integer,text),public.moderate_content(text,uuid,integer,text,text),public.browse_posts(uuid,text,boolean,text,uuid,jsonb),public.list_my_activity(text,uuid,timestamptz,uuid),public.list_members(timestamptz,uuid),public.list_admin_logs(bigint),public.list_hidden_content(text,timestamptz,uuid) from public,anon,service_role;
grant execute on function public.set_post_notice(uuid,integer,boolean,text,integer,text),public.moderate_content(text,uuid,integer,text,text),public.browse_posts(uuid,text,boolean,text,uuid,jsonb),public.list_my_activity(text,uuid,timestamptz,uuid),public.list_members(timestamptz,uuid),public.list_admin_logs(bigint),public.list_hidden_content(text,timestamptz,uuid) to authenticated;
-- Include historical (even deleted) characters that still have visible account-owned activity.
create function public.list_activity_characters() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not private.is_active_member() then raise exception 'ACTIVE_MEMBER_REQUIRED'; end if;
  with items as (
    select p.author_character_id as id,p.author_name_snapshot as name,p.created_at from public.posts p join private.content_owners o on o.content_kind='post' and o.content_id=p.id and o.user_id=auth.uid() where p.status='published'
    union all select c.author_character_id,c.author_name_snapshot,c.created_at from public.comments c join public.posts p on p.id=c.post_id join private.content_owners o on o.content_kind='comment' and o.content_id=c.id and o.user_id=auth.uid() where c.status='published' and p.status='published'
  ), unique_characters as (select distinct on(id) id,name from items order by id,created_at desc,name)
  select coalesce(jsonb_agg(to_jsonb(unique_characters) order by name,id),'[]'::jsonb) into result from unique_characters;
  return result;
end;
$$;
revoke all on function public.list_activity_characters() from public,anon,service_role;
grant execute on function public.list_activity_characters() to authenticated;
