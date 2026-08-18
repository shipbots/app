'use client';

import { useEffect, useState } from 'react';

/**
 * Hands the freshly-minted mobile token back to the app. Primary path: redirect
 * to the app's deep link, which the app's in-app browser captures automatically.
 * Fallback (if opened in a normal browser, or the redirect is blocked): show the
 * token with a copy button so the user can paste it into the app's sign-in screen.
 */
export function MobileTokenHandoff({ email, token }: { email: string; token: string }) {
  const deepLink = `shipbotscs://auth?token=${encodeURIComponent(token)}`;
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Auto-hand the token back to the app.
    const t = setTimeout(() => { window.location.href = deepLink; }, 400);
    return () => clearTimeout(t);
  }, [deepLink]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — user can long-press to select */
    }
  };

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 520, margin: '0 auto', padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0071BC' }}>ShipBots CS — signed in</h1>
      <p style={{ color: '#333' }}>
        Signed in as <strong>{email}</strong>. Returning you to the app…
      </p>

      <a
        href={deepLink}
        style={{
          display: 'inline-block', marginTop: 12, padding: '12px 18px', borderRadius: 10,
          background: '#0071BC', color: '#fff', fontWeight: 700, textDecoration: 'none',
        }}>
        Open the app
      </a>

      <hr style={{ margin: '24px 0', border: 0, borderTop: '1px solid #e5e7eb' }} />

      <p style={{ color: '#555', fontSize: 14 }}>
        Didn’t return automatically? Copy this sign-in code and paste it into the app’s
        “Paste sign-in code” box:
      </p>
      <textarea
        readOnly
        value={token}
        onFocus={e => e.currentTarget.select()}
        style={{
          width: '100%', height: 90, marginTop: 8, padding: 10, fontFamily: 'monospace',
          fontSize: 12, borderRadius: 8, border: '1px solid #d1d5db', resize: 'none',
        }}
      />
      <button
        onClick={copy}
        style={{
          marginTop: 8, padding: '10px 16px', borderRadius: 8, border: '1px solid #0071BC',
          background: copied ? '#0071BC' : '#fff', color: copied ? '#fff' : '#0071BC',
          fontWeight: 700, cursor: 'pointer',
        }}>
        {copied ? 'Copied ✓' : 'Copy code'}
      </button>
      <p style={{ color: '#9ca3af', fontSize: 12, marginTop: 16 }}>
        Keep this code private — it signs you in as you. It expires in 90 days.
      </p>
    </main>
  );
}
