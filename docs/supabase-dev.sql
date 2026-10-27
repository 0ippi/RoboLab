-- RoboLabin kehittäjätila (Supabase). Aja docs/supabase-plans.sql:n jälkeen: SQL Editor → New query → Run.
-- Kehittäjä voi vaihtaa oman tilinsä tason sovelluksen Tasot-sivulla testausta varten.
-- Kehittäjät lisätään tilin tunnuksella (UID), ei sähköpostilla, jotta kukaan ei saa tilaa rekisteröitymällä samalla osoitteella.

create table if not exists public.developers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.developers enable row level security;
revoke all on public.developers from anon, authenticated;

create or replace function public.am_developer() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.developers where user_id = auth.uid());
$$;
revoke all on function public.am_developer() from public, anon;
grant execute on function public.am_developer() to authenticated;

-- Vaihtaa kehittäjän oman tason. Muiden käyttäjien tasoihin ei voi koskea.
create or replace function public.dev_set_plan(p_plan text, p_seats int default 0) returns json
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.developers where user_id = auth.uid()) then raise exception 'not-developer'; end if;
  if p_plan not in ('free', 'education', 'teacher', 'pro') then raise exception 'bad-plan'; end if;
  insert into public.subscriptions (user_id, plan, seats, valid_until, source, updated_at)
  values (auth.uid(), p_plan, greatest(coalesce(p_seats, 0), 0), null, 'dev', now())
  on conflict (user_id) do update
    set plan = excluded.plan, seats = excluded.seats, valid_until = null, source = 'dev', updated_at = now();
  return json_build_object('plan', p_plan, 'valid_until', null, 'seats', greatest(coalesce(p_seats, 0), 0));
end $$;
revoke all on function public.dev_set_plan(text, int) from public, anon;
grant execute on function public.dev_set_plan(text, int) to authenticated;

-- ===== Lisenssien anto muille käyttäjille (kehittäjät) =====
-- Antaa tason pilvitilille sähköpostin perusteella. Tilin pitää olla jo luotu.
create or replace function public.dev_grant_plan(p_email text, p_plan text, p_seats int default 0, p_until timestamptz default null) returns json
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid;
begin
  if not exists (select 1 from public.developers where user_id = auth.uid()) then raise exception 'not-developer'; end if;
  if p_plan not in ('free', 'education', 'teacher', 'pro') then raise exception 'bad-plan'; end if;
  if p_until is not null and p_until <= now() then raise exception 'bad-date'; end if;
  select id into uid from auth.users where lower(email) = lower(trim(p_email));
  if uid is null then raise exception 'no-user'; end if;
  insert into public.subscriptions (user_id, plan, seats, valid_until, source, updated_at)
  values (uid, p_plan, greatest(coalesce(p_seats, 0), 0), p_until, 'manual', now())
  on conflict (user_id) do update
    set plan = excluded.plan, seats = excluded.seats, valid_until = excluded.valid_until, source = 'manual', updated_at = now();
  return json_build_object('email', lower(trim(p_email)), 'plan', p_plan, 'seats', greatest(coalesce(p_seats, 0), 0), 'valid_until', p_until);
end $$;
revoke all on function public.dev_grant_plan(text, text, int, timestamptz) from public, anon;
grant execute on function public.dev_grant_plan(text, text, int, timestamptz) to authenticated;

-- Voimassa olevat maksulliset tasot sähköposteineen (vain kehittäjille)
create or replace function public.dev_list_plans() returns json
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.developers where user_id = auth.uid()) then raise exception 'not-developer'; end if;
  return coalesce((select json_agg(json_build_object('email', u.email, 'plan', s.plan, 'seats', s.seats, 'valid_until', s.valid_until, 'source', s.source, 'updated_at', s.updated_at) order by s.updated_at desc)
    from public.subscriptions s join auth.users u on u.id = s.user_id
    where s.plan <> 'free' and (s.valid_until is null or s.valid_until > now())), '[]'::json);
end $$;
revoke all on function public.dev_list_plans() from public, anon;
grant execute on function public.dev_list_plans() to authenticated;

-- Kehittäjän lisääminen (vaihda sähköposti; tilin pitää olla jo luotu):
-- insert into public.developers (user_id) select id from auth.users where email = 'sinun@osoite.fi' on conflict do nothing;
