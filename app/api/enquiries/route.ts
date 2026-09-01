import type { NextRequest } from "next/server";

/**
 * Sample requests and quote requests from the visualizer.
 *
 * TODO: forward to the CRM / order system. Right now the payload is validated
 * and acknowledged so the client flow is real end to end, but nothing is
 * persisted — swap the body of `deliver` for the real integration.
 */

type Enquiry = {
  kind: "sample" | "quote";
  name: string;
  email: string;
  postcode: string;
  productId: string;
  areaM2?: number;
  notes?: string;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validate(body: unknown): { ok: true; value: Enquiry } | { ok: false; error: string } {
  const b = body as Partial<Enquiry> | null;
  if (!b) return { ok: false, error: "Missing body." };
  if (b.kind !== "sample" && b.kind !== "quote") {
    return { ok: false, error: "Unknown enquiry type." };
  }
  if (!b.name?.trim()) return { ok: false, error: "Please give us a name." };
  if (!b.email || !EMAIL.test(b.email)) {
    return { ok: false, error: "That email address does not look right." };
  }
  if (!b.postcode?.trim()) return { ok: false, error: "Please give us a postcode." };
  if (!b.productId?.trim()) return { ok: false, error: "No blend selected." };

  return {
    ok: true,
    value: {
      kind: b.kind,
      name: b.name.trim().slice(0, 120),
      email: b.email.trim().slice(0, 200),
      postcode: b.postcode.trim().slice(0, 12),
      productId: b.productId,
      areaM2: typeof b.areaM2 === "number" ? b.areaM2 : undefined,
      notes: b.notes?.slice(0, 2000),
    },
  };
}

async function deliver(enquiry: Enquiry) {
  console.info("[enquiry]", enquiry.kind, enquiry.productId, enquiry.postcode);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const result = validate(body);
  if (!result.ok) return Response.json({ error: result.error }, { status: 400 });

  await deliver(result.value);
  return Response.json({ status: "received" });
}
