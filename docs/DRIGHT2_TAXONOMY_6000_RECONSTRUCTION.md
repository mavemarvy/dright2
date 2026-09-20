# DRIGHT2 6,000+ Taxonomy Reconstruction

Date: 2026-09-20

## Purpose

This reconstruction replaces the unavailable historical `marketplace_master_taxonomy_6000.xlsx` with a new, versioned DRIGHT2 taxonomy. It is additive and preserves existing category IDs and legacy listing behavior.

## Active taxonomy size after reconstruction

- Physical Products: 2,165
- Services: 1,345
- Jobs: 1,390
- Courses: 1,091
- Digital Products: 891
- Tasks: 535
- Total: 7,417 active nodes

## Hierarchy

1. Main Category
2. Category
3. Subcategory
4. Mini Category
5. Micro Category
6. Leaf Category
7. Tiny Category

Leaf is a display level, not the same thing as "has no children". A Leaf Category may remain selectable while optional Tiny Categories exist beneath it.

## Source/provenance model

Taxonomy rows can record:

- `source_taxonomy`
- `source_id`
- `source_version`
- `external_mappings`
- `synonyms`
- `form_template_key`
- `moderation_tier`
- `restricted`
- `age_gate`
- `selectable_endpoint`

Physical-product reconstruction uses a curated subset of Shopify Standard Product Taxonomy 2026-08. Existing DRIGHT2 roots are preserved and official Shopify descendants are mapped beneath the closest existing roots.

Job reconstruction is O*NET-family-aligned editorial taxonomy. O*NET occupation codes are not fabricated when an exact imported O*NET record is not present.

Course reconstruction is subject-aligned editorial taxonomy informed by the current course-browse model.

Services, Digital Products and Tasks use DRIGHT2 marketplace editorial taxonomies designed around user search intent.

## Classification versus attributes

Brands, exact models, RAM, storage, colour, sizes, job seniority, employment type, course level, language, delivery mode, pricing model, licence type and other faceted values belong in dynamic attributes/filter definitions rather than being multiplied into canonical taxonomy paths.

## Moderation

Category existence does not automatically imply unrestricted publication.

- `standard`
- `standard_authenticity`
- `credential_review`
- `vehicle_verification`
- `restricted_health_review`
- `adult_age_gate`
- `adult_regulated_review`

Unsupported tobacco/nicotine/alcohol and weapons-related Shopify branches were excluded from the curated physical import.

## Protected systems

This reconstruction does not replace or modify DRIGHT2 authority for:

- Sales Team
- Admin Task
- promotions
- platform fees
- checkout/payments
- orders
- commission distribution
- wallets
- refunds
- withdrawals/payouts
- financial reconciliation

## Import behavior

`system_import_marketplace_taxonomy_paths(jsonb)` is service-role only, additive, idempotent, and enforces a maximum seven-level category path.
