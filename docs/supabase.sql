-- RoboLabin pilvitili (Supabase). Aja tämä kerran: Supabase → SQL Editor → New query → liitä → Run.
-- Jokaisella käyttäjällä on yksi rivi, jossa ovat hänen RoboLab-tietonsa (projektit, kurssit, robotit, asetukset).
-- Rivitason suojaus (RLS) takaa, että jokainen näkee ja muuttaa vain omaa riviään.

create table if not exists public.user_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  -- Selaimen tallennustila on noin 5 Mt, joten isompaa ei tarvita
  constraint user_data_size check (pg_column_size(data) < 6000000)
);

alter table public.user_data enable row level security;

drop policy if exists "own data: select" on public.user_data;
drop policy if exists "own data: insert" on public.user_data;
drop policy if exists "own data: update" on public.user_data;
drop policy if exists "own data: delete" on public.user_data;
create policy "own data: select" on public.user_data for select to authenticated using ((select auth.uid()) = user_id);
create policy "own data: insert" on public.user_data for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own data: update" on public.user_data for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own data: delete" on public.user_data for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.user_data from anon;
grant select, insert, update, delete on public.user_data to authenticated;

-- Palvelin asettaa muutosajan, jotta laitteiden kellot eivät vaikuta synkronointiin
create or replace function public.user_data_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;
drop trigger if exists user_data_touch on public.user_data;
create trigger user_data_touch before insert or update on public.user_data
  for each row execute function public.user_data_touch();

-- Käyttäjä voi poistaa oman tilinsä ja kaikki tietonsa sovelluksesta (Profiili → Poista pilvitili)
create or replace function public.delete_my_account() returns void
language sql security definer set search_path = '' as $$
  delete from auth.users where id = auth.uid();
$$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
