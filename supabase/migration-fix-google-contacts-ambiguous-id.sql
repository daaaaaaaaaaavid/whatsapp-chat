-- Fix "column reference id is ambiguous" when syncing Google contacts.
-- RETURNS TABLE (id ...) creates a PL/pgSQL variable named id, which clashes
-- with profiles.id / google_contacts.id. #variable_conflict use_column
-- makes every reference resolve to the table column.
-- Run in: Supabase → SQL Editor → Run

drop function if exists public.match_my_google_contacts();

create function public.match_my_google_contacts()
returns table (
  id uuid,
  email text,
  display_name text,
  avatar_url text,
  about text,
  last_seen timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  uid uuid;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'not authenticated';
  end if;

  update public.google_contacts as gc
  set matched_profile_id = null
  where gc.user_id = uid;

  update public.google_contacts as gc
  set matched_profile_id = prof.id
  from public.profiles as prof
  where gc.user_id = uid
    and gc.email is not null
    and prof.email is not null
    and lower(trim(gc.email)) = lower(trim(prof.email))
    and prof.id is distinct from uid;

  update public.profiles as prof
  set google_contacts_synced_at = now()
  where prof.id = uid;

  return query
    select distinct on (prof.id)
      prof.id,
      null::text,
      prof.display_name,
      prof.avatar_url,
      prof.about,
      prof.last_seen,
      prof.created_at
    from public.profiles as prof
    inner join public.google_contacts as gc
      on gc.matched_profile_id = prof.id
     and gc.user_id = uid
    order by prof.id, prof.display_name nulls last;
end;
$$;

revoke all on function public.match_my_google_contacts() from public;
grant execute on function public.match_my_google_contacts() to authenticated;
