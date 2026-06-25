'use client';

/**
 * Mini Apps view — iPhone-style grid of self-contained tools that live
 * inside the Customer Service surface. Each tile renders a colored icon,
 * a short label, and a hover tooltip with a longer description so the
 * user can scan the grid without clicking through.
 *
 * Adding a new app: append a new entry to APPS with its component.
 * Components receive an `onBack` prop and own their full UI inside the
 * area normally occupied by the grid.
 */

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { FileSpreadsheet, Sparkles, Loader2, Sheet, Warehouse } from 'lucide-react';

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
  Component?: React.ComponentType<{ onBack: () => void }>;
  externalUrl?: string;
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
];

export function MiniAppsView() {
  const [openAppId, setOpenAppId] = useState<string | null>(null);
  const open = APPS.find(a => a.id === openAppId);

  if (open?.Component) {
    const App = open.Component;
    return <App onBack={() => setOpenAppId(null)} />;
  }

  const handleTileClick = (app: AppDef) => {
    if (app.externalUrl) {
      window.open(app.externalUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    if (app.Component) {
      setOpenAppId(app.id);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <header className="mb-6">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#015280]" />
            <h1 className="text-lg font-semibold text-gray-900">Mini Apps</h1>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Focused tools that live inside the dashboard. Hover a tile to see what it does.
          </p>
        </header>

        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-x-4 gap-y-6">
          {APPS.map(app => (
            <AppTile key={app.id} app={app} onClick={() => handleTileClick(app)} />
          ))}

          {/* Placeholder slots so the grid hints at being a real iOS-style
              springboard with room to grow. Disabled, no click. */}
          {Array.from({ length: 3 }).map((_, i) => (
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
function AppTile({ app, onClick }: { app: AppDef; onClick: () => void }) {
  const [imgFailed, setImgFailed] = useState(false);
  const useImage = !!app.iconSrc && !imgFailed;
  const FallbackIcon = app.iconFallback ?? app.icon;

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col items-center gap-1.5 focus:outline-none"
      title={app.description}
    >
      <div
        className={`relative w-16 h-16 rounded-[18px] overflow-hidden flex items-center justify-center shadow-md group-hover:shadow-lg group-hover:-translate-y-0.5 transition-all ${
          useImage ? 'bg-white' : `bg-gradient-to-br ${app.bg} text-white`
        }`}
      >
        {useImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={app.iconSrc}
            alt={app.label}
            onError={() => setImgFailed(true)}
            className="w-full h-full object-cover"
          />
        ) : FallbackIcon ? (
          <FallbackIcon className="w-7 h-7" />
        ) : null}
      </div>
      <p className="text-[11px] font-medium text-gray-700 text-center leading-tight line-clamp-2 max-w-[88px]">
        {app.label}
      </p>
      <span className="hidden group-hover:block absolute z-20 mt-20 max-w-xs text-[11px] leading-snug text-white bg-gray-900/95 rounded-md px-2.5 py-1.5 shadow-lg pointer-events-none">
        {app.description}
      </span>
    </button>
  );
}
