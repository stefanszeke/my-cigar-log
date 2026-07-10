# Pityu Cigar Log

A light, modern personal cigar journal with card/list views, multi-photo gallery, profile photo controls, crop controls, export/import, Supabase cloud sync, and optional read-only viewer accounts.

## Local use

Open `index.html` in your browser. Without Supabase, the app saves data to your browser's `localStorage`.

## Supabase cloud sync

This version is already configured in `supabase.config.js` with your Supabase project URL and publishable key.

Before using cloud sync, run `supabase-setup.sql` in:

`Supabase → SQL Editor → New query`

That creates:

- `public.cigars` table
- `public.cigar_access` table
- owner/read-only Row Level Security policies
- private `cigar-photos` storage bucket
- `cigar_photos` gallery table
- storage/table policies so viewers can load allowed private photos, but only owners can upload/update/delete photos

If you already ran v6 or another older setup, run only:

`supabase-gallery-migration.sql`

That adds the multi-photo gallery table and backfills your old single profile photos.


## Cigarový svet link import

Open **+ Add cigar**. At the top of the form there is an **Import from Cigarový svet** section.

Paste a product link like:

`https://obchod.cigarovysvet.sk/product/simon-beltre-cuatro-caminos-toro/`

Then click **Fill from link**. The app will try to fill the current add form with: name, brand, country, price, strength, wrapper/binder/filler, taste notes, product description, and product link.

Because the cigar shop is a third-party website, the browser may block direct page reading with CORS. The app first tries a direct read, then falls back to public reader/proxy services. If the import fails, paste the details manually or try again later.

There is still a hidden bookmarklet/manual JSON importer in the code from the previous version, but the normal workflow is now **+ Add cigar → paste link → Fill from link**.

## Private account mode

This version intentionally has no **Create account** button in the app.

Recommended setup:

1. In Supabase, go to `Authentication → Users` and create your own user.
2. Go to `Authentication → Providers → Email` / Auth settings.
3. Disable `Allow new users to sign up`.
4. Use only the app's **Sign in** screen after that.

## Add yourself as owner

After your own Supabase Auth user exists, copy your user ID and run:

```sql
insert into public.cigar_access (user_id, owner_id, access_level)
values ('YOUR_USER_ID', 'YOUR_USER_ID', 'owner')
on conflict (user_id, owner_id)
do update set access_level = excluded.access_level;
```

You need this row because the new security policies check `cigar_access` before allowing read/write access.

## Add a read-only viewer

Create the viewer manually in:

`Authentication → Users → Add user`

Then copy the viewer user ID and your own user ID. Run:

```sql
insert into public.cigar_access (user_id, owner_id, access_level)
values ('VIEWER_USER_ID', 'YOUR_USER_ID', 'read')
on conflict (user_id, owner_id)
do update set access_level = excluded.access_level;
```

The viewer can:

- sign in
- see your cigars
- open details
- open the image gallery

The viewer cannot:

- add cigars
- edit cigars
- delete cigars
- import cigars
- upload or delete photos

The UI hides those actions, and the database/storage policies also reject writes.

## Important security note

The publishable key in `supabase.config.js` is safe for browser apps only when Row Level Security is enabled. Never put a Supabase `service_role` key in this app.

A read-only viewer can still manually copy anything they can see on screen. Read-only means they cannot change your log, not that screenshots/copying are impossible.

## Photos

Uploaded photos are compressed in the browser before upload, stored in the private Supabase Storage bucket, and loaded through temporary signed URLs. Webshop imports do not save or link webshop product images; add your own photos in the gallery/photo section instead.

## GitHub Pages

You can host this folder on GitHub Pages. The app will still use Supabase for login, database, and photos.
