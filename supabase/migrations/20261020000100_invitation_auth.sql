-- Attempts return domain errors instead of raising: failed attempts must commit.
create table private.invite_attempts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null,
  attempts integer not null check (attempts between 1 and 5)
);
alter table private.invite_attempts enable row level security;
revoke all on private.invite_attempts from public, anon, authenticated;

create function public.redeem_invite(invite_code text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  member_status text;
  invitation private.invite_codes%rowtype;
  attempt private.invite_attempts%rowtype;
begin
  if caller is null then return 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from auth.users where id = caller and email_confirmed_at is not null) then
    return 'EMAIL_REQUIRED';
  end if;
  -- Same lock ordering as all membership/admin mutations. Serializes retries,
  -- suspension and invitation redemption, including the last remaining use.
  update private.admin_guard set revision = revision + 1 where id;
  select status into member_status from private.members where user_id = caller;
  if member_status = 'suspended' then return 'SUSPENDED'; end if;
  if member_status = 'active' then return 'ALREADY_MEMBER'; end if;

  select * into attempt from private.invite_attempts where user_id = caller for update;
  if found and attempt.window_start > clock_timestamp() - interval '15 minutes' and attempt.attempts >= 5 then
    return 'RATE_LIMITED';
  end if;
  insert into private.invite_attempts(user_id, window_start, attempts)
    values(caller, clock_timestamp(), 1)
    on conflict(user_id) do update set
      attempts = case when private.invite_attempts.window_start <= clock_timestamp() - interval '15 minutes' then 1 else private.invite_attempts.attempts + 1 end,
      window_start = case when private.invite_attempts.window_start <= clock_timestamp() - interval '15 minutes' then clock_timestamp() else private.invite_attempts.window_start end;
  if invite_code is null or invite_code !~ '^[0-9a-f]{64}$' then return 'INVALID_INVITE'; end if;
  select * into invitation from private.invite_codes
    where code_hash = encode(extensions.digest(invite_code, 'sha256'), 'hex') for update;
  if not found or invitation.revoked_at is not null or invitation.expires_at <= clock_timestamp()
    or invitation.used_count >= invitation.max_uses then return 'INVALID_INVITE'; end if;

  insert into private.members(user_id) values(caller);
  insert into private.invite_redemptions(invite_id, user_id) values(invitation.id, caller);
  update private.invite_codes set used_count = used_count + 1 where id = invitation.id;
  delete from private.invite_attempts where user_id = caller;
  return 'JOINED';
end;
$$;
revoke all on function public.redeem_invite(text) from public, anon, service_role;
grant execute on function public.redeem_invite(text) to authenticated;

-- Operations APIs; the complete administrator UI is stage 6. Never list raw codes/hashes.
create function public.issue_invite(valid_days integer default 7, use_limit integer default 1)
returns table(invite_id uuid, code text)
language plpgsql security definer set search_path = '' as $$
declare raw_code text; new_id uuid;
begin
  update private.admin_guard set revision = revision + 1 where id;
  if not private.is_admin() then raise exception using errcode = '42501', message = 'ADMIN_REQUIRED'; end if;
  if valid_days is null or valid_days not between 1 and 365 or use_limit is null or use_limit not between 1 and 1000 then
    raise exception using errcode = '22023', message = 'INVALID_INPUT';
  end if;
  raw_code := encode(extensions.gen_random_bytes(32), 'hex');
  insert into private.invite_codes(code_hash, expires_at, max_uses, created_by)
    values(encode(extensions.digest(raw_code, 'sha256'), 'hex'), clock_timestamp() + make_interval(days => valid_days), use_limit, auth.uid()) returning id into new_id;
  insert into private.moderation_logs(actor_user_id, action, reason) values(auth.uid(), 'invite:issue', new_id::text);
  return query select new_id, raw_code;
end;
$$;
create function public.list_invites() returns table(id uuid, expires_at timestamptz, max_uses integer, used_count integer, revoked_at timestamptz, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception using errcode = '42501', message = 'ADMIN_REQUIRED'; end if;
  return query select i.id, i.expires_at, i.max_uses, i.used_count, i.revoked_at, i.created_at
    from private.invite_codes i order by i.created_at desc limit 100;
end;
$$;
create function public.update_invite(target_id uuid, expiry timestamptz, use_limit integer, revoke_code boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update private.admin_guard set revision = revision + 1 where id;
  if not private.is_admin() then raise exception using errcode = '42501', message = 'ADMIN_REQUIRED'; end if;
  if expiry is null or use_limit is null or use_limit not between 1 and 1000 or revoke_code is null then
    raise exception using errcode = '22023', message = 'INVALID_INPUT';
  end if;
  update private.invite_codes set expires_at = expiry, max_uses = use_limit,
    revoked_at = case when revoke_code then coalesce(revoked_at, clock_timestamp()) else revoked_at end
    where id = target_id and used_count <= use_limit;
  if not found then raise exception using errcode = '22023', message = 'INVALID_INPUT'; end if;
  insert into private.moderation_logs(actor_user_id, action, reason) values(auth.uid(), 'invite:update', target_id::text);
end;
$$;
revoke all on function public.issue_invite(integer,integer), public.list_invites(), public.update_invite(uuid,timestamptz,integer,boolean) from public, anon, service_role;
grant execute on function public.issue_invite(integer,integer), public.list_invites(), public.update_invite(uuid,timestamptz,integer,boolean) to authenticated;
