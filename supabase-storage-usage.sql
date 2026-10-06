-- Storage usage RPC for the "Storage usage" menu item.
-- Run this in Supabase SQL Editor (safe to run again).
-- Returns the size of every database on the server (the Supabase limit counts them all)
-- and the total size of files in the photo bucket.
-- Only users with owner access can call it.

drop function if exists public.get_storage_usage();

create or replace function public.get_storage_usage()
returns table (
  database_bytes bigint,
  database_breakdown jsonb,
  storage_bytes bigint,
  storage_file_count bigint
)
language plpgsql
security definer
set search_path = public, storage, pg_catalog
as $$
declare
  db record;
  db_size bigint;
  total bigint := 0;
  breakdown jsonb := '[]'::jsonb;
begin
  if not exists (
    select 1
    from public.cigar_access ca
    where ca.user_id = auth.uid()
      and ca.access_level = 'owner'
  ) then
    raise exception 'Only owners can view storage usage.';
  end if;

  for db in select datname from pg_database order by datname loop
    begin
      db_size := pg_database_size(db.datname);
    exception when others then
      db_size := null;
    end;
    if db_size is not null then
      total := total + db_size;
      breakdown := breakdown || jsonb_build_object(
        'name', db.datname,
        'bytes', db_size,
        'is_app', db.datname = current_database()
      );
    end if;
  end loop;

  return query
  select
    total,
    breakdown,
    coalesce(sum(
      coalesce(
        (o.metadata->>'size')::bigint,
        (o.metadata->>'contentLength')::bigint,
        0
      )
    ), 0)::bigint,
    count(o.id)::bigint
  from storage.objects o
  where o.bucket_id = 'cigar-photos';
end;
$$;

revoke all on function public.get_storage_usage() from public, anon;
grant execute on function public.get_storage_usage() to authenticated;

-- Make the API see the new function right away.
notify pgrst, 'reload schema';
