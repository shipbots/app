/**
 * Seed the projects database with the default statuses + the sample projects
 * (the same data the UI used as a mock preview). Idempotent — safe to re-run;
 * existing rows are left as-is.
 *
 * Run after provisioning + migrating:  npm run db:seed
 * (needs POSTGRES_PRISMA_URL / POSTGRES_URL_NON_POOLING in the environment.)
 */

import { PrismaClient } from '@prisma/client';
import { MOCK_PROJECTS, DEFAULT_PROJECT_STATUSES } from '../lib/projects';

const prisma = new PrismaClient();

async function main() {
  // Statuses — defaults plus any custom status a sample project references.
  const statuses = new Map(DEFAULT_PROJECT_STATUSES.map(s => [s.id, s]));
  for (const p of MOCK_PROJECTS) if (!statuses.has(p.status.id)) statuses.set(p.status.id, p.status);

  let sortOrder = 0;
  for (const s of statuses.values()) {
    await prisma.projectStatus.upsert({
      where: { id: s.id },
      create: { id: s.id, label: s.label, kind: s.kind, color: s.color, sortOrder: sortOrder++ },
      update: {},
    });
  }

  for (const p of MOCK_PROJECTS) {
    await prisma.project.upsert({
      where: { id: p.id },
      update: {},
      create: {
        id: p.id,
        name: p.name,
        clientBoardItemId: p.clientBoardItemId,
        clientName: p.clientName,
        statusId: p.status.id,
        ownerEmail: p.ownerEmail,
        note: p.note,
        dueDate: p.dueDate ? new Date(p.dueDate) : null,
        adhocCreated: p.adhocCreated,
        createdByEmail: p.createdByEmail,
        createdAt: new Date(p.createdAt),
        subtasks: {
          create: p.subtasks.map((s, i) => ({
            id: s.id,
            title: s.title,
            done: s.done,
            assigneeEmail: s.assigneeEmail,
            dueDate: s.dueDate ? new Date(s.dueDate) : null,
            completedByEmail: s.completedByEmail ?? null,
            completedAt: s.completedAt ? new Date(s.completedAt) : null,
            sortOrder: i,
          })),
        },
        documents: {
          create: p.documents.map(d => ({
            id: d.id,
            name: d.name,
            kind: d.kind,
            url: d.url ?? null,
            blobPath: d.blobPath ?? null,
            addedByEmail: d.addedByEmail,
            addedAt: new Date(d.addedAt),
          })),
        },
        comments: {
          create: p.comments.map(c => ({
            id: c.id,
            authorEmail: c.authorEmail,
            text: c.text,
            at: new Date(c.at),
          })),
        },
        activity: {
          create: p.activity.map(a => ({
            id: a.id,
            kind: a.kind,
            actorEmail: a.actorEmail,
            summary: a.summary,
            at: new Date(a.at),
          })),
        },
      },
    });
  }

  console.log(`Seeded ${statuses.size} statuses and ${MOCK_PROJECTS.length} projects.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async e => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
