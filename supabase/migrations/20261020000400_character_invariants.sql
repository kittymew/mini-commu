create function private.preserve_ownership() returns trigger
language plpgsql set search_path='' as $$
begin
  if new is distinct from old then raise exception using errcode='23514',message='OWNERSHIP_IMMUTABLE'; end if;
  return new;
end;
$$;
create trigger character_owner_immutable before update on private.character_owners for each row execute function private.preserve_ownership();
create trigger content_owner_immutable before update on private.content_owners for each row execute function private.preserve_ownership();
create trigger asset_owner_immutable before update on private.asset_owners for each row execute function private.preserve_ownership();
create function private.character_owner_capacity() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform 1 from private.members where user_id=new.user_id for update;
  if exists(select 1 from public.characters where id=new.character_id and status='active') and
    (select count(*) from public.characters c join private.character_owners o on o.character_id=c.id where o.user_id=new.user_id and c.status='active')>=6 then
    raise exception using errcode='23514',message='CHARACTER_LIMIT';
  end if;
  return new;
end;
$$;
create trigger character_owner_capacity before insert on private.character_owners for each row execute function private.character_owner_capacity();
create function private.character_invariants() returns trigger
language plpgsql security definer set search_path='' as $$
declare owner_id uuid;
begin
  if row(new.id,new.created_at) is distinct from row(old.id,old.created_at) then raise exception using errcode='23514',message='CHARACTER_IDENTITY_IMMUTABLE'; end if;
  if old.status='deleted' and new is distinct from old then raise exception using errcode='23514',message='CHARACTER_DELETED'; end if;
  if new.status='active' and old.status<>'active' then
    select user_id into owner_id from private.character_owners where character_id=old.id;
    perform 1 from private.members where user_id=owner_id for update;
    if (select count(*) from public.characters c join private.character_owners o on o.character_id=c.id where o.user_id=owner_id and c.status='active')>=6 then
      raise exception using errcode='23514',message='CHARACTER_LIMIT';
    end if;
  end if;
  return new;
end;
$$;
create trigger character_invariants before update on public.characters for each row execute function private.character_invariants();
revoke all on function private.preserve_ownership(),private.character_owner_capacity(),private.character_invariants() from public,anon,authenticated,service_role;
