This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Web push setup

This project now includes Firebase Cloud Functions + Web Push plumbing.

### Environment variables (Next.js)

Create `.env.local` with:

```bash
NEXT_PUBLIC_FIREBASE_VAPID_KEY=YOUR_WEB_PUSH_CERTIFICATE_KEY_PAIR_PUBLIC_KEY
```

### Deploy functions

```bash
cd functions
npm install
cd ..
firebase deploy --only functions
```

## Stripe Connect setup

This project now uses Stripe Connect onboarding for `standard` connected accounts from `/admin/payments`.

### Required functions environment

Set these in your functions environment before deploying:

```bash
STRIPE_SECRET_KEY=sk_test_...
APP_BASE_URL=https://app.bootcamp.rivcor.com
STRIPE_WEBHOOK_SECRET=whsec_...
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=bookings@your-domain.com
```

Optional, only if you still need the legacy OAuth fallback for an already-connected account:

```bash
STRIPE_CONNECT_CLIENT_ID=ca_...
```

### What the admin flow does

- Creates or reuses a Stripe `standard` connected account
- Generates a hosted onboarding link with `return_url` and `refresh_url`
- Syncs `charges_enabled`, `payouts_enabled`, `details_submitted`, and pending requirements back into `settings/payments`

## Stripe checkout and entitlement emails

This project now includes:

- `createUserBookingCheckoutSession` for logged-in client purchases
- `createExternalBookingCheckoutSession` for purchases made outside the client account flow
- `stripeWebhook` to confirm paid bookings and to generate redemption codes after external Stripe payments
- automatic entitlement email delivery through Resend

### Webhook behavior

- Internal checkout:
  - creates a pending booking first
  - Stripe webhook marks it `paid` and `confirmed`
- External checkout:
  - Stripe webhook creates a `bookingEntitlements` document
  - generates a redemption code
  - emails the code to the buyer

### Webhook endpoint

After deploying functions, configure this endpoint in Stripe:

```bash
https://us-central1-YOUR_FIREBASE_PROJECT.cloudfunctions.net/stripeWebhook
```

Listen at minimum for:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`

### Notes

- Admin send UI is available at `/admin/notifications`.
- iOS web push is constrained and only works where iOS/browser support it, generally in Home Screen apps.
