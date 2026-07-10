-- Cigar Log Supabase setup with owner + read-only viewer support.
-- Run this in Supabase SQL Editor for a fresh setup, or run again safely after older versions.

create table if not exists public.cigars (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,

  name text not null,
  status text not null default 'owned' check (status in ('owned', 'smoked', 'wishlist')),
  quantity integer not null default 1,
  log_order integer,

  brand text,
  company text,
  made_in text,
  vitola text,
  strength integer check (strength is null or strength between 1 and 5),
  rating integer check (rating is null or rating between 1 and 5),

  bought_date date,
  smoked_date date,
  price text,

  wrapper_leaf text,
  wrapper_origin text,
  binder_leaf text,
  binder_origin text,
  filler_leaf text,
  filler_origin text,

  taste text,
  draw text,
  burn text,
  nicotine text,
  pairing text,
  link text,
  notes text,

  image_file text,
  image_url text,
  image_path text,
  image_crop_x numeric default 50,
  image_crop_y numeric default 50,
  image_zoom numeric default 1,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (id, user_id)
);

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

-- Cigar access table policies: users can see access rows involving themselves.
drop policy if exists "Users can read own cigar access" on public.cigar_access;
drop policy if exists "Users can read involved cigar access" on public.cigar_access;

create policy "Users can read involved cigar access"
on public.cigar_access
for select
to authenticated
using (user_id = auth.uid() or owner_id = auth.uid());

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_cigars_updated_at on public.cigars;
create trigger set_cigars_updated_at
before update on public.cigars
for each row execute function public.set_updated_at();


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

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cigar-photos',
  'cigar-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Replace old storage policies.
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

-- IMPORTANT:
-- After creating your own Supabase Auth user, add yourself as owner:
-- insert into public.cigar_access (user_id, owner_id, access_level)
-- values ('YOUR_USER_ID', 'YOUR_USER_ID', 'owner')
-- on conflict (user_id, owner_id) do update set access_level = excluded.access_level;
--
-- To add a read-only viewer:
-- insert into public.cigar_access (user_id, owner_id, access_level)
-- values ('VIEWER_USER_ID', 'YOUR_USER_ID', 'read')
-- on conflict (user_id, owner_id) do update set access_level = excluded.access_level;
