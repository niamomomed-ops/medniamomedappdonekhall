import { formatCorrectionDisplay } from "./correction-display";

type Eye = {
  sphere: number | null;
  cylinder: number | null;
  axe: number | null;
  addition: number | null;
};

export type PrintCorrectionInput = {
  clientName: string | null;
  showOD: boolean;
  showOG: boolean;
  od: Eye;
  og: Eye;
  showAddition?: boolean;
};

export function printCorrection(input: PrintCorrectionInput): void {
  const showAddition = input.showAddition ?? true;
  const lines: string[] = [];
  if (input.showOD) {
    lines.push(
      `<div class="section"><div class="label">ŒIL DROIT (OD)</div><div class="value">${formatCorrectionDisplay(
        input.od.sphere,
        input.od.cylinder,
        input.od.axe,
        input.od.addition,
        showAddition,
      )}</div></div>`,
    );
  }
  if (input.showOG) {
    lines.push(
      `<div class="section"><div class="label">ŒIL GAUCHE (OG)</div><div class="value">${formatCorrectionDisplay(
        input.og.sphere,
        input.og.cylinder,
        input.og.axe,
        input.og.addition,
        showAddition,
      )}</div></div>`,
    );
  }

  const name = (input.clientName ?? "").trim() || "Client";

  const w = window.open("", "_blank", "width=300,height=600");
  if (!w) return;
  w.document.write(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Correction</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Courier New',Courier,monospace;font-size:12px;line-height:1.4;color:#000;background:#fff;width:72mm;padding:3mm}
  .name{font-weight:bold;font-size:13px;text-align:center;margin-bottom:6px;border-bottom:1px solid #000;padding-bottom:4px}
  .section{margin:4px 0}
  .label{font-weight:bold;font-size:11px}
  .value{font-size:12px;margin-top:2px}
  @page{size:72mm auto;margin:3mm}
</style></head>
<body>
  <div class="name">${escapeHtml(name)}</div>
  ${lines.join("")}
</body></html>`);
  w.document.close();
  w.focus();
  w.onload = () => {
    w.print();
    w.close();
  };
  setTimeout(() => {
    try {
      w.print();
      w.close();
    } catch {}
  }, 500);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
