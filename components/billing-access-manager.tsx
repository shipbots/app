'use client';

import { useEffect, useState } from 'react';
import { Receipt, Plus, X, Loader2, Info, ShieldAlert } from 'lucide-react';

interface AccessState {
  emails: string[];
  seeds: string[];
  source: 'store' | 'seed';
  writable: boolean;
}

// Admin-only manager for the billing / DocuSign access allowlist. Reads and
// mutates /api/admin/access; the list is persisted in Vercel Blob so changes
// apply at runtime (no redeploy).
export function BillingAccessManager({ currentEmail }: { currentEmail: string }) {
  const [state, setState] = useState<AccessState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState<string | null>(null); // email being removed, or '__add__'
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/admin/access', { headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error(`(${res.status})`);
        const data = (await res.json()) as AccessState;
        if (alive) setState(data);
      } catch (e) {
        if (alive) setLoadError(`Couldn't load the access list ${(e as Error).message || ''}`.trim());
      }
    })();
    return () => { alive = false; };
  }, []);

  async function add() {
    const email = input.trim().toLowerCase();
    if (!email) return;
    setBusy('__add__');
    setActionError(null);
    try {
      const res = await fetch('/api/admin/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Could not add');
      setState(prev => (prev ? { ...prev, emails: data.emails, source: 'store' } : prev));
      setInput('');
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function remove(email: string) {
    setBusy(email);
    setActionError(null);
    try {
      const res = await fetch('/api/admin/access', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Could not remove');
      setState(prev => (prev ? { ...prev, emails: data.emails, source: 'store' } : prev));
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 mb-6">
      <div className="flex items-center gap-2 mb-1">
        <Receipt className="w-5 h-5" style={{ color: 'var(--brand-navy)' }} />
        <h2 className="text-lg font-semibold text-gray-900">Billing &amp; DocuSign access</h2>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        These users can see and edit sensitive billing data. Add or remove them
        here — changes take effect within a minute, no redeploy needed.
      </p>

      {/* What this grants */}
      <div className="flex items-start gap-2 mb-4 rounded-lg bg-[#f0f9ff] border border-[#cfeaff] px-3 py-2.5">
        <Info className="w-4 h-4 text-[#0071BC] flex-shrink-0 mt-0.5" />
        <div className="text-xs text-[#0c4a6e] leading-relaxed">
          <p className="font-semibold mb-1">People on this list can access:</p>
          <ul className="list-disc ml-4 space-y-0.5">
            <li>The <strong>Billing Info</strong> tab in the dashboard (EIN, the DocuSign contract, billing address).</li>
            <li><strong>Pricing / SOW</strong> rates and the <strong>Payment Method / ACH</strong> bank details.</li>
            <li>Uploading a DocuSign contract and running billing/pricing extraction.</li>
            <li>The <strong>Billing info</strong> button in the Chrome extension.</li>
          </ul>
          <p className="mt-1.5 text-[11px] text-[#0c4a6e]/70">
            Everyone else has the EIN, contract, and ACH details hidden. Keep this
            list current as new billing features are added.
          </p>
        </div>
      </div>

      {loadError ? (
        <p className="text-sm text-red-500">{loadError}</p>
      ) : !state ? (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : (
        <>
          {!state.writable && (
            <div className="flex items-start gap-2 mb-4 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5">
              <ShieldAlert className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-900 leading-relaxed">
                Runtime storage isn&apos;t configured yet, so this list is read-only.
                Set <code className="bg-amber-100 px-1 rounded">BLOB_READ_WRITE_TOKEN</code> in
                Vercel (Storage → connect a Blob store) to enable editing here. Until
                then the list comes from <code className="bg-amber-100 px-1 rounded">DOCUSIGN_EMAILS</code>.
              </p>
            </div>
          )}

          {state.writable && (
            <form
              onSubmit={e => { e.preventDefault(); void add(); }}
              className="flex items-center gap-2 mb-3"
            >
              <input
                type="email"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="name@shipbots.com"
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-[#43c7ff]/40 focus:border-[#43c7ff]"
              />
              <button
                type="submit"
                disabled={busy === '__add__' || !input.trim()}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-[#015280] text-white hover:bg-[#013f63] disabled:opacity-40 transition-colors"
              >
                {busy === '__add__' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Add
              </button>
            </form>
          )}

          {actionError && <p className="text-xs text-red-500 mb-2">{actionError}</p>}

          <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg overflow-hidden">
            {state.emails.length === 0 && (
              <li className="px-4 py-3 text-sm text-gray-400 italic">No one has billing access yet.</li>
            )}
            {state.emails.map(email => (
              <li key={email} className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-2 min-w-0">
                  <Receipt className="w-4 h-4 text-[#015280] flex-shrink-0" />
                  <span className="text-sm text-gray-800 truncate">{email}</span>
                  {email === currentEmail && (
                    <span className="ml-1 text-[10px] font-semibold uppercase tracking-wider bg-[#e6f8ff] text-[#015280] px-1.5 py-0.5 rounded">You</span>
                  )}
                </div>
                {state.writable && (
                  <button
                    onClick={() => void remove(email)}
                    disabled={busy === email}
                    title="Remove billing access"
                    className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors disabled:opacity-40"
                  >
                    {busy === email ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                  </button>
                )}
              </li>
            ))}
          </ul>

          {state.source === 'seed' && state.writable && (
            <p className="mt-2 text-[11px] text-gray-400">
              Showing the starter list from <code className="bg-gray-100 px-1 rounded">DOCUSIGN_EMAILS</code>.
              Your first add or remove saves a runtime list that takes over from here.
            </p>
          )}
        </>
      )}
    </section>
  );
}
