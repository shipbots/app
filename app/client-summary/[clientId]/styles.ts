/** Self-contained CSS for the printable onboarding summary sheet.
 *  Injected via a <style> tag so the page needs no global classes and prints
 *  cleanly (the app nav is hidden under @media print). */
export const SUMMARY_CSS = `
.os-overlay{
  position:fixed; inset:0; z-index:100; overflow:auto; background:#f3f4f6;
  color:#1f2937;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  -webkit-print-color-adjust:exact; print-color-adjust:exact;
}
.os-sheet{
  width:8.5in; min-height:11in; margin:18px auto; background:#fff;
  padding:0.42in 0.46in 0.36in; box-shadow:0 6px 30px rgba(0,0,0,.14);
}
.os-sheet *{ box-sizing:border-box; }

/* Header */
.os-head{ display:flex; align-items:center; justify-content:space-between;
  border-bottom:3px solid #43c7ff; padding-bottom:11px; }
.os-brand{ display:flex; align-items:center; gap:10px; }
.os-brand img{ width:42px; height:42px; border-radius:9px; }
.os-name{ font-size:22px; font-weight:800; color:#015280; letter-spacing:-.3px; }
.os-name span{ color:#43c7ff; }
.os-rt{ text-align:right; }
.os-rt .os-t{ font-size:17px; font-weight:800; color:#015280; }
.os-rt .os-s{ font-size:11px; color:#6b7280; margin-top:2px; }

.os-welcome{ font-size:11px; color:#374151; margin:11px 0 3px; line-height:1.45; }
.os-welcome b{ color:#015280; }

/* Section titles */
.os-sec-title{ display:flex; align-items:center; gap:7px; font-size:11.5px; font-weight:800;
  color:#015280; text-transform:uppercase; letter-spacing:.4px; margin:14px 0 8px; }
.os-sec-title::after{ content:""; flex:1; height:1px; background:#e5e7eb; }

/* Checklist strip — kept dense so it stays on page 1 even with extra items */
.os-checklist{ display:grid; grid-template-columns:1fr 1fr 1fr; gap:5px 10px; }
.os-ci{ display:flex; gap:7px; align-items:flex-start; padding:5px 8px; border:1px solid #e5e7eb;
  border-radius:7px; background:#fcfcfd; }
.os-ci .os-icon{ width:15px; height:15px; border-radius:50%; flex-shrink:0; display:flex;
  align-items:center; justify-content:center; font-size:10px; font-weight:800; color:#fff; margin-top:1px; }
.os-ci.done .os-icon{ background:#16a34a; }
.os-ci.pending .os-icon{ background:#d97706; }
.os-ci.neutral .os-icon{ background:#43c7ff; }
.os-ci .os-l{ font-size:10px; font-weight:700; color:#111827; line-height:1.25; }
.os-ci .os-d{ font-size:9px; color:#6b7280; margin-top:1px; line-height:1.3; }
.os-ci .os-d a{ color:#015280; font-weight:700; text-decoration:none; }

/* Two-column body */
.os-body{ display:grid; grid-template-columns:1.45fr 1fr; gap:16px; margin-top:6px; }

/* Discussion cards */
.os-card{ border:1px solid #e5e7eb; border-radius:9px; padding:9px 11px; margin-bottom:9px;
  border-left:3px solid #43c7ff; }
.os-card h3{ margin:0 0 6px; font-size:11px; font-weight:800; color:#015280;
  display:flex; align-items:center; gap:6px; text-transform:uppercase; letter-spacing:.3px; }
.os-card h3 .os-e{ font-size:12px; }
.os-kv{ margin:0; }
.os-kv-row{ display:grid; grid-template-columns:34% 1fr; gap:2px 10px; align-items:baseline; }
.os-kv dt{ font-size:9.5px; color:#6b7280; }
.os-kv dd{ font-size:9.5px; color:#111827; margin:0 0 1px; font-weight:600; }
.os-notes{ font-size:9.5px; color:#374151; margin-top:5px; line-height:1.4;
  background:#e6f8ff; border-radius:6px; padding:5px 7px; }
.os-notes b{ color:#015280; }

/* Review callout under "What We Discussed" */
.os-review-note{ font-size:9.7px; color:#013f63; background:#e6f8ff; border-left:3px solid #43c7ff;
  border-radius:6px; padding:6px 9px; margin:0 0 9px; line-height:1.4; font-weight:600; }

/* Getting-started guide topics */
.os-guide{ font-size:9.5px; color:#374151; line-height:1.6; }

/* Next-steps ordered list */
.os-steps{ margin:0; padding-left:16px; }
.os-steps li{ font-size:9.7px; color:#111827; line-height:1.5; margin-bottom:2px; }

/* Right rail */
.os-rail .os-box{ border:1px solid #e5e7eb; border-radius:9px; padding:9px 11px; margin-bottom:9px; }
.os-rail .os-box.accent{ background:#015280; border-color:#015280; }
.os-rail .os-box.accent h4{ color:#fff; }
.os-rail .os-box.accent .os-li{ color:#eef7ff; }
.os-rail .os-box.accent .os-li b{ color:#bfe9ff; }
.os-rail .os-box.accent .os-li a{ color:#8fd8ff; }
.os-rail h4{ margin:0 0 6px; font-size:10.5px; font-weight:800; text-transform:uppercase;
  letter-spacing:.3px; color:#015280; display:flex; align-items:center; gap:6px; }
.os-rail .os-li{ font-size:9.7px; color:#111827; line-height:1.5; }
.os-rail .os-li b{ color:#374151; font-weight:700; }
.os-rail .os-li a{ color:#015280; text-decoration:none; font-weight:700; }
.os-contact{ padding:5px 0; border-bottom:1px dashed #e5e7eb; }
.os-contact:last-child{ border-bottom:none; }
.os-contact .os-nm{ font-size:10px; font-weight:800; color:#111827; }
.os-contact .os-role{ font-size:8.5px; font-weight:700; color:#43c7ff; text-transform:uppercase; letter-spacing:.3px; }
.os-contact .os-dd{ font-size:9.3px; color:#374151; }
.os-sup-row{ display:flex; justify-content:space-between; gap:8px; padding:3px 0; font-size:9.5px; }
.os-sup-row .os-k{ color:#6b7280; }
.os-sup-row .os-v{ color:#111827; font-weight:600; text-align:right; }

.os-foot{ margin-top:12px; border-top:1px solid #e5e7eb; padding-top:8px;
  font-size:9px; color:#6b7280; display:flex; justify-content:space-between; gap:12px; }
.os-foot b{ color:#015280; }

/* Floating action (screen only) */
.os-print-btn{ position:fixed; top:16px; right:16px; z-index:120; background:#015280; color:#fff;
  border:none; padding:10px 16px; border-radius:9px; font-size:13px; font-weight:700; cursor:pointer;
  box-shadow:0 4px 14px rgba(1,82,128,.4); font-family:inherit; }
.os-print-btn:hover{ background:#013f63; }

/* ── Page 2+ : help-article guides ─────────────────────────────────────── */
.os-article{ width:8.5in; margin:18px auto; background:#fff; padding:0.5in 0.62in;
  box-shadow:0 6px 30px rgba(0,0,0,.14); }
.os-article *{ box-sizing:border-box; }
.os-article-head{ display:flex; align-items:baseline; justify-content:space-between; gap:14px;
  border-bottom:2px solid #43c7ff; padding-bottom:8px; margin-bottom:12px; }
.os-article-t{ font-size:17px; font-weight:800; color:#015280; display:flex; align-items:center; gap:8px; }
.os-article-t .os-e{ font-size:16px; }
.os-article-lnk{ font-size:9.5px; color:#015280; font-weight:700; text-decoration:none; white-space:nowrap; }
.os-art-h{ font-size:12.5px; font-weight:800; color:#013f63; margin:13px 0 4px; }
.os-art-p{ font-size:10.5px; color:#374151; line-height:1.55; margin:0 0 6px; }
.os-art-li{ font-size:10.5px; color:#374151; line-height:1.5; margin:0 0 3px 18px; list-style:disc; }
.os-art-callout{ font-size:10px; color:#013f63; background:#e6f8ff; border-left:3px solid #43c7ff;
  border-radius:6px; padding:8px 11px; margin:8px 0; line-height:1.5; }
.os-art-img{ display:block; max-width:100%; max-height:3.6in; object-fit:contain; margin:9px auto;
  border:1px solid #e5e7eb; border-radius:6px; }

@media print{
  .os-article{ width:auto !important; margin:0 !important; padding:0 !important;
    box-shadow:none !important; page-break-before:always; break-before:page; }
  .os-art-img{ page-break-inside:avoid; break-inside:avoid; }
  .os-art-h{ page-break-after:avoid; break-after:avoid; }
}

@page{ size:letter; margin:0.4in; }
@media print{
  html,body{ height:auto !important; overflow:visible !important; background:#fff !important; }
  body > nav{ display:none !important; }
  main{ overflow:visible !important; flex:none !important; }
  .os-print-btn{ display:none !important; }
  .os-overlay{ position:static !important; overflow:visible !important; background:#fff !important; }
  .os-sheet{ width:auto !important; min-height:auto !important; margin:0 !important;
    padding:0 !important; box-shadow:none !important; }
  /* If content flows to a 2nd page, keep blocks whole (nothing truncated). */
  .os-head, .os-checklist, .os-ci, .os-card, .os-box, .os-review-note{
    break-inside:avoid; page-break-inside:avoid; }
}
`;
