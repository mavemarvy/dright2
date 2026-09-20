-- Explicitly keep listing extension records inaccessible to browser clients.
-- Service-role operations continue to bypass RLS. This policy exists to make
-- the intentional deny-by-default posture explicit and linter-visible.

create policy marketplace_listing_extensions_deny_client_access
on public.marketplace_listing_extensions
for all
to anon, authenticated
using (false)
with check (false);
