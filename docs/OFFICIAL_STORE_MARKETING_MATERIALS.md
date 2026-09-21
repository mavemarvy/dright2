# Official DRIGHT Store Listings & Marketing Materials

Implemented September 2026.

## Official DRIGHT Store
- Admin listing manager under Admin → DRIGHT Store.
- Additional first-party DRIGHT products are stored as normal marketplace products plus first-party metadata.
- Official products are immediately approved.
- Marketplace platform commission, Admin Task, and Sales Team task are zero for first-party catalog creation.
- Product images/gallery, taxonomy, dynamic context fields, price/currency, affiliate commission, stock, brand, condition, tags, benefits, visibility, featured state, official badge and official platform rating are configurable.
- Starter Access now supports an uploaded cover/gallery while retaining its specialized payment-gated checkout flow.

## Optional Affiliate & Marketing Materials
Listing owners may attach optional:
- PDF/brochure
- flyer
- banner
- image
- video
- Drive/cloud link
- website/landing link
- other approved file/link

Supported on product/service/course/digital listings, jobs, tasks/campaigns, Starter Access and other first-party DRIGHT products.

Marketing materials are optional and are not part of listing validation. A material upload failure must not roll back an otherwise valid listing.

Authenticated users can view/open/copy the marketing kit from listing detail pages.

## Database
Migrations:
- `20260922010000_official_store_marketing_materials.sql`
- `20260922011500_official_marketing_material_authority.sql`

Storage bucket:
- `listing-marketing-materials`
