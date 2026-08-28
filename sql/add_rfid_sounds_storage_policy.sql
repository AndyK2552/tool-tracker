-- Run this once in the Supabase SQL editor. Grants admins permission to
-- LIST the contents of the rfid_sounds Storage bucket through the Storage
-- API, which the app's Speaker Test page needs (supabase.storage.from(...)
-- .list()) to show what files are available to play.
--
-- Marking the bucket "Public" only controls whether an object can be
-- downloaded without auth (what lets the board fetch files with its
-- service_role key) -- it does NOT grant list/read access through the API.
-- Storage access is its own set of RLS policies on storage.objects, same
-- idea as any other table's RLS in this project. Without this policy,
-- .list() silently returns an empty array for a logged-in admin rather
-- than an error, which looks like "no files" even though they're there.
create policy "Admins can list rfid_sounds files"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'rfid_sounds'
    and exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_admin = true)
  );
