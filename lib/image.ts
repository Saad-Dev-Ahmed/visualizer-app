import type { Quad } from "@/lib/render/homography";

export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export class UploadError extends Error {}

/**
 * Normalises a user photo: rejects the obvious mistakes, then downscales so the
 * renderer is not pushing a 12-megapixel texture around, and so the result fits
 * in sessionStorage.
 */
export async function prepareUpload(
  file: File,
  maxEdge = 1600
): Promise<{ dataUrl: string; width: number; height: number; name: string }> {
  if (!file.type.startsWith("image/")) {
    throw new UploadError("That file is not an image. Try a JPG or PNG photo.");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new UploadError("That photo is over 20MB. Try a smaller one.");
  }

  const bitmap = await loadImage(URL.createObjectURL(file), true);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, width, height);

  return {
    dataUrl: canvas.toDataURL("image/jpeg", 0.9),
    width,
    height,
    name: file.name,
  };
}

export function loadImage(src: string, revoke = false): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (revoke) URL.revokeObjectURL(src);
      resolve(img);
    };
    img.onerror = () => reject(new UploadError("That image could not be read."));
    img.src = src;
  });
}

/**
 * Builds a mask from the quad the user placed over their surface. The blur is
 * what stops the new surface from looking like a decal — real ground meets a
 * kerb or a lawn over a pixel or two, not on a hard vector edge.
 */
export function maskFromQuad(
  quad: Quad,
  width: number,
  height: number,
  featherPx = 3
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);
  ctx.filter = `blur(${featherPx}px)`;
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  quad.forEach(([x, y], i) => {
    const px = x * width;
    const py = y * height;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.closePath();
  ctx.fill();
  ctx.filter = "none";

  return canvas;
}
