-- Pityu Cigar Log v8: read-only viewer photo access fix/check.
-- Run this if a viewer can see cigar rows but cannot see/open all photos.
-- It is safe to run again.

-- Basic table access grants for authenticated Supabase users.
grant usage on schema public to authenticated;
grant select on public.cigar_access to authenticated;
grant select on public.cigars to authenticated;
grant select on public.cigar_photos to authenticated;

-- The storage API normally has its own grants, but this keeps SQL/RLS explicit.
grant select on storage.objects to authenticated;

-- Cigar photo rows: viewers may read photo rows for owners they are allowed to read.
alter table public.cigar_photos enable row level security;

drop policy if exists "Users can read allowed cigar photos rows" on public.cigar_photos;

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

-- Keep write policies owner-only. These drops are safe even if the policies do not exist yet.
drop policy if exists "Owners can insert cigar photos rows" on public.cigar_photos;
drop policy if exists "Owners can update cigar photos rows" on public.cigar_photos;
drop policy if exists "Owners can delete cigar photos rows" on public.cigar_photos;

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

-- Storage objects: viewers may create signed URLs for files whose first folder is the owner's user id.
-- The app uploads photos as: OWNER_USER_ID / CIGAR_ID / filename.webp
-- Example: 7f...uuid/my-cigar-id/123-cigar.webp

drop policy if exists "Users can read own cigar photos" on storage.objects;
drop policy if exists "Users can read allowed cigar photos" on storage.objects;

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

-- Useful owner check: every stored photo should live under the owner's user_id folder.
-- If this query returns rows, those files may not be visible to viewers until their paths are fixed.
select
  p.cigar_id,
  c.name as cigar_name,
  p.image_path,
  p.user_id::text as expected_first_folder,
  (storage.foldername(p.image_path))[1] as actual_first_folder,
  case
    when (storage.foldername(p.image_path))[1] = p.user_id::text then 'ok'
    else 'path_folder_mismatch'
  end as status
from public.cigar_photos p
join public.cigars c
  on c.id = p.cigar_id
 and c.user_id = p.user_id
where p.image_path is not null
order by status desc, c.name, p.sort_order;
