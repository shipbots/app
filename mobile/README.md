# ShipBots CS — Android app (Expo / React Native)

A native mobile companion to the ShipBots Customer Service dashboard and Chrome
extension: search clients, open a client's details, and see your tasks — on the
go. Built with **Expo (React Native + TypeScript)** and **expo-router**.

> iOS comes essentially for free from the same codebase later; Android is the
> current target.

## Run it (fastest path)

1. Install [**Expo Go**](https://expo.dev/go) on your Android phone (Play Store).
2. From this folder:
   ```bash
   npm install
   npx expo start
   ```
3. Scan the QR code in the terminal with the Expo Go app. The app hot-reloads as
   you edit.

Prefer an emulator? Install Android Studio, create a device, then press `a` in
the `expo start` terminal (or `npm run android`).

## Current state

- **Clients tab** — live search over clients (name, legal entity, contact,
  warehouse), tap a row → client detail (contact, fulfillment, onboarding).
- **My Tasks tab** — your outstanding + done tasks.

### Data is mocked for now (on purpose)

The dashboard's API routes are gated by NextAuth **session cookies** (see
`proxy.ts` in the web app), so a phone can't call them with real data until we
add a **token-based mobile auth path**. Until then `USE_MOCK_DATA` in
[`src/config.ts`](src/config.ts) is `true` and the app runs against realistic
in-memory fixtures — so the whole UI is navigable today.

The API client ([`src/api/client.ts`](src/api/client.ts)) is already written so
that flipping that flag swaps in real `fetch` calls against the Vercel backend
(`API_BASE_URL`) with a `Bearer` token — the screens don't change.

## Next: real auth + live data (Phase 2)

1. **Mobile sign-in** — Google via `expo-auth-session`, restricted to
   `@shipbots.com`.
2. **Backend token exchange** — a small `/api/mobile/verify` route on the web app
   that validates the Google ID token, checks the email is allowed, and returns a
   signed app JWT.
3. **Accept the JWT at the edge** — teach `proxy.ts` to allow a valid
   `Authorization: Bearer` alongside NextAuth sessions.
4. Flip `USE_MOCK_DATA` to `false`.

Then: push notifications (new task / delivery alerts), client-info editing, and a
Play Store build via EAS (`eas build -p android`).

## Structure

```
src/
  app/                     # expo-router routes (file = screen)
    _layout.tsx            # root Stack (branded header)
    (tabs)/_layout.tsx     # bottom tabs (Clients, My Tasks)
    (tabs)/index.tsx       # Clients search + list
    (tabs)/tasks.tsx       # My Tasks
    client/[id].tsx        # Client detail
  api/                     # API client, types, mock fixtures
  components/              # themed primitives (from the Expo template)
  constants/theme.ts       # colors (ShipBots blue #0071BC), spacing
  config.ts                # API base URL + USE_MOCK_DATA flag
```

This folder is intentionally isolated from the Next.js web app: it has its own
`package.json`, it's excluded from the root `tsconfig.json`, and it's listed in
the root `.vercelignore` so Vercel never tries to build it.
