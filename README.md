# Bootcamp Platform

Plataforma interna para Wild Atlantic Bootcamp construida con Next.js, Firebase y Cloud Functions. El proyecto cubre tres áreas principales:

- panel de cliente
- panel de staff
- panel de administración

También incluye mensajería, reservas, sesiones online, progreso del cliente, push notifications y cobros con Stripe Connect y Stripe Checkout.

## Stack

- Next.js 16 + React 19
- Firebase Auth
- Firestore
- Firebase Storage
- Firebase Cloud Functions
- Firebase Cloud Messaging
- Stripe Connect + Stripe Checkout

## Estructura

- `app/`: rutas de la aplicación
- `components/`: layout, auth, dashboard y UI compartida
- `lib/`: acceso a Firebase y lógica reutilizable
- `functions/`: Cloud Functions para pagos, webhooks, emails y utilidades backend
- `public/`: assets estáticos y service worker de FCM
- `docs/`: material comercial y mockups

## Requisitos

- Node.js 20+
- Firebase CLI
- proyecto Firebase configurado
- cuenta Stripe con webhooks configurados

## Variables de entorno

### Frontend (`.env.local`)

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=...
NEXT_PUBLIC_FIREBASE_VAPID_KEY=...
```

### Cloud Functions

```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_CONNECT_WEBHOOK_SECRET=whsec_...
APP_BASE_URL=https://app.bootcamp.rivcor.com
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=bookings@your-domain.com
WEBSITE_PRICING_REVALIDATE_SECRET=...
WEBSITE_PRICING_REVALIDATE_URL=https://www.bootcamp.rivcor.com/api/revalidate-pricing
```

Opcional:

```bash
STRIPE_CONNECT_RETURN_URL=https://app.bootcamp.rivcor.com/admin/payments
STRIPE_CONNECT_CLIENT_ID=ca_...
```

## Desarrollo local

Instalar dependencias:

```bash
npm install
cd functions && npm install && cd ..
```

Levantar la app:

```bash
npm run dev
```

Validación básica:

```bash
npm run lint
npm run build
npm run test:e2e:smoke
```

Pruebas por rol con cuentas QA:

```bash
node scripts/create-qa-users.mjs
npm run test:e2e:roles
```

Functions en local:

```bash
cd functions
npm run serve
```

## Despliegue

Desplegar Cloud Functions:

```bash
cd functions
npm run deploy
```

Si usas Firebase Hosting para estáticos:

```bash
firebase deploy
```

## Integraciones críticas

### Stripe Connect

Desde `/admin/payments` el admin puede:

- crear o reutilizar una cuenta conectada `standard`
- iniciar onboarding hospedado por Stripe
- refrescar estado de capacidades
- revisar requisitos pendientes

### Stripe Checkout

Flujos soportados:

- compra interna para clientes autenticados
- compra externa con generación de entitlement y código de canje

Webhook mínimo requerido:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`

Endpoint:

```bash
https://us-central1-YOUR_FIREBASE_PROJECT.cloudfunctions.net/stripeWebhook
```

### Push notifications

- el frontend usa FCM web
- el service worker vive en `public/firebase-messaging-sw.js`
- se requiere `NEXT_PUBLIC_FIREBASE_VAPID_KEY`

## Cierre técnico recomendado antes de producción

- verificar secretos reales en Firebase Functions
- confirmar webhooks de Stripe en entorno productivo
- probar onboarding Stripe Connect de punta a punta
- probar checkout interno y externo con webhook real
- probar envío de email de entitlement
- probar permisos por rol: `admin`, `staff`, `client`
- desplegar Cloud Functions cuando cambie backend sensible

## Estado actual del repo

En este momento la aplicación compila y tiene validación automatizada básica:

```bash
npm run lint
npm run build
npm run test:e2e:smoke
```

Además existe una suite separada para roles con cuentas QA reales:

```bash
node scripts/create-qa-users.mjs
npm run test:e2e:roles
```
