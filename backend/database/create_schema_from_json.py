import argparse
import json
from pathlib import Path
from typing import Any


DEFAULT_INPUT = Path(__file__).with_name("lineup_seed_example.json")
DEFAULT_OUTPUT = Path(__file__).with_name("lineup_init.sql")


def sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def parse_act(raw_act: Any) -> tuple[str, str | None]:
    if isinstance(raw_act, str):
        return raw_act.strip(), None
    if isinstance(raw_act, dict):
        name = str(raw_act.get("name", "")).strip()
        start_time = raw_act.get("start_time")
        if start_time is not None:
            start_time = str(start_time).strip()
        return name, start_time or None
    raise ValueError(f"Unsupported act format: {raw_act!r}")


def load_payload(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, dict) or not isinstance(payload.get("cities"), list):
        raise ValueError("Input JSON must contain top-level key 'cities' as a list.")
    return payload


def build_sql(payload: dict[str, Any]) -> str:
    header = """-- Auto-generated from lineup JSON.
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
    unique (club_id, event_date, event_name)
);

create table if not exists acts (
    id bigserial primary key,
    name text not null unique
);

create table if not exists event_acts (
    id bigserial primary key,
    event_id bigint not null references events(id) on delete cascade,
    act_id bigint not null references acts(id) on delete restrict,
    act_time time null,
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
          and column_name = 'act_time'
    ) then
        alter table event_acts rename column set_start_time to act_time;
    end if;
end
$$;

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

"""
    statements: list[str] = [header]
    seen_cities: set[str] = set()
    seen_clubs: set[tuple[str, str]] = set()
    seen_events: set[tuple[str, str, str, str]] = set()
    seen_acts: set[str] = set()
    seen_event_acts: set[tuple[str, str, str, str, str]] = set()

    cities = payload.get("cities", [])
    for city in cities:
        city_name = str(city.get("name", "")).strip()
        if not city_name:
            continue
        if city_name not in seen_cities:
            statements.append(
                f"insert into cities (name) values ({sql_literal(city_name)}) "
                "on conflict (name) do nothing;\n"
            )
            seen_cities.add(city_name)

        clubs = city.get("clubs", [])
        for club in clubs:
            club_name = str(club.get("name", "")).strip()
            if not club_name:
                continue

            club_key = (city_name, club_name)
            if club_key not in seen_clubs:
                statements.append(
                    "insert into clubs (city_id, name)\n"
                    f"select c.id, {sql_literal(club_name)}\n"
                    "from cities c\n"
                    f"where c.name = {sql_literal(city_name)}\n"
                    "on conflict (city_id, name) do nothing;\n"
                )
                seen_clubs.add(club_key)

            events = club.get("events", [])
            for event in events:
                event_date = str(event.get("date", "")).strip()
                event_name = str(event.get("name", "")).strip()
                if not event_date:
                    continue

                event_key = (city_name, club_name, event_date, event_name)
                if event_key not in seen_events:
                    statements.append(
                        "insert into events (club_id, event_date, event_name)\n"
                        f"select cl.id, {sql_literal(event_date)}::date, {sql_literal(event_name)}\n"
                        "from clubs cl\n"
                        "join cities c on c.id = cl.city_id\n"
                        f"where c.name = {sql_literal(city_name)} and cl.name = {sql_literal(club_name)}\n"
                        "on conflict (club_id, event_date, event_name) do nothing;\n"
                    )
                    seen_events.add(event_key)

                acts = event.get("acts", [])
                for position, raw_act in enumerate(acts, start=1):
                    act_name, start_time = parse_act(raw_act)
                    if not act_name:
                        continue

                    if act_name not in seen_acts:
                        statements.append(
                            f"insert into acts (name) values ({sql_literal(act_name)}) "
                            "on conflict (name) do nothing;\n"
                        )
                        seen_acts.add(act_name)

                    event_act_key = (city_name, club_name, event_date, event_name, act_name)
                    if event_act_key in seen_event_acts:
                        continue

                    start_time_expr = (
                        f"{sql_literal(start_time)}::time" if start_time else "null"
                    )
                    statements.append(
                        "insert into event_acts (event_id, act_id, act_time, sort_order)\n"
                        f"select e.id, a.id, {start_time_expr}, {position}\n"
                        "from events e\n"
                        "join clubs cl on cl.id = e.club_id\n"
                        "join cities c on c.id = cl.city_id\n"
                        "join acts a on a.name = "
                        f"{sql_literal(act_name)}\n"
                        f"where c.name = {sql_literal(city_name)}\n"
                        f"  and cl.name = {sql_literal(club_name)}\n"
                        f"  and e.event_date = {sql_literal(event_date)}::date\n"
                        f"  and e.event_name = {sql_literal(event_name)}\n"
                        "on conflict (event_id, act_id) do update set\n"
                        "  act_time = coalesce(excluded.act_time, event_acts.act_time),\n"
                        "  sort_order = excluded.sort_order;\n"
                    )
                    seen_event_acts.add(event_act_key)

    statements.append("commit;\n")
    return "\n".join(statements)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate normalized Supabase/PostgreSQL schema + seed SQL from lineup JSON."
    )
    parser.add_argument(
        "--input",
        type=Path,
        default=DEFAULT_INPUT,
        help=f"Path to input JSON (default: {DEFAULT_INPUT})",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help=f"Path to output SQL file (default: {DEFAULT_OUTPUT})",
    )
    args = parser.parse_args()

    payload = load_payload(args.input)
    sql = build_sql(payload)
    args.output.write_text(sql, encoding="utf-8")
    print(f"SQL file written: {args.output}")
    print("Next step: run the SQL in Supabase SQL Editor.")


if __name__ == "__main__":
    main()
