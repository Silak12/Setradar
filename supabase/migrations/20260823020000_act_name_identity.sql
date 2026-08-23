-- Consolidate casing-only act duplicates and make the seeder's act identity
-- case-insensitive. The selected canonical rows preserve every existing rating,
-- favorite, lineup reference and available social link.

begin;

-- No mapped pair currently shares an event/user target. These deletes make the
-- migration safe if that changes between audit and deployment.
with mapping(old_id, canonical_id) as (
    values
        (3474::bigint, 3475::bigint), -- Background Music
        (2459::bigint, 32::bigint),   -- Francis
        (943::bigint, 2225::bigint),  -- OLIV
        (211::bigint, 185::bigint),   -- TBA
        (2270::bigint, 185::bigint),  -- TBA
        (62::bigint, 3496::bigint)    -- The Shredder
)
delete from public.event_acts duplicate
using mapping m, public.event_acts canonical
where duplicate.act_id = m.old_id
  and canonical.act_id = m.canonical_id
  and canonical.event_id = duplicate.event_id;

with mapping(old_id, canonical_id) as (
    values
        (3474::bigint, 3475::bigint),
        (2459::bigint, 32::bigint),
        (943::bigint, 2225::bigint),
        (211::bigint, 185::bigint),
        (2270::bigint, 185::bigint),
        (62::bigint, 3496::bigint)
)
delete from public.favorites duplicate
using mapping m, public.favorites canonical
where duplicate.entity_type::text = 'act'
  and canonical.entity_type::text = 'act'
  and duplicate.entity_id = m.old_id
  and canonical.entity_id = m.canonical_id
  and canonical.user_id = duplicate.user_id;

with mapping(old_id, canonical_id) as (
    values
        (3474::bigint, 3475::bigint),
        (2459::bigint, 32::bigint),
        (943::bigint, 2225::bigint),
        (211::bigint, 185::bigint),
        (2270::bigint, 185::bigint),
        (62::bigint, 3496::bigint)
)
delete from public.act_ratings duplicate
using mapping m, public.act_ratings canonical
where duplicate.act_id = m.old_id
  and canonical.act_id = m.canonical_id
  and canonical.user_id = duplicate.user_id
  and canonical.event_id is not distinct from duplicate.event_id;

with mapping(old_id, canonical_id) as (
    values
        (3474::bigint, 3475::bigint),
        (2459::bigint, 32::bigint),
        (943::bigint, 2225::bigint),
        (211::bigint, 185::bigint),
        (2270::bigint, 185::bigint),
        (62::bigint, 3496::bigint)
)
update public.event_acts row
set act_id = m.canonical_id
from mapping m
where row.act_id = m.old_id;

with mapping(old_id, canonical_id) as (
    values
        (3474::bigint, 3475::bigint),
        (2459::bigint, 32::bigint),
        (943::bigint, 2225::bigint),
        (211::bigint, 185::bigint),
        (2270::bigint, 185::bigint),
        (62::bigint, 3496::bigint)
)
update public.act_ratings row
set act_id = m.canonical_id
from mapping m
where row.act_id = m.old_id;

with mapping(old_id, canonical_id) as (
    values
        (3474::bigint, 3475::bigint),
        (2459::bigint, 32::bigint),
        (943::bigint, 2225::bigint),
        (211::bigint, 185::bigint),
        (2270::bigint, 185::bigint),
        (62::bigint, 3496::bigint)
)
update public.favorites row
set entity_id = m.canonical_id
from mapping m
where row.entity_type::text = 'act' and row.entity_id = m.old_id;

with mapping(old_id, canonical_id) as (
    values
        (3474::bigint, 3475::bigint),
        (2459::bigint, 32::bigint),
        (943::bigint, 2225::bigint),
        (211::bigint, 185::bigint),
        (2270::bigint, 185::bigint),
        (62::bigint, 3496::bigint)
)
update public.post_event_surveys row
set highlight_act_id = m.canonical_id
from mapping m
where row.highlight_act_id = m.old_id;

delete from public.acts
where id in (3474, 2459, 943, 211, 2270, 62);

update public.acts set name = 'Background Music' where id = 3475;
update public.acts set name = 'Francis' where id = 32;
update public.acts set name = 'OLIV' where id = 2225;
update public.acts set name = 'TBA' where id = 185;
update public.acts set name = 'The Shredder' where id = 3496;

alter table public.acts
    add column if not exists name_normalized text
    generated always as (lower(btrim(name))) stored;

alter table public.acts
    drop constraint if exists acts_name_not_blank;
alter table public.acts
    add constraint acts_name_not_blank check (btrim(name) <> '');

create unique index if not exists acts_name_normalized_key
    on public.acts(name_normalized);

commit;
