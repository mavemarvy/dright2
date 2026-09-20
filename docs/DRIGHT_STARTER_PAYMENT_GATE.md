# DRIGHT Starter payment gate

The public DRIGHT Starter product is intentionally guest-only.

- Direct signup actions are not exposed on the Starter product page.
- Starter signup is unlocked only after server-side payment verification.
- The paid email must match the signup email.
- Purchase claim and platform trial entitlement occur only after a verified purchase is associated with the authenticated account.
- The Starter product route owns its own checkout UI and does not use the general public guest navigation header.

This document records the production behavior expected for the Starter onboarding flow.
