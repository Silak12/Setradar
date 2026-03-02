-- Phase 1 follow-up patch for authenticated browser access.

begin;

grant usage on schema public to anon, authenticated;

grant select on table public.cities, public.clubs, public.events, public.acts, public.event_acts to authenticated;

drop policy if exists "authenticated can select cities" on public.cities;
create policy "authenticated can select cities" on public.cities
for select to authenticated
using (true);

drop policy if exists "authenticated can select clubs" on public.clubs;
create policy "authenticated can select clubs" on public.clubs
for select to authenticated
using (true);

drop policy if exists "authenticated can select events" on public.events;
create policy "authenticated can select events" on public.events
for select to authenticated
using (true);

drop policy if exists "authenticated can select acts" on public.acts;
create policy "authenticated can select acts" on public.acts
for select to authenticated
using (true);

drop policy if exists "authenticated can select event_acts" on public.event_acts;
create policy "authenticated can select event_acts" on public.event_acts
for select to authenticated
using (true);

grant select, insert, update on table public.profiles to authenticated;
grant select, insert, delete on table public.favorites to authenticated;
grant select on table public.event_hypes to anon, authenticated;
grant insert, delete on table public.event_hypes to authenticated;
grant select on table public.event_hype_seed to anon, authenticated;

grant usage, select on sequence public.favorites_id_seq, public.event_hypes_id_seq to authenticated;

create or replace view public.events_with_hype as
select
  e.*,
  eht.total_hype,
  eht.real_hype,
  eht.seed_hype
from public.events e
left join public.event_hype_totals eht on eht.event_id = e.id;

grant select on table public.event_hype_totals to anon, authenticated;
grant select on table public.events_with_hype to anon, authenticated;

commit;
