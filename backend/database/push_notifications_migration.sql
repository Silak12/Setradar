-- ═══════════════════════════════════════════════════════════════════════
-- Push Notifications Migration
-- Run this in your Supabase SQL editor
-- ═══════════════════════════════════════════════════════════════════════

-- 1. Push Subscriptions (stores browser push endpoints per device)
create table if not exists push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  endpoint    text not null,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  unique(user_id, endpoint)
);

alter table push_subscriptions enable row level security;

create policy "Users manage own subscriptions"
  on push_subscriptions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 2. Notification Preferences (one row per user)
create table if not exists notification_preferences (
  user_id                        uuid primary key references auth.users(id) on delete cascade,
  -- Timetable für gefolgten DJ bei gefoltem Event erscheint
  notify_timetable_act_event     boolean default true,
  -- Timetable öffentlich für gefoltes Event
  notify_timetable_event_public  boolean default true,
  -- Gästeliste / Friendlist / Skiplist Story von gefoltem DJ
  notify_guestlist_story         boolean default true,
  -- Neues Event bei gefoltem Club angekündigt
  notify_new_event_club          boolean default true,
  -- Erinnerung am Tag des Events (für gefolte Events)
  notify_event_day_reminder      boolean default false,
  updated_at                     timestamptz default now()
);

alter table notification_preferences enable row level security;

create policy "Users manage own prefs"
  on notification_preferences for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 3. Index for fast user lookups
create index if not exists idx_push_sub_user on push_subscriptions(user_id);
create index if not exists idx_notif_pref_user on notification_preferences(user_id);

-- 4. Helper: upsert default prefs on signup (optional trigger)
create or replace function create_default_notification_prefs()
returns trigger language plpgsql security definer as $$
begin
  insert into notification_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_notif_prefs on auth.users;
create trigger on_auth_user_created_notif_prefs
  after insert on auth.users
  for each row execute procedure create_default_notification_prefs();
