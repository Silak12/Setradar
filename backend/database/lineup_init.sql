-- Auto-generated from lineup JSON.
-- Target: PostgreSQL / Supabase SQL Editor

begin;

create table if not exists cities (
    id bigserial primary key,
    name text not null unique
);

create table if not exists clubs (
    id bigserial primary key,
    city_id bigint not null references cities(id) on delete cascade,
    name text not null,
    unique (city_id, name)
);

create table if not exists events (
    id bigserial primary key,
    club_id bigint not null references clubs(id) on delete cascade,
    event_date date not null,
    event_name text not null default '',
    time_start time null,
    time_end time null,
    interested_count integer null,
    unique (club_id, event_date, event_name)
);

alter table events add column if not exists time_start time null;
alter table events add column if not exists time_end time null;
alter table events add column if not exists interested_count integer null;

create table if not exists acts (
    id bigserial primary key,
    name text not null unique,
    insta_name text null,
    soundcloud_url text null
);

create table if not exists event_acts (
    id bigserial primary key,
    event_id bigint not null references events(id) on delete cascade,
    act_id bigint not null references acts(id) on delete restrict,
    start_time time null,
    end_time time null,
    sort_order integer not null default 0,
    unique (event_id, act_id)
);

-- Compatibility migration for older schema versions
do $$
begin
    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'event_acts'
          and column_name = 'set_start_time'
    ) and not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'event_acts'
          and column_name = 'start_time'
    ) then
        alter table event_acts rename column set_start_time to start_time;
    end if;

    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'event_acts'
          and column_name = 'act_time'
    ) and not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'event_acts'
          and column_name = 'start_time'
    ) then
        alter table event_acts rename column act_time to start_time;
    end if;
end
$$;

alter table event_acts add column if not exists start_time time null;
alter table event_acts add column if not exists end_time time null;
alter table acts add column if not exists insta_name text null;
alter table acts add column if not exists soundcloud_url text null;

-- Grants for anon role
grant usage on schema public to anon;
grant select, insert, update on table cities, clubs, events, acts, event_acts to anon;
grant usage, select, update on all sequences in schema public to anon;

-- RLS policies for anon role
alter table cities enable row level security;
alter table clubs enable row level security;
alter table events enable row level security;
alter table acts enable row level security;
alter table event_acts enable row level security;

drop policy if exists "anon can select cities" on cities;
create policy "anon can select cities" on cities
for select to anon
using (true);

drop policy if exists "anon can insert cities" on cities;
create policy "anon can insert cities" on cities
for insert to anon
with check (true);

drop policy if exists "anon can select clubs" on clubs;
create policy "anon can select clubs" on clubs
for select to anon
using (true);

drop policy if exists "anon can insert clubs" on clubs;
create policy "anon can insert clubs" on clubs
for insert to anon
with check (true);

drop policy if exists "anon can select events" on events;
create policy "anon can select events" on events
for select to anon
using (true);

drop policy if exists "anon can insert events" on events;
create policy "anon can insert events" on events
for insert to anon
with check (true);

drop policy if exists "anon can select acts" on acts;
create policy "anon can select acts" on acts
for select to anon
using (true);

drop policy if exists "anon can insert acts" on acts;
create policy "anon can insert acts" on acts
for insert to anon
with check (true);

drop policy if exists "anon can update acts" on acts;
create policy "anon can update acts" on acts
for update to anon
using (true)
with check (true);

drop policy if exists "anon can select event_acts" on event_acts;
create policy "anon can select event_acts" on event_acts
for select to anon
using (true);

drop policy if exists "anon can insert event_acts" on event_acts;
create policy "anon can insert event_acts" on event_acts
for insert to anon
with check (true);

drop policy if exists "anon can update event_acts" on event_acts;
create policy "anon can update event_acts" on event_acts
for update to anon
using (true)
with check (true);

-- Optional compatibility for existing 'items' table
do $$
begin
    if to_regclass('public.items') is not null then
        grant select on table items to anon;
        alter table items enable row level security;
        drop policy if exists "anon can select items" on items;
        create policy "anon can select items" on items
        for select to anon
        using (true);
    end if;
end
$$;


insert into cities (name) values ('Berlin') on conflict (name) do nothing;

insert into clubs (city_id, name)
select c.id, 'Lokschuppen'
from cities c
where c.name = 'Berlin'
on conflict (city_id, name) do nothing;

insert into events (club_id, event_date, event_name, time_start, time_end)
select cl.id, '2026-02-27'::date, 'Candyflip x Wyldhearts', '23:00'::time, '09:00'::time
from clubs cl
join cities c on c.id = cl.city_id
where c.name = 'Berlin' and cl.name = 'Lokschuppen'
on conflict (club_id, event_date, event_name) do update set
  time_start = coalesce(excluded.time_start, events.time_start),
  time_end = coalesce(excluded.time_end, events.time_end);

insert into acts (name, insta_name)
values ('DATSKO', null)
on conflict (name) do update set
  insta_name = coalesce(excluded.insta_name, acts.insta_name);

insert into event_acts (event_id, act_id, start_time, end_time, sort_order)
select e.id, a.id, null, null, 1
from events e
join clubs cl on cl.id = e.club_id
join cities c on c.id = cl.city_id
join acts a on a.name = 'DATSKO'
where c.name = 'Berlin'
  and cl.name = 'Lokschuppen'
  and e.event_date = '2026-02-27'::date
  and e.event_name = 'Candyflip x Wyldhearts'
on conflict (event_id, act_id) do update set
  start_time = coalesce(excluded.start_time, event_acts.start_time),
  end_time = coalesce(excluded.end_time, event_acts.end_time),
  sort_order = excluded.sort_order;

insert into acts (name, insta_name)
values ('SZG', null)
on conflict (name) do update set
  insta_name = coalesce(excluded.insta_name, acts.insta_name);

insert into event_acts (event_id, act_id, start_time, end_time, sort_order)
select e.id, a.id, null, null, 2
from events e
join clubs cl on cl.id = e.club_id
join cities c on c.id = cl.city_id
join acts a on a.name = 'SZG'
where c.name = 'Berlin'
  and cl.name = 'Lokschuppen'
  and e.event_date = '2026-02-27'::date
  and e.event_name = 'Candyflip x Wyldhearts'
on conflict (event_id, act_id) do update set
  start_time = coalesce(excluded.start_time, event_acts.start_time),
  end_time = coalesce(excluded.end_time, event_acts.end_time),
  sort_order = excluded.sort_order;

insert into acts (name, insta_name)
values ('BabaBass3000', null)
on conflict (name) do update set
  insta_name = coalesce(excluded.insta_name, acts.insta_name);

insert into event_acts (event_id, act_id, start_time, end_time, sort_order)
select e.id, a.id, null, null, 3
from events e
join clubs cl on cl.id = e.club_id
join cities c on c.id = cl.city_id
join acts a on a.name = 'BabaBass3000'
where c.name = 'Berlin'
  and cl.name = 'Lokschuppen'
  and e.event_date = '2026-02-27'::date
  and e.event_name = 'Candyflip x Wyldhearts'
on conflict (event_id, act_id) do update set
  start_time = coalesce(excluded.start_time, event_acts.start_time),
  end_time = coalesce(excluded.end_time, event_acts.end_time),
  sort_order = excluded.sort_order;

insert into acts (name, insta_name)
values ('DJ Tallboy', null)
on conflict (name) do update set
  insta_name = coalesce(excluded.insta_name, acts.insta_name);

insert into event_acts (event_id, act_id, start_time, end_time, sort_order)
select e.id, a.id, null, null, 4
from events e
join clubs cl on cl.id = e.club_id
join cities c on c.id = cl.city_id
join acts a on a.name = 'DJ Tallboy'
where c.name = 'Berlin'
  and cl.name = 'Lokschuppen'
  and e.event_date = '2026-02-27'::date
  and e.event_name = 'Candyflip x Wyldhearts'
on conflict (event_id, act_id) do update set
  start_time = coalesce(excluded.start_time, event_acts.start_time),
  end_time = coalesce(excluded.end_time, event_acts.end_time),
  sort_order = excluded.sort_order;

insert into acts (name, insta_name)
values ('SUITSIDE', null)
on conflict (name) do update set
  insta_name = coalesce(excluded.insta_name, acts.insta_name);

insert into event_acts (event_id, act_id, start_time, end_time, sort_order)
select e.id, a.id, null, null, 5
from events e
join clubs cl on cl.id = e.club_id
join cities c on c.id = cl.city_id
join acts a on a.name = 'SUITSIDE'
where c.name = 'Berlin'
  and cl.name = 'Lokschuppen'
  and e.event_date = '2026-02-27'::date
  and e.event_name = 'Candyflip x Wyldhearts'
on conflict (event_id, act_id) do update set
  start_time = coalesce(excluded.start_time, event_acts.start_time),
  end_time = coalesce(excluded.end_time, event_acts.end_time),
  sort_order = excluded.sort_order;

insert into acts (name, insta_name)
values ('HugoBass303', null)
on conflict (name) do update set
  insta_name = coalesce(excluded.insta_name, acts.insta_name);

insert into event_acts (event_id, act_id, start_time, end_time, sort_order)
select e.id, a.id, null, null, 6
from events e
join clubs cl on cl.id = e.club_id
join cities c on c.id = cl.city_id
join acts a on a.name = 'HugoBass303'
where c.name = 'Berlin'
  and cl.name = 'Lokschuppen'
  and e.event_date = '2026-02-27'::date
  and e.event_name = 'Candyflip x Wyldhearts'
on conflict (event_id, act_id) do update set
  start_time = coalesce(excluded.start_time, event_acts.start_time),
  end_time = coalesce(excluded.end_time, event_acts.end_time),
  sort_order = excluded.sort_order;

insert into acts (name, insta_name)
values ('Nachtwasser', null)
on conflict (name) do update set
  insta_name = coalesce(excluded.insta_name, acts.insta_name);

insert into event_acts (event_id, act_id, start_time, end_time, sort_order)
select e.id, a.id, null, null, 7
from events e
join clubs cl on cl.id = e.club_id
join cities c on c.id = cl.city_id
join acts a on a.name = 'Nachtwasser'
where c.name = 'Berlin'
  and cl.name = 'Lokschuppen'
  and e.event_date = '2026-02-27'::date
  and e.event_name = 'Candyflip x Wyldhearts'
on conflict (event_id, act_id) do update set
  start_time = coalesce(excluded.start_time, event_acts.start_time),
  end_time = coalesce(excluded.end_time, event_acts.end_time),
  sort_order = excluded.sort_order;

insert into acts (name, insta_name)
values ('Atzendent', null)
on conflict (name) do update set
  insta_name = coalesce(excluded.insta_name, acts.insta_name);

insert into event_acts (event_id, act_id, start_time, end_time, sort_order)
select e.id, a.id, null, null, 8
from events e
join clubs cl on cl.id = e.club_id
join cities c on c.id = cl.city_id
join acts a on a.name = 'Atzendent'
where c.name = 'Berlin'
  and cl.name = 'Lokschuppen'
  and e.event_date = '2026-02-27'::date
  and e.event_name = 'Candyflip x Wyldhearts'
on conflict (event_id, act_id) do update set
  start_time = coalesce(excluded.start_time, event_acts.start_time),
  end_time = coalesce(excluded.end_time, event_acts.end_time),
  sort_order = excluded.sort_order;

insert into acts (name, insta_name)
values ('OSKAMAXX', null)
on conflict (name) do update set
  insta_name = coalesce(excluded.insta_name, acts.insta_name);

insert into event_acts (event_id, act_id, start_time, end_time, sort_order)
select e.id, a.id, null, null, 9
from events e
join clubs cl on cl.id = e.club_id
join cities c on c.id = cl.city_id
join acts a on a.name = 'OSKAMAXX'
where c.name = 'Berlin'
  and cl.name = 'Lokschuppen'
  and e.event_date = '2026-02-27'::date
  and e.event_name = 'Candyflip x Wyldhearts'
on conflict (event_id, act_id) do update set
  start_time = coalesce(excluded.start_time, event_acts.start_time),
  end_time = coalesce(excluded.end_time, event_acts.end_time),
  sort_order = excluded.sort_order;

insert into acts (name, insta_name)
values ('MIMI404', null)
on conflict (name) do update set
  insta_name = coalesce(excluded.insta_name, acts.insta_name);

insert into event_acts (event_id, act_id, start_time, end_time, sort_order)
select e.id, a.id, null, null, 10
from events e
join clubs cl on cl.id = e.club_id
join cities c on c.id = cl.city_id
join acts a on a.name = 'MIMI404'
where c.name = 'Berlin'
  and cl.name = 'Lokschuppen'
  and e.event_date = '2026-02-27'::date
  and e.event_name = 'Candyflip x Wyldhearts'
on conflict (event_id, act_id) do update set
  start_time = coalesce(excluded.start_time, event_acts.start_time),
  end_time = coalesce(excluded.end_time, event_acts.end_time),
  sort_order = excluded.sort_order;

insert into acts (name, insta_name)
values ('Blossmbae', null)
on conflict (name) do update set
  insta_name = coalesce(excluded.insta_name, acts.insta_name);

insert into event_acts (event_id, act_id, start_time, end_time, sort_order)
select e.id, a.id, null, null, 11
from events e
join clubs cl on cl.id = e.club_id
join cities c on c.id = cl.city_id
join acts a on a.name = 'Blossmbae'
where c.name = 'Berlin'
  and cl.name = 'Lokschuppen'
  and e.event_date = '2026-02-27'::date
  and e.event_name = 'Candyflip x Wyldhearts'
on conflict (event_id, act_id) do update set
  start_time = coalesce(excluded.start_time, event_acts.start_time),
  end_time = coalesce(excluded.end_time, event_acts.end_time),
  sort_order = excluded.sort_order;

insert into acts (name, insta_name)
values ('bbymeister', null)
on conflict (name) do update set
  insta_name = coalesce(excluded.insta_name, acts.insta_name);

insert into event_acts (event_id, act_id, start_time, end_time, sort_order)
select e.id, a.id, null, null, 12
from events e
join clubs cl on cl.id = e.club_id
join cities c on c.id = cl.city_id
join acts a on a.name = 'bbymeister'
where c.name = 'Berlin'
  and cl.name = 'Lokschuppen'
  and e.event_date = '2026-02-27'::date
  and e.event_name = 'Candyflip x Wyldhearts'
on conflict (event_id, act_id) do update set
  start_time = coalesce(excluded.start_time, event_acts.start_time),
  end_time = coalesce(excluded.end_time, event_acts.end_time),
  sort_order = excluded.sort_order;

insert into acts (name, insta_name)
values ('jeanska', null)
on conflict (name) do update set
  insta_name = coalesce(excluded.insta_name, acts.insta_name);

insert into event_acts (event_id, act_id, start_time, end_time, sort_order)
select e.id, a.id, null, null, 13
from events e
join clubs cl on cl.id = e.club_id
join cities c on c.id = cl.city_id
join acts a on a.name = 'jeanska'
where c.name = 'Berlin'
  and cl.name = 'Lokschuppen'
  and e.event_date = '2026-02-27'::date
  and e.event_name = 'Candyflip x Wyldhearts'
on conflict (event_id, act_id) do update set
  start_time = coalesce(excluded.start_time, event_acts.start_time),
  end_time = coalesce(excluded.end_time, event_acts.end_time),
  sort_order = excluded.sort_order;

insert into acts (name, insta_name)
values ('subga', null)
on conflict (name) do update set
  insta_name = coalesce(excluded.insta_name, acts.insta_name);

insert into event_acts (event_id, act_id, start_time, end_time, sort_order)
select e.id, a.id, null, null, 14
from events e
join clubs cl on cl.id = e.club_id
join cities c on c.id = cl.city_id
join acts a on a.name = 'subga'
where c.name = 'Berlin'
  and cl.name = 'Lokschuppen'
  and e.event_date = '2026-02-27'::date
  and e.event_name = 'Candyflip x Wyldhearts'
on conflict (event_id, act_id) do update set
  start_time = coalesce(excluded.start_time, event_acts.start_time),
  end_time = coalesce(excluded.end_time, event_acts.end_time),
  sort_order = excluded.sort_order;

insert into acts (name, insta_name)
values ('elfie', null)
on conflict (name) do update set
  insta_name = coalesce(excluded.insta_name, acts.insta_name);

insert into event_acts (event_id, act_id, start_time, end_time, sort_order)
select e.id, a.id, null, null, 15
from events e
join clubs cl on cl.id = e.club_id
join cities c on c.id = cl.city_id
join acts a on a.name = 'elfie'
where c.name = 'Berlin'
  and cl.name = 'Lokschuppen'
  and e.event_date = '2026-02-27'::date
  and e.event_name = 'Candyflip x Wyldhearts'
on conflict (event_id, act_id) do update set
  start_time = coalesce(excluded.start_time, event_acts.start_time),
  end_time = coalesce(excluded.end_time, event_acts.end_time),
  sort_order = excluded.sort_order;

insert into acts (name, insta_name)
values ('Louv', 'louv.mp3')
on conflict (name) do update set
  insta_name = coalesce(excluded.insta_name, acts.insta_name);

insert into event_acts (event_id, act_id, start_time, end_time, sort_order)
select e.id, a.id, null, null, 16
from events e
join clubs cl on cl.id = e.club_id
join cities c on c.id = cl.city_id
join acts a on a.name = 'Louv'
where c.name = 'Berlin'
  and cl.name = 'Lokschuppen'
  and e.event_date = '2026-02-27'::date
  and e.event_name = 'Candyflip x Wyldhearts'
on conflict (event_id, act_id) do update set
  start_time = coalesce(excluded.start_time, event_acts.start_time),
  end_time = coalesce(excluded.end_time, event_acts.end_time),
  sort_order = excluded.sort_order;

insert into acts (name, insta_name)
values ('Limoncello', 'limoncello.tt')
on conflict (name) do update set
  insta_name = coalesce(excluded.insta_name, acts.insta_name);

insert into event_acts (event_id, act_id, start_time, end_time, sort_order)
select e.id, a.id, null, null, 17
from events e
join clubs cl on cl.id = e.club_id
join cities c on c.id = cl.city_id
join acts a on a.name = 'Limoncello'
where c.name = 'Berlin'
  and cl.name = 'Lokschuppen'
  and e.event_date = '2026-02-27'::date
  and e.event_name = 'Candyflip x Wyldhearts'
on conflict (event_id, act_id) do update set
  start_time = coalesce(excluded.start_time, event_acts.start_time),
  end_time = coalesce(excluded.end_time, event_acts.end_time),
  sort_order = excluded.sort_order;

commit;
