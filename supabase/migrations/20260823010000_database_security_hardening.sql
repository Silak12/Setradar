-- Harden the public API surface without removing the public aggregate features.
-- Raw user-linked rows remain owner-only; anonymous statistics are maintained in
-- sanitized projection/aggregate tables by non-callable trigger functions.

begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- The old views were owner-executed and therefore bypassed RLS. Recreate them
-- after their sanitized sources exist.
drop view if exists public.events_with_hype;
drop view if exists public.event_hype_totals;
drop view if exists public.event_queue_buckets;
drop view if exists public.event_queue_current;
drop view if exists public.queue_reports_mapped;
drop view if exists public.event_queue_timeline;
drop view if exists public.event_mood_current;
drop view if exists public.event_presence_current;
drop view if exists public.event_act_highlights;
drop view if exists public.act_rating_stats;

-- The UI supports marking an act as the surprise before assigning stars. A zero
-- rating is an unset value and is excluded from all rating aggregates below.
alter table public.act_ratings
    drop constraint if exists act_ratings_rating_check;
alter table public.act_ratings
    add constraint act_ratings_rating_check check (rating between 0 and 5);

alter table public.events
    drop constraint if exists events_end_date_check;
alter table public.events
    add constraint events_end_date_check check (event_end_date >= event_date);

-- Sanitized public sources. None of these tables contains an auth user id or a
-- free-text comment.
create table if not exists public.act_ratings_public (
    rating_id bigint primary key
        references public.act_ratings(id) on delete cascade,
    act_id bigint not null
        references public.acts(id) on delete cascade,
    event_id bigint null
        references public.events(id) on delete cascade,
    rating smallint not null check (rating between 0 and 5),
    was_best_act boolean not null default false,
    was_surprise boolean not null default false
);

create index if not exists idx_act_ratings_public_act
    on public.act_ratings_public(act_id);
create index if not exists idx_act_ratings_public_event
    on public.act_ratings_public(event_id);

create table if not exists public.event_hype_counts_public (
    event_id bigint primary key
        references public.events(id) on delete cascade,
    real_hype integer not null default 0 check (real_hype >= 0)
);

create table if not exists public.mood_votes_public (
    vote_id bigint primary key
        references public.mood_votes(id) on delete cascade,
    event_id bigint not null
        references public.events(id) on delete cascade,
    mood public.mood_type not null,
    created_at timestamptz not null
);

create index if not exists idx_mood_votes_public_event_time
    on public.mood_votes_public(event_id, created_at desc);

create table if not exists public.queue_reports_public (
    report_id bigint primary key
        references public.queue_reports(id) on delete cascade,
    event_id bigint not null
        references public.events(id) on delete cascade,
    level public.queue_level not null,
    created_at timestamptz not null
);

create index if not exists idx_queue_reports_public_event_time
    on public.queue_reports_public(event_id, created_at desc);

create table if not exists public.event_presence_counts_public (
    event_id bigint not null
        references public.events(id) on delete cascade,
    status public.presence_status not null,
    users_count integer not null check (users_count >= 0),
    primary key (event_id, status)
);

create table if not exists public.event_queue_timeline_public (
    event_id bigint not null
        references public.events(id) on delete cascade,
    bucket_start timestamptz not null,
    avg_wait_minutes integer not null,
    sample_count integer not null check (sample_count >= 0),
    primary key (event_id, bucket_start)
);

create table if not exists public.event_visit_stats_public (
    event_id bigint primary key
        references public.events(id) on delete cascade,
    wait_minutes_sum numeric not null default 0,
    wait_sample_count bigint not null default 0 check (wait_sample_count >= 0),
    in_club_count bigint not null default 0 check (in_club_count >= 0),
    denied_count bigint not null default 0 check (denied_count >= 0)
);

-- Backfill the sanitized data before installing synchronization triggers.
insert into public.act_ratings_public (
    rating_id, act_id, event_id, rating, was_best_act, was_surprise
)
select id, act_id, event_id, rating, was_best_act, was_surprise
from public.act_ratings
on conflict (rating_id) do update set
    act_id = excluded.act_id,
    event_id = excluded.event_id,
    rating = excluded.rating,
    was_best_act = excluded.was_best_act,
    was_surprise = excluded.was_surprise;

insert into public.event_hype_counts_public(event_id, real_hype)
select event_id, count(*)::integer
from public.event_hypes
group by event_id
on conflict (event_id) do update set real_hype = excluded.real_hype;

insert into public.mood_votes_public(vote_id, event_id, mood, created_at)
select id, event_id, mood, created_at
from public.mood_votes
on conflict (vote_id) do update set
    event_id = excluded.event_id,
    mood = excluded.mood,
    created_at = excluded.created_at;

insert into public.queue_reports_public(report_id, event_id, level, created_at)
select id, event_id, level, created_at
from public.queue_reports
on conflict (report_id) do update set
    event_id = excluded.event_id,
    level = excluded.level,
    created_at = excluded.created_at;

insert into public.event_presence_counts_public(event_id, status, users_count)
select event_id, status, count(*)::integer
from public.user_event_presence
where event_id is not null and status is not null
group by event_id, status
on conflict (event_id, status) do update
set users_count = excluded.users_count;

with first_queue as (
    select distinct on (user_id, event_id)
        user_id, event_id, created_at as queued_at
    from public.user_presence_log
    where status = 'queue'
    order by user_id, event_id, created_at
), first_club as (
    select distinct on (user_id, event_id)
        user_id, event_id, created_at as entered_at
    from public.user_presence_log
    where status = 'in_club'
    order by user_id, event_id, created_at
), waits as (
    select
        fq.event_id,
        date_trunc('hour', fq.queued_at)
            + floor(extract(minute from fq.queued_at) / 30) * interval '30 minutes'
            as bucket_start,
        extract(epoch from (fc.entered_at - fq.queued_at)) / 60 as wait_minutes
    from first_queue fq
    join first_club fc
      on fc.user_id = fq.user_id
     and fc.event_id = fq.event_id
     and fc.entered_at > fq.queued_at
    where extract(epoch from (fc.entered_at - fq.queued_at)) / 60 between 1 and 360
)
insert into public.event_queue_timeline_public(
    event_id, bucket_start, avg_wait_minutes, sample_count
)
select event_id, bucket_start, round(avg(wait_minutes))::integer, count(*)::integer
from waits
group by event_id, bucket_start
on conflict (event_id, bucket_start) do update set
    avg_wait_minutes = excluded.avg_wait_minutes,
    sample_count = excluded.sample_count;

with waits as (
    select
        queued.event_id,
        extract(epoch from (entered.created_at - queued.created_at)) / 60 as wait_minutes
    from public.user_presence_log queued
    join public.user_presence_log entered
      on entered.event_id = queued.event_id
     and entered.user_id = queued.user_id
     and entered.created_at > queued.created_at
    where queued.status = 'queue'
      and entered.status = 'in_club'
      and extract(epoch from (entered.created_at - queued.created_at)) / 60 between 5 and 120
), wait_stats as (
    select event_id, sum(wait_minutes) as wait_minutes_sum, count(*) as wait_sample_count
    from waits
    group by event_id
), presence_stats as (
    select
        event_id,
        count(*) filter (where status = 'in_club') as in_club_count,
        count(*) filter (where status = 'denied') as denied_count
    from public.user_presence_log
    group by event_id
)
insert into public.event_visit_stats_public(
    event_id, wait_minutes_sum, wait_sample_count, in_club_count, denied_count
)
select
    ps.event_id,
    coalesce(ws.wait_minutes_sum, 0),
    coalesce(ws.wait_sample_count, 0),
    ps.in_club_count,
    ps.denied_count
from presence_stats ps
left join wait_stats ws on ws.event_id = ps.event_id
on conflict (event_id) do update set
    wait_minutes_sum = excluded.wait_minutes_sum,
    wait_sample_count = excluded.wait_sample_count,
    in_club_count = excluded.in_club_count,
    denied_count = excluded.denied_count;

-- Trigger-only synchronization functions live outside the exposed schema and
-- cannot be executed by API roles.
create or replace function private.sync_act_rating_public()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if tg_op = 'DELETE' then
        delete from public.act_ratings_public where rating_id = old.id;
        return old;
    end if;

    insert into public.act_ratings_public(
        rating_id, act_id, event_id, rating, was_best_act, was_surprise
    ) values (
        new.id, new.act_id, new.event_id, new.rating, new.was_best_act, new.was_surprise
    )
    on conflict (rating_id) do update set
        act_id = excluded.act_id,
        event_id = excluded.event_id,
        rating = excluded.rating,
        was_best_act = excluded.was_best_act,
        was_surprise = excluded.was_surprise;
    return new;
end;
$$;

create or replace function private.refresh_event_hype_count(p_event_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if p_event_id is null then return; end if;
    perform pg_catalog.pg_advisory_xact_lock(8341, (p_event_id % 2147483647)::integer);
    if not exists (select 1 from public.events where id = p_event_id) then
        delete from public.event_hype_counts_public where event_id = p_event_id;
        return;
    end if;
    insert into public.event_hype_counts_public(event_id, real_hype)
    select p_event_id, count(*)::integer
    from public.event_hypes
    where event_id = p_event_id
    on conflict (event_id) do update set real_hype = excluded.real_hype;
end;
$$;

create or replace function private.sync_event_hype_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if tg_op <> 'INSERT' then
        perform private.refresh_event_hype_count(old.event_id);
    end if;
    if tg_op <> 'DELETE' and (tg_op = 'INSERT' or new.event_id is distinct from old.event_id) then
        perform private.refresh_event_hype_count(new.event_id);
    end if;
    if tg_op = 'DELETE' then return old; end if;
    return new;
end;
$$;

create or replace function private.sync_mood_vote_public()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if tg_op = 'DELETE' then
        delete from public.mood_votes_public where vote_id = old.id;
        return old;
    end if;
    insert into public.mood_votes_public(vote_id, event_id, mood, created_at)
    values (new.id, new.event_id, new.mood, new.created_at)
    on conflict (vote_id) do update set
        event_id = excluded.event_id,
        mood = excluded.mood,
        created_at = excluded.created_at;
    return new;
end;
$$;

create or replace function private.sync_queue_report_public()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if tg_op = 'DELETE' then
        delete from public.queue_reports_public where report_id = old.id;
        return old;
    end if;
    insert into public.queue_reports_public(report_id, event_id, level, created_at)
    values (new.id, new.event_id, new.level, new.created_at)
    on conflict (report_id) do update set
        event_id = excluded.event_id,
        level = excluded.level,
        created_at = excluded.created_at;
    return new;
end;
$$;

create or replace function private.refresh_presence_count(p_event_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if p_event_id is null then return; end if;
    perform pg_catalog.pg_advisory_xact_lock(8342, (p_event_id % 2147483647)::integer);
    delete from public.event_presence_counts_public where event_id = p_event_id;
    if not exists (select 1 from public.events where id = p_event_id) then return; end if;
    insert into public.event_presence_counts_public(event_id, status, users_count)
    select event_id, status, count(*)::integer
    from public.user_event_presence
    where event_id = p_event_id and status is not null
    group by event_id, status;
end;
$$;

create or replace function private.sync_presence_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if tg_op <> 'INSERT' then
        perform private.refresh_presence_count(old.event_id);
    end if;
    if tg_op <> 'DELETE' and (tg_op = 'INSERT' or new.event_id is distinct from old.event_id) then
        perform private.refresh_presence_count(new.event_id);
    elsif tg_op = 'UPDATE' then
        perform private.refresh_presence_count(new.event_id);
    end if;
    if tg_op = 'DELETE' then return old; end if;
    return new;
end;
$$;

create or replace function private.refresh_presence_log_event(p_event_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if p_event_id is null then return; end if;
    perform pg_catalog.pg_advisory_xact_lock(8343, (p_event_id % 2147483647)::integer);

    delete from public.event_queue_timeline_public where event_id = p_event_id;
    delete from public.event_visit_stats_public where event_id = p_event_id;
    if not exists (select 1 from public.events where id = p_event_id) then return; end if;

    with first_queue as (
        select distinct on (user_id)
            user_id, created_at as queued_at
        from public.user_presence_log
        where event_id = p_event_id and status = 'queue'
        order by user_id, created_at
    ), first_club as (
        select distinct on (user_id)
            user_id, created_at as entered_at
        from public.user_presence_log
        where event_id = p_event_id and status = 'in_club'
        order by user_id, created_at
    ), waits as (
        select
            date_trunc('hour', fq.queued_at)
                + floor(extract(minute from fq.queued_at) / 30) * interval '30 minutes'
                as bucket_start,
            extract(epoch from (fc.entered_at - fq.queued_at)) / 60 as wait_minutes
        from first_queue fq
        join first_club fc on fc.user_id = fq.user_id and fc.entered_at > fq.queued_at
        where extract(epoch from (fc.entered_at - fq.queued_at)) / 60 between 1 and 360
    )
    insert into public.event_queue_timeline_public(
        event_id, bucket_start, avg_wait_minutes, sample_count
    )
    select p_event_id, bucket_start, round(avg(wait_minutes))::integer, count(*)::integer
    from waits
    group by bucket_start;

    with waits as (
        select extract(epoch from (entered.created_at - queued.created_at)) / 60 as wait_minutes
        from public.user_presence_log queued
        join public.user_presence_log entered
          on entered.event_id = queued.event_id
         and entered.user_id = queued.user_id
         and entered.created_at > queued.created_at
        where queued.event_id = p_event_id
          and queued.status = 'queue'
          and entered.status = 'in_club'
          and extract(epoch from (entered.created_at - queued.created_at)) / 60 between 5 and 120
    )
    insert into public.event_visit_stats_public(
        event_id, wait_minutes_sum, wait_sample_count, in_club_count, denied_count
    )
    select
        p_event_id,
        coalesce((select sum(wait_minutes) from waits), 0),
        (select count(*) from waits),
        count(*) filter (where status = 'in_club'),
        count(*) filter (where status = 'denied')
    from public.user_presence_log
    where event_id = p_event_id;
end;
$$;

create or replace function private.sync_presence_log_stats()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if tg_op <> 'INSERT' then
        perform private.refresh_presence_log_event(old.event_id);
    end if;
    if tg_op <> 'DELETE' and (tg_op = 'INSERT' or new.event_id is distinct from old.event_id) then
        perform private.refresh_presence_log_event(new.event_id);
    elsif tg_op = 'UPDATE' then
        perform private.refresh_presence_log_event(new.event_id);
    end if;
    if tg_op = 'DELETE' then return old; end if;
    return new;
end;
$$;

drop trigger if exists sync_act_rating_public on public.act_ratings;
create trigger sync_act_rating_public
after insert or update or delete on public.act_ratings
for each row execute function private.sync_act_rating_public();

drop trigger if exists sync_event_hype_count on public.event_hypes;
create trigger sync_event_hype_count
after insert or update or delete on public.event_hypes
for each row execute function private.sync_event_hype_count();

drop trigger if exists sync_mood_vote_public on public.mood_votes;
create trigger sync_mood_vote_public
after insert or update or delete on public.mood_votes
for each row execute function private.sync_mood_vote_public();

drop trigger if exists sync_queue_report_public on public.queue_reports;
create trigger sync_queue_report_public
after insert or update or delete on public.queue_reports
for each row execute function private.sync_queue_report_public();

drop trigger if exists sync_presence_count on public.user_event_presence;
create trigger sync_presence_count
after insert or update or delete on public.user_event_presence
for each row execute function private.sync_presence_count();

drop trigger if exists sync_presence_log_stats on public.user_presence_log;
create trigger sync_presence_log_stats
after insert or update or delete on public.user_presence_log
for each row execute function private.sync_presence_log_stats();

-- Every exposed view now runs with caller permissions and reads only sanitized
-- public sources.
create view public.act_rating_stats
with (security_invoker = true)
as
select
    act_id,
    count(*)::integer as rating_count,
    round(avg(rating), 1) as avg_rating,
    round(100.0 * sum(case when was_best_act then 1 else 0 end) / nullif(count(*), 0), 0)::integer as best_act_pct,
    round(100.0 * sum(case when was_surprise then 1 else 0 end) / nullif(count(*), 0), 0)::integer as surprise_pct
from public.act_ratings_public
where rating > 0
group by act_id;

create view public.event_act_highlights
with (security_invoker = true)
as
with stats as (
    select
        event_id,
        act_id,
        count(*) filter (where rating > 0)::integer as cnt,
        coalesce(avg(rating) filter (where rating > 0), 0) as avg_r,
        case
            when count(*) filter (where rating > 0) > 0 then
                count(*) filter (where rating > 0)::numeric
                    / (count(*) filter (where rating > 0) + 5) * avg(rating) filter (where rating > 0)
                + 5.0 / (count(*) filter (where rating > 0) + 5) * 3.5
            else 0
        end as score,
        sum(case when was_surprise then 1 else 0 end)::integer as surprise_cnt
    from public.act_ratings_public
    where event_id is not null
    group by event_id, act_id
), surprise as (
    select distinct on (event_id) event_id, act_id as surprise_act_id
    from stats
    where surprise_cnt >= 1
    order by event_id, surprise_cnt desc, cnt desc
), best as (
    select distinct on (s.event_id) s.event_id, s.act_id as best_act_id
    from stats s
    left join surprise su
      on su.event_id = s.event_id and su.surprise_act_id = s.act_id
    where s.cnt >= 1 and su.surprise_act_id is null
    order by s.event_id, s.score desc, s.cnt desc
), gem as (
    select distinct on (s.event_id) s.event_id, s.act_id as hidden_gem_act_id
    from stats s
    left join surprise su
      on su.event_id = s.event_id and su.surprise_act_id = s.act_id
    left join best b
      on b.event_id = s.event_id and b.best_act_id = s.act_id
    where s.cnt between 10 and 50
      and s.avg_r > 4.0
      and su.surprise_act_id is null
      and b.best_act_id is null
    order by s.event_id, s.avg_r desc
)
select
    coalesce(b.event_id, su.event_id, g.event_id) as event_id,
    b.best_act_id,
    su.surprise_act_id,
    g.hidden_gem_act_id
from best b
full join surprise su on su.event_id = b.event_id
full join gem g on g.event_id = coalesce(b.event_id, su.event_id);

create view public.event_hype_totals
with (security_invoker = true)
as
select
    e.id as event_id,
    coalesce(s.seed_count, 0) as seed_hype,
    coalesce(h.real_hype, 0) as real_hype,
    coalesce(s.seed_count, 0) + coalesce(h.real_hype, 0) as total_hype
from public.events e
left join public.event_hype_seed s on s.event_id = e.id
left join public.event_hype_counts_public h on h.event_id = e.id;

create view public.events_with_hype
with (security_invoker = true)
as
select
    e.id,
    e.club_id,
    e.event_date,
    e.event_name,
    e.time_start,
    e.time_end,
    eht.total_hype,
    eht.real_hype,
    eht.seed_hype
from public.events e
left join public.event_hype_totals eht on eht.event_id = e.id;

create view public.event_mood_current
with (security_invoker = true)
as
with recent as (
    select event_id, mood, created_at
    from public.mood_votes_public
    where created_at >= now() - interval '1 hour'
)
select
    event_id,
    count(*)::integer as votes_count,
    sum(case when mood = 'euphoric' then 1 else 0 end)::integer as euphoric_count,
    sum(case when mood = 'stable' then 1 else 0 end)::integer as stable_count,
    sum(case when mood = 'flop' then 1 else 0 end)::integer as flop_count,
    round(100.0 * sum(case when mood = 'euphoric' then 1 else 0 end) / nullif(count(*), 0), 1) as euphoric_pct,
    round(100.0 * sum(case when mood = 'stable' then 1 else 0 end) / nullif(count(*), 0), 1) as stable_pct,
    round(100.0 * sum(case when mood = 'flop' then 1 else 0 end) / nullif(count(*), 0), 1) as flop_pct,
    max(created_at) as last_vote_at
from recent
group by event_id;

create view public.event_presence_current
with (security_invoker = true)
as
select event_id, status, users_count
from public.event_presence_counts_public
where status in ('queue', 'in_club');

create view public.queue_reports_mapped
with (security_invoker = true)
as
select
    report_id as id,
    event_id,
    level,
    created_at,
    case level
        when 'green' then 0
        when 'yellow' then 1
        when 'red' then 2
        when 'hell' then 3
    end as level_num
from public.queue_reports_public;

create view public.event_queue_current
with (security_invoker = true)
as
select
    event_id,
    count(*)::integer as reports_count,
    avg(level_num)::double precision as level_avg,
    case round(avg(level_num))::integer
        when 0 then 'green'::public.queue_level
        when 1 then 'yellow'::public.queue_level
        when 2 then 'red'::public.queue_level
        else 'hell'::public.queue_level
    end as current_level,
    max(created_at) as last_report_at
from public.queue_reports_mapped
where created_at >= now() - interval '20 minutes'
group by event_id;

create view public.event_queue_buckets
with (security_invoker = true)
as
select
    event_id,
    date_bin(interval '5 minutes', created_at, now() - interval '2 hours') as bucket_start,
    count(*)::integer as reports_count,
    avg(level_num)::double precision as level_avg,
    case round(avg(level_num))::integer
        when 0 then 'green'::public.queue_level
        when 1 then 'yellow'::public.queue_level
        when 2 then 'red'::public.queue_level
        else 'hell'::public.queue_level
    end as bucket_level
from public.queue_reports_mapped
where created_at >= now() - interval '2 hours'
group by event_id, date_bin(interval '5 minutes', created_at, now() - interval '2 hours')
order by event_id, bucket_start;

create view public.event_queue_timeline
with (security_invoker = true)
as
select event_id, bucket_start, avg_wait_minutes, sample_count
from public.event_queue_timeline_public;

-- Harden existing functions. Only account deletion still needs definer rights in
-- the exposed schema; anonymous callers cannot execute it.
create or replace function public.create_default_notification_prefs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.notification_preferences(user_id)
    values (new.id)
    on conflict (user_id) do nothing;
    return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.profiles(user_id, display_name)
    values (new.id, coalesce(new.raw_user_meta_data->>'name', new.email))
    on conflict (user_id) do nothing;
    return new;
end;
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create or replace function public.list_public_tables()
returns table(table_name text)
language sql
security invoker
set search_path = ''
as $$
    select tablename::text
    from pg_catalog.pg_tables
    where schemaname = 'public'
    order by tablename;
$$;

create or replace function public.get_club_stats(p_event_ids bigint[])
returns table(
    avg_wait_minutes numeric,
    entry_rate numeric,
    in_club_count bigint,
    denied_count bigint,
    total_attempts bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
    select
        case
            when coalesce(sum(wait_sample_count), 0) = 0 then 0
            else round(sum(wait_minutes_sum) / sum(wait_sample_count), 0)
        end as avg_wait_minutes,
        case
            when coalesce(sum(in_club_count + denied_count), 0) = 0 then null
            else round(sum(in_club_count)::numeric / sum(in_club_count + denied_count) * 100, 0)
        end as entry_rate,
        coalesce(sum(in_club_count), 0)::bigint,
        coalesce(sum(denied_count), 0)::bigint,
        coalesce(sum(in_club_count + denied_count), 0)::bigint
    from public.event_visit_stats_public
    where event_id = any(coalesce(p_event_ids, '{}'::bigint[]));
$$;

create or replace function private.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    account_user_id uuid := auth.uid();
begin
    if account_user_id is null then
        raise exception 'Not authenticated';
    end if;

    delete from public.act_ratings where user_id = account_user_id;
    delete from public.club_ratings where user_id = account_user_id;
    delete from public.event_ratings where user_id = account_user_id;
    delete from public.event_hypes where user_id = account_user_id;
    delete from public.favorites where user_id = account_user_id;
    delete from public.mood_votes where user_id = account_user_id;
    delete from public.post_event_surveys where user_id = account_user_id;
    delete from public.queue_reports where user_id = account_user_id;
    delete from public.user_achievements where user_id = account_user_id;
    delete from public.user_event_attendance where user_id = account_user_id;
    delete from public.user_event_presence where user_id = account_user_id;
    delete from public.user_presence_log where user_id = account_user_id;
    delete from public.push_subscriptions where user_id = account_user_id;
    delete from public.notification_preferences where user_id = account_user_id;
    delete from public.profiles where user_id = account_user_id;
    delete from auth.users where id = account_user_id;
end;
$$;

create or replace function public.delete_my_account()
returns void
language sql
security invoker
set search_path = ''
as $$
    select private.delete_my_account();
$$;

-- Collaborative filtering is calculated with private rows but returns only act
-- ids and aggregate scores. The exposed wrapper itself is security invoker.
create or replace function private.get_my_act_recommendations()
returns table(act_id bigint, predicted_score numeric, raw_score numeric)
language sql
stable
security definer
set search_path = ''
as $$
with me as (
    select ratings.act_id, avg(ratings.rating)::numeric as avg_rating
    from public.act_ratings ratings
    where ratings.user_id = auth.uid() and ratings.rating > 0
    group by ratings.act_id
), similarities as (
    select
        other.user_id,
        avg(1 - abs(me.avg_rating - other.rating::numeric) / 4) as similarity,
        count(*) as shared_count
    from me
    join public.act_ratings other on other.act_id = me.act_id
    where other.user_id <> auth.uid() and other.rating > 0
    group by other.user_id
    having count(*) >= 2
), top_similar as (
    select user_id, similarity
    from similarities
    order by similarity desc
    limit 20
), candidates as (
    select
        ratings.act_id,
        sum(similarity * ratings.rating) / nullif(sum(similarity), 0) as predicted_rating,
        sum(similarity * ratings.rating) as weighted_raw_score
    from top_similar
    join public.act_ratings ratings using (user_id)
    where ratings.rating > 0
      and not exists (select 1 from me where me.act_id = ratings.act_id)
    group by ratings.act_id
)
select
    candidates.act_id,
    round(candidates.predicted_rating * 2, 1) as predicted_score,
    candidates.weighted_raw_score as raw_score
from candidates
order by candidates.weighted_raw_score desc
limit 500;
$$;

create or replace function public.get_my_act_recommendations()
returns table(act_id bigint, predicted_score numeric, raw_score numeric)
language sql
stable
security invoker
set search_path = ''
as $$
    select * from private.get_my_act_recommendations();
$$;

-- Replace every legacy policy with one explicit role/action policy set.
do $$
declare
    policy_row record;
begin
    for policy_row in
        select schemaname, tablename, policyname
        from pg_catalog.pg_policies
        where schemaname = 'public'
    loop
        execute format(
            'drop policy %I on %I.%I',
            policy_row.policyname,
            policy_row.schemaname,
            policy_row.tablename
        );
    end loop;
end;
$$;

alter table public.achievements enable row level security;
alter table public.acts enable row level security;
alter table public.cities enable row level security;
alter table public.clubs enable row level security;
alter table public.events enable row level security;
alter table public.event_acts enable row level security;
alter table public.event_hype_seed enable row level security;
alter table public.act_ratings enable row level security;
alter table public.club_ratings enable row level security;
alter table public.event_ratings enable row level security;
alter table public.event_hypes enable row level security;
alter table public.favorites enable row level security;
alter table public.mood_votes enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.post_event_surveys enable row level security;
alter table public.profiles enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.queue_reports enable row level security;
alter table public.user_achievements enable row level security;
alter table public.user_event_attendance enable row level security;
alter table public.user_event_presence enable row level security;
alter table public.user_presence_log enable row level security;
alter table public.act_ratings_public enable row level security;
alter table public.event_hype_counts_public enable row level security;
alter table public.mood_votes_public enable row level security;
alter table public.queue_reports_public enable row level security;
alter table public.event_presence_counts_public enable row level security;
alter table public.event_queue_timeline_public enable row level security;
alter table public.event_visit_stats_public enable row level security;

create policy achievements_read_public on public.achievements
for select to anon, authenticated using (true);
create policy acts_read_public on public.acts
for select to anon, authenticated using (true);
create policy cities_read_public on public.cities
for select to anon, authenticated using (true);
create policy clubs_read_public on public.clubs
for select to anon, authenticated using (true);
create policy events_read_public on public.events
for select to anon, authenticated using (true);
create policy event_acts_read_public on public.event_acts
for select to anon, authenticated using (true);
create policy event_hype_seed_read_public on public.event_hype_seed
for select to anon, authenticated using (true);

create policy act_ratings_read_own on public.act_ratings
for select to authenticated using ((select auth.uid()) = user_id);
create policy act_ratings_insert_own on public.act_ratings
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy act_ratings_update_own on public.act_ratings
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy act_ratings_delete_own on public.act_ratings
for delete to authenticated using ((select auth.uid()) = user_id);

create policy club_ratings_read_own on public.club_ratings
for select to authenticated using ((select auth.uid()) = user_id);
create policy club_ratings_insert_own on public.club_ratings
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy club_ratings_update_own on public.club_ratings
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy club_ratings_delete_own on public.club_ratings
for delete to authenticated using ((select auth.uid()) = user_id);

create policy event_ratings_read_own on public.event_ratings
for select to authenticated using ((select auth.uid()) = user_id);
create policy event_ratings_insert_own on public.event_ratings
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy event_ratings_update_own on public.event_ratings
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy event_ratings_delete_own on public.event_ratings
for delete to authenticated using ((select auth.uid()) = user_id);

create policy event_hypes_read_own on public.event_hypes
for select to authenticated using ((select auth.uid()) = user_id);
create policy event_hypes_insert_own on public.event_hypes
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy event_hypes_delete_own on public.event_hypes
for delete to authenticated using ((select auth.uid()) = user_id);

create policy favorites_read_own on public.favorites
for select to authenticated using ((select auth.uid()) = user_id);
create policy favorites_insert_own on public.favorites
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy favorites_delete_own on public.favorites
for delete to authenticated using ((select auth.uid()) = user_id);

create policy mood_votes_read_own on public.mood_votes
for select to authenticated using ((select auth.uid()) = user_id);
create policy mood_votes_insert_own on public.mood_votes
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy mood_votes_delete_own on public.mood_votes
for delete to authenticated using ((select auth.uid()) = user_id);

create policy notification_preferences_manage_own on public.notification_preferences
for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy surveys_read_own on public.post_event_surveys
for select to authenticated using ((select auth.uid()) = user_id);
create policy surveys_insert_own on public.post_event_surveys
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy surveys_update_own on public.post_event_surveys
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy surveys_delete_own on public.post_event_surveys
for delete to authenticated using ((select auth.uid()) = user_id);

create policy profiles_read_own on public.profiles
for select to authenticated using ((select auth.uid()) = user_id);
create policy profiles_update_own on public.profiles
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy push_subscriptions_manage_own on public.push_subscriptions
for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy queue_reports_read_own on public.queue_reports
for select to authenticated using ((select auth.uid()) = user_id);
create policy queue_reports_insert_own on public.queue_reports
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy queue_reports_delete_own on public.queue_reports
for delete to authenticated using ((select auth.uid()) = user_id);

create policy user_achievements_read_own on public.user_achievements
for select to authenticated using ((select auth.uid()) = user_id);

create policy attendance_read_own on public.user_event_attendance
for select to authenticated using ((select auth.uid()) = user_id);
create policy attendance_insert_own on public.user_event_attendance
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy attendance_delete_own on public.user_event_attendance
for delete to authenticated using ((select auth.uid()) = user_id);

create policy presence_read_own on public.user_event_presence
for select to authenticated using ((select auth.uid()) = user_id);
create policy presence_insert_own on public.user_event_presence
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy presence_update_own on public.user_event_presence
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy presence_delete_own on public.user_event_presence
for delete to authenticated using ((select auth.uid()) = user_id);

create policy presence_log_read_own on public.user_presence_log
for select to authenticated using ((select auth.uid()) = user_id);
create policy presence_log_insert_own on public.user_presence_log
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy presence_log_update_own on public.user_presence_log
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy presence_log_delete_own on public.user_presence_log
for delete to authenticated using ((select auth.uid()) = user_id);

create policy act_ratings_public_read on public.act_ratings_public
for select to anon, authenticated using (true);
create policy event_hype_counts_public_read on public.event_hype_counts_public
for select to anon, authenticated using (true);
create policy mood_votes_public_read on public.mood_votes_public
for select to anon, authenticated using (true);
create policy queue_reports_public_read on public.queue_reports_public
for select to anon, authenticated using (true);
create policy event_presence_counts_public_read on public.event_presence_counts_public
for select to anon, authenticated using (true);
create policy event_queue_timeline_public_read on public.event_queue_timeline_public
for select to anon, authenticated using (true);
create policy event_visit_stats_public_read on public.event_visit_stats_public
for select to anon, authenticated using (true);

-- Start from deny-by-default grants and expose only the required operations.
revoke all privileges on all tables in schema public from anon, authenticated;
revoke all privileges on all sequences in schema public from anon, authenticated;
revoke create on schema public from public, anon, authenticated;
grant usage on schema public to anon, authenticated;

grant select on table
    public.achievements,
    public.acts,
    public.cities,
    public.clubs,
    public.events,
    public.event_acts,
    public.event_hype_seed,
    public.act_ratings_public,
    public.event_hype_counts_public,
    public.mood_votes_public,
    public.queue_reports_public,
    public.event_presence_counts_public,
    public.event_queue_timeline_public,
    public.event_visit_stats_public,
    public.act_rating_stats,
    public.event_act_highlights,
    public.event_hype_totals,
    public.events_with_hype,
    public.event_mood_current,
    public.event_presence_current,
    public.queue_reports_mapped,
    public.event_queue_current,
    public.event_queue_buckets,
    public.event_queue_timeline
to anon, authenticated;

grant select, insert, update, delete on table public.act_ratings to authenticated;
grant select, insert, update, delete on table public.club_ratings to authenticated;
grant select, insert, update, delete on table public.event_ratings to authenticated;
grant select, insert, delete on table public.event_hypes to authenticated;
grant select, insert, delete on table public.favorites to authenticated;
grant select, insert, delete on table public.mood_votes to authenticated;
grant select, insert, update, delete on table public.notification_preferences to authenticated;
grant select, insert, update, delete on table public.post_event_surveys to authenticated;
grant select, update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.push_subscriptions to authenticated;
grant select, insert, delete on table public.queue_reports to authenticated;
grant select on table public.user_achievements to authenticated;
grant select, insert, delete on table public.user_event_attendance to authenticated;
grant select, insert, update, delete on table public.user_event_presence to authenticated;
grant select, insert, update, delete on table public.user_presence_log to authenticated;

grant usage, select on sequence
    public.act_ratings_id_seq,
    public.club_ratings_id_seq,
    public.event_hypes_id_seq,
    public.event_ratings_id_seq,
    public.favorites_id_seq,
    public.mood_votes_id_seq,
    public.post_event_surveys_id_seq,
    public.queue_reports_id_seq,
    public.user_event_attendance_id_seq
to authenticated;

revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function public.get_club_stats(bigint[]) to anon, authenticated;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.get_my_act_recommendations() to authenticated;
grant execute on function public.list_public_tables() to service_role;
grant usage on schema private to authenticated;
grant execute on function private.delete_my_account() to authenticated;
grant execute on function private.get_my_act_recommendations() to authenticated;

alter default privileges for role postgres in schema public
    revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
    revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
    revoke execute on functions from public, anon, authenticated;

-- Cover every foreign key reported by the performance advisor.
create index if not exists idx_act_ratings_act_id
    on public.act_ratings(act_id);
create index if not exists idx_act_ratings_event_id
    on public.act_ratings(event_id);
create index if not exists idx_club_ratings_club_id
    on public.club_ratings(club_id);
create index if not exists idx_event_acts_act_id
    on public.event_acts(act_id);
create index if not exists idx_events_club_id
    on public.events(club_id);
create index if not exists idx_post_event_surveys_event_id
    on public.post_event_surveys(event_id);
create index if not exists idx_post_event_surveys_highlight_act_id
    on public.post_event_surveys(highlight_act_id);
create index if not exists idx_user_achievements_achievement_id
    on public.user_achievements(achievement_id);
create index if not exists idx_user_presence_log_event_id
    on public.user_presence_log(event_id);

comment on table public.act_ratings_public is
    'Sanitized rating projection for public statistics; never contains user ids or comments.';
comment on table public.queue_reports_public is
    'Sanitized queue-report projection for public live statistics; never contains user ids.';
comment on function private.get_my_act_recommendations() is
    'Definer helper in an unexposed schema; returns aggregate scores only and derives the user from auth.uid().';

commit;
