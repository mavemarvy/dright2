# DRIGHT2 Mobile

DRIGHT2 now has two intentionally separate Expo/React Native applications.

## Applications

| App | Android application ID | iOS bundle ID | Audience |
| --- | --- | --- | --- |
| DRIGHT | `com.dright.app` | `com.dright.app` | Buyers, vendors, affiliates, creators and other ordinary platform users |
| DRIGHT Admin | `com.dright.admin` | `com.dright.admin` | Active DRIGHT administrators only |

Both apps use the existing DRIGHT2 Supabase Auth, database, RLS policies, realtime-capable data model and device-account security functions. They are separate binaries and can be installed side-by-side.

## Security boundary

- The user app has no admin interface and refuses an active administrator session.
- The admin app has no public signup flow. After Supabase Auth succeeds it checks the canonical `public.users` row and requires `is_admin = true` and `admin_status = 'active'`.
- Existing Supabase RLS remains authoritative for every table. The admin app does not use a service-role key.
- Both apps call DRIGHT2's existing `claim_current_device` RPC using an OS-provided native identifier where available, with a stable local fallback. On iOS, apps from the same vendor receive the same vendor ID. On Android, the Android ID is scoped by device/user/signing key, so use the same Android signing key for both DRIGHT apps if cross-app device identity must be identical.
- The publishable key belongs in Expo environment variables. Do not add a Supabase secret/service-role key to either app.

## Configure

In each application directory, copy `.env.example` to `.env` and set the DRIGHT2 publishable key:

```bash
EXPO_PUBLIC_SUPABASE_URL=https://vtiardblxpaeekbfvhjo.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

Install and run:

```bash
cd mobile/user-app
npm install
npx expo start
```

and separately:

```bash
cd mobile/admin-app
npm install
npx expo start
```

## EAS projects and store builds

Initialize each directory as a separate EAS project. This is important: do not point both folders to one EAS project.

```bash
cd mobile/user-app
npx eas-cli@latest init
npx eas-cli@latest build -p android --profile preview
npx eas-cli@latest build -p ios --profile preview

cd ../admin-app
npx eas-cli@latest init
npx eas-cli@latest build -p android --profile preview
npx eas-cli@latest build -p ios --profile preview
```

Production builds use the `production` profile.

## Current mobile foundation

### DRIGHT user app
- Existing-account login
- New user signup and email-verification flow
- DRIGHT2 device-policy preflight/claim
- Active-admin exclusion
- Live approved marketplace
- Live buyer/seller orders
- Live user notifications with mark-as-read
- Profile/wallet summary
- Separate native package/bundle identity

### DRIGHT Admin
- Admin-only login
- Active-admin/account-status gate
- DRIGHT2 device-policy claim
- Dashboard counts
- Listing review queue
- Withdrawal queue (RBAC-aware)
- Support ticket queue (role-aware)
- Admin role/account page
- No public registration
- Separate native package/bundle identity

The first mobile foundation deliberately keeps high-impact admin mutations out of the client until each existing DRIGHT2 web-admin action/RPC is mapped and audited. RLS still controls every query.
