
drop policy if exists listing_review_events_owner_read on public.listing_review_events;
create policy listing_review_events_owner_read
on public.listing_review_events
for select to authenticated
using (
  owner_id=auth.uid()
  or public.can_review_listing_kind(listing_kind,'review')
);
