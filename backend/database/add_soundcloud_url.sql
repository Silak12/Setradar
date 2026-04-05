-- Add SoundCloud URL to acts table
alter table public.acts add column if not exists soundcloud_url text null;

-- Allow read access for existing roles
grant select (soundcloud_url) on public.acts to anon, authenticated;
