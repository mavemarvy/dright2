# DRIGHT Starter signup payment gate

The DRIGHT Starter funnel is payment-gated.

- Visiting /dright/starter marks the current browser session as a paid Starter signup journey.
- /sign-up does not render the account form for that journey until Supabase confirms a successful Starter payment reference for the same purchase email.
- Payment verification is server-side via get_dright_starter_signup_eligibility.
- Admin-configured professional platform roles are also gated during normal signup.
- Buyer signup remains free.
- The funnel marker is cleared only after the verified purchase is claimed by the newly created account.
- Production rollout uses the standard GitHub → Vercel deployment path.


Production rollout marker: 2026-09-21 — Starter payment gate and headerless product page verified for production deployment.
