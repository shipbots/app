# ShipBots Customer Service — extension changelog

Release notes for the Chrome extension. The current store build is
**v0.47.0**. Upload the matching zip from
`docs/store-listing/zips/shipbots-cs-v0.47.0.zip` (manifest sits at the zip
root, as the Web Store requires). Teammates auto-update within ~5 hours
of a new upload — no action on their end.

---

## Highlights since v0.24.0

**The popup became a mini workspace.** What started as search + a
read-only info card now carries editing, three new views, and an
admin panel — without ever leaving the popup.

- **Client detail, reorganized** to mirror the dashboard's Customer
  Service categories (Contacts, Billing, Receiving, Packing & Shipping,
  Returns, Portals). Sections open **collapsed** for a compact first
  view and expand on demand.
- **Inline editing** of client fields and **editable / addable
  contacts**, right in the popup. A clean read view hides empty fields;
  the per-section **Edit** button only appears once a section is open.
- **Three new views — Tasks, Calendar, Projects.** My Tasks
  (Outstanding / Done), a real month-grid Calendar of *recent & upcoming
  client deliveries*, and an active-Projects browser. All three load
  **instantly from cache** and refresh in the background. Clicking a
  client from Tasks or Calendar opens it **inside the popup** instead of
  bouncing you to a new tab.
- **Admin: onboarding checklist.** Admins get an Onboarding panel with
  the checklist and completion progress, can **tick steps** and **change
  the onboarding status** directly, and can **deep-link into the
  onboarding app** for that client.
- **Documents fixed for good.** Per-section documents (Receiving /
  Packing / Returns) now always render, with no empty "Documents" flash.
  Two underlying bugs were fixed: a DOM insert error that silently
  aborted rendering, and — importantly — the **stale-download problem**,
  where re-downloading from `/install` kept serving an old build. The
  install zip is now committed and rebuilt on every deploy.
- **Search parity everywhere.** Results consolidate same-name clients
  and show sub-warehouse + AppDot/Portal. The in-detail "switch client"
  search now behaves **exactly like the main search bar** — same rich
  rows, arrow-key navigation, and Enter → top result.
- **Picks up where you left off.** Reopening the popup restores the
  last client you were viewing.

---

## Version history (v0.24.0 → v0.47.0)

| Version | Date | What changed |
|--------:|------|--------------|
| **0.47.0** | 2026-07-30 | **Billing info** now fills the **whole popup page** (not a thin side column) and is split into the same collapsible groups as the CS app — **General Billing Info**, **Payment Method**, **Pricing Info** — each expandable/collapsible. |
| **0.46.0** | 2026-07-29 | **Billing info** shows the full billing view **inside the popup** again (no new tab) — general info, **Payment Method / ACH**, and pricing — with an "Edit in dashboard ↗" link for changes. Still restricted to DocuSign-access users. |
| **0.45.0** | 2026-07-29 | **Billing info** now opens the client's full Billing tab in the dashboard in a **new tab** (everything — billing address, payments/ACH, pricing) via a `?tab=billing` deep-link, instead of the in-popup read-only panel. Still restricted to DocuSign-access users. |
| **0.44.0** | 2026-07-29 | New **Billing info** button next to Onboarding in the client header — a read-only billing view (address, legal/tax, contract, and SOW pricing). Restricted to DocuSign-access users; hidden for everyone else. |
| **0.43.0** | 2026-07-29 | Restored client opens **instantly** from a cached payload (no "Loading…" on reopen); the remembered view now expires after **15 min** so a stale open starts on the main menu. |
| **0.42.0** | 2026-07-24 | Sections open collapsed; in-detail "switch client" search matches the main search (rich rows, arrow keys, Enter → top result). |
| **0.41.0** | 2026-07-24 | Deep-link to the onboarding app for a client; in-detail client search; restore last-viewed client on reopen. |
| **0.40.0** | 2026-07-24 | **Root-cause docs fix** — an attachment-badge insert threw `NotFoundError` and aborted document rendering. |
| **0.39.0** | 2026-07-24 | First pass at the docs `DOMException` in `loadClientDocs` (insert ordering). |
| **0.38.0** | 2026-07-24 | Added document-fetch diagnostics to pinpoint the "no docs" reports. |
| **0.37.0** | 2026-07-24 | Admins can edit onboarding checklist steps and change the onboarding status. |
| **0.36.0** | 2026-07-24 | Instant (cached) Projects view + admin-only Onboarding checklist panel. |
| **0.35.0** | 2026-07-24 | Auto-open sections that have documents; **fixed the stale `/install` download** (zip committed + build hardened). |
| **0.34.0** | 2026-07-24 | Calendar subtitle reworded to "Recent & upcoming client deliveries". |
| **0.33.0** | 2026-07-24 | No empty "Documents" flash; per-section docs always visible. |
| **0.32.0** | 2026-07-23 | Edit button appears only when a section is expanded; editable / addable contacts. |
| **0.31.0** | 2026-07-23 | Clicking a client in Tasks/Calendar opens it in the popup, not the CS app. |
| **0.30.0** | 2026-07-23 | Instant (cached) Tasks/Calendar; Calendar upgraded to a real month grid. |
| **0.29.0** | 2026-07-23 | Clean read-only view (hide empty fields) + per-section Edit button. |
| **0.28.0** | 2026-07-23 | Create projects, inline-edit fields, in-popup Calendar + My Tasks. |
| **0.27.0** | 2026-07-23 | Sub-warehouse added to the search index (Sub column + bulk edit on the dashboard). |
| **0.26.0** | 2026-07-23 | Client detail reorganized into the CS app's categories. |
| **0.25.0** | 2026-07-23 | Search results show sub-warehouse + AppDot/Portal. |
| **0.24.0** | 2026-07-20 | Search consolidates same-name clients into one result; notes show the full author name. |

---

## Re-packing the store zip

```bash
npm run pack:store
```

Writes `docs/store-listing/zips/shipbots-cs-v<version>.zip` from the
current `chrome-extension/` source, with `manifest.json` at the zip
root. Bump `chrome-extension/manifest.json` `version` before packing so
the upload is uniquely named and teammates know to update.
