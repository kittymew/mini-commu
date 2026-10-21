create or replace function private.can_read_asset_path(object_path text) returns boolean
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
        or exists(select 1 from private.poll_votes v join public.polls q on q.post_id=v.poll_id join public.posts p on p.id=q.post_id
          where v.author_avatar_asset_id=a.id and p.status='published' and not q.anonymous and (q.results_policy='always'
            or q.results_policy='after_vote' and exists(select 1 from private.poll_votes mine where mine.poll_id=q.post_id and mine.user_id=auth.uid())
            or q.results_policy='after_close' and (q.closed_at is not null or q.closes_at<=statement_timestamp())))
      )
  );
$$;

create function private.poll_invariants() returns trigger language plpgsql set search_path='' as $$
begin
  if new.post_id<>old.post_id or new.created_at<>old.created_at then raise exception 'POLL_IDENTITY_IMMUTABLE'; end if;
  if old.closed_at is not null and new.closed_at is distinct from old.closed_at then raise exception 'POLL_CLOSED'; end if;
  if row(new.question,new.multiple,new.anonymous,new.revote_allowed,new.results_policy,new.closes_at) is distinct from row(old.question,old.multiple,old.anonymous,old.revote_allowed,old.results_policy,old.closes_at) then
    if old.closed_at is not null or old.closes_at<=clock_timestamp() then raise exception 'POLL_CLOSED'; end if;
    if exists(select 1 from private.poll_votes where poll_id=old.post_id) then raise exception 'POLL_FROZEN'; end if;
  end if;
  return new;
end;
$$;
create trigger poll_invariants before update on public.polls for each row execute function private.poll_invariants();
create function private.poll_option_invariants() returns trigger language plpgsql set search_path='' as $$
declare target uuid;
begin
  if tg_op='INSERT' then target:=new.poll_id; else target:=old.poll_id; end if;
  perform 1 from public.posts where id=target for update;
  if exists(select 1 from private.poll_votes where poll_id=target) then raise exception 'POLL_FROZEN'; end if;
  if exists(select 1 from public.polls where post_id=target and (closed_at is not null or closes_at<=clock_timestamp())) then raise exception 'POLL_CLOSED'; end if;
  if tg_op='UPDATE' and row(new.id,new.poll_id) is distinct from row(old.id,old.poll_id) then raise exception 'POLL_IDENTITY_IMMUTABLE'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
create trigger poll_option_invariants before insert or update or delete on public.poll_options for each row execute function private.poll_option_invariants();
create trigger poll_vote_author_immutable before update on private.poll_votes for each row execute function private.preserve_author();
revoke all on function private.poll_invariants(),private.poll_option_invariants() from public,anon,authenticated,service_role;
create or replace function public.get_post(target_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not private.is_active_member() then raise exception using errcode='42501',message='ACTIVE_MEMBER_REQUIRED'; end if;
  select jsonb_build_object('id',p.id,'category_id',p.category_id,'type',p.type,'notice',p.notice,'pin_scope',p.pin_scope,'pin_order',p.pin_order,'title',p.title,'body_json',p.body_json,'body_text',p.body_text,
    'author_character_id',p.author_character_id,'author_name_snapshot',p.author_name_snapshot,'author_avatar_asset_id',p.author_avatar_asset_id,
    'created_at',p.created_at,'updated_at',p.updated_at,'version',p.version,
    'can_edit',exists(select 1 from private.content_owners o where o.content_kind='post' and o.content_id=p.id and o.user_id=auth.uid()),
    'image_ids',coalesce((select jsonb_agg(i.asset_id order by i.position) from public.post_images i where i.post_id=p.id),'[]'::jsonb),
    'comment_count',(select count(*) from public.comments c where c.post_id=p.id and c.status='published')) into result from public.posts p where p.id=target_id and p.status='published';
  return result;
end;
$$;
