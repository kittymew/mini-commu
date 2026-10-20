-- Profile images are reserved by a member, validated by the server, then attached
-- through the character RPC. A new immutable path is used for every replacement.
create function public.reserve_profile_asset() returns uuid
language plpgsql security definer set search_path = '' as $$
declare caller uuid := private.lock_active_member(); asset_id uuid := gen_random_uuid();
begin
  if (select count(*) from public.assets a join private.asset_owners o on o.asset_id=a.id
    where o.user_id=caller and a.storage_path like 'profiles/%' and a.created_at>clock_timestamp()-interval '1 hour')>=20 then
    raise exception using errcode='54000', message='UPLOAD_RATE_LIMIT';
  end if;
  insert into public.assets(id,storage_path,thumbnail_path,mime_type,size_bytes,status)
    values(asset_id,'profiles/'||asset_id||'/main.webp','profiles/'||asset_id||'/thumb.webp','image/webp',1,'pending');
  insert into private.asset_owners(asset_id,user_id) values(asset_id,caller);
  return asset_id;
end;
$$;
create function public.finalize_profile_asset(target_id uuid, owner_id uuid, stored_bytes integer, accepted boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  -- EXECUTE is service_role only; owner_id comes from Auth getUser in the handler.
  perform 1 from private.members where user_id=owner_id and status='active' for update;
  if not found then raise exception using errcode='42501',message='ACTIVE_MEMBER_REQUIRED'; end if;
  if accepted is null or stored_bytes is null or stored_bytes not between 1 and 5242880 then raise exception using errcode='22023',message='INVALID_INPUT'; end if;
  update public.assets a set status=case when accepted then 'ready' else 'rejected' end,size_bytes=stored_bytes
    where a.id=target_id and a.status='pending' and a.storage_path='profiles/'||target_id||'/main.webp'
    and exists(select 1 from private.asset_owners o where o.asset_id=a.id and o.user_id=owner_id);
  if not found then raise exception using errcode='22023',message='INVALID_ASSET'; end if;
end;
$$;
revoke all on function public.reserve_profile_asset() from public,anon,service_role;
grant execute on function public.reserve_profile_asset() to authenticated;
revoke all on function public.finalize_profile_asset(uuid,uuid,integer,boolean) from public,anon,authenticated;
grant execute on function public.finalize_profile_asset(uuid,uuid,integer,boolean) to service_role;
