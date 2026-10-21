-- Member archives use an explicit public DTO. No ownership, private choices or admin data.
create function public.export_manifest(snapshot_time timestamptz default null,category_filter uuid default null,from_time timestamptz default null,until_time timestamptz default null,after_time timestamptz default null,after_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare cutoff timestamptz:=coalesce(snapshot_time,statement_timestamp()); total bigint; items jsonb;
begin
  if not private.is_active_member() then raise exception 'ACTIVE_MEMBER_REQUIRED'; end if;
  if not isfinite(cutoff) or cutoff>statement_timestamp() or (from_time is not null and not isfinite(from_time)) or (until_time is not null and not isfinite(until_time)) or from_time>=until_time or (after_time is null)<>(after_id is null) then raise exception 'INVALID_EXPORT_RANGE'; end if;
  select count(*) into total from public.posts p where p.status='published' and p.created_at<=cutoff and (category_filter is null or p.category_id=category_filter) and (from_time is null or p.created_at>=from_time) and (until_time is null or p.created_at<until_time);
  select coalesce(jsonb_agg(to_jsonb(page) order by created_at,id),'[]'::jsonb) into items from (
    select p.id,p.created_at from public.posts p where p.status='published' and p.created_at<=cutoff and (category_filter is null or p.category_id=category_filter) and (from_time is null or p.created_at>=from_time) and (until_time is null or p.created_at<until_time)
      and (after_time is null or (p.created_at,p.id)>(after_time,after_id)) order by p.created_at,p.id limit 200
  ) page;
  return jsonb_build_object('snapshot_time',cutoff,'total',total,'items',items);
end;
$$;
create function private.export_document(target uuid,with_comments boolean,with_images boolean) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p public.posts%rowtype; poll jsonb; result jsonb;
begin
  select * into p from public.posts where id=target and status='published';
  if not found then return null; end if;
  if p.type='poll' then
    poll:=public.get_poll(target);
    poll:=jsonb_build_object('question',poll->'question','multiple',poll->'multiple','anonymous',poll->'anonymous','closed',poll->'closed','closes_at',poll->'closes_at','results_policy',poll->'results_policy',
      'options',(select jsonb_agg(jsonb_build_object('id',o->'id','text',o->'text') order by ord) from jsonb_array_elements(poll->'options') with ordinality as options(o,ord)),
      'results',case when (poll->>'results_visible')::boolean then jsonb_build_object('participants',poll->'participants','options',poll->'options','voters',
        (select coalesce(jsonb_agg(jsonb_build_object('name',v->'name','avatar_asset_id',case when with_images then v->'avatar_asset_id' else 'null'::jsonb end,'choices',v->'choices') order by ord),'[]'::jsonb) from jsonb_array_elements(poll->'voters') with ordinality as voters(v,ord))) else 'null'::jsonb end);
  end if;
  select jsonb_build_object('id',p.id,'type',p.type,'title',p.title,'body',p.body_json,'body_text',p.body_text,'created_at',p.created_at,'updated_at',p.updated_at,'notice',p.notice,
    'category',jsonb_build_object('id',c.id,'name',c.name),'author',jsonb_build_object('name',p.author_name_snapshot,'avatar_asset_id',case when with_images then p.author_avatar_asset_id end),
    'images',case when with_images then coalesce((select jsonb_agg(jsonb_build_object('asset_id',i.asset_id,'position',i.position) order by i.position) from public.post_images i where i.post_id=p.id),'[]'::jsonb) else '[]'::jsonb end,
    'poll',poll,'comments',case when with_comments then coalesce((select jsonb_agg(jsonb_build_object('id',ch.id,'parent_id',ch.parent_id,'created_at',ch.created_at,'updated_at',ch.updated_at,'deleted',ch.status<>'published',
      'body',case when ch.status='published' then ch.body end,'author',case when ch.status='published' then jsonb_build_object('name',ch.author_name_snapshot,'avatar_asset_id',case when with_images then ch.author_avatar_asset_id end) else 'null'::jsonb end) order by ch.created_at,ch.id)
      from public.comments ch where ch.post_id=p.id and (ch.status='published' or ch.parent_id is null and exists(select 1 from public.comments reply where reply.parent_id=ch.id and reply.status='published'))),'[]'::jsonb) else '[]'::jsonb end) into result from public.categories c where c.id=p.category_id;
  return result;
end;
$$;
create function public.export_batch(post_ids uuid[],with_comments boolean default true,with_images boolean default true) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not private.is_active_member() then raise exception 'ACTIVE_MEMBER_REQUIRED'; end if;
  if post_ids is null or cardinality(post_ids) not between 1 and 200 or cardinality(post_ids)<>(select count(distinct x) from unnest(post_ids) x) or with_comments is null or with_images is null then raise exception 'INVALID_EXPORT_BATCH'; end if;
  if (select count(*) from public.posts where id=any(post_ids) and status='published')<>cardinality(post_ids) then raise exception 'EXPORT_CHANGED'; end if;
  with documents as materialized (select p.id,p.created_at,private.export_document(p.id,with_comments,with_images) as doc from public.posts p where p.id=any(post_ids))
  select jsonb_agg(jsonb_build_object('document',doc,'checksum',encode(extensions.digest(doc::text,'sha256'),'hex')) order by created_at,id) into result from documents;
  return result;
end;
$$;
create function public.validate_export(expected jsonb,with_comments boolean default true,with_images boolean default true) returns void
language plpgsql stable security definer set search_path='' as $$
declare item jsonb; doc jsonb;
begin
  if not private.is_active_member() then raise exception 'ACTIVE_MEMBER_REQUIRED'; end if;
  if expected is null or jsonb_typeof(expected)<>'array' or with_comments is null or with_images is null then raise exception 'INVALID_EXPORT_BATCH'; end if;
  if jsonb_array_length(expected) not between 1 and 200 then raise exception 'INVALID_EXPORT_BATCH'; end if;
  for item in select value from jsonb_array_elements(expected) loop
    doc:=private.export_document((item->>'id')::uuid,with_comments,with_images);
    if doc is null or encode(extensions.digest(doc::text,'sha256'),'hex') is distinct from item->>'checksum' then raise exception 'EXPORT_CHANGED'; end if;
  end loop;
end;
$$;
revoke all on function private.export_document(uuid,boolean,boolean) from public,anon,authenticated,service_role;
revoke all on function public.export_manifest(timestamptz,uuid,timestamptz,timestamptz,timestamptz,uuid),public.export_batch(uuid[],boolean,boolean),public.validate_export(jsonb,boolean,boolean) from public,anon,service_role;
grant execute on function public.export_manifest(timestamptz,uuid,timestamptz,timestamptz,timestamptz,uuid),public.export_batch(uuid[],boolean,boolean),public.validate_export(jsonb,boolean,boolean) to authenticated;
