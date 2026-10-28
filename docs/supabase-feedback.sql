-- RoboLabin viestit kehittäjälle (Ohjeet ja tuki -sivun lomake). Aja docs/supabase-dev.sql:n jälkeen: SQL Editor → New query → Run.
-- Kuka tahansa sovelluksen käyttäjä voi lähettää viestin ilman tiliä. Viestejä lukevat vain kehittäjät (taulu developers).
-- Tiedoston voi ajaa uudelleen: se ei poista olemassa olevia tietoja. Vuotta vanhemmat viestit poistuvat itsestään.

create table if not exists public.feedback (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  topic text not null default 'other',
  message text not null,
  contact text not null default '',   -- vapaaehtoinen sähköposti vastausta varten
  page text not null default '',      -- sivu, jolta Ohjeet avattiin
  version text not null default '',
  lang text not null default '',
  agent text not null default '',     -- selaimen tunniste vianetsintää varten
  user_id uuid,                       -- pilvitili, jos lähettäjä oli kirjautunut
  handled boolean not null default false
);
alter table public.feedback enable row level security;
revoke all on public.feedback from anon, authenticated;

-- Viestin lähetys. Pituudet rajataan, ja koko palvelulle tulee enintään 30 viestiä tunnissa ja 300 vuorokaudessa (roskaviestien jarru).
create or replace function public.send_feedback(p_topic text, p_message text, p_contact text, p_page text, p_version text, p_lang text, p_agent text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  m text := left(trim(coalesce(p_message, '')), 2000);
begin
  if length(m) < 3 then raise exception 'too-short'; end if;
  if (select count(*) from public.feedback where created_at > now() - interval '1 hour') >= 30
     or (select count(*) from public.feedback where created_at > now() - interval '1 day') >= 300 then raise exception 'rate'; end if;
  delete from public.feedback where created_at < now() - interval '365 days'; -- säilytysaika (tietosuojaseloste)
  insert into public.feedback (topic, message, contact, page, version, lang, agent, user_id)
  values (case when p_topic in ('bug', 'question', 'idea', 'school', 'privacy') then p_topic else 'other' end, m,
    left(trim(coalesce(p_contact, '')), 120), left(coalesce(p_page, ''), 40), left(coalesce(p_version, ''), 20),
    left(coalesce(p_lang, ''), 5), left(coalesce(p_agent, ''), 200), auth.uid());
end $$;
revoke all on function public.send_feedback(text, text, text, text, text, text, text) from public;
grant execute on function public.send_feedback(text, text, text, text, text, text, text) to anon, authenticated;

-- Kehittäjä: viimeisimmät 100 viestiä (sovelluksen Ohjeet ja tuki -sivulla)
create or replace function public.dev_list_feedback() returns json
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.developers where user_id = auth.uid()) then raise exception 'not-developer'; end if;
  return coalesce((select json_agg(f order by f.created_at desc) from (
    select id, created_at, topic, message, contact, page, version, lang, agent, handled from public.feedback order by created_at desc limit 100) f), '[]'::json);
end $$;
revoke all on function public.dev_list_feedback() from public, anon;
grant execute on function public.dev_list_feedback() to authenticated;

-- Kehittäjä: merkitse käsitellyksi tai palauta uudeksi
create or replace function public.dev_mark_feedback(p_id bigint, p_handled boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.developers where user_id = auth.uid()) then raise exception 'not-developer'; end if;
  update public.feedback set handled = coalesce(p_handled, true) where id = p_id;
end $$;
revoke all on function public.dev_mark_feedback(bigint, boolean) from public, anon;
grant execute on function public.dev_mark_feedback(bigint, boolean) to authenticated;

-- Kehittäjä: poista viesti
create or replace function public.dev_delete_feedback(p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.developers where user_id = auth.uid()) then raise exception 'not-developer'; end if;
  delete from public.feedback where id = p_id;
end $$;
revoke all on function public.dev_delete_feedback(bigint) from public, anon;
grant execute on function public.dev_delete_feedback(bigint) to authenticated;
