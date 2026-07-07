# Chrome Web Store submission — ShipBots Customer Service

Everything needed to publish and update the extension on the Web
Store. First submission is manual; every future release is: bump
version → `npm run pack:store` → upload the new zip.

## First-time submission checklist

1. **Register once** at <https://chrome.google.com/webstore/devconsole>
   (sign in with `andres@shipbots.com`, pay the one-time $5 fee).
2. **Build the zip**: `npm run pack:store`. Output lands in
   `docs/store-listing/zips/shipbots-cs-vX.Y.Z.zip`.
3. In the dev console click **Add new item** and upload the zip.
4. Open **Store listing** in the sidebar:
   - **Name / summary / description** — paste from `listing.md`.
   - **Category** — Productivity → Workflow & Planning.
   - **Language** — English.
   - **Icon** — Chrome pulls the 128×128 from the manifest; no
     action needed.
   - **Screenshots** — drag PNGs from `screenshots/` (need at
     least one 1280×800 or 640×400; three is better).
5. Open **Privacy practices**:
   - **Single purpose**: "Companion popup for the ShipBots
     Onboarding Dashboard — live client search plus a read-only
     inline info panel."
   - **Permission justifications** — paste each row from
     `permissions.md`.
   - **Data usage** — extension does not sell data, does not use
     it for creditworthiness/lending, does not use it for
     unrelated purposes. All three "no" checkboxes.
6. Open **Distribution** (visibility):
   - **Visibility**: **Unlisted**. Only teammates with the direct
     Web Store URL can install; not searchable. Chrome still
     auto-updates every ~5 hours.
   - **Regions**: All regions.
7. **Submit for review**. Turnaround is typically 1–3 business
   days for a Manifest V3 unlisted extension with minimal
   permissions.
8. Once approved, copy the Web Store URL into the `/install` page
   (replace the self-hosted zip flow) and share with the team.

## Publishing an update

1. Change something in `chrome-extension/`.
2. Bump `chrome-extension/manifest.json` → `version` (semver;
   Chrome sorts by dotted-integer).
3. Commit + push (standing rule).
4. `npm run pack:store` — writes a new `shipbots-cs-vX.Y.Z.zip`.
5. In the dev console: your item → **Package** → **Upload new
   package**. Pick the fresh zip.
6. Submit. First-time reviews take 1–3 days; incremental updates
   are usually same-day. Every user's Chrome polls the store
   roughly every 5 hours and installs the update silently.

## Folder layout

```
docs/store-listing/
├── README.md          ← you are here
├── listing.md         ← name / short desc / detailed desc, ready to copy
├── permissions.md     ← reviewer-facing justifications per permission
├── screenshots/       ← PNG parking spot (uploaded via console, not shipped)
└── zips/              ← output of `npm run pack:store` (gitignored)
```
