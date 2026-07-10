-- Migration for adding owner + read-only viewer support to an existing Cigar Log Supabase setup.
-- Run this in Supabase SQL Editor.

create table if not exists public.cigar_access (
  user_id uuid not null references auth.users(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  access_level text not null check (access_level in ('owner', 'read')),
  created_at timestamptz not null default now(),
  primary key (user_id, owner_id)
);


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

alter table public.cigars add column if not exists image_url text;

alter table public.cigars enable row level security;
alter table public.cigar_access enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.cigars to authenticated;
grant select on public.cigar_access to authenticated;
grant select on public.cigar_photos to authenticated;
grant select on storage.objects to authenticated;

-- Replace old cigar table policies.
drop policy if exists "Users can read own cigars" on public.cigars;
drop policy if exists "Users can insert own cigars" on public.cigars;
drop policy if exists "Users can update own cigars" on public.cigars;
drop policy if exists "Users can delete own cigars" on public.cigars;
drop policy if exists "Users can read allowed cigars" on public.cigars;
drop policy if exists "Owners can insert cigars" on public.cigars;
drop policy if exists "Owners can update cigars" on public.cigars;
drop policy if exists "Owners can delete cigars" on public.cigars;

create policy "Users can read allowed cigars"
on public.cigars
for select
to authenticated
using (
  exists (
    select 1
    from public.cigar_access ca
    where ca.user_id = auth.uid()
      and ca.owner_id = cigars.user_id
      and ca.access_level in ('owner', 'read')
  )
);

create policy "Owners can insert cigars"
on public.cigars
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

create policy "Owners can update cigars"
on public.cigars
for update
to authenticated
using (
  exists (
    select 1
    from public.cigar_access ca
    where ca.user_id = auth.uid()
      and ca.owner_id = cigars.user_id
      and ca.access_level = 'owner'
  )
)
with check (
  exists (
    select 1
    from public.cigar_access ca
    where ca.user_id = auth.uid()
      and ca.owner_id = cigars.user_id
      and ca.access_level = 'owner'
  )
);

create policy "Owners can delete cigars"
on public.cigars
for delete
to authenticated
using (
  exists (
    select 1
    from public.cigar_access ca
    where ca.user_id = auth.uid()
      and ca.owner_id = cigars.user_id
      and ca.access_level = 'owner'
  )
);

-- Access table policy.
drop policy if exists "Users can read own cigar access" on public.cigar_access;
drop policy if exists "Users can read involved cigar access" on public.cigar_access;

create policy "Users can read involved cigar access"
on public.cigar_access
for select
to authenticated
using (user_id = auth.uid() or owner_id = auth.uid());

-- Replace old storage policies so read-only viewers can also load your private photos.
drop policy if exists "Users can read own cigar photos" on storage.objects;
drop policy if exists "Users can upload own cigar photos" on storage.objects;
drop policy if exists "Users can update own cigar photos" on storage.objects;
drop policy if exists "Users can delete own cigar photos" on storage.objects;
drop policy if exists "Users can read allowed cigar photos" on storage.objects;
drop policy if exists "Owners can upload cigar photos" on storage.objects;
drop policy if exists "Owners can update cigar photos" on storage.objects;
drop policy if exists "Owners can delete cigar photos" on storage.objects;

create policy "Users can read allowed cigar photos"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'cigar-photos'
  and exists (
    select 1
    from public.cigar_access ca
    where ca.user_id = auth.uid()
      and ca.owner_id::text = (storage.foldername(name))[1]
      and ca.access_level in ('owner', 'read')
  )
);

create policy "Owners can upload cigar photos"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'cigar-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1
    from public.cigar_access ca
    where ca.user_id = auth.uid()
      and ca.owner_id = auth.uid()
      and ca.access_level = 'owner'
  )
);

create policy "Owners can update cigar photos"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'cigar-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1
    from public.cigar_access ca
    where ca.user_id = auth.uid()
      and ca.owner_id = auth.uid()
      and ca.access_level = 'owner'
  )
)
with check (
  bucket_id = 'cigar-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1
    from public.cigar_access ca
    where ca.user_id = auth.uid()
      and ca.owner_id = auth.uid()
      and ca.access_level = 'owner'
  )
);

create policy "Owners can delete cigar photos"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'cigar-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1
    from public.cigar_access ca
    where ca.user_id = auth.uid()
      and ca.owner_id = auth.uid()
      and ca.access_level = 'owner'
  )
);

-- After creating your own Supabase Auth user, run:

-- Multiple-photo gallery table. One photo can be marked as the profile photo in the app.
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

-- Backfill the new gallery table from the older single image_path column.
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

-- insert into public.cigar_access (user_id, owner_id, access_level)
-- values ('YOUR_USER_ID', 'YOUR_USER_ID', 'owner')
-- on conflict (user_id, owner_id) do update set access_level = excluded.access_level;
--
-- To add a read-only viewer, run:
-- insert into public.cigar_access (user_id, owner_id, access_level)
-- values ('VIEWER_USER_ID', 'YOUR_USER_ID', 'read')
-- on conflict (user_id, owner_id) do update set access_level = excluded.access_level;
