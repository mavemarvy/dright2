# DRIGHT2 Listing Engine — Protected Integration Boundaries

This upgrade is additive. Existing DRIGHT2 financial, promotion, Sales Team, and attribution behavior remains authoritative.

## Protected systems

The listing engine must not replace, repurpose, or silently recalculate any of the following existing systems:

- `products.admin_task_percent`
- `products.sales_team_task_percent`
- `products.affiliate_commission_percent`
- `products.commission_rate`
- Sales Team tier and contract logic
- `sales_team_*` tables and checkout attribution guards
- `commission_rate_rules` and `commission_splits`
- promotion authority, payment binding, campaign delivery, and promotion attribution
- `orders` financial attribution snapshots
- Admin/platform fee accounting
- `platform_accounts`, ledger entries, reconciliation, refunds, payouts, and withdrawal systems

## Compatibility model

1. Existing listings continue to work without taxonomy metadata.
2. New taxonomy data is stored in extension tables, not by destructively reshaping legacy listing tables.
3. New feature switches default to OFF.
4. Legacy fallback remains ON.
5. Seller commission policy initially affects only future UI defaults/validation after explicitly enabled.
6. Seller commission policy is not a payout engine. Authoritative payout distribution remains the existing `commission_rate_rules` / `commission_splits` system.
7. No listing-engine trigger may be attached to `orders`, `products`, `jobs`, promotion tables, Sales Team tables, or financial ledgers without a dedicated compatibility review.
8. Historical transactions must always use stored financial snapshots and must never be recomputed from current listing policy.

## Rollout order

- Foundation tables and read-only resolver
- Taxonomy mapping in shadow mode
- Dynamic category attributes in shadow mode
- Seller commission policy UI behind feature flag
- Category-aware filters/forms
- Admin taxonomy/schema editor
- Optional controlled migration of older listings

This file is a standing guardrail for future DRIGHT2 listing-engine work.
