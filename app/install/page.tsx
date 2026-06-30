/**
 * /install — public-ish download page for the ShipBots CS Chrome extension.
 *
 * Gated by the same auth as the rest of the dashboard (no special handling
 * needed; proxy.ts redirects unauthenticated visits to /login). Renders the
 * current version from the manifest and serves a build-time zip from
 * /public/chrome-extension.zip — the prebuild script regenerates the zip
 * on every deploy, so the download is always in sync with the codebase.
 */

import { Download, Sparkles, RefreshCw, Puzzle, FolderOpen, Pin } from 'lucide-react';
import manifest from '@/chrome-extension/manifest.json';

export const metadata = {
  title: 'Install ShipBots CS Extension',
};

export default function InstallPage() {
  const version = manifest.version as string;
  const downloadName = `shipbots-cs-extension-v${version}.zip`;

  return (
    <div className="min-h-full bg-gray-50">
      <div className="max-w-2xl mx-auto px-6 py-10">
        <header className="mb-8">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#015280] mb-1">
            Chrome extension · v{version}
          </p>
          <h1 className="text-2xl font-bold text-gray-900">Install ShipBots Customer Service</h1>
          <p className="text-sm text-gray-600 mt-2 leading-relaxed">
            A toolbar popup with live client search, the full client info panel, and the Mini
            Apps launcher. Reuses your existing Google login — no separate sign-in.
          </p>
        </header>

        <a
          href={`/chrome-extension.zip`}
          download={downloadName}
          className="flex items-center justify-between gap-4 px-5 py-4 rounded-xl bg-[#015280] text-white hover:bg-[#01416a] transition-colors shadow-sm"
        >
          <div>
            <p className="text-sm font-semibold flex items-center gap-2">
              <Download className="w-4 h-4" />
              Download v{version}
            </p>
            <p className="text-[11px] text-white/70 mt-0.5">{downloadName}</p>
          </div>
          <span className="text-[11px] font-medium text-white/70">~35 KB</span>
        </a>

        <section className="mt-8">
          <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#015280]" />
            Install — first time
          </h2>
          <ol className="space-y-3 text-sm text-gray-700">
            <Step n={1} icon={<FolderOpen className="w-4 h-4" />}>
              <strong>Unzip</strong> the file you just downloaded. Stash the unzipped folder
              somewhere stable — Documents or Desktop. Chrome reads the extension straight
              from this folder, so deleting it later uninstalls the extension.
            </Step>
            <Step n={2} icon={<Puzzle className="w-4 h-4" />}>
              In a new tab, go to{' '}
              <code className="font-mono text-xs bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded">
                chrome://extensions
              </code>
              . Top-right toggle: turn on <strong>Developer mode</strong>.
            </Step>
            <Step n={3} icon={<FolderOpen className="w-4 h-4" />}>
              Top-left: click <strong>Load unpacked</strong>. Pick the unzipped folder (the
              one that has{' '}
              <code className="font-mono text-xs bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded">
                manifest.json
              </code>{' '}
              inside it). The ShipBots Customer Service card appears in the list.
            </Step>
            <Step n={4} icon={<Pin className="w-4 h-4" />}>
              Click the <strong>puzzle icon</strong> in the Chrome toolbar (next to the URL
              bar) → find ShipBots Customer Service → click the <strong>pin</strong>. The
              extension icon now sits in the toolbar.
            </Step>
          </ol>
        </section>

        <section className="mt-8">
          <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-[#015280]" />
            Update — when there&apos;s a new version
          </h2>
          <p className="text-sm text-gray-700 leading-relaxed mb-3">
            Self-hosted extensions don&apos;t auto-update, so you&apos;ll do this whenever I
            announce a new release (or you remember to check):
          </p>
          <ol className="space-y-2 text-sm text-gray-700 list-decimal pl-5">
            <li>Come back to this page and click <strong>Download</strong>.</li>
            <li>Unzip the new file <strong>into the same folder</strong>, replacing the old
              files. (Or delete the old folder + unzip fresh.)</li>
            <li>Open{' '}
              <code className="font-mono text-xs bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded">
                chrome://extensions
              </code>{' '}
              and click the <strong>↻ refresh</strong> arrow on the extension&apos;s card. New
              version active immediately.</li>
          </ol>
        </section>

        <section className="mt-8 bg-amber-50 border border-amber-200 rounded-lg p-4">
          <p className="text-xs text-amber-900 leading-relaxed">
            <strong>Note:</strong> Chrome shows a yellow &quot;Disable developer mode
            extensions&quot; banner whenever the browser launches. That&apos;s normal for
            self-hosted extensions like this one. Click the small <strong>×</strong> to
            dismiss it; the extension still works.
          </p>
        </section>
      </div>
    </div>
  );
}

function Step({
  n, icon, children,
}: {
  n: number;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex-shrink-0 w-7 h-7 rounded-full bg-[#015280] text-white text-xs font-bold flex items-center justify-center mt-0.5">
        {n}
      </span>
      <div className="flex-1 pt-1">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#015280] uppercase tracking-wider mb-0.5">
          {icon}
          Step {n}
        </div>
        <p className="text-sm text-gray-700 leading-relaxed">{children}</p>
      </div>
    </li>
  );
}
