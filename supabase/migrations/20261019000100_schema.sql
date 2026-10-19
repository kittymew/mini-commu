-- Stage 2: relational foundation. Feature writes are deliberately not exposed yet.
create schema if not exists private;
create extension if not exists pgcrypto with schema extensions;
revoke all on schema private from public, anon, authenticated;
revoke create on schema public from public, anon, authenticated;
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema private revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema private revoke execute on functions from public, anon, authenticated;

create table private.members (
  user_id uuid primary key references auth.users(id) on delete restrict,
  role text not null default 'member' check (role in ('member', 'admin')),
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now()
);
create table private.admin_guard (id boolean primary key default true check (id), revision bigint not null default 0);
insert into private.admin_guard(id) values (true);
create table private.invite_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  max_uses integer not null default 1 check (max_uses > 0),
  used_count integer not null default 0 check (used_count >= 0 and used_count <= max_uses),
  revoked_at timestamptz,
  created_by uuid references private.members(user_id) on delete restrict,
  created_at timestamptz not null default now()
);
create table private.invite_redemptions (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references private.invite_codes(id) on delete restrict,
  user_id uuid not null unique references private.members(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(invite_id, user_id)
);
create table public.assets (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null unique check (length(storage_path) > 0),
  thumbnail_path text unique,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes bigint not null check (size_bytes > 0),
  status text not null default 'pending' check (status in ('pending', 'ready', 'rejected')),
  created_at timestamptz not null default now()
);
create table private.asset_owners (
  asset_id uuid primary key references public.assets(id) on delete cascade,
  user_id uuid not null references private.members(user_id) on delete restrict
);
create table public.characters (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 30),
  bio text not null default '' check (char_length(bio) <= 300),
  avatar_asset_id uuid references public.assets(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'disabled', 'deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table private.character_owners (
  character_id uuid primary key references public.characters(id) on delete restrict,
  user_id uuid not null references private.members(user_id) on delete restrict
);
create index character_owners_user_idx on private.character_owners(user_id);
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
insert into public.categories(id, name) values ('00000000-0000-0000-0000-000000000001', '기본');
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete restrict,
  type text not null check (type in ('general', 'poll')),
  title text not null check (char_length(btrim(title)) between 1 and 100),
  body_json jsonb not null default '{"type":"doc","content":[]}' check (jsonb_typeof(body_json) = 'object'),
  body_text text not null default '' check (char_length(body_text) <= 5000 and position(chr(13) in body_text) = 0),
  author_character_id uuid not null references public.characters(id) on delete restrict,
  author_name_snapshot text not null check (char_length(author_name_snapshot) between 1 and 30),
  author_avatar_asset_id uuid references public.assets(id) on delete restrict,
  notice boolean not null default false,
  pin_scope text not null default 'none' check (pin_scope in ('none', 'global', 'category')),
  pin_order integer not null default 0 check (pin_order >= 0),
  status text not null default 'published' check (status in ('published', 'author_deleted', 'moderator_hidden', 'moderator_deleted')),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index posts_feed_idx on public.posts(created_at desc, id desc) where status = 'published';
create index posts_category_idx on public.posts(category_id, created_at desc, id desc) where status = 'published';
create index posts_character_idx on public.posts(author_character_id, created_at desc, id desc);
create table private.content_owners (
  content_kind text not null check (content_kind in ('post', 'comment')),
  content_id uuid not null,
  user_id uuid not null references private.members(user_id) on delete restrict,
  post_id uuid generated always as (case when content_kind = 'post' then content_id end) stored references public.posts(id) on delete restrict,
  primary key(content_kind, content_id)
);
create index content_owners_user_idx on private.content_owners(user_id, content_kind);
create table public.post_images (
  post_id uuid not null references public.posts(id) on delete restrict,
  asset_id uuid not null references public.assets(id) on delete restrict,
  position integer not null check (position between 1 and 4),
  primary key(post_id, position),
  unique(post_id, asset_id)
);
create index post_images_asset_idx on public.post_images(asset_id);
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete restrict,
  parent_id uuid,
  body text not null check (char_length(btrim(body)) between 1 and 1000 and position(chr(13) in body) = 0),
  author_character_id uuid not null references public.characters(id) on delete restrict,
  author_name_snapshot text not null check (char_length(author_name_snapshot) between 1 and 30),
  author_avatar_asset_id uuid references public.assets(id) on delete restrict,
  status text not null default 'published' check (status in ('published', 'author_deleted', 'moderator_hidden', 'moderator_deleted')),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id, post_id),
  foreign key(parent_id, post_id) references public.comments(id, post_id) on delete restrict,
  check (parent_id is distinct from id)
);
alter table private.content_owners add column comment_id uuid generated always as (case when content_kind = 'comment' then content_id end) stored references public.comments(id) on delete restrict;
create index comments_post_idx on public.comments(post_id, created_at, id);
create index comments_parent_idx on public.comments(parent_id);
create table public.polls (
  post_id uuid primary key references public.posts(id) on delete restrict,
  question text not null check (char_length(btrim(question)) between 1 and 100),
  multiple boolean not null default false,
  anonymous boolean not null default true,
  revote_allowed boolean not null default false,
  results_policy text not null default 'after_vote' check (results_policy in ('always', 'after_vote', 'after_close')),
  closes_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(post_id) on delete restrict,
  text text not null check (char_length(btrim(text)) between 1 and 100),
  position integer not null check (position between 1 and 10),
  unique(poll_id, position),
  unique(id, poll_id)
);
create table private.poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(post_id) on delete restrict,
  user_id uuid not null references private.members(user_id) on delete restrict,
  author_character_id uuid references public.characters(id) on delete restrict,
  author_name_snapshot text,
  author_avatar_asset_id uuid references public.assets(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(poll_id, user_id),
  unique(id, poll_id)
);
create table private.poll_vote_choices (
  vote_id uuid not null,
  option_id uuid not null,
  poll_id uuid not null,
  primary key(vote_id, option_id),
  foreign key(vote_id, poll_id) references private.poll_votes(id, poll_id) on delete restrict,
  foreign key(option_id, poll_id) references public.poll_options(id, poll_id) on delete restrict
);
create table private.moderation_logs (
  id bigint generated always as identity primary key,
  actor_user_id uuid references private.members(user_id) on delete restrict,
  action text not null,
  target_user_id uuid references private.members(user_id) on delete restrict,
  reason text not null check (char_length(btrim(reason)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index moderation_logs_created_idx on private.moderation_logs(created_at desc, id desc);

-- Defense in depth: future feature RPCs cannot rewrite historical authorship.
create function private.preserve_author() returns trigger language plpgsql set search_path = '' as $$
begin
  if row(new.author_character_id, new.author_name_snapshot, new.author_avatar_asset_id, new.created_at)
     is distinct from row(old.author_character_id, old.author_name_snapshot, old.author_avatar_asset_id, old.created_at) then
    raise exception using errcode = '23514', message = 'AUTHOR_IMMUTABLE';
  end if;
  return new;
end;
$$;
create trigger posts_author_immutable before update on public.posts for each row execute function private.preserve_author();
create trigger comments_author_immutable before update on public.comments for each row execute function private.preserve_author();
create function private.check_comment_parent() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and row(new.post_id, new.parent_id) is distinct from row(old.post_id, old.parent_id) then
    raise exception using errcode = '23514', message = 'COMMENT_THREAD_IMMUTABLE';
  end if;
  if new.parent_id is not null and exists(select 1 from public.comments where id = new.parent_id and parent_id is not null) then
    raise exception using errcode = '23514', message = 'REPLY_DEPTH_EXCEEDED';
  end if;
  return new;
end;
$$;
create trigger comment_parent before insert or update on public.comments for each row execute function private.check_comment_parent();
