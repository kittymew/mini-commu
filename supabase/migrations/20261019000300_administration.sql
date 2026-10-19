-- A single write lock serializes all membership changes, including authorization checks.
-- Updating the guard (rather than just SELECT FOR UPDATE) also fails safely under old snapshots.
create function private.protect_last_admin() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update private.admin_guard set revision = revision + 1 where id;
  if tg_op in ('UPDATE', 'DELETE') and old.role = 'admin' and old.status = 'active' then
    if tg_op = 'DELETE' or new.role <> 'admin' or new.status <> 'active' then
      if not exists(select 1 from private.members where role = 'admin' and status = 'active' and user_id <> old.user_id) then
        raise exception using errcode = '23514', message = 'LAST_ACTIVE_ADMIN';
      end if;
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger protect_last_admin before insert or update or delete on private.members
  for each row execute function private.protect_last_admin();

create function public.change_member_role(target_user_id uuid, new_role text, reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update private.admin_guard set revision = revision + 1 where id;
  if not private.is_admin() then raise exception using errcode = '42501', message = 'ADMIN_REQUIRED'; end if;
  if new_role is null or new_role not in ('member', 'admin') or reason is null or char_length(btrim(reason)) not between 1 and 1000 then
    raise exception using errcode = '22023', message = 'INVALID_INPUT';
  end if;
  update private.members set role = new_role where user_id = target_user_id;
  if not found then raise exception using errcode = 'P0002', message = 'MEMBER_NOT_FOUND'; end if;
  insert into private.moderation_logs(actor_user_id, action, target_user_id, reason)
    values (auth.uid(), 'role:' || new_role, target_user_id, reason);
end;
$$;
create function public.change_member_status(target_user_id uuid, new_status text, reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update private.admin_guard set revision = revision + 1 where id;
  if not private.is_admin() then raise exception using errcode = '42501', message = 'ADMIN_REQUIRED'; end if;
  if new_status is null or new_status not in ('active', 'suspended') or reason is null or char_length(btrim(reason)) not between 1 and 1000 then
    raise exception using errcode = '22023', message = 'INVALID_INPUT';
  end if;
  update private.members set status = new_status where user_id = target_user_id;
  if not found then raise exception using errcode = 'P0002', message = 'MEMBER_NOT_FOUND'; end if;
  insert into private.moderation_logs(actor_user_id, action, target_user_id, reason)
    values (auth.uid(), 'status:' || new_status, target_user_id, reason);
end;
$$;
create function public.get_moderation_logs(before_id bigint default null, page_size integer default 20)
returns table(id bigint, actor_user_id uuid, action text, target_user_id uuid, reason text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception using errcode = '42501', message = 'ADMIN_REQUIRED'; end if;
  if page_size is null or page_size not between 1 and 100 then
    raise exception using errcode = '22023', message = 'INVALID_INPUT';
  end if;
  return query select l.id, l.actor_user_id, l.action, l.target_user_id, l.reason, l.created_at
    from private.moderation_logs l where before_id is null or l.id < before_id order by l.id desc limit page_size;
end;
$$;
revoke all on function public.change_member_role(uuid,text,text), public.change_member_status(uuid,text,text), public.get_moderation_logs(bigint,integer) from public, anon;
grant execute on function public.change_member_role(uuid,text,text), public.change_member_status(uuid,text,text), public.get_moderation_logs(bigint,integer) to authenticated;

-- Operator-only bootstrap: SQL owner connection only, never exposed through the API.
-- The initial invitation exists before there is an administrator. Redemption is stage 3.
create function private.issue_bootstrap_invite() returns text
language plpgsql security definer set search_path = '' as $$
declare raw_code text;
begin
  update private.admin_guard set revision = revision + 1 where id;
  if exists(select 1 from private.members where role = 'admin' and status = 'active') then
    raise exception using errcode = '23514', message = 'BOOTSTRAP_ALREADY_COMPLETED';
  end if;
  if exists(select 1 from private.invite_codes where created_by is null and revoked_at is null and expires_at > now() and used_count < max_uses) then
    raise exception using errcode = '23514', message = 'BOOTSTRAP_INVITE_EXISTS';
  end if;
  raw_code := encode(extensions.gen_random_bytes(32), 'hex');
  insert into private.invite_codes(code_hash, expires_at)
    values (encode(extensions.digest(raw_code, 'sha256'), 'hex'), now() + interval '7 days');
  return raw_code;
end;
$$;
create function private.bootstrap_admin(target_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update private.admin_guard set revision = revision + 1 where id;
  if exists(select 1 from private.members where role = 'admin' and status = 'active') then
    raise exception using errcode = '23514', message = 'BOOTSTRAP_ALREADY_COMPLETED';
  end if;
  if not exists(select 1 from private.members m join auth.users u on u.id = m.user_id
    where m.user_id = target_user_id and m.status = 'active' and u.email_confirmed_at is not null
    and exists(select 1 from private.invite_redemptions r where r.user_id = m.user_id)) then
    raise exception using errcode = '23514', message = 'VERIFIED_REDEEMED_MEMBER_REQUIRED';
  end if;
  update private.members set role = 'admin' where user_id = target_user_id;
  insert into private.moderation_logs(actor_user_id, action, target_user_id, reason)
    values (null, 'bootstrap_admin', target_user_id, 'Server-only initial administrator setup');
end;
$$;
revoke all on function private.protect_last_admin(), private.issue_bootstrap_invite(), private.bootstrap_admin(uuid)
  from public, anon, authenticated, service_role;
