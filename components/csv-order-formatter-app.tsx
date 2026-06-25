'use client';

/**
 * CSV Order Formatter — first mini-app inside the CS "Mini Apps" surface.
 *
 * Flow:
 *   1. User drops or picks a CSV / XLSX / XLS file
 *   2. We parse it client-side with SheetJS and grab headers + sample rows
 *   3. /api/mini-apps/csv-order-format runs the rows through Claude and
 *      returns a column mapping onto ShipHero's order CSV template,
 *      a country-value normalization mp, and a confidence score for the
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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Upload, FileSpreadsheet, Loader2, Check, AlertTriangle, ChevronLeft, Download, Sparkles, Info, Hash, Plus, Trash2, Package,
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

// ── Product-name splitting (for files where one cell lists many products) ──
// Default candidate delimiters the user can toggle. We never split on '-'
// because product names often contain hyphens ("PR Mailer - Bites").
const CANDIDATE_DELIMS: { key: string; label: string }[] = [
  { key: ',', label: 'Comma ( , )' },
  { key: '&', label: 'Ampersand ( & )' },
  { key: '+', label: 'Plus ( + )' },
  { key: '/', label: 'Slash ( / )' },
  { key: ';', label: 'Semicolon ( ; )' },
];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Split a multi-product cell into individual product names using the
// chosen delimiters. Empty/whitespace-only segments are dropped. If no
// delimiters are active, the whole cell is treated as one product.
function splitProducts(cell: string, delimiters: string[]): string[] {
  const v = (cell ?? '').trim();
  if (!v) return [];
  const active = delimiters.filter(d => d.length > 0);
  if (active.length === 0) return [v];
  const re = new RegExp(active.map(escapeRegex).join('|'), 'g');
  return v.split(re).map(s => s.trim()).filter(Boolean);
}

// Walk every source row's product cells (one OR many columns) and
// collect the unique product names. Sorted alphabetically for stable
// UI; deduplication is case-insensitive but we keep the first-seen
// casing for display.
function uniqueProducts(
  rows: Record<string, unknown>[],
  productCols: string[],
  delimiters: string[],
): string[] {
  if (productCols.length === 0) return [];
  const seen = new Map<string, string>(); // lower → original
  for (const row of rows) {
    for (const col of productCols) {
      const cell = String(row[col] ?? '');
      for (const name of splitProducts(cell, delimiters)) {
        const key = name.toLowerCase();
        if (!seen.has(key)) seen.set(key, name);
      }
    }
  }
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
}

// Distinct sample values from a single column, in row order. Used in
// the column picker so users can see what each column contains before
// they check it.
function previewValuesForColumn(
  rows: Record<string, unknown>[],
  col: string,
  limit = 3,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of rows) {
    if (out.length >= limit) break;
    const v = String(row[col] ?? '').trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

// Per-row dedup of every product name across the selected columns. Used
// by both the row generator and the projected-output-rows preview.
function rowProductNames(
  row: Record<string, unknown>,
  cols: string[],
  delimiters: string[],
): string[] {
  if (cols.length === 0) return [];
  const seen = new Map<string, string>();
  for (const col of cols) {
    const cell = String(row[col] ?? '');
    for (const name of splitProducts(cell, delimiters)) {
      const key = name.toLowerCase();
      if (!seen.has(key)) seen.set(key, name);
    }
  }
  return Array.from(seen.values());
}

// Look at a sample of the product-column cells and suggest which of the
// candidate delimiters are actually in use. Comma is always included if
// nothing else is detected, so the user has a sensible starting point.
function detectDelimitersFromCells(cells: string[]): string[] {
  const hits: string[] = [];
  for (const { key } of CANDIDATE_DELIMS) {
    if (cells.some(c => c.includes(key))) hits.push(key);
  }
  return hits.length > 0 ? hits : [','];
}

type Stage = 'idle' | 'parsing' | 'header-confirm' | 'analyzing' | 'review' | 'error';
type SkuStrategy = 'column' | 'product-mapping' | 'global-products';

// A single product line that gets applied to every order under the
// 'global-products' strategy. Each row in the source file is duplicated
// once per valid entry here.
interface GlobalProductEntry {
  id: string;
  sku: string;
  name: string;
  quantity: string;
}

// Browser-only id generator for adding/removing global product rows.
function genId(): string {
  return Math.random().toString(36).slice(2, 10);
}

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
  // SKU strategy — either pick a SKU column from the source or, when the
  // source only has product names, ask the user to assign a SKU per
  // unique product (multi-product cells get expanded into line items).
  const [skuStrategy, setSkuStrategy] = useState<SkuStrategy>('column');
  const [productNameCols, setProductNameCols] = useState<string[]>([]);
  const [delimiters, setDelimiters] = useState<string[]>([',']);
  const [customDelim, setCustomDelim] = useState<string>('');
  const [productSkuMap, setProductSkuMap] = useState<Record<string, string>>({});
  // Global products applied to every order under the 'global-products'
  // strategy. Each entry becomes one extra output row per source row.
  const [globalProducts, setGlobalProducts] = useState<GlobalProductEntry[]>(
    () => [{ id: genId(), sku: '', name: '', quantity: '' }],
  );
  // When the column strategy is active but some cells still hold multiple
  // products, the user can opt in to splitting them positionally — each
  // mapped column (Product Name, SKU, Quantity) gets split with the same
  // delimiters and zipped, so one row in becomes N rows out.
  const [columnExpandMulti, setColumnExpandMulti] = useState<boolean>(false);
  // Default quantity used when the Quantity column isn't mapped. Editable
  // so the user can confirm or override. Always treated as a string in
  // the output CSV.
  const [defaultQuantity, setDefaultQuantity] = useState<string>('1');
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
    setSkuStrategy('column');
    setProductNameCols([]);
    setDelimiters([',']);
    setCustomDelim('');
    setProductSkuMap({});
    setGlobalProducts([{ id: genId(), sku: '', name: '', quantity: '' }]);
    setColumnExpandMulti(false);
    setDefaultQuantity('1');
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

      // Initialize product-mapping defaults. When the AI couldn't find a
      // SKU column at all but did identify a Product Name column, flip
      // the SKU strategy to "I'll provide the SKUs" so the user lands on
      // the right surface without a click.
      const aiProductCol = out.columnMapping['Product Name'] || '';
      const aiSkuCol = out.columnMapping['Product Sku (Required)'] || '';
      setProductNameCols(aiProductCol ? [aiProductCol] : []);
      const sampleCells = aiProductCol
        ? dataRows.slice(0, 20).map(r => String(r[aiProductCol] ?? ''))
        : [];
      setDelimiters(detectDelimitersFromCells(sampleCells));
      setCustomDelim('');
      setProductSkuMap({});
      setGlobalProducts([{ id: genId(), sku: '', name: '', quantity: '' }]);
      setColumnExpandMulti(false);
      // Quantity default stays at whatever the user previously typed,
      // resetting only on a brand-new upload (handled by reset()).
      setSkuStrategy(
        out.skuConfidence === 'none' && aiProductCol && !aiSkuCol ? 'product-mapping' : 'column',
      );

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
    const allDelims = [...delimiters, ...(customDelim ? [customDelim] : [])];

    // Build the canonical "shipping fields" output for a source row.
    // Per-product overrides (Product Name / Product Sku) are applied
    // afterward so multi-product rows can share order-level info.
    const buildBaseRow = (row: Record<string, unknown>, idx: number): Record<string, string> => {
      const out: Record<string, string> = {};
      for (const col of result.columns) {
        const src = mappingEdits[col];
        if (col === 'Order Number (Required)' && isAutoGenOrder) {
          out[col] = autoGenOrderNumber(autoGenPrefix, idx, total);
          continue;
        }
        if (!src || src === AUTO_GEN_ORDER_VAL) { out[col] = ''; continue; }
        const raw = row[src];
        out[col] = raw === undefined || raw === null ? '' : String(raw).trim();
      }
      if (countryCol) {
        const raw = String(row[countryCol] ?? '').trim();
        out['Country Code (Required)'] = countryEdits[raw] ?? raw;
      }
      if (billingCountryCol) {
        const raw = String(row[billingCountryCol] ?? '').trim();
        out['Billing Country Code'] = countryEdits[raw] ?? raw;
      }
      if (!quantityCol && !out['Quantity']) out['Quantity'] = (defaultQuantity || '1');
      return out;
    };

    // Strategy A: SKU column.
    if (skuStrategy === 'column') {
      // A1. Single product per row — straight passthrough.
      if (!columnExpandMulti) {
        return sourceRows.map((row, idx) => buildBaseRow(row, idx));
      }
      // A2. Multi-product cells. Split product/SKU/quantity cells with
      // the active delimiters and zip them positionally. A row whose
      // product cell has 3 entries becomes 3 output rows sharing all
      // order-level fields. If the SKU cell has fewer entries (or one),
      // the last value is repeated; if it has more, the extras are
      // dropped — same for Quantity.
      const productCol = mappingEdits['Product Name'];
      const skuCol = mappingEdits['Product Sku (Required)'];
      const expanded: Record<string, string>[] = [];
      sourceRows.forEach((row, idx) => {
        const base = buildBaseRow(row, idx);
        const names = productCol
          ? splitProducts(String(row[productCol] ?? ''), allDelims)
          : [base['Product Name'] ?? ''];
        const skus = skuCol
          ? splitProducts(String(row[skuCol] ?? ''), allDelims)
          : [];
        const qtys = quantityCol
          ? splitProducts(String(row[quantityCol] ?? ''), allDelims)
          : [];
        const n = Math.max(names.length || 1, 1);
        for (let p = 0; p < n; p++) {
          const lineRow: Record<string, string> = { ...base };
          lineRow['Product Name'] = names[p] ?? names[names.length - 1] ?? '';
          lineRow['Product Sku (Required)'] =
            skus[p] ?? skus[skus.length - 1] ?? '';
          if (qtys.length > 0) {
            lineRow['Quantity'] = qtys[p] ?? qtys[qtys.length - 1] ?? (defaultQuantity || '1');
          } else if (!quantityCol) {
            lineRow['Quantity'] = defaultQuantity || '1';
          }
          expanded.push(lineRow);
        }
      });
      return expanded;
    }

    // Strategy C: global products. Each source row is duplicated once
    // per user-defined product. Order-level fields are shared; Product
    // Name / SKU / Quantity come from the global entries.
    if (skuStrategy === 'global-products') {
      const valid = globalProducts.filter(p => p.sku.trim() && p.name.trim());
      const out: Record<string, string>[] = [];
      sourceRows.forEach((row, idx) => {
        const base = buildBaseRow(row, idx);
        if (valid.length === 0) {
          out.push({ ...base, 'Product Name': '', 'Product Sku (Required)': '' });
          return;
        }
        for (const p of valid) {
          out.push({
            ...base,
            'Product Name': p.name,
            'Product Sku (Required)': p.sku,
            'Quantity': p.quantity.trim() || defaultQuantity || '1',
          });
        }
      });
      return out;
    }

    // Strategy B: product → SKU lookup. Each source row's product cells
    // (one or more selected columns) are split into N products and we
    // emit one output row per product, sharing the order info but with
    // the product's name + SKU substituted in. Unknown products keep the
    // name and leave SKU blank so the user can spot them in the output.
    const expanded: Record<string, string>[] = [];
    sourceRows.forEach((row, idx) => {
      const base = buildBaseRow(row, idx);
      const names = rowProductNames(row, productNameCols, allDelims);
      if (names.length === 0) {
        // No products on this row — keep the order line but blank product fields.
        expanded.push({ ...base, 'Product Name': '', 'Product Sku (Required)': '' });
        return;
      }
      for (const name of names) {
        const sku = productSkuMap[name.toLowerCase()] ?? '';
        const lineRow: Record<string, string> = {
          ...base,
          'Product Name': name,
          'Product Sku (Required)': sku,
        };
        // Per-line quantity. If no Quantity column was mapped, use the
        // user-confirmed default (1 unless they changed it). If a column
        // was mapped, all line items inherit the source row's quantity.
        if (!quantityCol) lineRow['Quantity'] = defaultQuantity || '1';
        expanded.push(lineRow);
      }
    });
    return expanded;
  };

  const onDownload = () => {
    if (!result) return;
    const rows = generateRows();
    const baseName = fileName.replace(/\.(csv|xlsx?|tsv)$/i, '') || 'orders';
    downloadCSV(`${baseName} — shiphero.csv`, result.columns, rows);
  };

  // List of products that need a SKU under the product-mapping strategy.
  // Recomputes when the user toggles delimiters / changes the product
  // column / loads a new file.
  const allActiveDelims = useMemo(
    () => [...delimiters, ...(customDelim ? [customDelim] : [])],
    [delimiters, customDelim],
  );
  const uniqueProductNames = useMemo(
    () => (skuStrategy === 'product-mapping' ? uniqueProducts(sourceRows, productNameCols, allActiveDelims) : []),
    [skuStrategy, sourceRows, productNameCols, allActiveDelims],
  );
  const productMapComplete = useMemo(() => {
    if (skuStrategy !== 'product-mapping') return false;
    if (uniqueProductNames.length === 0) return false;
    return uniqueProductNames.every(n => (productSkuMap[n.toLowerCase()] ?? '').trim() !== '');
  }, [skuStrategy, uniqueProductNames, productSkuMap]);

  // Global-products strategy needs at least one row where BOTH SKU and
  // product name are filled in. Empty SKU rows are dropped at download.
  const validGlobalProducts = useMemo(
    () => globalProducts.filter(p => p.sku.trim() && p.name.trim()),
    [globalProducts],
  );
  const globalProductsValid = skuStrategy === 'global-products' && validGlobalProducts.length > 0;

  // Forecast the number of output rows. Useful preview so the user can
  // see "12 source rows → 47 output rows" before they download.
  const projectedOutputRows = useMemo(() => {
    if (!result) return 0;
    if (skuStrategy === 'product-mapping') {
      if (productNameCols.length === 0) return sourceRows.length;
      return sourceRows.reduce((sum, row) => {
        const names = rowProductNames(row, productNameCols, allActiveDelims);
        return sum + Math.max(1, names.length);
      }, 0);
    }
    if (skuStrategy === 'global-products') {
      const count = Math.max(1, validGlobalProducts.length);
      return sourceRows.length * count;
    }
    if (columnExpandMulti) {
      const productCol = mappingEdits['Product Name'];
      if (!productCol) return sourceRows.length;
      return sourceRows.reduce((sum, row) => {
        const names = splitProducts(String(row[productCol] ?? ''), allActiveDelims);
        return sum + Math.max(1, names.length);
      }, 0);
    }
    return sourceRows.length;
  }, [result, skuStrategy, productNameCols, sourceRows, allActiveDelims, columnExpandMulti, mappingEdits, validGlobalProducts.length]);

  // Missing required columns based on current mapping edits. Auto-gen for
  // Order Number counts as "mapped" only if the user has typed a prefix.
  // Product Sku is satisfied under the product-mapping strategy as long as
  // every unique product has a SKU.
  const missingRequired = useMemo(() => {
    return REQUIRED_COLS.filter(col => {
      if (col === 'Product Sku (Required)') {
        if (skuStrategy === 'product-mapping') return !productMapComplete;
        if (skuStrategy === 'global-products') return !globalProductsValid;
      }
      const v = mappingEdits[col];
      if (!v) return true;
      if (col === 'Order Number (Required)' && v === AUTO_GEN_ORDER_VAL && !autoGenPrefix.trim()) {
        return true;
      }
      return false;
    });
  }, [mappingEdits, autoGenPrefix, skuStrategy, productMapComplete, globalProductsValid]);

  const orderIsAutoGen = mappingEdits['Order Number (Required)'] === AUTO_GEN_ORDER_VAL;
  const skuOk =
    skuStrategy === 'column' ? skuConfirmed :
    skuStrategy === 'product-mapping' ? productMapComplete :
    globalProductsValid;
  const canDownload =
    !!result &&
    skuOk &&
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
              skuStrategy={skuStrategy}
              setSkuStrategy={setSkuStrategy}
              productNameCols={productNameCols}
              setProductNameCols={setProductNameCols}
              delimiters={delimiters}
              setDelimiters={setDelimiters}
              customDelim={customDelim}
              setCustomDelim={setCustomDelim}
              productSkuMap={productSkuMap}
              setProductSkuMap={setProductSkuMap}
              uniqueProductNames={uniqueProductNames}
              productMapComplete={productMapComplete}
              globalProducts={globalProducts}
              setGlobalProducts={setGlobalProducts}
              globalProductsValid={globalProductsValid}
              validGlobalProductCount={validGlobalProducts.length}
              columnExpandMulti={columnExpandMulti}
              setColumnExpandMulti={setColumnExpandMulti}
              defaultQuantity={defaultQuantity}
              setDefaultQuantity={setDefaultQuantity}
              projectedOutputRows={projectedOutputRows}
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
  skuStrategy, setSkuStrategy,
  productNameCols, setProductNameCols,
  delimiters, setDelimiters,
  customDelim, setCustomDelim,
  productSkuMap, setProductSkuMap,
  uniqueProductNames, productMapComplete,
  globalProducts, setGlobalProducts,
  globalProductsValid, validGlobalProductCount,
  columnExpandMulti, setColumnExpandMulti,
  defaultQuantity, setDefaultQuantity,
  projectedOutputRows,
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
  skuStrategy: SkuStrategy;
  setSkuStrategy: (s: SkuStrategy) => void;
  productNameCols: string[];
  setProductNameCols: React.Dispatch<React.SetStateAction<string[]>>;
  delimiters: string[];
  setDelimiters: React.Dispatch<React.SetStateAction<string[]>>;
  customDelim: string;
  setCustomDelim: (s: string) => void;
  productSkuMap: Record<string, string>;
  setProductSkuMap: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  uniqueProductNames: string[];
  productMapComplete: boolean;
  globalProducts: GlobalProductEntry[];
  setGlobalProducts: React.Dispatch<React.SetStateAction<GlobalProductEntry[]>>;
  globalProductsValid: boolean;
  validGlobalProductCount: number;
  columnExpandMulti: boolean;
  setColumnExpandMulti: (b: boolean) => void;
  defaultQuantity: string;
  setDefaultQuantity: (s: string) => void;
  projectedOutputRows: number;
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

  // Local mirror of the parent's skuOk — keeps the strategy box color and
  // the "Confirmed" badge in sync regardless of which strategy is active.
  const skuOk =
    skuStrategy === 'column' ? skuConfirmed :
    skuStrategy === 'product-mapping' ? productMapComplete :
    globalProductsValid;

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
          {projectedOutputRows !== sourceRows.length && (
            <p className="text-[11px] text-[#015280] font-semibold mt-0.5">
              {sourceRows.length} source row{sourceRows.length === 1 ? '' : 's'} → {projectedOutputRows} output row{projectedOutputRows === 1 ? '' : 's'} (multi-product rows are duplicated per line)
            </p>
          )}
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

      {/* SKU section — strategy toggle on top, sub-UI below */}
      <div className={`rounded-xl border-2 p-4 ${
        skuOk ? 'border-emerald-300 bg-emerald-50/40' : 'border-[#43c7ff] bg-[#e6f8ff]/40'
      }`}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <p className="text-sm font-semibold text-gray-900">How are products listed in this file?</p>
            <p className="text-[11px] text-gray-600 mt-0.5">
              {result.skuReasoning || 'Tell us how to read the products and SKUs out of your source data.'}
              {result.skuConfidence && (
                <span className="ml-2 text-gray-500">
                  AI confidence:&nbsp;<span className="font-semibold uppercase">{result.skuConfidence}</span>
                </span>
              )}
            </p>
          </div>
          {skuOk && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-white border border-emerald-200 rounded-full px-2 py-0.5 flex-shrink-0">
              <Check className="w-3 h-3" />
              Confirmed
            </span>
          )}
        </div>

        {/* Strategy toggle */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
          {([
            { key: 'column' as const, title: 'Each row has a SKU column', sub: 'Pick which column in the file holds the SKU.' },
            { key: 'product-mapping' as const, title: "Rows have product names — I'll provide SKUs", sub: 'For files with only product names (often multiple per row).' },
            { key: 'global-products' as const, title: "Products aren't in the file — I'll add them", sub: 'Define one or more products that get added to every order.' },
          ]).map(opt => {
            const active = skuStrategy === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => {
                  setSkuStrategy(opt.key);
                  if (opt.key !== 'column') setSkuConfirmed(false);
                }}
                className={`text-left p-3 rounded-lg border transition-colors ${
                  active ? 'border-[#015280] bg-white shadow-sm' : 'border-gray-200 bg-white/60 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 ${active ? 'border-[#015280] bg-[#015280]' : 'border-gray-300 bg-white'}`}>
                    {active && <span className="block w-1.5 h-1.5 m-auto mt-[3px] rounded-full bg-white" />}
                  </span>
                  <span className="text-xs font-semibold text-gray-900">{opt.title}</span>
                </div>
                <p className="text-[11px] text-gray-600 ml-5">{opt.sub}</p>
              </button>
            );
          })}
        </div>

        {/* Strategy A — SKU column flow */}
        {skuStrategy === 'column' && (
          <div className="bg-white rounded-lg p-3 border border-gray-100">
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
                    <span key={i} className="text-[11px] font-mono bg-gray-50 border border-gray-200 text-gray-700 px-1.5 py-0.5 rounded">
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

            {/* Optional multi-product expansion in column strategy */}
            <div className="mt-3 pt-3 border-t border-gray-100">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={columnExpandMulti}
                  onChange={e => setColumnExpandMulti(e.target.checked)}
                  className="mt-0.5 accent-[#015280]"
                />
                <div className="flex-1">
                  <p className="text-xs font-semibold text-gray-800">
                    Some rows have multiple products in one cell
                  </p>
                  <p className="text-[11px] text-gray-500">
                    Split product, SKU, and quantity cells by the same delimiters and emit one CSV
                    row per product. All order-level fields (name, address, etc.) get duplicated.
                  </p>
                </div>
              </label>
              {columnExpandMulti && (
                <div className="mt-2 ml-6">
                  <p className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider mb-1">
                    Split on
                  </p>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {CANDIDATE_DELIMS.map(d => {
                      const on = delimiters.includes(d.key);
                      return (
                        <button
                          key={d.key}
                          type="button"
                          onClick={() =>
                            setDelimiters(prev => prev.includes(d.key) ? prev.filter(x => x !== d.key) : [...prev, d.key])
                          }
                          className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border transition-colors ${
                            on ? 'border-[#43c7ff] bg-[#e6f8ff] text-[#015280]' : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
                          }`}
                        >
                          {on ? '✓ ' : ''}{d.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] text-gray-600">Custom:</label>
                    <input
                      type="text"
                      value={customDelim}
                      onChange={e => setCustomDelim(e.target.value)}
                      placeholder='e.g. " | "'
                      className="flex-1 max-w-[180px] px-2 py-0.5 text-xs font-mono border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-[#43c7ff]"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Strategy B — product-name → SKU lookup */}
        {skuStrategy === 'product-mapping' && (
          <ProductMappingPanel
            sourceHeaders={sourceHeaders}
            sourceRows={sourceRows}
            productNameCols={productNameCols}
            setProductNameCols={setProductNameCols}
            delimiters={delimiters}
            setDelimiters={setDelimiters}
            customDelim={customDelim}
            setCustomDelim={setCustomDelim}
            productSkuMap={productSkuMap}
            setProductSkuMap={setProductSkuMap}
            uniqueProductNames={uniqueProductNames}
            productMapComplete={productMapComplete}
            projectedOutputRows={projectedOutputRows}
            sourceRowCount={sourceRows.length}
          />
        )}

        {skuStrategy === 'global-products' && (
          <GlobalProductsPanel
            globalProducts={globalProducts}
            setGlobalProducts={setGlobalProducts}
            sourceRowCount={sourceRows.length}
            validCount={validGlobalProductCount}
            defaultQuantity={defaultQuantity}
          />
        )}
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
        <div className="space-y-1.5">
          {result.columns.map(col => {
            const isReq = (REQUIRED_COLS as readonly string[]).includes(col);
            const src = mappingEdits[col] ?? '';
            const isOrderRow = col === 'Order Number (Required)';
            const isQuantityRow = col === 'Quantity';
            const isSkuRow = col === 'Product Sku (Required)';
            const isSkuFromUpstream = isSkuRow && (skuStrategy === 'product-mapping' || skuStrategy === 'global-products');
            const showAutoGenInput = isOrderRow && src === AUTO_GEN_ORDER_VAL;

            // SKU row when the upstream strategy box is handling it via the
            // product → SKU table OR the global products list: just show a
            // read-only note instead of letting the user pick another
            // column down here.
            if (isSkuFromUpstream) {
              const note = skuStrategy === 'product-mapping'
                ? 'Using SKUs from product mapping above'
                : 'Using SKUs from global product list above';
              return (
                <div key={col} className="grid grid-cols-2 gap-2 items-center text-xs">
                  <span className="truncate font-semibold text-gray-900" title={col}>
                    {col}
                  </span>
                  <div className="px-2 py-1 text-xs bg-[#e6f8ff]/40 border border-[#43c7ff]/40 rounded text-[#015280] flex items-center gap-1.5">
                    <Check className="w-3 h-3" />
                    <span className="truncate">{note}</span>
                  </div>
                </div>
              );
            }

            const reqMissing = isReq && (
              !src || (isOrderRow && src === AUTO_GEN_ORDER_VAL && !autoGenPrefix.trim())
            );

            // Quantity: when there's no mapped column, the picker label
            // should reassure the user that we'll default — not say
            // "Not mapped". Required dot disappears too because the
            // default IS the mapping.
            const quantityHasDefault = isQuantityRow && !src && defaultQuantity.trim() !== '';
            const reqMissingFinal = reqMissing && !quantityHasDefault;

            const notMappedLabel = quantityHasDefault
              ? `Defaulting to ${defaultQuantity}`
              : '— Not mapped —';

            const extraOptions: PickerExtraOption[] = isOrderRow
              ? [{
                  value: AUTO_GEN_ORDER_VAL,
                  label: 'Auto-generate from prefix…',
                  description: 'Use a prefix and we\'ll number every order sequentially.',
                  icon: <Sparkles className="w-3 h-3" />,
                }]
              : [];

            return (
              <div key={col} className="grid grid-cols-2 gap-2 items-start text-xs">
                <span
                  className={`truncate pt-1 ${isReq ? 'font-semibold text-gray-900' : 'text-gray-700'}`}
                  title={col}
                >
                  {col}
                  {reqMissingFinal && <span className="ml-1 text-red-500">•</span>}
                </span>
                <div className="flex flex-col gap-1">
                  <SingleColumnPicker
                    value={src}
                    onChange={v => updateMapping(col, v)}
                    sourceHeaders={sourceHeaders}
                    sourceRows={sourceRows}
                    notMappedLabel={notMappedLabel}
                    extraOptions={extraOptions}
                    highlightError={reqMissingFinal}
                  />
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
                  {isQuantityRow && !src && (
                    <div className="border border-[#43c7ff]/30 bg-[#e6f8ff]/30 rounded p-2 flex items-center gap-2">
                      <span className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">
                        Default to
                      </span>
                      <input
                        type="number"
                        min="1"
                        value={defaultQuantity}
                        onChange={e => setDefaultQuantity(e.target.value)}
                        className="w-16 px-2 py-0.5 text-xs font-mono border border-gray-300 rounded bg-white text-center focus:outline-none focus:ring-1 focus:ring-[#43c7ff]"
                      />
                      <span className="text-[10px] text-gray-600">
                        per order line
                      </span>
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
          title={!canDownload ? 'Finish the SKU step first' : 'Download CSV'}
        >
          <Download className="w-4 h-4" />
          Download CSV
        </button>
      </div>
    </div>
  );
}

// ── Product-name → SKU mapping (strategy B) ─────────────────────────────────
// Shows the source column picker, the delimiter selector, and a scrollable
// table of unique product names with an empty SKU input next to each. Used
// when the file only has product names — usually one cell holds multiple
// products separated by commas, &, or +.
function ProductMappingPanel({
  sourceHeaders, sourceRows,
  productNameCols, setProductNameCols,
  delimiters, setDelimiters,
  customDelim, setCustomDelim,
  productSkuMap, setProductSkuMap,
  uniqueProductNames, productMapComplete,
  projectedOutputRows, sourceRowCount,
}: {
  sourceHeaders: string[];
  sourceRows: Record<string, unknown>[];
  productNameCols: string[];
  setProductNameCols: React.Dispatch<React.SetStateAction<string[]>>;
  delimiters: string[];
  setDelimiters: React.Dispatch<React.SetStateAction<string[]>>;
  customDelim: string;
  setCustomDelim: (s: string) => void;
  productSkuMap: Record<string, string>;
  setProductSkuMap: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  uniqueProductNames: string[];
  productMapComplete: boolean;
  projectedOutputRows: number;
  sourceRowCount: number;
}) {
  const toggleDelim = (key: string) => {
    setDelimiters(prev => prev.includes(key) ? prev.filter(d => d !== key) : [...prev, key]);
  };
  const setSkuForProduct = (name: string, sku: string) => {
    const key = name.toLowerCase();
    setProductSkuMap(prev => ({ ...prev, [key]: sku }));
  };
  const filledCount = uniqueProductNames.filter(n => (productSkuMap[n.toLowerCase()] ?? '').trim() !== '').length;

  return (
    <div className="bg-white rounded-lg p-3 border border-gray-100 space-y-3">
      {/* Product name source columns — multi-select */}
      <div className="flex flex-wrap items-start gap-2">
        <label className="text-xs text-gray-700 pt-1">Product name column(s):</label>
        <MultiColumnPicker
          selected={productNameCols}
          onChange={setProductNameCols}
          sourceHeaders={sourceHeaders}
          sourceRows={sourceRows}
        />
      </div>

      {/* Sample cells — grouped by selected column so the user can see
          what they're splitting on. Handy when the file mixes commas and
          pluses across two separate columns. */}
      {productNameCols.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider mb-1">
            Sample cells from selected column{productNameCols.length === 1 ? '' : 's'}
          </p>
          <div className="space-y-2">
            {productNameCols.map(col => {
              const samples = sourceRows
                .slice(0, 3)
                .map(r => String(r[col] ?? '').trim())
                .filter(Boolean);
              return (
                <div key={col}>
                  <p className="text-[10px] font-semibold text-gray-500 mb-0.5">
                    {col}
                  </p>
                  {samples.length === 0 ? (
                    <p className="text-[11px] italic text-gray-400">(no values found in the first few rows)</p>
                  ) : (
                    <div className="space-y-1">
                      {samples.map((s, i) => (
                        <p
                          key={i}
                          className="text-[11px] font-mono bg-gray-50 border border-gray-200 text-gray-700 px-1.5 py-0.5 rounded truncate"
                          title={s}
                        >
                          {s}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Delimiter picker */}
      <div>
        <p className="text-xs font-semibold text-gray-800 mb-1">
          When a cell holds more than one product, how are they separated?
        </p>
        <p className="text-[11px] text-gray-500 mb-2">
          Pick every separator the file uses. Comma is the most common; some files mix in
          <span className="font-mono"> &amp; </span> or <span className="font-mono">+</span>.
        </p>
        <div className="flex flex-wrap gap-2 mb-2">
          {CANDIDATE_DELIMS.map(d => {
            const on = delimiters.includes(d.key);
            return (
              <button
                key={d.key}
                type="button"
                onClick={() => toggleDelim(d.key)}
                className={`px-2 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                  on
                    ? 'border-[#43c7ff] bg-[#e6f8ff] text-[#015280]'
                    : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
                }`}
              >
                {on ? '✓ ' : ''}{d.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[11px] text-gray-600">Custom:</label>
          <input
            type="text"
            value={customDelim}
            onChange={e => setCustomDelim(e.target.value)}
            placeholder='e.g. " | "'
            className="flex-1 max-w-[180px] px-2 py-0.5 text-xs font-mono border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-[#43c7ff]"
          />
          {customDelim && (
            <span className="text-[10px] text-gray-500">
              Will also split on <span className="font-mono">{customDelim}</span>
            </span>
          )}
        </div>
      </div>

      {/* Row-duplication preview — makes the expansion visible */}
      {projectedOutputRows !== sourceRowCount && (
        <div className="text-[11px] bg-[#015280]/5 border border-[#015280]/20 rounded p-2 text-[#015280] leading-snug">
          <span className="font-semibold">{sourceRowCount} source row{sourceRowCount === 1 ? '' : 's'}</span> will be expanded into{' '}
          <span className="font-semibold">{projectedOutputRows} output row{projectedOutputRows === 1 ? '' : 's'}</span>.
          Each product becomes its own line — same order number, name, address, and shipping info; only Product Name + SKU change.
        </div>
      )}

      {/* Product → SKU table */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-semibold text-gray-800">
            Map products to SKUs
          </p>
          <p className="text-[11px] text-gray-500">
            {uniqueProductNames.length === 0
              ? 'Pick a product name column above to start'
              : <>
                  {filledCount} / {uniqueProductNames.length} mapped
                  {productMapComplete && (
                    <span className="ml-2 inline-flex items-center gap-0.5 text-emerald-700 font-semibold">
                      <Check className="w-3 h-3" /> All set
                    </span>
                  )}
                </>}
          </p>
        </div>
        {uniqueProductNames.length === 0 ? (
          <div className="text-[11px] text-gray-500 italic px-3 py-4 bg-gray-50 border border-dashed border-gray-200 rounded">
            No products to map yet. Pick the column that holds product names above.
          </div>
        ) : (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="grid grid-cols-[1fr_140px] gap-0 bg-gray-50 px-3 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200">
              <span>Product name</span>
              <span>SKU</span>
            </div>
            <div className="max-h-72 overflow-y-auto divide-y divide-gray-100">
              {uniqueProductNames.map(name => {
                const sku = productSkuMap[name.toLowerCase()] ?? '';
                return (
                  <div key={name} className="grid grid-cols-[1fr_140px] gap-2 items-center px-3 py-1.5">
                    <span className="text-xs text-gray-800 truncate" title={name}>{name}</span>
                    <input
                      type="text"
                      value={sku}
                      onChange={e => setSkuForProduct(name, e.target.value)}
                      placeholder="Enter SKU"
                      className={`px-2 py-1 text-xs font-mono border rounded focus:outline-none focus:ring-1 focus:ring-[#43c7ff] ${
                        sku ? 'border-emerald-300 bg-emerald-50/30' : 'border-red-200 bg-white'
                      }`}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── MultiColumnPicker ──────────────────────────────────────────────────────
// Multi-select popover for source columns. Each option row shows the
// column header AND a short content preview (up to 3 distinct values
// from that column) so the user can identify the right columns even
// when headers are blank ("Column M") or look similar.
function MultiColumnPicker({
  selected, onChange, sourceHeaders, sourceRows,
}: {
  selected: string[];
  onChange: React.Dispatch<React.SetStateAction<string[]>>;
  sourceHeaders: string[];
  sourceRows: Record<string, unknown>[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const toggle = (col: string) => {
    onChange(prev => prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]);
  };

  const summary = selected.length === 0
    ? 'Pick one or more columns'
    : selected.length === 1
      ? selected[0]
      : `${selected.length} columns: ${selected.slice(0, 2).join(', ')}${selected.length > 2 ? '…' : ''}`;

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1.5 px-2 py-1 text-xs border border-gray-300 rounded bg-white hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-[#43c7ff] min-w-[220px] justify-between"
      >
        <span className={selected.length === 0 ? 'text-gray-400 italic' : 'text-gray-800 truncate'} title={selected.join(', ')}>
          {summary}
        </span>
        <ChevronLeft className="w-3 h-3 text-gray-400 -rotate-90" />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-30 min-w-[300px] max-w-[440px] max-h-80 overflow-y-auto">
          {sourceHeaders.length === 0 ? (
            <p className="px-3 py-2 text-xs text-gray-500 italic">No columns available</p>
          ) : (
            <>
              <div className="sticky top-0 bg-white border-b border-gray-100 px-3 py-1.5 flex items-center justify-between">
                <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                  {selected.length} of {sourceHeaders.length} selected
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onChange(sourceHeaders.slice())}
                    className="text-[10px] font-semibold text-[#015280] hover:underline"
                  >
                    Select all
                  </button>
                  <span className="text-gray-300 text-[10px]">·</span>
                  <button
                    type="button"
                    onClick={() => onChange([])}
                    className="text-[10px] font-semibold text-gray-500 hover:underline"
                  >
                    Clear
                  </button>
                </div>
              </div>
              <div className="py-1">
                {sourceHeaders.map(h => {
                  const on = selected.includes(h);
                  const previews = previewValuesForColumn(sourceRows, h, 3);
                  return (
                    <button
                      key={h}
                      type="button"
                      onClick={() => toggle(h)}
                      className={`w-full text-left px-3 py-2 hover:bg-gray-50 flex items-start gap-2 ${on ? 'bg-[#e6f8ff]/40' : ''}`}
                    >
                      <span className={`mt-0.5 w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center ${on ? 'bg-[#015280] border-[#015280]' : 'bg-white border-gray-300'}`}>
                        {on && <Check className="w-2.5 h-2.5 text-white" />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-900 truncate" title={h}>{h}</p>
                        {previews.length > 0 ? (
                          <p className="text-[10px] text-gray-500 truncate" title={previews.join(' · ')}>
                            {previews.join(' · ')}
                          </p>
                        ) : (
                          <p className="text-[10px] text-gray-400 italic">(empty in the first rows)</p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── SingleColumnPicker ────────────────────────────────────────────────────
// Replacement for native <select> in the column mapping list. Shows a
// content preview for every source column so the user can tell apart
// "Column J" and "Column N" without opening their file. Supports extra
// non-column options (e.g. "Auto-generate from prefix"). When `value` is
// empty, displays the configurable notMappedLabel instead of "— Not
// mapped —" — used by the Quantity row to say "Defaulting to 1".
interface PickerExtraOption {
  value: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
}

function SingleColumnPicker({
  value,
  onChange,
  sourceHeaders,
  sourceRows,
  notMappedLabel = '— Not mapped —',
  extraOptions = [],
  highlightError = false,
}: {
  value: string;
  onChange: (v: string) => void;
  sourceHeaders: string[];
  sourceRows: Record<string, unknown>[];
  notMappedLabel?: string;
  extraOptions?: PickerExtraOption[];
  highlightError?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const extraMatch = extraOptions.find(o => o.value === value);
  const isColumn = !!value && !extraMatch;
  const isEmpty = !value;
  const selectedPreview = isColumn ? previewValuesForColumn(sourceRows, value, 2) : [];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`w-full text-left px-2 py-1 text-xs border rounded bg-white hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-[#43c7ff] flex items-center justify-between gap-1.5 ${
          highlightError ? 'border-red-300' : 'border-gray-200'
        }`}
      >
        <span className="truncate flex-1 min-w-0">
          {extraMatch ? (
            <span className="font-semibold text-[#015280]">{extraMatch.label}</span>
          ) : isColumn ? (
            <>
              <span className="text-gray-800 font-medium">{value}</span>
              {selectedPreview.length > 0 && (
                <span className="text-gray-400 ml-1.5">· {selectedPreview.join(' · ')}</span>
              )}
            </>
          ) : (
            <span className="text-gray-500 italic">{notMappedLabel}</span>
          )}
        </span>
        <ChevronLeft className="w-3 h-3 text-gray-400 flex-shrink-0 -rotate-90" />
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-30 min-w-[320px] max-w-[440px] max-h-80 overflow-y-auto py-1">
          {/* Not mapped */}
          <button
            type="button"
            onClick={() => { onChange(''); setOpen(false); }}
            className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 ${isEmpty ? 'bg-[#e6f8ff]/40 font-semibold text-[#015280]' : 'text-gray-700 italic'}`}
          >
            {notMappedLabel}
          </button>

          {extraOptions.length > 0 && (
            <>
              <div className="border-t border-gray-100 my-1" />
              {extraOptions.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { onChange(opt.value); setOpen(false); }}
                  className={`w-full text-left px-3 py-1.5 hover:bg-gray-50 ${value === opt.value ? 'bg-[#e6f8ff]/40' : ''}`}
                >
                  <p className={`text-xs ${value === opt.value ? 'font-semibold text-[#015280]' : 'font-semibold text-gray-800'} flex items-center gap-1`}>
                    {opt.icon}
                    {opt.label}
                  </p>
                  {opt.description && (
                    <p className="text-[10px] text-gray-500">{opt.description}</p>
                  )}
                </button>
              ))}
            </>
          )}

          {sourceHeaders.length > 0 && (
            <>
              <div className="border-t border-gray-100 my-1" />
              <p className="px-3 py-1 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                Source columns
              </p>
              {sourceHeaders.map(h => {
                const preview = previewValuesForColumn(sourceRows, h, 3);
                const active = value === h;
                return (
                  <button
                    key={h}
                    type="button"
                    onClick={() => { onChange(h); setOpen(false); }}
                    className={`w-full text-left px-3 py-1.5 hover:bg-gray-50 ${active ? 'bg-[#e6f8ff]/40' : ''}`}
                  >
                    <p className={`text-xs truncate ${active ? 'font-semibold text-[#015280]' : 'font-semibold text-gray-900'}`}>
                      {h}
                    </p>
                    {preview.length > 0 ? (
                      <p className="text-[10px] text-gray-500 truncate" title={preview.join(' · ')}>
                        {preview.join(' · ')}
                      </p>
                    ) : (
                      <p className="text-[10px] text-gray-400 italic">(empty in the first rows)</p>
                    )}
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── GlobalProductsPanel ───────────────────────────────────────────────────
// Sub-UI for the 'global-products' SKU strategy. The user defines one or
// more products (SKU + name + optional qty) that get attached to every
// order in the source file. Each entry expands the output by one row per
// source row at download time.
function GlobalProductsPanel({
  globalProducts, setGlobalProducts,
  sourceRowCount, validCount, defaultQuantity,
}: {
  globalProducts: GlobalProductEntry[];
  setGlobalProducts: React.Dispatch<React.SetStateAction<GlobalProductEntry[]>>;
  sourceRowCount: number;
  validCount: number;
  defaultQuantity: string;
}) {
  const update = (id: string, patch: Partial<GlobalProductEntry>) => {
    setGlobalProducts(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p));
  };
  const addRow = () => {
    setGlobalProducts(prev => [...prev, { id: genId(), sku: '', name: '', quantity: '' }]);
  };
  const removeRow = (id: string) => {
    setGlobalProducts(prev => prev.length <= 1 ? prev : prev.filter(p => p.id !== id));
  };

  const projected = sourceRowCount * Math.max(1, validCount);

  return (
    <div className="bg-white rounded-lg p-3 border border-gray-100 space-y-3">
      <div className="flex items-start gap-2">
        <Package className="w-4 h-4 text-[#015280] mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-xs font-semibold text-gray-900">
            Products to add to every order
          </p>
          <p className="text-[11px] text-gray-600">
            Each product becomes one line item on every order. Add as many as you need.
          </p>
        </div>
      </div>

      {/* Row count preview */}
      {sourceRowCount > 0 && (
        <div className="text-[11px] bg-[#015280]/5 border border-[#015280]/20 rounded p-2 text-[#015280] leading-snug">
          <span className="font-semibold">{sourceRowCount} order{sourceRowCount === 1 ? '' : 's'}</span>
          {' × '}
          <span className="font-semibold">{Math.max(1, validCount)} product{Math.max(1, validCount) === 1 ? '' : 's'}</span>
          {' = '}
          <span className="font-semibold">{projected} output row{projected === 1 ? '' : 's'}</span>.
          Every order shares its name, address, and shipping fields across all product lines.
        </div>
      )}

      {/* Header */}
      <div className="grid grid-cols-[1fr_1.5fr_80px_28px] gap-2 px-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
        <span>SKU</span>
        <span>Product name</span>
        <span>Qty</span>
        <span />
      </div>

      {/* Rows */}
      <div className="space-y-1.5">
        {globalProducts.map(p => {
          const valid = p.sku.trim() && p.name.trim();
          return (
            <div key={p.id} className="grid grid-cols-[1fr_1.5fr_80px_28px] gap-2 items-center">
              <input
                type="text"
                value={p.sku}
                onChange={e => update(p.id, { sku: e.target.value })}
                placeholder="SKU-001"
                className={`px-2 py-1 text-xs font-mono border rounded focus:outline-none focus:ring-1 focus:ring-[#43c7ff] ${
                  valid ? 'border-emerald-300 bg-emerald-50/30' : 'border-gray-300 bg-white'
                }`}
              />
              <input
                type="text"
                value={p.name}
                onChange={e => update(p.id, { name: e.target.value })}
                placeholder="Product name"
                className={`px-2 py-1 text-xs border rounded focus:outline-none focus:ring-1 focus:ring-[#43c7ff] ${
                  valid ? 'border-emerald-300 bg-emerald-50/30' : 'border-gray-300 bg-white'
                }`}
              />
              <input
                type="number"
                min="1"
                value={p.quantity}
                onChange={e => update(p.id, { quantity: e.target.value })}
                placeholder={defaultQuantity || '1'}
                title={`Defaults to ${defaultQuantity || '1'} if left blank`}
                className="px-2 py-1 text-xs font-mono border border-gray-300 rounded bg-white text-center focus:outline-none focus:ring-1 focus:ring-[#43c7ff]"
              />
              <button
                type="button"
                onClick={() => removeRow(p.id)}
                disabled={globalProducts.length <= 1}
                title={globalProducts.length <= 1 ? 'Keep at least one row' : 'Remove this product'}
                className="p-1 rounded hover:bg-red-50 hover:text-red-500 text-gray-400 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Add row */}
      <button
        type="button"
        onClick={addRow}
        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold text-[#015280] hover:bg-[#e6f8ff]/40 rounded transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        Add product
      </button>

      {validCount === 0 && (
        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
          Add at least one product with a SKU and name before downloading.
        </p>
      )}
    </div>
  );
}
