'use client';

import { useState, useEffect, useRef } from 'react';
import { X, UserPlus, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

export interface CreatedClientResult {
  name: string;
  onboardingItemId: string;
  clientItemId: string;
  url: string;
}

interface AddClientModalProps {
  onClose: () => void;
  onCreated: (result: CreatedClientResult) => void;
}

export function AddClientModal({ onClose, onCreated }: AddClientModalProps) {
  const [name, setName] = useState('');
  const [state, setState] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on open; close on Escape
  useEffect(() => {
    inputRef.current?.focus();
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    setState('saving');
    setErrorMsg('');
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create client');
      setState('success');
      // Short success flash, then hand off result and close
      setTimeout(() => {
        onCreated({
          name: trimmed,
          onboardingItemId: data.onboardingItemId,
          clientItemId: data.clientItemId,
          url: data.url ?? '',
        });
      }, 600);
    } catch (err) {
      setState('error');
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong');
    }
  };

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(1,82,128,0.35)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-slide-in-up">

        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between" style={{ background: 'var(--brand-navy)' }}>
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/shipbots-icon.png" alt="ShipBots" className="w-7 h-7 object-contain" />
            <h2 className="text-base font-semibold text-white">Add New Client</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Client Name
            </label>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Acme Corporation"
              disabled={state === 'saving' || state === 'success'}
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#43c7ff] focus:border-transparent disabled:opacity-60 transition"
            />
            <p className="mt-1.5 text-[11px] text-gray-400">
              This will create entries on both the Onboarding and Clients boards and link them automatically.
            </p>
          </div>

          {/* Error banner */}
          {state === 'error' && (
            <div className="flex items-start gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={state === 'saving'}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || state === 'saving' || state === 'success'}
              className="flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-lg text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: 'var(--brand-navy)' }}
            >
              {state === 'saving' && <Loader2 className="w-4 h-4 animate-spin" />}
              {state === 'success' && <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--brand-cyan)' }} />}
              {(state === 'idle' || state === 'error') && <UserPlus className="w-4 h-4" />}
              {state === 'saving'  ? 'Creating…' :
               state === 'success' ? 'Created!' :
               'Create Client'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
