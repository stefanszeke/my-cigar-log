select
  count(*) as photo_count,
  round(
    sum(
      coalesce(
        (metadata->>'size')::numeric,
        (metadata->>'contentLength')::numeric,
        0
      )
    ) / 1024 / 1024,
    2
  ) as total_mb
from storage.objects
where bucket_id = 'cigar-photos';