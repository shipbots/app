'use client';

/**
 * Mini Apps view — iPhone-style grid of self-contained tools that live
 * inside the Customer Service surface. Each tile renders a colored icon,
 * a short label, and a hover tooltip with a longer description so the
 * user can scan the grid without clicking through.
 *
 * Tiles are reorderable via HTML5 drag-and-drop. The order is persisted
 * per signed-in user in localStorage so each person sees their own
 * arrangement. New apps added to APPS later land at the end of the
 * user's saved order automatically.
 *
 * Adding a new app: append a new entry to APPS with its component.
 * Components receive an `onBack` prop and own their full UI inside the
 * area normally occupied by the grid.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSession } from 'next-auth/react';
import {
  FileSpreadsheet, Sparkles, Loader2, Sheet, Warehouse,
  LifeBuoy, BookOpen, GripVertical, Camera,
} from 'lucide-react';

// Lazy-load the CSV formatter so the xlsx (~500KB) bundle only ships when
// the user actually opens that tile. Tiles that haven't been opened never
// fetch their JS.
const CsvOrderFormatterApp = dynamic(
  () => import('./csv-order-formatter-app').then(m => m.CsvOrderFormatterApp),
  {
    ssr: false,
    loading: () => (
      <div className="h-full flex items-center justify-center text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        <span className="text-sm">Loading app…</span>
      </div>
    ),
  },
);

interface AppDef {
  id: string;
  label: string;
  description: string;
  // Tailwind gradient classes for the icon tile (iOS-style). Ignored when
  // iconSrc is set (the image fills the whole tile).
  bg: string;
  iconBg: string;
  // Tile artwork — either a lucide React component drawn over the gradient
  // or a static image that fills the whole tile. Exactly one is set.
  icon?: React.ComponentType<{ className?: string }>;
  iconSrc?: string;
  // Optional fallback icon used if iconSrc fails to load (image missing).
  iconFallback?: React.ComponentType<{ className?: string }>;
  // A tile is either an in-app surface (Component mounts inline) or a
  // shortcut to an external URL (opens in a new tab). Exactly one is set.
  // When `comingSoon` is true, neither needs to be set — the tile is a
  // visible-but-inert placeholder with a "Soon" badge.
  Component?: React.ComponentType<{ onBack: () => void }>;
  externalUrl?: string;
  comingSoon?: boolean;
}

const APPS: AppDef[] = [
  {
    id: 'csv-order-formatter',
    label: 'CSV Order Formatter',
    description:
      'Drop in any CSV or Excel sheet — Claude reshapes it into the ShipHero order upload template, normalizes country codes, and asks you to confirm the SKU column before download.',
    bg: 'from-[#43c7ff] to-[#015280]',
    iconBg: '#015280',
    icon: FileSpreadsheet,
    Component: CsvOrderFormatterApp,
  },
  {
    id: 'sheet',
    label: 'SHEET',
    description: 'Opens the ShipBots Sheet workspace (shipbots.com/sheet) in a new tab.',
    bg: 'from-emerald-400 to-emerald-700',
    iconBg: '#047857',
    icon: Sheet,
    externalUrl: 'https://www.shipbots.com/sheet',
  },
  {
    id: 'ship-hero',
    label: 'Ship Hero',
    description: 'Opens the ShipHero login (shipbots.com/login) in a new tab.',
    bg: 'from-gray-100 to-gray-300',
    iconBg: '#cbd5e1',
    iconSrc: '/mini-apps/ship-hero.png',
    iconFallback: Warehouse,
    externalUrl: 'https://www.shipbots.com/login',
  },
  {
    id: 'sh-portal',
    label: 'SH Portal',
    description: 'Opens the ShipBots 3PL portal (shipbots.com/portal) in a new tab.',
    bg: 'from-white to-gray-100',
    iconBg: '#ffffff',
    iconSrc: '/mini-apps/sh-portal.svg',
    iconFallback: Warehouse,
    externalUrl: 'https://www.shipbots.com/portal',
  },
  {
    id: 'help-shiphero',
    label: 'Help Shiphero',
    description: 'How-to articles for clients using the AppDot version of ShipHero. Opens help.shipbots.com.',
    bg: 'from-orange-400 to-orange-600',
    iconBg: '#ea580c',
    icon: LifeBuoy,
    externalUrl: 'https://help.shipbots.com',
  },
  {
    id: 'help-portal',
    label: 'Help Portal',
    description: 'How-to articles for clients using the ShipHero Portal. Opens helpportal.shipbots.com.',
    bg: 'from-violet-500 to-violet-800',
    iconBg: '#5b21b6',
    icon: BookOpen,
    externalUrl: 'https://helpportal.shipbots.com',
  },
  {
    id: 'photo-to-po',
    label: 'Photo to PO',
    description: 'Snap a photo of an invoice or item list — Claude reads it and drafts a ShipHero purchase order. (In development.)',
    bg: 'from-amber-400 to-orange-600',
    iconBg: '#ea580c',
    icon: Camera,
    comingSoon: true,
  },
];

// ── Per-user order persistence ────────────────────────────────────────────
function storageKey(email: string | null | undefined): string | null {
  if (!email) return null;
  return `shipbots:mini-apps:order:${email.toLowerCase()}`;
}

function loadOrder(email: string | null | undefined, validIds: string[]): string[] {
  const key = storageKey(email);
  if (!key || typeof window === 'undefined') return validIds;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return validIds;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return validIds;
    const seen = new Set<string>();
    const kept = parsed.filter((id): id is string =>
      typeof id === 'string' && validIds.includes(id) && !seen.has(id) && (seen.add(id), true),
    );
    // Append any new apps that landed in the codebase after the user
    // last saved their order, so they don't silently disappear.
    for (const id of validIds) if (!seen.has(id)) kept.push(id);
    return kept;
  } catch {
    return validIds;
  }
}

function saveOrder(email: string | null | undefined, order: string[]) {
  const key = storageKey(email);
  if (!key || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(order));
  } catch {
    /* quota / disabled — skip silently */
  }
}

export function MiniAppsView() {
  const { data: session } = useSession();
  const userEmail = session?.user?.email ?? null;
  const validIds = useMemo(() => APPS.map(a => a.id), []);

  const [openAppId, setOpenAppId] = useState<string | null>(null);
  const [order, setOrder] = useState<string[]>(validIds);
  const [loaded, setLoaded] = useState(false);

  // Hydrate order from localStorage once we know which user is signed in.
  useEffect(() => {
    setOrder(loadOrder(userEmail, validIds));
    setLoaded(true);
  }, [userEmail, validIds]);

  // Persist whenever the user changes their arrangement.
  useEffect(() => {
    if (!loaded) return;
    saveOrder(userEmail, order);
  }, [order, userEmail, loaded]);

  // Drag-and-drop state — same pattern as pipeline-board / calendar-view.
  // Ref instead of state for the dragging id so we don't re-render the
  // whole grid on every dragenter event.
  const draggingRef = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const open = APPS.find(a => a.id === openAppId);
  if (open?.Component) {
    const App = open.Component;
    return <App onBack={() => setOpenAppId(null)} />;
  }

  const handleTileClick = (app: AppDef) => {
    // Coming-soon tiles are visible but inert — the tooltip says they're
    // in development and the click does nothing on purpose.
    if (app.comingSoon) return;
    if (app.externalUrl) {
      window.open(app.externalUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    if (app.Component) {
      setOpenAppId(app.id);
    }
  };

  const onDragStart = (e: React.DragEvent, id: string) => {
    draggingRef.current = id;
    e.dataTransfer.effectAllowed = 'move';
    // Required for Firefox to actually start the drag.
    e.dataTransfer.setData('text/plain', id);
  };

  const onDragOver = (e: React.DragEvent, id: string) => {
    if (!draggingRef.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (id !== dragOverId) setDragOverId(id);
  };

  const onDragLeave = (id: string) => {
    if (dragOverId === id) setDragOverId(null);
  };

  const onDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const sourceId = draggingRef.current;
    draggingRef.current = null;
    setDragOverId(null);
    if (!sourceId || sourceId === targetId) return;
    setOrder(prev => {
      const next = prev.filter(id => id !== sourceId);
      const idx = next.indexOf(targetId);
      if (idx === -1) return prev;
      next.splice(idx, 0, sourceId);
      return next;
    });
  };

  const onDragEnd = () => {
    draggingRef.current = null;
    setDragOverId(null);
  };

  // Render in the user's preferred order. Fall back to APPS order if a
  // saved id no longer matches (defensive — loadOrder already filters).
  const orderedApps = order
    .map(id => APPS.find(a => a.id === id))
    .filter((a): a is AppDef => !!a);

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <header className="mb-6">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#015280]" />
            <h1 className="text-lg font-semibold text-gray-900">Mini Apps</h1>
          </div>
          <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
            Focused tools that live inside the dashboard.
            <span className="text-gray-300">·</span>
            <span className="inline-flex items-center gap-0.5">
              <GripVertical className="w-3 h-3" />
              Drag tiles to reorder
            </span>
          </p>
        </header>

        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-x-4 gap-y-6">
          {orderedApps.map(app => (
            <AppTile
              key={app.id}
              app={app}
              onClick={() => handleTileClick(app)}
              onDragStart={e => onDragStart(e, app.id)}
              onDragOver={e => onDragOver(e, app.id)}
              onDragLeave={() => onDragLeave(app.id)}
              onDrop={e => onDrop(e, app.id)}
              onDragEnd={onDragEnd}
              isDropTarget={dragOverId === app.id}
            />
          ))}

          {/* Placeholder slots so the grid hints at being a real iOS-style
              springboard with room to grow. Disabled, no click. */}
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={`ph-${i}`} className="flex flex-col items-center gap-1.5 opacity-30 select-none">
              <div className="w-16 h-16 rounded-[18px] border-2 border-dashed border-gray-300" />
              <p className="text-[11px] text-gray-400">Coming soon</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── App tile ───────────────────────────────────────────────────────────────
// Lifted out so we can hold per-tile state (image-load fallback) without
// polluting MiniAppsView. Renders either a static image (iconSrc) that
// fills the whole rounded square, or a lucide icon drawn over a gradient.
// Now also draggable — when the user starts a drag, the parent updates the
// order and persists it.
function AppTile({
  app, onClick,
  onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd,
  isDropTarget,
}: {
  app: AppDef;
  onClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  isDropTarget: boolean;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const useImage = !!app.iconSrc && !imgFailed;
  const FallbackIcon = app.iconFallback ?? app.icon;

  return (
    <button
      type="button"
      onClick={onClick}
      draggable
      onDragStart={e => { setIsDragging(true); onDragStart(e); }}
      onDragEnd={() => { setIsDragging(false); onDragEnd(); }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`group flex flex-col items-center gap-1.5 focus:outline-none transition-opacity cursor-grab active:cursor-grabbing ${
        isDragging ? 'opacity-40' : ''
      }`}
      title={app.description}
    >
      <div
        className={`relative w-16 h-16 rounded-[18px] overflow-hidden flex items-center justify-center shadow-md group-hover:shadow-lg group-hover:-translate-y-0.5 transition-all ${
          useImage ? 'bg-white' : `bg-gradient-to-br ${app.bg} text-white`
        } ${isDropTarget ? 'ring-2 ring-offset-2 ring-[#43c7ff]' : ''} ${
          app.comingSoon ? 'opacity-70 saturate-75' : ''
        }`}
      >
        {useImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={app.iconSrc}
            alt={app.label}
            onError={() => setImgFailed(true)}
            className="w-full h-full object-cover pointer-events-none"
            draggable={false}
          />
        ) : FallbackIcon ? (
          <FallbackIcon className="w-7 h-7" />
        ) : null}
        {app.comingSoon && (
          <span className="absolute top-0 right-0 text-[8px] font-bold uppercase tracking-wider bg-gray-900/85 text-white px-1.5 py-0.5 rounded-bl-md">
            Soon
          </span>
        )}
      </div>
      <p className={`text-[11px] font-medium text-center leading-tight line-clamp-2 max-w-[88px] ${
        app.comingSoon ? 'text-gray-500' : 'text-gray-700'
      }`}>
        {app.label}
      </p>
      <span className="hidden group-hover:block absolute z-20 mt-20 max-w-xs text-[11px] leading-snug text-white bg-gray-900/95 rounded-md px-2.5 py-1.5 shadow-lg pointer-events-none">
        {app.description}
      </span>
    </button>
  );
}
