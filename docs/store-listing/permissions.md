# Permission justifications

The Chrome Web Store reviewer asks for a one-sentence
justification per permission and per host. These are ready to
paste into the **Privacy practices** tab, "Permission
justifications" section. Keep them plain-language — reviewers
reject boilerplate.

---

## `tabs`

```
Opens the ShipBots Dashboard in a new tab when a user clicks a client result in the popup or the "Open in dashboard" button. Not used to read tab content or observe browsing.
```

## `storage`

```
Persists the user's recent-searches list, the pinned mini-app order, and the last-selected view between popup opens. Never syncs, never leaves the browser.
```

## Host permission: `https://app-snowy-eight-64.vercel.app/*`

```
The extension is a companion for the ShipBots Onboarding Dashboard hosted at this URL. It calls the authenticated /api/clients/search-index and /api/client/[id] endpoints on that origin to power live client search and the inline info panel, and it opens deep links back into the dashboard for edits. No other origins are accessed.
```

---

## What the extension does NOT do

Useful to have ready in case the reviewer asks a follow-up:

- Does not inject scripts into any other page.
- Does not read the DOM of the pages a user visits.
- Does not use `activeTab`, `webRequest`, `webNavigation`,
  `cookies`, `identity`, or any remote-code features.
- Does not run a background service worker beyond the popup's
  lifetime.
- Does not sell, share, or transfer any user data. All data
  handling is by the ShipBots Dashboard itself under its own
  privacy policy.
