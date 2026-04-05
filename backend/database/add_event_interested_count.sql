-- Add RA interested count to events table
alter table public.events add column if not exists interested_count integer null;

-- Allow read access for existing roles
grant select (interested_count) on public.events to anon, authenticated;
