-- Pityu Cigar Log general gallery (humidors, lighters, cutters, etc.) migration.
-- Run this once in Supabase SQL Editor. Reuses the existing 'cigar-photos' storage
-- bucket and its storage.objects policies (paths are stored under <user_id>/gallery/...,
-- which the existing policies already allow).

create table if not exists public.gallery_photos (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  image_path text not null,
  note text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.gallery_photos enable row level security;
grant select, insert, update, delete on public.gallery_photos to authenticated;

drop policy if exists "Users can read allowed gallery photos" on public.gallery_photos;
drop policy if exists "Owners can insert gallery photos" on public.gallery_photos;
drop policy if exists "Owners can update gallery photos" on public.gallery_photos;
drop policy if exists "Owners can delete gallery photos" on public.gallery_photos;

create policy "Users can read allowed gallery photos"
on public.gallery_photos
for select
to authenticated
using (
  exists (
    select 1
    from public.cigar_access ca
    where ca.user_id = auth.uid()
      and ca.owner_id = gallery_photos.user_id
      and ca.access_level in ('owner', 'read')
  )
);

create policy "Owners can insert gallery photos"
on public.gallery_photos
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.cigar_access ca
    where ca.user_id = auth.uid()
      and ca.owner_id = auth.uid()
      and ca.access_level = 'owner'
  )
);

create policy "Owners can update gallery photos"
on public.gallery_photos
for update
to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1
    from public.cigar_access ca
    where ca.user_id = auth.uid()
      and ca.owner_id = gallery_photos.user_id
      and ca.access_level = 'owner'
  )
)
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.cigar_access ca
    where ca.user_id = auth.uid()
      and ca.owner_id = gallery_photos.user_id
      and ca.access_level = 'owner'
  )
);

create policy "Owners can delete gallery photos"
on public.gallery_photos
for delete
to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1
    from public.cigar_access ca
    where ca.user_id = auth.uid()
      and ca.owner_id = gallery_photos.user_id
      and ca.access_level = 'owner'
  )
);
