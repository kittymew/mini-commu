-- All voting, configuration and closing operations lock the parent post first.
-- Raw votes never receive Data API grants; only get_poll may expose policy-filtered results.
create function private.write_poll(target uuid, settings jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare deadline timestamptz;
begin
  if settings is null or jsonb_typeof(settings)<>'object' or
    (settings - array['question','options','multiple','anonymous','allow_revote','results_policy','closes_at'])<>'{}'::jsonb or
    jsonb_typeof(settings->'question') is distinct from 'string' or char_length(btrim(settings->>'question')) not between 1 and 100 or
    jsonb_typeof(settings->'options') is distinct from 'array' then raise exception 'INVALID_POLL'; end if;
  if jsonb_array_length(settings->'options') not between 2 and 10 or exists(select 1 from jsonb_array_elements(settings->'options') x where jsonb_typeof(x)<>'string' or char_length(btrim(x#>>'{}')) not between 1 and 100) or
    jsonb_typeof(settings->'multiple') is distinct from 'boolean' or jsonb_typeof(settings->'anonymous') is distinct from 'boolean' or jsonb_typeof(settings->'allow_revote') is distinct from 'boolean' or
    coalesce(settings->>'results_policy','') not in ('always','after_vote','after_close') then raise exception 'INVALID_POLL'; end if;
  deadline:=(settings->>'closes_at')::timestamptz;
  if deadline is not null and (not isfinite(deadline) or deadline<=clock_timestamp()) then raise exception 'INVALID_DEADLINE'; end if;
  insert into public.polls(post_id,question,multiple,anonymous,revote_allowed,results_policy,closes_at)
    values(target,btrim(settings->>'question'),(settings->>'multiple')::boolean,(settings->>'anonymous')::boolean,(settings->>'allow_revote')::boolean,settings->>'results_policy',deadline)
    on conflict(post_id) do update set question=excluded.question,multiple=excluded.multiple,anonymous=excluded.anonymous,revote_allowed=excluded.revote_allowed,results_policy=excluded.results_policy,closes_at=excluded.closes_at;
  delete from public.poll_options where poll_id=target;
  insert into public.poll_options(poll_id,text,position) select target,btrim(value#>>'{}'),ordinality from jsonb_array_elements(settings->'options') with ordinality;
end;
$$;
create function public.create_poll_post(request_id uuid,character_id uuid,category_id uuid,post_title text,document jsonb,settings jsonb,image_ids uuid[] default '{}') returns uuid
language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.lock_active_member(); plain text;
begin
  if exists(select 1 from private.content_owners where content_kind='post' and content_id=request_id and user_id=caller) then return request_id; end if;
  perform private.lock_category();
  if request_id is null or post_title is null or char_length(btrim(post_title)) not between 1 and 100 then raise exception 'INVALID_INPUT'; end if;
  if not exists(select 1 from public.categories c where c.id=create_poll_post.category_id) then raise exception 'INVALID_CATEGORY'; end if;
  plain:=private.document_text(document);
  insert into public.posts(id,category_id,type,title,body_json,body_text,author_character_id,author_name_snapshot)
    values(request_id,category_id,'poll',btrim(post_title),document,plain,character_id,'server');
  perform private.write_poll(request_id,settings);
  perform private.replace_post_images(request_id,image_ids,caller);
  return request_id;
end;
$$;
create function public.update_poll(target_id uuid,expected_version integer,settings jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.lock_active_member(); p public.posts%rowtype; poll public.polls%rowtype;
begin
  select * into p from public.posts where id=target_id and status='published' and type='poll' for update;
  if not found or not exists(select 1 from private.content_owners where content_kind='post' and content_id=target_id and user_id=caller) then raise exception 'CONTENT_NOT_OWNED'; end if;
  if p.version is distinct from expected_version then raise exception 'CONTENT_CONFLICT'; end if;
  select * into poll from public.polls where post_id=target_id;
  if poll.closed_at is not null or poll.closes_at<=clock_timestamp() then raise exception 'POLL_CLOSED'; end if;
  if exists(select 1 from private.poll_votes where poll_id=target_id) then raise exception 'POLL_FROZEN'; end if;
  perform private.write_poll(target_id,settings);
  update public.posts set version=version+1,updated_at=clock_timestamp() where id=target_id;
end;
$$;
create function public.submit_vote(target_id uuid,character_id uuid,option_ids uuid[]) returns void
language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.lock_active_member(); poll public.polls%rowtype; vote uuid; ch public.characters%rowtype;
begin
  perform 1 from public.posts where id=target_id and status='published' and type='poll' for update;
  if not found then raise exception 'CONTENT_UNAVAILABLE'; end if;
  select * into poll from public.polls where post_id=target_id;
  if poll.closed_at is not null or poll.closes_at<=clock_timestamp() then raise exception 'POLL_CLOSED'; end if;
  if option_ids is null or cardinality(option_ids) not between 1 and 10 or (not poll.multiple and cardinality(option_ids)<>1) or
    cardinality(option_ids)<>(select count(distinct x) from unnest(option_ids) x) or
    cardinality(option_ids)<>(select count(*) from public.poll_options where poll_id=target_id and id=any(option_ids)) then raise exception 'INVALID_CHOICES'; end if;
  select id into vote from private.poll_votes where poll_id=target_id and user_id=caller;
  if vote is not null then
    if not poll.revote_allowed then raise exception 'ALREADY_VOTED'; end if;
    delete from private.poll_vote_choices where vote_id=vote;
  else
    select c.* into ch from public.characters c join private.character_owners o on o.character_id=c.id where c.id=submit_vote.character_id and c.status='active' and o.user_id=caller for share of c;
    if not found then raise exception 'CHARACTER_NOT_OWNED'; end if;
    if not poll.anonymous and ch.avatar_asset_id is not null then perform 1 from public.assets where id=ch.avatar_asset_id and status='ready' for share; end if;
    insert into private.poll_votes(poll_id,user_id,author_character_id,author_name_snapshot,author_avatar_asset_id)
      values(target_id,caller,case when not poll.anonymous then ch.id end,case when not poll.anonymous then ch.name end,case when not poll.anonymous then ch.avatar_asset_id end) returning id into vote;
  end if;
  insert into private.poll_vote_choices(vote_id,option_id,poll_id) select vote,x,target_id from unnest(option_ids) x;
end;
$$;
create function public.close_poll(target_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  -- Administrative authorization is serialized with role revocation.
  update private.admin_guard set revision=revision+1 where id;
  perform private.lock_active_member();
  perform 1 from public.posts where id=target_id and status='published' and type='poll' for update;
  if not found then raise exception 'CONTENT_UNAVAILABLE'; end if;
  if not private.is_admin() and not exists(select 1 from private.content_owners where content_kind='post' and content_id=target_id and user_id=auth.uid()) then raise exception 'CONTENT_NOT_OWNED'; end if;
  update public.polls set closed_at=clock_timestamp() where post_id=target_id and closed_at is null;
end;
$$;
create function public.get_poll(target_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare poll public.polls%rowtype; vote uuid; closed boolean; visible boolean; owner boolean; participants bigint;
begin
  if not private.can_read_post(target_id) then raise exception 'CONTENT_UNAVAILABLE'; end if;
  select * into poll from public.polls where post_id=target_id;
  if not found then return null; end if;
  select id into vote from private.poll_votes where poll_id=target_id and user_id=auth.uid();
  closed:=poll.closed_at is not null or coalesce(poll.closes_at<=statement_timestamp(),false);
  visible:=poll.results_policy='always' or (poll.results_policy='after_vote' and vote is not null) or (poll.results_policy='after_close' and closed);
  owner:=exists(select 1 from private.content_owners where content_kind='post' and content_id=target_id and user_id=auth.uid());
  if visible then select count(*) into participants from private.poll_votes where poll_id=target_id; end if;
  return jsonb_build_object('question',poll.question,'multiple',poll.multiple,'anonymous',poll.anonymous,'allow_revote',poll.revote_allowed,'results_policy',poll.results_policy,'closes_at',poll.closes_at,'closed',closed,
    'can_close',not closed and (owner or private.is_admin()),'can_edit_settings',owner and not closed and not exists(select 1 from private.poll_votes where poll_id=target_id),
    'has_voted',vote is not null,'my_choices',coalesce((select jsonb_agg(option_id) from private.poll_vote_choices where vote_id=vote),'[]'::jsonb),
    'results_visible',visible,'participants',participants,
    'options',(select jsonb_agg(jsonb_build_object('id',o.id,'text',o.text,'count',case when visible then (select count(*) from private.poll_vote_choices c where c.option_id=o.id) end) order by o.position) from public.poll_options o where o.poll_id=target_id),
    'voters',case when visible and not poll.anonymous then coalesce((select jsonb_agg(jsonb_build_object('name',v.author_name_snapshot,'avatar_asset_id',v.author_avatar_asset_id,'choices',(select jsonb_agg(c.option_id) from private.poll_vote_choices c where c.vote_id=v.id)) order by v.created_at,v.id) from private.poll_votes v where v.poll_id=target_id),'[]'::jsonb) else '[]'::jsonb end);
end;
$$;
revoke all on function private.write_poll(uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.create_poll_post(uuid,uuid,uuid,text,jsonb,jsonb,uuid[]),public.update_poll(uuid,integer,jsonb),public.submit_vote(uuid,uuid,uuid[]),public.close_poll(uuid),public.get_poll(uuid) from public,anon,service_role;
grant execute on function public.create_poll_post(uuid,uuid,uuid,text,jsonb,jsonb,uuid[]),public.update_poll(uuid,integer,jsonb),public.submit_vote(uuid,uuid,uuid[]),public.close_poll(uuid),public.get_poll(uuid) to authenticated;
