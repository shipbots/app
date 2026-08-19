'use client';

/** Floating "Save as PDF" action — hidden when printing (see SUMMARY_CSS).
 *  Uses the browser's print-to-PDF, which keeps full CSS fidelity and needs
 *  no server-side PDF toolchain. */
export function PrintButton() {
  return (
    <button type="button" className="os-print-btn" onClick={() => window.print()}>
      ⬇ Save as PDF
    </button>
  );
}
