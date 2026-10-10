# Order — White-label Mobile Ordering App

Production-ready, white-label mobile ordering app for a single-store owner
(supermarket, pharmacy, retail shop) with three roles: **Client**, **Admin**,
and **Owner**. Built with Expo (React Native) + Supabase.

- iOS + Android via Expo (managed workflow, Expo Router v3)
- TypeScript + NativeWind (Tailwind)
- Zustand for state (cart, auth, store settings)
- Supabase (Postgres, Auth, Realtime, Storage)
- WhatsApp deep-linking (no paid SMS) for order status updates
- Cash on Delivery by default; Stripe wired modularly for later card toggle
- Expo Notifications + sound chime for live order alerts

---

## 1. Prerequisites

- Node.js 20+
- `npm` or `pnpm`
- Expo CLI: `npm install -g expo-cli eas-cli`
- A Supabase project (free tier is fine)
- (Optional) Stripe account for card payments

## 2. Install

```bash
cd Order
npm install
cp .env.example .env
# fill in EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY
```

## 3. Supabase Setup

1. Create a project at <https://supabase.com>.
2. Grab `Project URL` and `anon public` key → put them in `.env`.
3. Apply the migrations and seed:

   **Option A — Supabase CLI (recommended)**
   ```bash
   supabase link --project-ref <YOUR_REF>
   supabase db push       # runs supabase/migrations/*
   supabase db execute --file supabase/seed.sql
   ```

   **Option B — Dashboard SQL editor**
   Paste each file in order:
   1. `supabase/migrations/20260101000000_init_schema.sql`
   2. `supabase/migrations/20260101000001_rls_policies.sql`
   3. `supabase/migrations/20260101000002_realtime.sql`
   4. `supabase/seed.sql`

4. **Create the Owner auth user.**
   In the Supabase dashboard: *Authentication → Users → Add user*.
   Email: `owner@storename.com`, pick a password. Then re-run
   `supabase/seed.sql` (the `do $$ ... end$$` block picks up the auth user
   by email and promotes the profile to the `owner` role).

5. **(Optional) Enable Google OAuth** for Client sign-in.
   Supabase dashboard → *Authentication → Providers → Google*. Add your
   OAuth client ID / secret from Google Cloud, and add the following
   redirect URL to the Supabase provider config and to Google Cloud:
   `order://sign-in`

## 4. Run in Development

```bash
# Metro dev server
npm run start

# Native dev client (requires one-time EAS build or `expo prebuild`)
npm run android
npm run ios
```

Open the app:
- **Guest/Client:** no sign-in needed, just shop and checkout.
- **Owner:** tap the top-right briefcase icon or go to
  `/sign-in` → *Staff sign-in* → enter the owner credentials.
- **Admin:** same flow once you create a user with role `'admin'` in the
  `profiles` table.

## 5. Native Build (EAS)

### Preview (internal testing)

```bash
# Android .apk (sideload-friendly)
eas build --profile preview --platform android

# iOS simulator build
eas build --profile preview --platform ios
```

### Production (store-ready)

```bash
# Android App Bundle (.aab) for Google Play
eas build --profile production --platform android

# iOS archive (.ipa) for App Store Connect
eas build --profile production --platform ios
```

### Submit

```bash
eas submit --platform android   # requires secrets/play-service-account.json
eas submit --platform ios       # fill ascAppId + appleTeamId in eas.json
```

> Before your first EAS build, update `extra.eas.projectId` in `app.json`
> and the `ascAppId` / `appleTeamId` fields in `eas.json`. Also replace
> `com.storename.orderingapp` with your actual reverse-DNS bundle id.

## 6. Repo Structure

```
Order/
├── app/                       Expo Router v3 routes
│   ├── _layout.tsx            Root stack + providers (Stripe, Auth, Settings)
│   ├── index.tsx              Catalog (Home)
│   ├── cart.tsx               Cart modal
│   ├── checkout.tsx           Checkout form (dynamic required fields)
│   ├── order-confirmation.tsx Order summary + WhatsApp contact
│   ├── sign-in.tsx            Email (staff) + Google (client) + Guest
│   ├── (owner)/
│   │   ├── _layout.tsx        Owner tab bar + role guard
│   │   ├── dashboard.tsx      Live orders (realtime + WhatsApp triggers)
│   │   ├── inventory.tsx      Product CRUD + stock toggle
│   │   └── settings.tsx       Store settings (fees, methods, fields)
│   └── (admin)/
│       ├── _layout.tsx        Admin tab bar + role guard (admin|owner)
│       └── audit.tsx          Read-only orders + stock audit
├── src/
│   ├── lib/
│   │   ├── supabase.ts        Supabase client singleton
│   │   ├── whatsapp.ts        Deep-link builder + openURL wrapper
│   │   ├── validation.ts      E.164 phone + dynamic field validation
│   │   ├── notifications.ts   Expo Notifications setup + presenters
│   │   ├── stripe.ts          Modular Stripe wrapper (stubbed intents)
│   │   └── format.ts          Currency / date / short id helpers
│   ├── stores/
│   │   ├── cart.ts            Zustand cart (persisted to AsyncStorage)
│   │   ├── auth.ts            Supabase session + profile store
│   │   └── settings.ts        Store-wide settings loader/saver
│   ├── components/            Shared UI (ProductCard, OrderCard, ...)
│   └── types/database.ts      Hand-maintained schema types
├── supabase/
│   ├── migrations/
│   │   ├── 20260101000000_init_schema.sql
│   │   ├── 20260101000001_rls_policies.sql
│   │   └── 20260101000002_realtime.sql
│   └── seed.sql
├── assets/                    icons, splash, notification sound (add your own)
├── app.json
├── eas.json
├── .env.example
└── package.json
```

## 7. Key Behaviors

- **Guest checkout**: anonymous users may insert into `orders` / `order_items`
  thanks to the public-insert RLS policy, with `user_id` null.
- **Authenticated auto-fill**: checkout fields pre-populate from
  `profiles.full_name / phone_number / address_json`.
- **Strict E.164 validation**: enforced on submit; the normalizer strips
  spaces, dashes, parens, and leading zeros.
- **WhatsApp status updates**: when the Owner advances an order, we build
  `https://wa.me/<phone>?text=<encoded-message>` and launch via
  `Linking.openURL`. The owner's native WhatsApp opens with the recipient
  and message pre-filled.
- **Realtime new-order banner**: Owner dashboard subscribes to
  `postgres_changes` on `orders`. On `INSERT` a banner slides in, a local
  notification fires with sound, and the row joins the top of the Pending
  bucket.
- **Modular Stripe**: card/Apple Pay/Google Pay are off by default. Toggle
  them from the Settings screen. The checkout screen auto-shows active
  methods. Deploy a Supabase Edge Function at `/payments/intent` that
  returns a `clientSecret` to activate the Stripe sheet (see
  `src/lib/stripe.ts`).

## 8. Add Your Own Assets

Drop the following into `assets/` before `eas build`:

- `icon.png` (1024×1024)
- `adaptive-icon.png` (foreground, 1024×1024)
- `splash.png` (1242×2436)
- `favicon.png` (48×48)
- `notification-icon.png` (96×96, monochrome)
- `sounds/new-order.wav`

Expo Router + `expo-splash-screen` + `expo-notifications` reference them
automatically via `app.json`.
