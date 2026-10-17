import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Eraser, Upload } from "lucide-react";
import type { ContractSignature } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { inputCls } from "@/components/accounts/shared";

const WIDTH = 440;
const HEIGHT = 140;
const INK = "#08293d";
const SCRIPT_FONT = '"Segoe Script", "Brush Script MT", "Apple Chancery", "URW Chancery L", cursive';

/**
 * Captures the signature the way DocuSeal does: draw it, type the name (rendered in a script font) or upload an
 * image. Reports a PNG data URL whenever a valid signature exists, null otherwise.
 */
export function SignaturePad({ signerName, onChange }: { signerName: string; onChange: (s: ContractSignature | null) => void }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<ContractSignature["kind"]>("drawn");
  const [typed, setTyped] = useState(signerName);
  const [uploaded, setUploaded] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasStrokes = useRef(false);
  const [drawnUrl, setDrawnUrl] = useState<string | null>(null);

  // What the parent gets depends on the active tab.
  useEffect(() => {
    if (mode === "drawn") return onChange(drawnUrl ? { kind: "drawn", image_url: drawnUrl } : null);
    if (mode === "typed") return onChange(typed.trim() ? { kind: "typed", image_url: renderTyped(typed.trim()) } : null);
    onChange(uploaded ? { kind: "uploaded", image_url: uploaded } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, drawnUrl, typed, uploaded]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * WIDTH, y: ((e.clientY - r.top) / r.height) * HEIGHT };
  };
  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const p = point(e);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = INK;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const p = point(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    hasStrokes.current = true;
  };
  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (hasStrokes.current && canvas.current) setDrawnUrl(canvas.current.toDataURL("image/png"));
  };
  const clear = () => {
    const ctx = canvas.current?.getContext("2d");
    ctx?.clearRect(0, 0, WIDTH, HEIGHT);
    hasStrokes.current = false;
    setDrawnUrl(null);
  };
  const pick = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setUploaded(String(reader.result));
    reader.readAsDataURL(file);
  };

  const tab = (k: ContractSignature["kind"], label: string) => (
    <button key={k} type="button" role="tab" aria-selected={mode === k} onClick={() => setMode(k)}
      className={cn("rounded-[4px] px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", mode === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
      {label}
    </button>
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-sm font-medium">{t("intake.docuseal.sig_title")}</span>
        <div role="tablist" className="grid w-full grid-cols-3 rounded-md border border-border bg-muted/50 p-0.5 sm:inline-grid sm:w-auto">
          {tab("drawn", t("intake.docuseal.sig_draw"))}
          {tab("typed", t("intake.docuseal.sig_type"))}
          {tab("uploaded", t("intake.docuseal.sig_upload"))}
        </div>
      </div>

      {mode === "drawn" && (
        <div className="space-y-1.5">
          <div className="relative overflow-hidden rounded-[4px] border border-input bg-white shadow-[inset_0_1px_2px_rgb(0_0_0/0.04)]">
            <canvas ref={canvas} width={WIDTH} height={HEIGHT} aria-label={t("intake.docuseal.sig_draw_hint")}
              className="block w-full cursor-crosshair touch-none select-none" style={{ aspectRatio: `${WIDTH} / ${HEIGHT}`, minHeight: 120 }}
              onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerLeave={end} onPointerCancel={end} />
            <span aria-hidden className="pointer-events-none absolute bottom-6 left-4 font-display text-sm text-muted-foreground">×</span>
            <span aria-hidden className="pointer-events-none absolute bottom-7 left-8 right-4 border-b border-border" />
            {drawnUrl && (
              <button type="button" onClick={clear} className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-[4px] border border-border bg-surface px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground">
                <Eraser className="h-3 w-3" />{t("intake.docuseal.sig_clear")}
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{t("intake.docuseal.sig_draw_hint")}</p>
        </div>
      )}

      {mode === "typed" && (
        <div className="space-y-1.5">
          <input className={inputCls} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={t("intake.docuseal.sig_type_placeholder")} autoComplete="off" />
          <div className="relative flex h-24 items-center justify-center rounded-[4px] border border-input bg-white px-4">
            <span aria-hidden className="pointer-events-none absolute bottom-5 left-8 right-4 border-b border-border" />
            <span className="truncate text-3xl" style={{ fontFamily: SCRIPT_FONT, color: INK }}>{typed.trim() || " "}</span>
          </div>
        </div>
      )}

      {mode === "uploaded" && (
        <div className="space-y-1.5">
          {uploaded ? (
            <div className="relative flex h-28 items-center justify-center rounded-[4px] border border-input bg-white p-2">
              <img src={uploaded} alt="" className="max-h-full max-w-full object-contain" />
              <button type="button" onClick={() => setUploaded(null)} className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-[4px] border border-border bg-surface px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground">
                <Eraser className="h-3 w-3" />{t("intake.docuseal.sig_clear")}
              </button>
            </div>
          ) : (
            <label className="flex h-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-[4px] border border-dashed border-input bg-white text-sm text-muted-foreground hover:border-ring">
              <Upload className="h-4 w-4" />
              <span>{t("intake.docuseal.sig_choose_file")}</span>
              <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = ""; }} />
            </label>
          )}
          <p className="text-xs text-muted-foreground">{t("intake.docuseal.sig_upload_hint")}</p>
        </div>
      )}
    </div>
  );
}

/** Typed signature as a PNG data URL (same shape as the drawn one, so the PDF treats both alike). */
function renderTyped(text: string): string {
  const c = document.createElement("canvas");
  c.width = WIDTH;
  c.height = HEIGHT;
  const ctx = c.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = INK;
  ctx.font = `40px ${SCRIPT_FONT}`;
  ctx.textBaseline = "middle";
  let size = 40;
  while (ctx.measureText(text).width > WIDTH - 40 && size > 16) {
    size -= 2;
    ctx.font = `${size}px ${SCRIPT_FONT}`;
  }
  ctx.fillText(text, 20, HEIGHT / 2);
  return c.toDataURL("image/png");
}
