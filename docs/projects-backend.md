# Projects backend (Postgres + Vercel Blob)

The Projects workspace persists to Postgres via Prisma; uploaded documents go
to Vercel Blob. Until the database is provisioned the app runs on a mock
preview (the API reports `configured: false` and the UI keeps sample data),
so nothing breaks before setup.

## One-time provisioning

1. **Postgres** — Vercel dashboard → **Storage → Create Database → Postgres** →
   connect it to this project. Vercel injects `POSTGRES_PRISMA_URL` (pooled)
   and `POSTGRES_URL_NON_POOLING` (direct, for migrations).
2. **Blob** — Vercel dashboard → **Storage → Create → Blob** → connect. Gives
   `BLOB_READ_WRITE_TOKEN`.
3. **Pull env locally** so you can migrate/seed from your machine:
   ```
   vercel env pull .env.local
   ```
   (or paste the two `POSTGRES_*` URLs into `.env.local`).

## Create the tables + seed sample data

```
npm run db:migrate     # or: npx prisma migrate deploy   (applies migrations)
# first time, to create the initial migration:  npx prisma migrate dev --name init
npm run db:seed        # loads default statuses + the sample projects
```

On Vercel, `postinstall` runs `prisma generate` automatically. Run
`prisma migrate deploy` as part of your deploy (or once manually) so the schema
is applied in production.

## What's wired

- **CRUD** — create / read / update / delete projects (`/api/projects`,
  `/api/projects/[id]`). The detail modal saves the whole project
  (document-save); the Delete button removes it.
- **Documents** — links save with the project; files upload to Vercel Blob via
  `/api/projects/[id]/documents` (enabled once a project is saved).
- **Audit** — every project carries an append-only `ProjectActivity` list.
- **Fallback** — no DB env ⇒ mock preview, edits are session-only.

## Known follow-ups

- **Concurrency**: whole-document saves are last-write-wins. Harden with
  granular per-action endpoints + server-authored activity if two people edit
  the same project simultaneously.
- **Blob cleanup**: removing a file document deletes the row, not the blob
  bytes (`blobPath` is stored so a cleanup job can remove them later).
- **Reminders**: due-date reminders (Vercel Cron → assignee) are not built yet
  — decide the channel (email vs Slack) first.
- **ShipHero ad-hoc**: the completion prompt is manual for now.
