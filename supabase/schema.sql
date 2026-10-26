create table if not exists public.plans (
  owner uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.plans enable row level security;

-- Data API privileges and row ownership are separate layers.
revoke all on public.plans from anon;
grant select, insert, update, delete on public.plans to authenticated;

drop policy if exists "Users can read own plan" on public.plans;
create policy "Users can read own plan"
on public.plans for select to authenticated
using ((select auth.uid()) = owner);

drop policy if exists "Users can create own plan" on public.plans;
create policy "Users can create own plan"
on public.plans for insert to authenticated
with check ((select auth.uid()) = owner);

drop policy if exists "Users can update own plan" on public.plans;
create policy "Users can update own plan"
on public.plans for update to authenticated
using ((select auth.uid()) = owner)
with check ((select auth.uid()) = owner);

drop policy if exists "Users can delete own plan" on public.plans;
create policy "Users can delete own plan"
on public.plans for delete to authenticated
using ((select auth.uid()) = owner);
