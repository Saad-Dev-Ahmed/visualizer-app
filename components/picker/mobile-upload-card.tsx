"use client";

import { useEffect, useRef, useState } from "react";

import QRCode from "qrcode";
import { CheckIcon, SmartphoneIcon } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";

/** Short, unguessable-enough id for a channel that lives for ten minutes. */
function newSessionId() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function MobileUploadCard({
  onPhoto,
}: {
  onPhoto: (dataUrl: string) => void;
}) {
  const [qr, setQr] = useState<string | null>(null);
  const [received, setReceived] = useState(false);
  // The polling loop must stay mounted for the life of the card, so it reads
  // the latest callback through a ref rather than restarting on every render.
  const onPhotoRef = useRef(onPhoto);
  useEffect(() => {
    onPhotoRef.current = onPhoto;
  }, [onPhoto]);

  useEffect(() => {
    const id = newSessionId();
    const url = `${window.location.origin}/m/${id}`;
    let cancelled = false;

    QRCode.toDataURL(url, {
      margin: 1,
      width: 320,
      color: { dark: "#111827ff", light: "#00000000" },
      errorCorrectionLevel: "M",
    })
      .then((data) => !cancelled && setQr(data))
      .catch(() => !cancelled && setQr(null));

    // Poll for the phone's upload. A socket would be tidier, but polling a
    // route handler needs no extra infrastructure and this window is short.
    const timer = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/handoff/${id}`, { cache: "no-store" });
        const body = (await res.json()) as { status: string; dataUrl?: string };
        if (body.status === "ready" && body.dataUrl) {
          setReceived(true);
          onPhotoRef.current(body.dataUrl);
        }
      } catch {
        // Offline or the dev server restarted; the next tick will retry.
      }
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl bg-card px-6 py-10">
      <div className="flex size-40 items-center justify-center">
        {received ? (
          <div className="flex size-16 items-center justify-center rounded-full bg-brand/10 text-brand">
            <CheckIcon className="size-8" />
          </div>
        ) : qr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={qr}
            alt="QR code linking to the mobile upload page"
            className="size-40"
          />
        ) : (
          <Skeleton className="size-40 rounded-lg" />
        )}
      </div>
      <div className="flex flex-col items-center gap-1 text-center">
        <p className="flex items-center gap-2 font-semibold">
          <SmartphoneIcon className="size-4 text-muted-foreground" />
          {received ? "Photo received" : "Upload from mobile"}
        </p>
        <p className="text-xs text-muted-foreground">
          {received ? "Opening the visualizer" : "Open camera to scan"}
        </p>
      </div>
    </div>
  );
}
