'use client';

/**
 * CSV Order Formatter — first mini-app inside the CS "Mini Apps" surface.
 *
 * Flow:
 *   1. User drops or picks a CSV / XLSX / XLS file
 *   2. We parse it client-side with SheetJS and grab headers + sample rows
 *   3. /api/mini-apps/csv-order-format runs the rows through Claude and
 *      returns a column mapping onto ShipHero's order CSV template,
 *      a country-value normalization map, and a confidence score for the
 *      SKU column
 *   4. The user reviews the mapping. SKU column always requires explicit
 *      confirmation (per spec — even when AI is confident). User can also
 *      override any other column.
 *   5. The user reviews the country code map (in case AI guessed wrong
 *      on an unusual entry).
 *   6. User clicks Download and we emit a CSV that matches the template
 *      column order. Required columns missing → red warning, but we still
 *      let the file generate so the user can patch downstream.
 *
 * All parsing happens in the browser; only headers + a sample of rows are
 * sent to the AI endpoint. The full data never leaves the user's machine
 * except as the downloaded CSV.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Upload, FileSpreadsheet, Loader2, Check, AlertTriangle, ChevronLeft, Download, Sparkles, Info, Hash,
} from 'lucide-react';

const REQUIRED_COLS = [
  'Order Number (Required)',
  'First Name (Required)',
  'Address (Required)',
  'City (Required)',
  'State / Province',
  'Zip (Required)',
  'Country Code (Required)',
  'Product Sku (Required)',
  'Quantity',
] as const;

// Sentinel for the Order Number mapping when the user wants to auto-generate
// numbers from a prefix instead of mapping a source column. Kept as a string
// so it co-exists in the same mappingEdits record as real source-column
// header values without needing a separate parallel state.
const AUTO_GEN_ORDER_VAL = '__autogen-order-number__';

// Excel-style column letter for a 0-indexed position: 0→A, 25→Z, 26→AA…
function columnLetter(i: number): string {
  let n = i;
  let s = '';
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

// If a header cell is empty, fall back to "Column X" with X = its Excel
// position. If a header repeats, suffix " (2)", " (3)", etc. Output array
// is guaranteed unique so it's safe to use as object keys.
function ensureUniqueHeaders(headers: string[]): string[] {
  const seen = new Map<string, number>();
  return headers.map((h, i) => {
    const base = h.trim() || `Column ${columnLetter(i)}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base} (${count + 1})`;
  });
}

// First row with ≥2 non-empty cells within the first 10 rows — skip the
// "blank rows / title row" prelude some Excel files have above the table.
// Falls back to row 0 if nothing matches.
function findAnchorRow(aoa: unknown[][]): number {
  for (let i = 0; i < Math.min(aoa.length, 10); i++) {
    const row = aoa[i] ?? [];
    const nonEmpty = row.filter(c => String(c ?? '').trim() !== '').length;
    if (nonEmpty >= 2) return i;
  }
  return 0;
}

// 999 rows → 3 digits, 9_999 → 4, 99_999 → 5. Always ≥3 so we get
// 001 / 002 / … even for tiny files.
function padForCount(n: number): number {
  if (n <= 0) return 3;
  return Math.max(3, String(n).length);
}

// Render a generated order number for the given 0-indexed row and total
// row count, padded so the largest row number has the same width.
function autoGenOrderNumber(prefix: string, idx: number, total: number): string {
  return `${prefix}${String(idx + 1).padStart(padForCount(total), '0')}`;
}

type Stage = 'idle' | 'parsing' | 'header-confirm' | 'analyzing' | 'review' | 'error';

interface MapResult {
  columns: string[];
  columnMapping: Record<string, string>;
  countryValueMap: Record<string, string>;
  skuConfidence: 'high' | 'medium' | 'low' | 'none';
  skuReasoning: string;
  warnings: string[];
}

// CSV cell escaping — wrap in quotes if value contains comma/quote/newline,
// double up internal quotes.
function escapeCSV(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (s === '') return '';
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCSV(filename: string, columns: string[], rows: Record<string, string>[]) {
  const headerLine = columns.map(escapeCSV).join(',');
  const lines = rows.map(row => columns.map(col => escapeCSV(row[col])).join(','));
  const csv = [headerLine, ...lines].join('\n');
  // BOM so Excel opens UTF-8 correctly.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function CsvOrderFormatterApp({ onBack }: { onBack: () => void }) {
  const [stage, setStage] = useState<Stage>('idle');
  const [dragging, setDragging] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  // Raw cells from the workbook; kept around so the user can flip the
  // "row 1 is headers" answer without re-uploading.
  const [rawAoa, setRawAoa] = useState<unknown[][]>([]);
  const [anchorIdx, setAnchorIdx] = useState<number>(0);
  const [anchorPreview, setAnchorPreview] = useState<string[]>([]);
  const [hasHeaders, setHasHeaders] = useState<boolean | null>(null);
  const [sourceHeaders, setSourceHeaders] = useState<string[]>([]);
  const [sourceRows, setSourceRows] = useState<Record<string, unknown>[]>([]);
  const [result, setResult] = useState<MapResult | null>(null);
  // User edits live in these mirrors so we don't mutate the AI result.
  const [mappingEdits, setMappingEdits] = useState<Record<string, string>>({});
  const [countryEdits, setCountryEdits] = useState<Record<string, string>>({});
  const [skuConfirmed, setSkuConfirmed] = useState(false);
  // Prefix used when the user picks Auto-generate for the Order Number
  // column. Empty until the user types something.
  const [autoGenPrefix, setAutoGenPrefix] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStage('idle');
    setErrorMsg('');
    setFileName('');
    setRawAoa([]);
    setAnchorIdx(0);
    setAnchorPreview([]);
    setHasHeaders(null);
    setSourceHeaders([]);
    setSourceRows([]);
    setResult(null);
    setMappingEdits({});
    setCountryEdits({});
    setSkuConfirmed(false);
    setAutoGenPrefix('');
  };

  // Step 1: parse the file. Stops at 'header-confirm' so the user can
  // tell us whether row 1 is headers or data.
  const ingest = useCallback(async (file: File) => {
    setStage('parsing');
    setErrorMsg('');
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheetName = wb.SheetNames[0];
      if (!sheetName) throw new Error('Workbook has no sheets');
      const sheet = wb.Sheets[sheetName];
      const aoa: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
      if (aoa.length === 0) throw new Error('Sheet appears empty');
      const idx = findAnchorRow(aoa);
      const preview = (aoa[idx] ?? []).map(c => String(c ?? '').trim());
      if (preview.length === 0) throw new Error('No content detected in the file');
      setRawAoa(aoa);
      setAnchorIdx(idx);
      setAnchorPreview(preview);
      setStage('header-confirm');
    } catch (err) {
      console.error('[CsvOrderFormatter] parse failed:', err);
      setErrorMsg(err instanceof Error ? err.message : 'Failed to read file');
      setStage('error');
    }
  }, []);

  // Step 2: with the user's answer about headers, derive the real column
  // list and data rows, then call the AI mapping endpoint.
  const proceedWithHeaders = useCallback(async (rowOneIsHeader: boolean) => {
    try {
      const colCount = Math.max(
        anchorPreview.length,
        ...rawAoa.slice(anchorIdx, anchorIdx + 20).map(r => (r ?? []).length),
      );
      const derivedHeaders = rowOneIsHeader
        ? ensureUniqueHeaders([
            ...anchorPreview,
            // Pad the header row out to the widest data row so columns with
            // an empty header cell at the far right still get a "Column X"
            // label and stay mappable.
            ...Array.from({ length: Math.max(0, colCount - anchorPreview.length) }, () => ''),
          ])
        : Array.from({ length: colCount }, (_, i) => `Column ${columnLetter(i)}`);
      const dataStart = rowOneIsHeader ? anchorIdx + 1 : anchorIdx;

      const dataRows: Record<string, unknown>[] = [];
      for (let i = dataStart; i < rawAoa.length; i++) {
        const row = rawAoa[i] ?? [];
        const obj: Record<string, unknown> = {};
        let hasValue = false;
        derivedHeaders.forEach((h, j) => {
          const v = row[j];
          const sv = v === null || v === undefined ? '' : String(v).trim();
          obj[h] = sv;
          if (sv !== '') hasValue = true;
        });
        if (hasValue) dataRows.push(obj);
      }
      if (dataRows.length === 0) throw new Error('No data rows found in the file');

      setSourceHeaders(derivedHeaders);
      setSourceRows(dataRows);
      setHasHeaders(rowOneIsHeader);

      setStage('analyzing');
      const res = await fetch('/api/mini-apps/csv-order-format', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headers: derivedHeaders, sampleRows: dataRows.slice(0, 6) }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `AI mapping failed (${res.status})`);
      }
      const out = (await res.json()) as MapResult;
      setResult(out);
      setMappingEdits({ ...out.columnMapping });
      setCountryEdits({ ...out.countryValueMap });
      setSkuConfirmed(false);
      setAutoGenPrefix('');
      setStage('review');
    } catch (err) {
      console.error('[CsvOrderFormatter] proceedWithHeaders failed:', err);
      setErrorMsg(err instanceof Error ? err.message : 'Failed to process file');
      setStage('error');
    }
  }, [rawAoa, anchorIdx, anchorPreview]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void ingest(file);
  };

  const onFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void ingest(file);
    // Reset so picking the same file again still fires.
    e.target.value = '';
  };

  // Build the output rows once the user clicks Download. Country values
  // run through the user-confirmed value map; quantity defaults to 1 if
  // not mapped; the Order Number column either comes from a source column
  // or is generated from the user's prefix.
  const generateRows = (): Record<string, string>[] => {
    if (!result) return [];
    const orderNumCol = mappingEdits['Order Number (Required)'];
    const isAutoGenOrder = orderNumCol === AUTO_GEN_ORDER_VAL;
    const countryCol = mappingEdits['Country Code (Required)'];
    const billingCountryCol = mappingEdits['Billing Country Code'];
    const quantityCol = mappingEdits['Quantity'];
    const total = sourceRows.length;
    return sourceRows.map((row, idx) => {
      const out: Record<string, string> = {};
      for (const col of result.columns) {
        const src = mappingEdits[col];
        // Order Number — auto-generate path takes precedence over any
        // accidental mapping. Sentinel value never refers to a real
        // source column, so we'd output blanks if we let it fall through.
        if (col === 'Order Number (Required)' && isAutoGenOrder) {
          out[col] = autoGenOrderNumber(autoGenPrefix, idx, total);
          continue;
        }
        if (!src || src === AUTO_GEN_ORDER_VAL) { out[col] = ''; continue; }
        const raw = row[src];
        out[col] = raw === undefined || raw === null ? '' : String(raw).trim();
      }
      // Country normalization
      if (countryCol) {
        const raw = String(row[countryCol] ?? '').trim();
        out['Country Code (Required)'] = countryEdits[raw] ?? raw;
      }
      if (billingCountryCol) {
        const raw = String(row[billingCountryCol] ?? '').trim();
        out['Billing Country Code'] = countryEdits[raw] ?? raw;
      }
      // Default quantity to 1 when not mapped
      if (!quantityCol && !out['Quantity']) out['Quantity'] = '1';
      return out;
    });
  };

  const onDownload = () => {
    if (!result) return;
    const rows = generateRows();
    const baseName = fileName.replace(/\.(csv|xlsx?|tsv)$/i, '') || 'orders';
    downloadCSV(`${baseName} — shiphero.csv`, result.columns, rows);
  };

  // Missing required columns based on current mapping edits. Auto-gen for
  // Order Number counts as "mapped" only if the user has typed a prefix.
  const missingRequired = useMemo(() => {
    return REQUIRED_COLS.filter(col => {
      const v = mappingEdits[col];
      if (!v) return true;
      if (col === 'Order Number (Required)' && v === AUTO_GEN_ORDER_VAL && !autoGenPrefix.trim()) {
        return true;
      }
      return false;
    });
  }, [mappingEdits, autoGenPrefix]);

  const orderIsAutoGen = mappingEdits['Order Number (Required)'] === AUTO_GEN_ORDER_VAL;
  const canDownload =
    !!result &&
    skuConfirmed &&
    (!orderIsAutoGen || autoGenPrefix.trim().length > 0);

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col bg-gray-50 overflow-hidden">
      {/* App header — back button + title */}
      <header className="flex items-center gap-3 px-6 py-3 bg-white border-b border-gray-200 flex-shrink-0">
        <button
          onClick={onBack}
          className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
          title="Back to Mini Apps"
        >
          <ChevronLeft className="w-4 h-4 text-gray-600" />
        </button>
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#43c7ff] to-[#015280] flex items-center justify-center text-white shadow-sm">
          <FileSpreadsheet className="w-5 h-5" />
        </div>
        <div className="flex flex-col min-w-0">
          <h1 className="text-sm font-semibold text-gray-900">CSV Order Formatter</h1>
          <p className="text-[11px] text-gray-500">Reshape any sheet into a ShipHero-ready order upload.</p>
        </div>
        {stage !== 'idle' && (
          <button
            onClick={reset}
            className="ml-auto text-xs font-medium text-gray-500 hover:text-[#015280]"
          >
            Start over
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto">

          {/* ── Stage: idle (upload) ──────────────────────────────────── */}
          {stage === 'idle' && (
            <section>
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`relative rounded-2xl border-2 border-dashed transition-colors cursor-pointer p-12 text-center ${
                  dragging
                    ? 'border-[#43c7ff] bg-[#e6f8ff]/70'
                    : 'border-gray-300 bg-white hover:border-[#43c7ff] hover:bg-[#e6f8ff]/30'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.tsv,.xlsx,.xls"
                  onChange={onFilePick}
                  className="hidden"
                />
                <div className="flex flex-col items-center gap-3">
                  <div className="w-14 h-14 rounded-2xl bg-[#015280] text-white flex items-center justify-center">
                    <Upload className="w-6 h-6" />
                  </div>
                  <p className="text-base font-semibold text-gray-900">Drop your CSV or Excel here</p>
                  <p className="text-xs text-gray-500">or click to browse · .csv, .tsv, .xlsx, .xls</p>
                </div>
              </div>

              <div className="mt-6 bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-start gap-2">
                  <Sparkles className="w-4 h-4 text-[#015280] flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-gray-600 leading-relaxed">
                    Claude reads the first few rows of your file, maps your columns onto the
                    ShipHero order template, and converts country names to 2-letter codes
                    (United States &rarr; US, Canada &rarr; CA, Mexico &rarr; MX). You&apos;ll
                    review the mapping before downloading.
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* ── Stage: parsing / analyzing ────────────────────────────── */}
          {(stage === 'parsing' || stage === 'analyzing') && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-600">
              <Loader2 className="w-8 h-8 animate-spin text-[#015280]" />
              <p className="text-sm font-medium">
                {stage === 'parsing' ? 'Reading file…' : 'Asking Claude to map your columns…'}
              </p>
              <p className="text-xs text-gray-500">{fileName}</p>
            </div>
          )}

          {/* ── Stage: header confirm ─────────────────────────────────── */}
          {stage === 'header-confirm' && (
            <section className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-9 h-9 rounded-lg bg-[#e6f8ff] text-[#015280] flex items-center justify-center flex-shrink-0">
                  <FileSpreadsheet className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">Does row 1 contain column headers?</p>
                  <p className="text-[11px] text-gray-500 mt-0.5 truncate">{fileName}</p>
                </div>
              </div>

              <div className="border border-gray-200 rounded-lg overflow-hidden mb-4">
                <div className="bg-gray-50 px-3 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                  Row 1 preview
                </div>
                <div className="overflow-x-auto">
                  <table className="text-xs w-full">
                    <tbody>
                      <tr>
                        {anchorPreview.map((cell, i) => (
                          <td key={i} className="px-3 py-2 border-t border-gray-100 whitespace-nowrap">
                            <span className="text-[9px] font-mono text-gray-400 block">Col {columnLetter(i)}</span>
                            <span className="text-gray-800">{cell || <span className="italic text-gray-300">(blank)</span>}</span>
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => void proceedWithHeaders(true)}
                  className="flex-1 min-w-[180px] inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-md bg-[#015280] text-white text-sm font-semibold hover:opacity-90 transition-opacity"
                >
                  <Check className="w-4 h-4" />
                  Yes — those are headers
                </button>
                <button
                  onClick={() => void proceedWithHeaders(false)}
                  className="flex-1 min-w-[180px] inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-md bg-white border border-gray-300 text-gray-700 text-sm font-semibold hover:bg-gray-50 transition-colors"
                >
                  No — that&apos;s order data
                </button>
              </div>
              <p className="text-[11px] text-gray-500 mt-2">
                If you pick &quot;No&quot;, columns will be auto-named Column A, B, C… and row 1 will be treated as the first order.
              </p>
            </section>
          )}

          {/* ── Stage: error ──────────────────────────────────────────── */}
          {stage === 'error' && (
            <div className="bg-white border border-red-200 rounded-xl p-5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900">Couldn&apos;t process this file</p>
                  <p className="text-xs text-gray-600 mt-1">{errorMsg}</p>
                </div>
                <button
                  onClick={reset}
                  className="text-xs font-medium text-[#015280] hover:underline"
                >
                  Try another file
                </button>
              </div>
            </div>
          )}

          {/* ── Stage: review (mapping + SKU + country) ───────────────── */}
          {stage === 'review' && result && (
            <ReviewPanel
              result={result}
              fileName={fileName}
              hasHeaders={hasHeaders ?? true}
              sourceHeaders={sourceHeaders}
              sourceRows={sourceRows}
              mappingEdits={mappingEdits}
              setMappingEdits={setMappingEdits}
              countryEdits={countryEdits}
              setCountryEdits={setCountryEdits}
              skuConfirmed={skuConfirmed}
              setSkuConfirmed={setSkuConfirmed}
              autoGenPrefix={autoGenPrefix}
              setAutoGenPrefix={setAutoGenPrefix}
              missingRequired={missingRequired}
              canDownload={canDownload}
              onDownload={onDownload}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Review panel ────────────────────────────────────────────────────────────
function ReviewPanel({
  result, fileName, hasHeaders, sourceHeaders, sourceRows,
  mappingEdits, setMappingEdits,
  countryEdits, setCountryEdits,
  skuConfirmed, setSkuConfirmed,
  autoGenPrefix, setAutoGenPrefix,
  missingRequired, canDownload, onDownload,
}: {
  result: MapResult;
  fileName: string;
  hasHeaders: boolean;
  sourceHeaders: string[];
  sourceRows: Record<string, unknown>[];
  mappingEdits: Record<string, string>;
  setMappingEdits: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  countryEdits: Record<string, string>;
  setCountryEdits: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  skuConfirmed: boolean;
  setSkuConfirmed: (b: boolean) => void;
  autoGenPrefix: string;
  setAutoGenPrefix: (s: string) => void;
  missingRequired: readonly string[];
  canDownload: boolean;
  onDownload: () => void;
}) {
  const skuCol = mappingEdits['Product Sku (Required)'] ?? '';
  const skuSamples = useMemo(() => {
    if (!skuCol) return [];
    return sourceRows.slice(0, 5).map(r => String(r[skuCol] ?? '').trim()).filter(Boolean);
  }, [skuCol, sourceRows]);

  const orderNumCol = mappingEdits['Order Number (Required)'] ?? '';
  const isAutoGenOrder = orderNumCol === AUTO_GEN_ORDER_VAL;
  const orderPad = padForCount(sourceRows.length);
  const orderPreview = useMemo(() => {
    if (!isAutoGenOrder || !autoGenPrefix) return '';
    const first = autoGenOrderNumber(autoGenPrefix, 0, sourceRows.length);
    const last = autoGenOrderNumber(autoGenPrefix, sourceRows.length - 1, sourceRows.length);
    return sourceRows.length <= 2 ? first : `${first}, …, ${last}`;
  }, [isAutoGenOrder, autoGenPrefix, sourceRows.length]);

  const updateMapping = (template: string, source: string) => {
    setMappingEdits(prev => ({ ...prev, [template]: source }));
    if (template === 'Product Sku (Required)') setSkuConfirmed(false);
  };

  return (
    <div className="space-y-4">
      {/* File summary */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3">
        <FileSpreadsheet className="w-5 h-5 text-[#015280]" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{fileName}</p>
          <p className="text-[11px] text-gray-500">
            {sourceRows.length} data rows · {sourceHeaders.length} source columns
            <span className="mx-1.5">·</span>
            {hasHeaders ? 'Row 1 treated as headers' : 'No headers — columns auto-named'}
          </p>
        </div>
        <button
          onClick={onDownload}
          disabled={!canDownload}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#015280] text-white text-xs font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          title={!canDownload ? (isAutoGenOrder && !autoGenPrefix ? 'Enter an Order Number prefix' : 'Confirm the SKU column first') : 'Download CSV'}
        >
          <Download className="w-3.5 h-3.5" />
          Download CSV
        </button>
      </div>

      {/* Missing required + AI warnings */}
      {(missingRequired.length > 0 || result.warnings.length > 0) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 text-xs">
              {missingRequired.length > 0 && (
                <p className="text-amber-900 font-semibold mb-1">
                  Required columns not mapped: {missingRequired.join(', ')}
                </p>
              )}
              {result.warnings.length > 0 && (
                <ul className="list-disc pl-4 space-y-0.5 text-amber-800">
                  {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SKU confirmation — always required */}
      <div className={`rounded-xl border-2 p-4 ${
        skuConfirmed
          ? 'border-emerald-300 bg-emerald-50/40'
          : 'border-[#43c7ff] bg-[#e6f8ff]/40'
      }`}>
        <div className="flex items-start justify-between gap-3 mb-2">
          <div>
            <p className="text-sm font-semibold text-gray-900">Confirm the SKU column</p>
            <p className="text-[11px] text-gray-600 mt-0.5">
              {result.skuReasoning || 'Pick which source column holds the product SKU.'}
              {result.skuConfidence && (
                <span className="ml-2 text-gray-500">
                  AI confidence:&nbsp;<span className="font-semibold uppercase">{result.skuConfidence}</span>
                </span>
              )}
            </p>
          </div>
          {skuConfirmed && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-white border border-emerald-200 rounded-full px-2 py-0.5">
              <Check className="w-3 h-3" />
              Confirmed
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-3">
          <label className="text-xs text-gray-700">SKU column:</label>
          <select
            value={skuCol}
            onChange={e => updateMapping('Product Sku (Required)', e.target.value)}
            className="px-2 py-1 text-xs border border-gray-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-[#43c7ff]"
          >
            <option value="">— None / unsure —</option>
            {sourceHeaders.map(h => (
              <option key={h} value={h}>{h}</option>
            ))}
          </select>
        </div>

        {skuCol && skuSamples.length > 0 && (
          <div className="mb-3">
            <p className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider mb-1">
              Sample values from this column
            </p>
            <div className="flex flex-wrap gap-1.5">
              {skuSamples.map((s, i) => (
                <span key={i} className="text-[11px] font-mono bg-white border border-gray-200 text-gray-700 px-1.5 py-0.5 rounded">
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={() => setSkuConfirmed(true)}
          disabled={!skuCol || skuConfirmed}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#015280] text-white text-xs font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
        >
          <Check className="w-3.5 h-3.5" />
          {skuConfirmed ? 'SKU confirmed' : 'These are the SKUs'}
        </button>
      </div>

      {/* Country code map */}
      {Object.keys(countryEdits).length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-gray-900 mb-1">Country codes</p>
          <p className="text-[11px] text-gray-600 mb-3 flex items-center gap-1">
            <Info className="w-3 h-3" />
            ShipHero expects 2-letter ISO codes. Edit any row if the AI guessed wrong.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {Object.entries(countryEdits).map(([src, code]) => (
              <div key={src} className="flex items-center gap-2 text-xs">
                <span className="flex-1 truncate text-gray-700" title={src}>{src || '(empty)'}</span>
                <ChevronLeft className="w-3 h-3 text-gray-400 rotate-180" />
                <input
                  type="text"
                  value={code}
                  maxLength={2}
                  onChange={e => setCountryEdits(prev => ({ ...prev, [src]: e.target.value.toUpperCase() }))}
                  className="w-12 text-center uppercase font-mono text-xs border border-gray-300 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-[#43c7ff]"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Full column mapping */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <p className="text-sm font-semibold text-gray-900 mb-1">Column mapping</p>
        <p className="text-[11px] text-gray-600 mb-3">
          ShipHero columns on the left, your source columns on the right. Empty values stay blank in the output.
        </p>
        <div className="space-y-1 max-h-96 overflow-y-auto pr-1">
          {result.columns.map(col => {
            const isReq = (REQUIRED_COLS as readonly string[]).includes(col);
            const src = mappingEdits[col] ?? '';
            const isOrderRow = col === 'Order Number (Required)';
            const showAutoGenInput = isOrderRow && src === AUTO_GEN_ORDER_VAL;
            const reqMissing = isReq && (
              !src || (isOrderRow && src === AUTO_GEN_ORDER_VAL && !autoGenPrefix.trim())
            );
            return (
              <div key={col} className="grid grid-cols-2 gap-2 items-start text-xs">
                <span
                  className={`truncate pt-1 ${isReq ? 'font-semibold text-gray-900' : 'text-gray-700'}`}
                  title={col}
                >
                  {col}
                  {reqMissing && <span className="ml-1 text-red-500">•</span>}
                </span>
                <div className="flex flex-col gap-1">
                  <select
                    value={src}
                    onChange={e => updateMapping(col, e.target.value)}
                    className={`px-2 py-1 text-xs border rounded bg-white focus:outline-none focus:ring-1 focus:ring-[#43c7ff] ${
                      reqMissing ? 'border-red-300' : 'border-gray-200'
                    }`}
                  >
                    <option value="">— Not mapped —</option>
                    {isOrderRow && (
                      <option value={AUTO_GEN_ORDER_VAL}>
                        ✨ Auto-generate from prefix…
                      </option>
                    )}
                    {sourceHeaders.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                  {showAutoGenInput && (
                    <div className="border border-[#43c7ff]/50 bg-[#e6f8ff]/40 rounded p-2 flex flex-col gap-1">
                      <label className="flex items-center gap-1.5">
                        <Hash className="w-3 h-3 text-[#015280]" />
                        <span className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider">
                          Prefix
                        </span>
                        <input
                          type="text"
                          value={autoGenPrefix}
                          onChange={e => setAutoGenPrefix(e.target.value)}
                          placeholder="e.g. SAFE"
                          className="flex-1 px-2 py-0.5 text-xs font-mono border border-gray-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-[#43c7ff]"
                        />
                      </label>
                      <p className="text-[10px] text-gray-600">
                        {autoGenPrefix
                          ? <>Will generate <span className="font-mono text-gray-800">{orderPreview}</span> ({sourceRows.length} orders · {orderPad}-digit pad)</>
                          : <>Type a prefix to preview. Numbers will pad to {orderPad} digits.</>}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Download CTA at the bottom too */}
      <div className="flex justify-end">
        <button
          onClick={onDownload}
          disabled={!canDownload}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-[#015280] text-white text-sm font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          title={!canDownload ? 'Confirm the SKU column first' : 'Download CSV'}
        >
          <Download className="w-4 h-4" />
          Download CSV
        </button>
      </div>
    </div>
  );
}
