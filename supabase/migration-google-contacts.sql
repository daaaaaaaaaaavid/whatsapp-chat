-- Google Contacts sync: private imported contacts + email match to WhaChat profiles.
-- Run in: Supabase → SQL Editor → Run
-- Also enable People API + contacts.readonly on the Google Cloud OAuth consent screen.

alter table public.profiles
  add column if not exists google_contacts_synced_at timestamptz;

create table if not exists public.google_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  google_resource_name text not null,
  display_name text,
  email text,
  photo_url text,
  matched_profile_id uuid references public.profiles (id) on delete set null,
  synced_at timestamptz not null default now(),
  unique (user_id, google_resource_name)
);

create index if not exists google_contacts_user_idx
  on public.google_contacts (user_id);

create index if not exists google_contacts_email_idx
  on public.google_contacts (user_id, lower(trim(email)))
  where email is not null;

create index if not exists google_contacts_matched_idx
  on public.google_contacts (matched_profile_id)
  where matched_profile_id is not null;

alter table public.google_contacts enable row level security;

drop policy if exists "google_contacts_select_own" on public.google_contacts;
create policy "google_contacts_select_own"
  on public.google_contacts for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "google_contacts_insert_own" on public.google_contacts;
create policy "google_contacts_insert_own"
  on public.google_contacts for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "google_contacts_update_own" on public.google_contacts;
create policy "google_contacts_update_own"
  on public.google_contacts for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "google_contacts_delete_own" on public.google_contacts;
create policy "google_contacts_delete_own"
  on public.google_contacts for delete
  to authenticated
  using (user_id = auth.uid());

-- Match imported emails to registered profiles (exact, case-insensitive).
-- Does not expose the full user directory — only emails the caller already imported.
create or replace function public.match_my_google_contacts()
returns setof public.profiles
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

  update public.profiles
  set google_contacts_synced_at = now()
  where id = auth.uid();

  return query
    select distinct on (p.id) p.*
    from public.profiles p
    inner join public.google_contacts gc on gc.matched_profile_id = p.id
    where gc.user_id = auth.uid()
    order by p.id, p.display_name nulls last;
end;
$$;

revoke all on function public.match_my_google_contacts() from public;
grant execute on function public.match_my_google_contacts() to authenticated;
