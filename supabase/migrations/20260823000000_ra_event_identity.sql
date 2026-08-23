-- Stable Resident Advisor event identity and multi-day support.

begin;

alter table public.events add column if not exists event_end_date date null;
update public.events
set event_end_date = event_date
where event_end_date is null;
alter table public.events alter column event_end_date set not null;

alter table public.events add column if not exists ra_id text null;
alter table public.events add column if not exists is_active boolean not null default true;

-- Mutable RA data such as a title cannot be part of event identity. Dropping
-- this constraint also permits distinct events with the same venue/date/title.
alter table public.events
    drop constraint if exists events_club_id_event_date_event_name_key;

create unique index if not exists events_ra_id_key
    on public.events (ra_id)
    where ra_id is not null;

-- Hide obvious legacy copies until a snapshot assigns a stable ra_id. Exact
-- schedule equality plus a title-prefix relationship avoids matching unrelated
-- parallel events merely because they share a venue and date.
with normalized as (
    select
        id,
        club_id,
        event_date,
        time_start,
        time_end,
        trim(regexp_replace(lower(event_name), '[^[:alnum:]]+', ' ', 'g')) as normalized_name
    from public.events
    where is_active
), legacy_duplicates as (
    select older.id
    from normalized older
    join normalized newer
      on newer.club_id = older.club_id
     and newer.event_date = older.event_date
     and newer.time_start is not distinct from older.time_start
     and newer.time_end is not distinct from older.time_end
     and newer.id > older.id
     and least(length(older.normalized_name), length(newer.normalized_name)) >= 8
     and (
          older.normalized_name like newer.normalized_name || '%'
          or newer.normalized_name like older.normalized_name || '%'
     )
)
update public.events event
set is_active = false
where event.id in (select id from legacy_duplicates);

commit;
