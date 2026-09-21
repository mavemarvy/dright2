# DRIGHT2 Subscription & Listing Capacity Architecture

This document records the production separation between platform access, listing capacity, and promotion products.

## DRIGHT Platform Access

- Buyer access remains free.
- Professional-role access is controlled by the Admin platform-access policy.
- The introductory free-access trial is controlled only by `platform_access_settings`.
- Optional subscription plans do not create additional 7/14-day trials.
- Verified DRIGHT Starter purchases can grant their own configured access period.

## Listing Capacity

- Listing capacity is not the same thing as a subscription or promotion.
- A configurable monthly free allowance is available first.
- When allowance is exhausted, users can purchase finite extra listing-capacity packs.
- Admin controls pack quantity, price, currency, validity, listing type, category, and activation.
- Allowance overrides can be configured by listing type, taxonomy category/subtree, role, or specific user.
- Product and Job creation are enforced server-side.
- Drafts and edits do not consume additional capacity.
- Existing listings keep their legacy behavior/history.

## Promotions

- Promotion products affect listing visibility/distribution.
- Promotions do not increase listing capacity.
- The mature DRIGHT2 promotion/payment authority remains unchanged.

## Trial authority

- `subscription_plans.trial_days` is forced to zero by database trigger.
- Platform trial settings remain centrally configurable.
- The DRIGHT Starter paid-product access grant remains separate.

## Currency and payment

- Subscription and capacity prices retain their Admin-configured source currency.
- The UI converts source prices to the user's selected display currency.
- Paystack validates the server-side price.
- USD-priced subscription/capacity products can settle through Paystack using the existing server FX conversion to NGN.

## Compatibility

The change is additive and does not replace Sales Team commissions, Admin Task calculations, marketplace fees, affiliate attribution, promotions, wallet accounting, withdrawals, payouts, refunds, or order financial authority.
