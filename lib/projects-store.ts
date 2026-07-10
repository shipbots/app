/**
 * Server-side data access for Projects (Postgres via Prisma).
 *
 * Persistence model: "document save". The client detail modal accumulates all
 * edits into a full Project object and saves the whole thing; upsertProject()
 * writes the core fields and replaces the child collections (subtasks,
 * documents, comments, activity) to match. This mirrors the modal's UX with
 * minimal wiring.
 *
 * Known limitation (documented, hardening deferred): whole-document saves are
 * last-write-wins, so two people editing the *same* project at once can clobber
 * each other. The fix is granular per-action endpoints with server-authored
 * activity — a follow-up. Blob file bytes are not deleted when a document row
 * is removed (orphan cleanup is also a follow-up); blobPath is round-tripped so
 * that cleanup is possible later.
 */

import { Prisma } from '@prisma/client';
import { getPrisma, isDbConfigured } from './db';
import type {
  Project,
  ProjectStatus,
  ProjectStatusKind,
  ProjectActivityKind,
} from './projects';
import { DEFAULT_PROJECT_STATUSES } from './projects';

export { isDbConfigured };

const projectInclude = {
  status: true,
  subtasks: { orderBy: { sortOrder: 'asc' } },
  documents: { orderBy: { addedAt: 'asc' } },
  comments: { orderBy: { at: 'asc' } },
  activity: { orderBy: { at: 'desc' } },
} satisfies Prisma.ProjectInclude;

type DbProject = Prisma.ProjectGetPayload<{ include: typeof projectInclude }>;

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);
const dateOnly = (d: Date | null | undefined): string | null => (d ? d.toISOString().slice(0, 10) : null);

function toClientProject(p: DbProject): Project {
  return {
    id: p.id,
    name: p.name,
    clientBoardItemId: p.clientBoardItemId,
    clientName: p.clientName,
    status: {
      id: p.status.id,
      label: p.status.label,
      kind: p.status.kind as ProjectStatusKind,
      color: p.status.color,
    },
    ownerEmail: p.ownerEmail,
    note: p.note,
    dueDate: dateOnly(p.dueDate),
    subtasks: p.subtasks.map(s => ({
      id: s.id,
      title: s.title,
      done: s.done,
      assigneeEmail: s.assigneeEmail,
      dueDate: dateOnly(s.dueDate),
      completedByEmail: s.completedByEmail,
      completedAt: iso(s.completedAt),
    })),
    documents: p.documents.map(d => ({
      id: d.id,
      name: d.name,
      kind: d.kind as 'file' | 'link',
      url: d.url ?? undefined,
      blobPath: d.blobPath ?? undefined,
      addedByEmail: d.addedByEmail,
      addedAt: iso(d.addedAt) as string,
    })),
    comments: p.comments.map(c => ({
      id: c.id,
      authorEmail: c.authorEmail,
      text: c.text,
      at: iso(c.at) as string,
    })),
    adhocCreated: p.adhocCreated,
    createdByEmail: p.createdByEmail,
    createdAt: iso(p.createdAt) as string,
    activity: p.activity.map(a => ({
      id: a.id,
      kind: a.kind as ProjectActivityKind,
      actorEmail: a.actorEmail,
      at: iso(a.at) as string,
      summary: a.summary,
    })),
  };
}

/** Make sure the three default statuses exist (idempotent). */
export async function ensureDefaultStatuses(): Promise<void> {
  const prisma = getPrisma();
  await Promise.all(
    DEFAULT_PROJECT_STATUSES.map((s, i) =>
      prisma.projectStatus.upsert({
        where: { id: s.id },
        create: { id: s.id, label: s.label, kind: s.kind, color: s.color, sortOrder: i },
        update: {},
      }),
    ),
  );
}

export async function listProjects(): Promise<Project[]> {
  const prisma = getPrisma();
  const rows = await prisma.project.findMany({ include: projectInclude, orderBy: { createdAt: 'desc' } });
  return rows.map(toClientProject);
}

export async function listStatuses(): Promise<ProjectStatus[]> {
  const prisma = getPrisma();
  const rows = await prisma.projectStatus.findMany({ orderBy: { sortOrder: 'asc' } });
  return rows.map(s => ({ id: s.id, label: s.label, kind: s.kind as ProjectStatusKind, color: s.color }));
}

/**
 * Create or fully replace a project from a client-supplied Project object.
 * `mode: 'create'` stamps createdByEmail from the session; 'update' leaves it.
 */
export async function upsertProject(
  input: Project,
  actorEmail: string,
  mode: 'create' | 'update',
): Promise<Project> {
  const prisma = getPrisma();

  // Ensure the status row exists (covers custom statuses reps add).
  await prisma.projectStatus.upsert({
    where: { id: input.status.id },
    create: {
      id: input.status.id,
      label: input.status.label,
      kind: input.status.kind,
      color: input.status.color,
    },
    update: { label: input.status.label, color: input.status.color },
  });

  const core = {
    name: input.name,
    clientBoardItemId: input.clientBoardItemId,
    clientName: input.clientName,
    statusId: input.status.id,
    ownerEmail: input.ownerEmail,
    note: input.note,
    dueDate: input.dueDate ? new Date(input.dueDate) : null,
    adhocCreated: input.adhocCreated,
  };

  await prisma.$transaction(async tx => {
    if (mode === 'create') {
      await tx.project.create({
        data: {
          id: input.id,
          ...core,
          createdByEmail: actorEmail,
          createdAt: input.createdAt ? new Date(input.createdAt) : undefined,
        },
      });
    } else {
      await tx.project.update({ where: { id: input.id }, data: core });
      // Replace child collections to match the incoming document.
      await tx.subtask.deleteMany({ where: { projectId: input.id } });
      await tx.projectDocument.deleteMany({ where: { projectId: input.id } });
      await tx.projectComment.deleteMany({ where: { projectId: input.id } });
      await tx.projectActivity.deleteMany({ where: { projectId: input.id } });
    }

    if (input.subtasks.length) {
      await tx.subtask.createMany({
        data: input.subtasks.map((s, i) => ({
          id: s.id,
          projectId: input.id,
          title: s.title,
          done: s.done,
          assigneeEmail: s.assigneeEmail,
          dueDate: s.dueDate ? new Date(s.dueDate) : null,
          completedByEmail: s.completedByEmail ?? null,
          completedAt: s.completedAt ? new Date(s.completedAt) : null,
          sortOrder: i,
        })),
      });
    }
    if (input.documents.length) {
      await tx.projectDocument.createMany({
        data: input.documents.map(d => ({
          id: d.id,
          projectId: input.id,
          name: d.name,
          kind: d.kind,
          url: d.url ?? null,
          blobPath: d.blobPath ?? null,
          addedByEmail: d.addedByEmail,
          addedAt: d.addedAt ? new Date(d.addedAt) : undefined,
        })),
      });
    }
    if (input.comments.length) {
      await tx.projectComment.createMany({
        data: input.comments.map(c => ({
          id: c.id,
          projectId: input.id,
          authorEmail: c.authorEmail,
          text: c.text,
          at: c.at ? new Date(c.at) : undefined,
        })),
      });
    }
    if (input.activity.length) {
      await tx.projectActivity.createMany({
        data: input.activity.map(a => ({
          id: a.id,
          projectId: input.id,
          kind: a.kind,
          actorEmail: a.actorEmail,
          summary: a.summary,
          at: a.at ? new Date(a.at) : undefined,
        })),
      });
    }
  });

  const saved = await prisma.project.findUnique({ where: { id: input.id }, include: projectInclude });
  return toClientProject(saved as DbProject);
}

export async function deleteProject(id: string): Promise<void> {
  const prisma = getPrisma();
  // Children cascade (onDelete: Cascade in the schema).
  await prisma.project.delete({ where: { id } });
}

/** Append a document row (link or an already-uploaded Blob file). */
export async function addDocument(
  projectId: string,
  doc: { name: string; kind: 'file' | 'link'; url?: string; blobPath?: string; addedByEmail: string },
): Promise<Project['documents'][number]> {
  const prisma = getPrisma();
  const row = await prisma.projectDocument.create({
    data: {
      projectId,
      name: doc.name,
      kind: doc.kind,
      url: doc.url ?? null,
      blobPath: doc.blobPath ?? null,
      addedByEmail: doc.addedByEmail,
    },
  });
  // Record it in the audit trail.
  await prisma.projectActivity.create({
    data: {
      projectId,
      kind: doc.kind === 'file' ? 'document_added' : 'link_added',
      actorEmail: doc.addedByEmail,
      summary: `added ${doc.kind === 'file' ? 'file' : 'link'} “${doc.name}”`,
    },
  });
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as 'file' | 'link',
    url: row.url ?? undefined,
    blobPath: row.blobPath ?? undefined,
    addedByEmail: row.addedByEmail,
    addedAt: row.addedAt.toISOString(),
  };
}

export async function projectExists(id: string): Promise<boolean> {
  const prisma = getPrisma();
  const found = await prisma.project.findUnique({ where: { id }, select: { id: true } });
  return !!found;
}
