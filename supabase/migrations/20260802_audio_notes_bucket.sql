-- Create private storage bucket for audio notes
insert into storage.buckets (id, name, public)
values ('audio-notes', 'audio-notes', false)
on conflict do nothing;

-- RLS: each user can only access files under their own user-id folder
create policy "Users manage own audio notes"
on storage.objects for all
using (
  bucket_id = 'audio-notes'
  and auth.uid()::text = (storage.foldername(name))[1]
);
