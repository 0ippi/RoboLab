-- RoboLabin luokkahuoneet (Supabase). Aja docs/supabase-plans.sql:n jälkeen: SQL Editor → New query → Run.
-- Oppilas liittyy luokkaan luokkakoodilla ja nimimerkillä ilman tiliä. Palvelin tallentaa vain satunnaisen
-- laitetunnuksen, nimimerkin ja kurssien etenemisen (ei nimiä, sähköposteja eikä vastauksia).
-- Opettaja (luokan omistaja) näkee oppilaiden etenemisen ja valitsee kurssit, jotka luokan pitää suorittaa.

alter table public.class_activations add column if not exists alias text not null default '';
alter table public.class_activations add column if not exists seen_at timestamptz not null default now();
alter table public.classes add column if not exists courses jsonb not null default '[]'::jsonb; -- [{"id": "start", "due": "2026-11-30"}]

create table if not exists public.class_progress (
  code text not null,
  device text not null,
  course text not null,
  steps int not null default 0,
  done int not null default 0,
  finished boolean not null default false,
  hints int not null default 0,
  score int,              -- loppukokeen oikeat vastaukset (null = ei tehty)
  score_max int,
  updated_at timestamptz not null default now(),
  primary key (code, device, course),
  foreign key (code, device) references public.class_activations (code, device) on delete cascade
);
alter table public.class_progress enable row level security;
revoke all on public.class_progress from anon, authenticated;

-- Oppilas liittyy luokkaan (tai päivittää nimimerkkinsä). Sama laite ei kuluta uutta paikkaa.
create or replace function public.join_class(p_code text, p_device text, p_alias text) returns json
language plpgsql security definer set search_path = '' as $$
declare
  c public.classes%rowtype;
  used int;
  a text := left(regexp_replace(trim(coalesce(p_alias, '')), '[\x00-\x1f<>]', '', 'g'), 30);
begin
  if p_device is null or length(p_device) < 8 or length(p_device) > 64 then raise exception 'bad-device'; end if;
  if a = '' then raise exception 'no-alias'; end if;
  select * into c from public.classes where code = upper(trim(p_code));
  if not found then raise exception 'no-code'; end if;
  if c.valid_until <= now() then raise exception 'expired'; end if;
  if exists (select 1 from public.class_activations where code = c.code and device = p_device) then
    update public.class_activations set alias = a, seen_at = now() where code = c.code and device = p_device;
  else
    select count(*) into used from public.class_activations where code = c.code;
    if used >= c.seats then raise exception 'full'; end if;
    insert into public.class_activations (code, device, alias) values (c.code, p_device, a);
  end if;
  return json_build_object('plan', 'education', 'name', c.name, 'valid_until', c.valid_until, 'courses', c.courses, 'alias', a);
end $$;
revoke all on function public.join_class(text, text, text) from public;
grant execute on function public.join_class(text, text, text) to anon, authenticated;

-- Oppilaan laite hakee luokan tiedot (nimi, voimassaolo, annetut kurssit). Poistettu oppilas saa virheen.
create or replace function public.class_info(p_code text, p_device text) returns json
language plpgsql security definer set search_path = '' as $$
declare
  c public.classes%rowtype;
  a text;
begin
  select * into c from public.classes where code = upper(trim(p_code));
  if not found then raise exception 'no-code'; end if;
  if c.valid_until <= now() then raise exception 'expired'; end if;
  select alias into a from public.class_activations where code = c.code and device = p_device;
  if not found then raise exception 'no-member'; end if;
  update public.class_activations set seen_at = now() where code = c.code and device = p_device;
  return json_build_object('plan', 'education', 'name', c.name, 'valid_until', c.valid_until, 'courses', c.courses, 'alias', a);
end $$;
revoke all on function public.class_info(text, text) from public;
grant execute on function public.class_info(text, text) to anon, authenticated;

-- Oppilaan laite lähettää kurssien etenemisen: [{course, steps, done, finished, hints, score, score_max}], enintään 30 kurssia
create or replace function public.report_progress(p_code text, p_device text, p_items jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  k text := upper(trim(p_code));
  it jsonb;
  n int := 0;
begin
  if not exists (select 1 from public.class_activations a join public.classes c on c.code = a.code
                 where a.code = k and a.device = p_device and c.valid_until > now()) then raise exception 'no-member'; end if;
  if jsonb_typeof(p_items) <> 'array' then raise exception 'bad-items'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    n := n + 1;
    exit when n > 30;
    if coalesce(it->>'course', '') !~ '^[a-z0-9_-]{1,20}$' then continue; end if;
    insert into public.class_progress (code, device, course, steps, done, finished, hints, score, score_max, updated_at)
    values (k, p_device, it->>'course',
      least(greatest(coalesce((it->>'steps')::int, 0), 0), 100),
      least(greatest(coalesce((it->>'done')::int, 0), 0), 100),
      coalesce((it->>'finished')::boolean, false),
      least(greatest(coalesce((it->>'hints')::int, 0), 0), 9999),
      case when it ? 'score' and it->>'score' is not null then least(greatest((it->>'score')::int, 0), 100) end,
      case when it ? 'score_max' and it->>'score_max' is not null then least(greatest((it->>'score_max')::int, 0), 100) end,
      now())
    on conflict (code, device, course) do update set steps = excluded.steps, done = excluded.done, finished = excluded.finished,
      hints = excluded.hints, score = excluded.score, score_max = excluded.score_max, updated_at = now();
  end loop;
  update public.class_activations set seen_at = now() where code = k and device = p_device;
end $$;
revoke all on function public.report_progress(text, text, jsonb) from public;
grant execute on function public.report_progress(text, text, jsonb) to anon, authenticated;

-- Opettaja: luokan oppilaat ja heidän etenemisensä (vain luokan omistaja)
create or replace function public.class_overview(p_code text) returns json
language plpgsql stable security definer set search_path = '' as $$
declare
  c public.classes%rowtype;
begin
  select * into c from public.classes where code = upper(trim(p_code)) and teacher_id = auth.uid();
  if not found then raise exception 'not-owner'; end if;
  return json_build_object('code', c.code, 'name', c.name, 'seats', c.seats, 'valid_until', c.valid_until, 'courses', c.courses,
    'students', coalesce((select json_agg(json_build_object('device', a.device, 'alias', a.alias, 'joined', a.created_at, 'seen', a.seen_at,
      'progress', coalesce((select json_agg(json_build_object('course', p.course, 'steps', p.steps, 'done', p.done, 'finished', p.finished,
        'hints', p.hints, 'score', p.score, 'score_max', p.score_max, 'updated', p.updated_at)) from public.class_progress p
        where p.code = a.code and p.device = a.device), '[]'::json)) order by lower(a.alias))
      from public.class_activations a where a.code = c.code), '[]'::json));
end $$;
revoke all on function public.class_overview(text) from public, anon;
grant execute on function public.class_overview(text) to authenticated;

-- Opettaja: kurssit, jotka luokan pitää suorittaa ([{id, due}], enintään 20)
create or replace function public.set_class_courses(p_code text, p_courses jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if jsonb_typeof(p_courses) <> 'array' or jsonb_array_length(p_courses) > 20 then raise exception 'bad-courses'; end if;
  update public.classes set courses = (
    select coalesce(jsonb_agg(jsonb_build_object('id', e->>'id', 'due', nullif(left(coalesce(e->>'due', ''), 10), ''))), '[]'::jsonb)
    from jsonb_array_elements(p_courses) e where coalesce(e->>'id', '') ~ '^[a-z0-9_-]{1,20}$')
  where code = upper(trim(p_code)) and teacher_id = auth.uid();
  if not found then raise exception 'not-owner'; end if;
end $$;
revoke all on function public.set_class_courses(text, jsonb) from public, anon;
grant execute on function public.set_class_courses(text, jsonb) to authenticated;

-- Opettaja: poistaa oppilaan luokasta (paikka vapautuu, eteneminen poistuu)
create or replace function public.remove_student(p_code text, p_device text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.classes where code = upper(trim(p_code)) and teacher_id = auth.uid()) then raise exception 'not-owner'; end if;
  delete from public.class_activations where code = upper(trim(p_code)) and device = p_device;
end $$;
revoke all on function public.remove_student(text, text) from public, anon;
grant execute on function public.remove_student(text, text) to authenticated;
