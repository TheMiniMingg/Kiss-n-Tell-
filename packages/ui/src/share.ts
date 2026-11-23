import type { RunSummary } from "@kiss-n-tell/engine";

export interface ShareCardInput {
  imageUrl: string;
  topicTitle: string;
  characterName: string;
  summary: RunSummary;
  siteLabel: string;
}

const W = 1080;
const H = 1350;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load the image for the share card."));
    img.src = src;
  });
}

/** Draws the result card (final image + topic + score) and returns a PNG blob. */
export async function renderShareCard(input: ShareCardInput): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available.");
  ctx.fillStyle = "#120a16";
  ctx.fillRect(0, 0, W, H);

  const img = await loadImage(input.imageUrl);
  // Cover-fit the image into the full card.
  const iw = img.naturalWidth || img.width || W;
  const ih = img.naturalHeight || img.height || H;
  const scale = Math.max(W / iw, H / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);

  const grad = ctx.createLinearGradient(0, H * 0.55, 0, H);
  grad.addColorStop(0, "rgba(18,10,22,0)");
  grad.addColorStop(0.45, "rgba(18,10,22,0.85)");
  grad.addColorStop(1, "rgba(18,10,22,0.97)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, H * 0.55, W, H * 0.45);

  const { summary } = input;
  const font = (weight: number, size: number) => `${weight} ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#ff4f8b";
  ctx.font = font(800, 40);
  ctx.fillText("KISS N TELL", 72, H - 300);
  ctx.fillStyle = "#ffffff";
  ctx.font = font(800, 120);
  ctx.fillText(`${summary.score}`, 72, H - 170);
  const scoreW = ctx.measureText(`${summary.score}`).width;
  ctx.font = font(600, 56);
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fillText(` / ${summary.maxScore} pts`, 72 + scoreW, H - 170);
  ctx.fillStyle = "#ffffff";
  ctx.font = font(600, 40);
  const line = summary.won ? `Ending unlocked · ${input.topicTitle}` : `Stage ${summary.stage}/10 · ${input.topicTitle}`;
  ctx.fillText(truncate(ctx, line, W - 144), 72, H - 105);
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.font = font(500, 30);
  ctx.fillText(truncate(ctx, `${input.characterName} · ${input.siteLabel}`, W - 144), 72, H - 55);

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not create the image."))), "image/png"),
  );
}

function truncate(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > max) t = t.slice(0, -1);
  return t + "…";
}

export type ShareOutcome = "copied" | "downloaded" | "shared" | "cancelled";

export function canCopyImage(): boolean {
  return typeof window !== "undefined" && "ClipboardItem" in window && !!navigator.clipboard?.write;
}

/** Copy the card to the clipboard. Must be called from a click handler. */
export async function copyCard(make: () => Promise<Blob>): Promise<ShareOutcome> {
  if (!canCopyImage()) {
    downloadBlob(await make(), "kiss-n-tell.png");
    return "downloaded";
  }
  // Pass a promise so Safari keeps the user gesture while the image renders.
  await navigator.clipboard.write([new ClipboardItem({ "image/png": make() })]);
  return "copied";
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function canNativeShareFiles(): boolean {
  try {
    const probe = new File([new Blob()], "x.png", { type: "image/png" });
    return typeof navigator.share === "function" && !!navigator.canShare?.({ files: [probe] });
  } catch {
    return false;
  }
}

export async function nativeShare(blob: Blob, text: string): Promise<ShareOutcome> {
  const file = new File([blob], "kiss-n-tell.png", { type: "image/png" });
  try {
    await navigator.share({ files: [file], text });
    return "shared";
  } catch (e) {
    if ((e as Error).name === "AbortError") return "cancelled";
    throw e;
  }
}
