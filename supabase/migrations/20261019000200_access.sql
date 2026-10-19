-- RLS determines rows. Schema privileges and explicit views determine columns.
create function private.is_active_member() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from private.members where user_id = (select auth.uid()) and status = 'active');
$$;
create function private.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from private.members where user_id = (select auth.uid()) and role = 'admin' and status = 'active');
$$;
create function private.can_read_post(target_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_active_member() and exists(select 1 from public.posts where id = target_id and status = 'published');
$$;

grant usage on schema private to authenticated;
grant execute on function private.is_active_member(), private.is_admin(), private.can_read_post(uuid) to authenticated;

-- No direct browser writes, even by an administrator. Only reviewed RPCs get EXECUTE grants.
do $$
declare item record;
begin
  for item in select schemaname, tablename from pg_tables where schemaname in ('private', 'public') loop
    execute format('alter table %I.%I enable row level security', item.schemaname, item.tablename);
    execute format('revoke all on %I.%I from public, anon, authenticated', item.schemaname, item.tablename);
  end loop;
end;
$$;
revoke all on all sequences in schema private from public, anon, authenticated;

create policy characters_read on public.characters for select to authenticated
  using ((select private.is_active_member()) and status = 'active');
create policy categories_read on public.categories for select to authenticated
  using ((select private.is_active_member()));
create policy posts_read on public.posts for select to authenticated
  using ((select private.is_active_member()) and status = 'published');
create policy comments_read on public.comments for select to authenticated
  using (private.can_read_post(post_id) and status = 'published');
create policy images_read on public.post_images for select to authenticated
  using (private.can_read_post(post_id));
create policy polls_read on public.polls for select to authenticated
  using (private.can_read_post(post_id));
create policy poll_options_read on public.poll_options for select to authenticated
  using (private.can_read_post(poll_id));

-- Explicit column grants keep future added columns private until deliberately reviewed.
grant select(id, name, bio, avatar_asset_id, status, created_at, updated_at) on public.characters to authenticated;
grant select(id, name, sort_order, created_at) on public.categories to authenticated;
grant select(id, category_id, type, title, body_json, body_text, author_character_id, author_name_snapshot,
  author_avatar_asset_id, notice, pin_scope, pin_order, status, version, created_at, updated_at) on public.posts to authenticated;
grant select(id, post_id, parent_id, body, author_character_id, author_name_snapshot, author_avatar_asset_id,
  status, version, created_at, updated_at) on public.comments to authenticated;
grant select(post_id, asset_id, position) on public.post_images to authenticated;
grant select(post_id, question, multiple, anonymous, revote_allowed, results_policy, closes_at, closed_at, created_at) on public.polls to authenticated;
grant select(id, poll_id, text, position) on public.poll_options to authenticated;

create view public.feed_posts with (security_invoker = true) as
  select id, category_id, type, title, body_json, body_text, author_character_id, author_name_snapshot,
         author_avatar_asset_id, notice, pin_scope, pin_order, version, created_at, updated_at
  from public.posts where status = 'published';
create view public.visible_comments with (security_invoker = true) as
  select id, post_id, parent_id, body, author_character_id, author_name_snapshot,
         author_avatar_asset_id, version, created_at, updated_at
  from public.comments where status = 'published';
revoke all on public.feed_posts, public.visible_comments from public, anon, authenticated;
grant select on public.feed_posts, public.visible_comments to authenticated;

-- Returning one's own status is allowed for account suspension / onboarding screens.
create function public.current_membership() returns table(role text, status text)
language sql stable security definer set search_path = '' as $$
  select m.role, m.status from private.members m where m.user_id = (select auth.uid());
$$;
revoke all on function public.current_membership() from public, anon;
grant execute on function public.current_membership() to authenticated;

-- Free-plan Storage only. No paid image transformation feature is used.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('community', 'community', false, 10485760, array['image/jpeg','image/png','image/webp']);
create function private.can_read_asset_path(object_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_active_member() and exists (
    select 1 from public.assets a
    where a.status = 'ready' and (a.storage_path = object_path or a.thumbnail_path = object_path)
      and (
        exists(select 1 from public.characters c where c.avatar_asset_id = a.id and c.status = 'active')
        or exists(select 1 from public.posts p where p.author_avatar_asset_id = a.id and p.status = 'published')
        or exists(select 1 from public.post_images i join public.posts p on p.id = i.post_id where i.asset_id = a.id and p.status = 'published')
        or exists(select 1 from public.comments c join public.posts p on p.id = c.post_id
                  where c.author_avatar_asset_id = a.id and c.status = 'published' and p.status = 'published')
      )
  );
$$;
grant execute on function private.can_read_asset_path(text) to authenticated;
-- No upload/update/delete policy until the trusted image pipeline is implemented in stage 5.
create policy community_read on storage.objects for select to authenticated
  using (bucket_id = 'community' and private.can_read_asset_path(name));

-- Remove implicit function execution, including trigger functions, from public roles.
revoke execute on all functions in schema private from public, anon;
