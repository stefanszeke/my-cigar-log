-- Pityu Cigar Log v7 gallery/profile-photo migration.
-- Run this once in Supabase SQL Editor if you already ran the earlier setup.

create table if not exists public.cigar_photos (
  id text primary key,
  cigar_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  image_path text not null,
  caption text,
  sort_order integer not null default 0,
  is_profile boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (cigar_id, user_id) references public.cigars(id, user_id) on delete cascade
);

alter table public.cigar_photos enable row level security;
grant select, insert, update, delete on public.cigar_photos to authenticated;

drop policy if exists "Users can read allowed cigar photos rows" on public.cigar_photos;
drop policy if exists "Owners can insert cigar photos rows" on public.cigar_photos;
drop policy if exists "Owners can update cigar photos rows" on public.cigar_photos;
drop policy if exists "Owners can delete cigar photos rows" on public.cigar_photos;

create policy "Users can read allowed cigar photos rows"
on public.cigar_photos
for select
to authenticated
using (
  exists (
    select 1
    from public.cigar_access ca
    where ca.user_id = auth.uid()
      and ca.owner_id = cigar_photos.user_id
      and ca.access_level in ('owner', 'read')
  )
);

create policy "Owners can insert cigar photos rows"
on public.cigar_photos
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

create policy "Owners can update cigar photos rows"
on public.cigar_photos
for update
to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1
    from public.cigar_access ca
    where ca.user_id = auth.uid()
      and ca.owner_id = cigar_photos.user_id
      and ca.access_level = 'owner'
  )
)
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.cigar_access ca
    where ca.user_id = auth.uid()
      and ca.owner_id = cigar_photos.user_id
      and ca.access_level = 'owner'
  )
);

create policy "Owners can delete cigar photos rows"
on public.cigar_photos
for delete
to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1
    from public.cigar_access ca
    where ca.user_id = auth.uid()
      and ca.owner_id = cigar_photos.user_id
      and ca.access_level = 'owner'
  )
);

-- Move old single-photo image_path values into the gallery table.
insert into public.cigar_photos (id, cigar_id, user_id, image_path, sort_order, is_profile)
select 'legacy-' || c.id, c.id, c.user_id, c.image_path, 0, true
from public.cigars c
where c.image_path is not null
  and c.image_path <> ''
  and not exists (
    select 1
    from public.cigar_photos p
    where p.cigar_id = c.id
      and p.user_id = c.user_id
      and p.image_path = c.image_path
  )
on conflict (id) do nothing;
