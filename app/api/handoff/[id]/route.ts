import type { NextRequest } from "next/server";

/**
 * Phone-to-desktop photo handoff behind the QR code on the landing screen.
 *
 * Deliberately in-memory: it is a two-minute, single-use channel and the photo
 * never needs to outlive the session. Moving to more than one server instance
 * means swapping this Map for Redis or blob storage — the route contract does
 * not change.
 */

type Slot = { dataUrl: string; at: number };

const TTL_MS = 10 * 60 * 1000;
const MAX_BYTES = 8 * 1024 * 1024;

const globalStore = globalThis as unknown as { __handoff?: Map<string, Slot> };
const store = (globalStore.__handoff ??= new Map<string, Slot>());

function sweep() {
  const cutoff = Date.now() - TTL_MS;
  for (const [id, slot] of store) if (slot.at < cutoff) store.delete(id);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  sweep();
  const { id } = await params;
  const slot = store.get(id);
  if (!slot) return Response.json({ status: "waiting" });

  // Single use — once the desktop has collected it, the channel is closed.
  store.delete(id);
  return Response.json({ status: "ready", dataUrl: slot.dataUrl });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  sweep();
  const { id } = await params;
  if (!/^[a-z0-9]{6,32}$/i.test(id)) {
    return Response.json({ error: "Bad session id." }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as { dataUrl?: string } | null;
  const dataUrl = body?.dataUrl;
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
    return Response.json({ error: "Expected an image data URL." }, { status: 400 });
  }
  if (dataUrl.length > MAX_BYTES) {
    return Response.json({ error: "That photo is too large." }, { status: 413 });
  }

  store.set(id, { dataUrl, at: Date.now() });
  return Response.json({ status: "sent" });
}
