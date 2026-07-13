-- Status replies: comments on a status (not chat messages)

create table if not exists public.status_replies (
  id uuid primary key default gen_random_uuid(),
  status_id uuid not null references public.statuses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists status_replies_status_id_idx
  on public.status_replies (status_id, created_at);

alter table public.status_replies enable row level security;

-- Anyone who can see the status can read its replies
drop policy if exists "status_replies_select" on public.status_replies;
create policy "status_replies_select"
  on public.status_replies for select
  to authenticated
  using (
    exists (
      select 1 from public.statuses s
      where s.id = status_id
        and s.expires_at > now()
        and public.is_known_contact(s.user_id)
    )
  );

-- Contacts of the status owner can reply (not the owner themselves — enforced in app too)
drop policy if exists "status_replies_insert" on public.status_replies;
create policy "status_replies_insert"
  on public.status_replies for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.statuses s
      where s.id = status_id
        and s.expires_at > now()
        and s.user_id <> auth.uid()
        and public.is_known_contact(s.user_id)
    )
  );

-- Authors can delete their own replies
drop policy if exists "status_replies_delete_own" on public.status_replies;
create policy "status_replies_delete_own"
  on public.status_replies for delete
  to authenticated
  using (auth.uid() = user_id);

-- Realtime for live reply updates while viewing own status
do $$
begin
  begin
    alter publication supabase_realtime add table public.status_replies;
  exception when duplicate_object then null;
  end;
end $$;
