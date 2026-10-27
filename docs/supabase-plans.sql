-- RoboLabin tilaukset ja luokkakoodit (Supabase). Aja docs/supabase.sql:n jälkeen: SQL Editor → New query → Run.
-- Turvallisuus: käyttäjä voi vain LUKEA oman tilauksensa. Tilauksia kirjoittavat vain ylläpitäjä (Table Editor)
-- ja maksupalvelun webhook (supabase/functions/stripe-webhook, service role). Luokkakoodit käsitellään
-- funktioiden kautta, jotta paikkamäärää ei voi ohittaa.

-- ===== Tilaukset =====
create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'education', 'teacher', 'pro')),
  seats int not null default 0 check (seats >= 0),   -- opettajan ostamat lisäpaikat (5 sisältyy aina)
  valid_until timestamptz,                            -- null = toistaiseksi voimassa
  source text not null default 'manual',              -- manual | stripe | school
  stripe_customer text,
  stripe_subscription text,
  updated_at timestamptz not null default now()
);
alter table public.subscriptions enable row level security;
drop policy if exists "own subscription: select" on public.subscriptions;
create policy "own subscription: select" on public.subscriptions for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.subscriptions from anon, authenticated;
grant select on public.subscriptions to authenticated;

-- Käyttäjän voimassa oleva taso (vanhentunut = free)
create or replace function public.my_plan() returns json
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select json_build_object('plan', s.plan, 'valid_until', s.valid_until, 'seats', s.seats)
       from public.subscriptions s
      where s.user_id = auth.uid() and (s.valid_until is null or s.valid_until > now())),
    json_build_object('plan', 'free', 'valid_until', null, 'seats', 0));
$$;
revoke all on function public.my_plan() from public, anon;
grant execute on function public.my_plan() to authenticated;

-- ===== Luokat ja luokkakoodit =====
create table if not exists public.classes (
  code text primary key,
  teacher_id uuid not null references auth.users (id) on delete cascade,
  name text not null default '',
  seats int not null check (seats between 1 and 1000),
  valid_until timestamptz not null,
  created_at timestamptz not null default now()
);
create table if not exists public.class_activations (
  code text not null references public.classes (code) on delete cascade,
  device text not null,
  created_at timestamptz not null default now(),
  primary key (code, device)
);
alter table public.classes enable row level security;
alter table public.class_activations enable row level security;
drop policy if exists "teacher: own classes" on public.classes;
create policy "teacher: own classes" on public.classes for select to authenticated using ((select auth.uid()) = teacher_id);
revoke all on public.classes, public.class_activations from anon, authenticated;
grant select on public.classes to authenticated;

-- Opettaja luo luokan: paikkoja on käytössä 5 + ostetut lisäpaikat (koululisenssissä seats = koko koulu)
create or replace function public.create_class(p_name text, p_seats int) returns json
language plpgsql security definer set search_path = '' as $$
declare
  s public.subscriptions%rowtype;
  used int;
  allowed int;
  new_code text;
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i int;
begin
  select * into s from public.subscriptions
   where user_id = auth.uid() and plan in ('teacher', 'pro') and (valid_until is null or valid_until > now());
  if not found then raise exception 'not-teacher'; end if;
  if p_seats is null or p_seats < 1 then raise exception 'bad-seats'; end if;
  select coalesce(sum(seats), 0) into used from public.classes where teacher_id = auth.uid() and valid_until > now();
  allowed := 5 + s.seats;
  if used + p_seats > allowed then raise exception 'no-seats:%', allowed - used; end if;
  loop
    new_code := '';
    for i in 1..8 loop
      new_code := new_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.classes where code = new_code);
  end loop;
  insert into public.classes (code, teacher_id, name, seats, valid_until)
  values (new_code, auth.uid(), left(coalesce(p_name, ''), 60), p_seats,
          coalesce(s.valid_until, now() + interval '1 year'));
  return json_build_object('code', new_code, 'seats', p_seats);
end $$;
revoke all on function public.create_class(text, int) from public, anon;
grant execute on function public.create_class(text, int) to authenticated;

-- Opettajan luokat ja montako laitetta kuhunkin on aktivoitu
create or replace function public.my_classes() returns json
language sql stable security definer set search_path = '' as $$
  select coalesce(json_agg(json_build_object('code', c.code, 'name', c.name, 'seats', c.seats, 'valid_until', c.valid_until,
           'used', (select count(*) from public.class_activations a where a.code = c.code)) order by c.created_at), '[]'::json)
    from public.classes c where c.teacher_id = auth.uid();
$$;
revoke all on function public.my_classes() from public, anon;
grant execute on function public.my_classes() to authenticated;

create or replace function public.delete_class(p_code text) returns void
language sql security definer set search_path = '' as $$
  delete from public.classes where code = upper(p_code) and teacher_id = auth.uid();
$$;
revoke all on function public.delete_class(text) from public, anon;
grant execute on function public.delete_class(text) to authenticated;

-- Oppilas aktivoi luokkakoodin laitteelleen ilman tiliä. Sama laite voi aktivoida uudelleen kuluttamatta paikkaa.
create or replace function public.activate_class_code(p_code text, p_device text) returns json
language plpgsql security definer set search_path = '' as $$
declare
  c public.classes%rowtype;
  used int;
begin
  if p_device is null or length(p_device) < 8 or length(p_device) > 64 then raise exception 'bad-device'; end if;
  select * into c from public.classes where code = upper(trim(p_code));
  if not found then raise exception 'no-code'; end if;
  if c.valid_until <= now() then raise exception 'expired'; end if;
  if not exists (select 1 from public.class_activations where code = c.code and device = p_device) then
    select count(*) into used from public.class_activations where code = c.code;
    if used >= c.seats then raise exception 'full'; end if;
    insert into public.class_activations (code, device) values (c.code, p_device);
  end if;
  return json_build_object('plan', 'education', 'name', c.name, 'valid_until', c.valid_until);
end $$;
revoke all on function public.activate_class_code(text, text) from public;
grant execute on function public.activate_class_code(text, text) to anon, authenticated;
