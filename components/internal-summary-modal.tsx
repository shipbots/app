'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Copy, Check, Loader2, Mail, ExternalLink, Users } from 'lucide-react';

const TEAM_TO = 'support@shipbots.com, allen@shipbots.com, payam@shipbots.com, carmen@shipbots.com, karina@shipbots.com, alex@shipbots.com, nancy@shipbots.com, robert@shipbots.com';
const TEAM_BCC = 'andres@shipbots.com';

interface InternalSummaryModalProps {
  clientName: string;
  clientBoardItemId: string;
  onboardingItemId: string;
  onClose: () => void;
}

export function InternalSummaryModal({
  clientName,
  clientBoardItemId,
  onboardingItemId,
  onClose,
}: InternalSummaryModalProps) {
  const [rawText, setRawText] = useState('');
  const [generating, setGenerating] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pasteHint, setPasteHint] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Parse subject + body from generated text
  const parseEmail = (text: string) => {
    const match = text.match(/^Subject:\s*(.+)\n+([\s\S]*)$/m);
    if (match) return { subject: match[1].trim(), body: match[2].trim() };
    return { subject: `New Client: ${clientName}`, body: text };
  };

  const generate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    setRawText('');
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch('/api/generate-onboarding-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientName, clientBoardItemId, onboardingItemId }),
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body) {
        const err = await res.text();
        throw new Error(err || 'Generation failed');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setRawText(accumulated);
      }
    } catch (e: unknown) {
      if ((e as { name?: string }).name !== 'AbortError') {
        setError(String(e));
      }
    } finally {
      setGenerating(false);
    }
  }, [clientName, clientBoardItemId, onboardingItemId]);

  useEffect(() => {
    generate();
    return () => abortRef.current?.abort();
  }, [generate]);

  // Auto-grow textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [rawText]);

  const handleCopy = async () => {
    const { body } = parseEmail(rawText);
    await navigator.clipboard.writeText(body);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Convert inline markdown to HTML
  const formatInline = (text: string) =>
    text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/__(.+?)__/g, '<strong>$1</strong>')
      .replace(/_(.+?)_/g, '<em>$1</em>');

  const markdownToHtml = (text: string): string => {
    const lines = text.split('\n');
    const out: string[] = [];
    let inList = false;

    for (const raw of lines) {
      const line = raw.trimEnd();
      if (/^[•\-\*]\s/.test(line.trimStart())) {
        if (!inList) { out.push('<ul style="margin:6px 0;padding-left:20px;">'); inList = true; }
        out.push(`<li style="margin:2px 0;">${formatInline(line.trimStart().slice(2).trim())}</li>`);
      } else {
        if (inList) { out.push('</ul>'); inList = false; }
        if (line.trim() === '') {
          out.push('<br>');
        } else {
          out.push(`<p style="margin:4px 0;">${formatInline(line)}</p>`);
        }
      }
    }
    if (inList) out.push('</ul>');
    return out.join('\n');
  };

  const handleOpenInSuperhuman = async () => {
    const { subject, body } = parseEmail(rawText);

    // Write rich text (HTML) to clipboard
    try {
      const html = markdownToHtml(body);
      const blob = new Blob([html], { type: 'text/html' });
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': blob })]);
    } catch {
      await navigator.clipboard.writeText(body);
    }

    // mailto with all team recipients + bcc
    const toEncoded = encodeURIComponent(TEAM_TO);
    const bccEncoded = encodeURIComponent(TEAM_BCC);
    window.location.href = `mailto:${toEncoded}?subject=${encodeURIComponent(subject)}&bcc=${bccEncoded}`;

    setPasteHint(true);
  };

  const { subject } = parseEmail(rawText);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-3xl max-h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
              <Users className="w-3.5 h-3.5 text-blue-600" />
            </div>
            <h2 className="font-semibold text-gray-900 text-sm">Client Onboarding Summary — {clientName}</h2>
            {generating && (
              <span className="flex items-center gap-1 text-[11px] text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                <Loader2 className="w-3 h-3 animate-spin" />
                Generating…
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {rawText && !generating && (
              <>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  {copied
                    ? <><Check className="w-3.5 h-3.5 text-green-500" />Copied!</>
                    : <><Copy className="w-3.5 h-3.5" />Copy</>
                  }
                </button>
                <button
                  type="button"
                  onClick={handleOpenInSuperhuman}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-black text-white hover:bg-gray-800 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open in Superhuman
                </button>
              </>
            )}
            {!generating && error && (
              <button
                type="button"
                onClick={generate}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 transition-colors"
              >
                <Loader2 className="w-3.5 h-3.5" />Retry
              </button>
            )}
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors ml-1">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>

        {/* To / BCC bar */}
        <div className="px-5 py-2 border-b border-gray-100 bg-gray-50 flex-shrink-0 space-y-1">
          {rawText && subject && (
            <div className="flex items-start gap-2 text-xs text-gray-500">
              <Mail className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span className="font-medium text-gray-700 flex-shrink-0">Subject:</span>
              <span className="text-gray-800">{subject}</span>
            </div>
          )}
          <div className="flex items-start gap-2 text-xs text-gray-500">
            <span className="font-medium text-gray-700 flex-shrink-0 w-[3.5rem]">To:</span>
            <span className="text-gray-600 break-all">{TEAM_TO}</span>
          </div>
          <div className="flex items-start gap-2 text-xs text-gray-500">
            <span className="font-medium text-gray-700 flex-shrink-0 w-[3.5rem]">BCC:</span>
            <span className="text-gray-600">{TEAM_BCC}</span>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error ? (
            <div className="text-center py-12">
              <p className="text-sm text-red-500 mb-2">⚠ Generation failed</p>
              <p className="text-xs text-gray-400 max-w-sm mx-auto">{error}</p>
            </div>
          ) : generating && !rawText ? (
            <div className="space-y-3 py-4">
              {[75, 90, 60, 85, 70, 95, 65, 80, 55].map((w, i) => (
                <div key={i} className="h-3.5 bg-gray-100 rounded animate-pulse" style={{ width: `${w}%` }} />
              ))}
            </div>
          ) : (
            <textarea
              ref={textareaRef}
              value={rawText}
              onChange={e => setRawText(e.target.value)}
              className="w-full text-sm text-gray-800 leading-relaxed resize-none border-0 outline-none focus:ring-0 bg-transparent font-mono"
              style={{ minHeight: '300px' }}
              placeholder="Generating email…"
            />
          )}
        </div>

        {/* Footer hint */}
        {rawText && !generating && (
          <div className={`px-5 py-2 border-t flex-shrink-0 transition-colors ${pasteHint ? 'border-green-200 bg-green-50' : 'border-gray-100'}`}>
            {pasteHint ? (
              <p className="text-[11px] text-green-700 font-medium">
                ✓ Formatted body copied to clipboard — paste into the Superhuman compose window with ⌘V.
              </p>
            ) : (
              <p className="text-[11px] text-gray-400">
                Edit above, then click <strong className="text-gray-600">Open in Superhuman</strong> — recipients are pre-filled, formatted body copies to clipboard automatically. Paste with ⌘V.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
