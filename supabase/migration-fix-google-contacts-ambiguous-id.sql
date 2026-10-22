-- Fix "column reference id is ambiguous" when syncing Google contacts.
-- The OUT column `id` in RETURNS TABLE clashed with profiles.id in the UPDATE.
-- Run in: Supabase → SQL Editor → Run

create or replace function public.match_my_google_contacts()
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
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  update public.google_contacts
  set matched_profile_id = null
  where user_id = auth.uid();

  update public.google_contacts gc
  set matched_profile_id = p.id
  from public.profiles p
  where gc.user_id = auth.uid()
    and gc.email is not null
    and p.email is not null
    and lower(trim(gc.email)) = lower(trim(p.email))
    and p.id is distinct from auth.uid();

  update public.profiles me
  set google_contacts_synced_at = now()
  where me.id = auth.uid();

  return query
    select distinct on (p.id)
      p.id,
      null::text as email,
      p.display_name,
      p.avatar_url,
      p.about,
      p.last_seen,
      p.created_at
    from public.profiles p
    inner join public.google_contacts gc on gc.matched_profile_id = p.id
    where gc.user_id = auth.uid()
    order by p.id, p.display_name nulls last;
end;
$$;

revoke all on function public.match_my_google_contacts() from public;
grant execute on function public.match_my_google_contacts() to authenticated;
