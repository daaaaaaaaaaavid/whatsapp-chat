-- Status lifetime and per-status audience controls.
-- Run in: Supabase -> SQL Editor -> New query -> Run

alter table public.statuses
  add column if not exists audience_mode text not null default 'contacts',
  add column if not exists audience_user_ids uuid[] not null default '{}'::uuid[];

alter table public.statuses
  alter column expires_at set default (now() + interval '12 hours');

-- Existing statuses must also disappear no later than 12 hours after publication.
update public.statuses
set expires_at = least(expires_at, created_at + interval '12 hours')
where expires_at > created_at + interval '12 hours';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'statuses_audience_mode_check'
      and conrelid = 'public.statuses'::regclass
  ) then
    alter table public.statuses
      add constraint statuses_audience_mode_check
      check (audience_mode in ('contacts', 'contacts_except', 'selected_contacts'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'statuses_max_12h_check'
      and conrelid = 'public.statuses'::regclass
  ) then
    alter table public.statuses
      add constraint statuses_max_12h_check
      check (expires_at <= created_at + interval '12 hours');
  end if;
end $$;

create or replace function public.can_view_status(
  p_owner_id uuid,
  p_audience_mode text,
  p_audience_user_ids uuid[]
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    auth.uid() = p_owner_id
    or (
      public.is_known_contact(p_owner_id)
      and case p_audience_mode
        when 'contacts_except' then not (auth.uid() = any(coalesce(p_audience_user_ids, '{}'::uuid[])))
        when 'selected_contacts' then auth.uid() = any(coalesce(p_audience_user_ids, '{}'::uuid[]))
        else true
      end
    );
$$;

revoke all on function public.can_view_status(uuid, text, uuid[]) from public;
grant execute on function public.can_view_status(uuid, text, uuid[]) to authenticated;

drop policy if exists "statuses_select_authenticated" on public.statuses;
create policy "statuses_select_authenticated"
  on public.statuses for select
  to authenticated
  using (
    expires_at > now()
    and public.can_view_status(user_id, audience_mode, audience_user_ids)
  );

drop policy if exists "statuses_insert_own" on public.statuses;
create policy "statuses_insert_own"
  on public.statuses for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and expires_at <= created_at + interval '12 hours'
  );

drop policy if exists "status_views_insert" on public.status_views;
create policy "status_views_insert"
  on public.status_views for insert
  to authenticated
  with check (
    viewer_id = auth.uid()
    and exists (
      select 1 from public.statuses s
      where s.id = status_id
        and s.expires_at > now()
        and public.can_view_status(s.user_id, s.audience_mode, s.audience_user_ids)
    )
  );

drop policy if exists "status_replies_select" on public.status_replies;
create policy "status_replies_select"
  on public.status_replies for select
  to authenticated
  using (
    exists (
      select 1 from public.statuses s
      where s.id = status_id
        and s.expires_at > now()
        and public.can_view_status(s.user_id, s.audience_mode, s.audience_user_ids)
    )
  );

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
        and public.can_view_status(s.user_id, s.audience_mode, s.audience_user_ids)
    )
  );
