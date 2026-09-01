"use client";

import * as React from "react";
import { CameraIcon, CheckIcon, ImageIcon, SendIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { prepareUpload, UploadError } from "@/lib/image";

type State = "idle" | "ready" | "sending" | "sent";

export function MobileCapture({ sessionId }: { sessionId: string }) {
  const cameraRef = React.useRef<HTMLInputElement>(null);
  const libraryRef = React.useRef<HTMLInputElement>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [state, setState] = React.useState<State>("idle");
  const [error, setError] = React.useState<string | null>(null);

  const accept = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      // Downscale on the phone: it keeps the POST small over mobile data.
      const prepared = await prepareUpload(file, 1600);
      setPreview(prepared.dataUrl);
      setState("ready");
    } catch (err) {
      setError(
        err instanceof UploadError ? err.message : "That photo could not be read."
      );
    }
  };

  const send = async () => {
    if (!preview) return;
    setState("sending");
    setError(null);
    try {
      const res = await fetch(`/api/handoff/${sessionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl: preview }),
      });
      if (!res.ok) throw new Error();
      setState("sent");
    } catch {
      setError("Could not reach the visualizer. Check your connection.");
      setState("ready");
    }
  };

  if (state === "sent") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-brand/10 text-brand">
          <CheckIcon className="size-8" />
        </div>
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-bold">Sent to your computer</h1>
          <p className="text-sm text-muted-foreground">
            Head back to the other screen — the visualizer is opening there now.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-bold tracking-tight">Take a photo</h1>
        <p className="text-sm text-muted-foreground">
          Stand back far enough to see the whole driveway, patio or path, and
          keep the camera level.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>That didn&apos;t work</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => {
          void accept(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => {
          void accept(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview}
          alt="The photo you just took"
          className="w-full rounded-xl border object-cover"
        />
      ) : (
        <div className="flex aspect-[3/4] w-full items-center justify-center rounded-xl border border-dashed bg-muted/40 text-muted-foreground">
          <CameraIcon className="size-10" strokeWidth={1.5} />
        </div>
      )}

      <div className="flex flex-col gap-3">
        <Button onClick={() => cameraRef.current?.click()} size="lg">
          <CameraIcon data-icon="inline-start" />
          {preview ? "Retake photo" : "Open camera"}
        </Button>
        <Button
          variant="outline"
          size="lg"
          onClick={() => libraryRef.current?.click()}
        >
          <ImageIcon data-icon="inline-start" />
          Choose from library
        </Button>
        {preview && (
          <Button
            variant="secondary"
            size="lg"
            onClick={send}
            disabled={state === "sending"}
          >
            {state === "sending" ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <SendIcon data-icon="inline-start" />
            )}
            Send to computer
          </Button>
        )}
      </div>
    </div>
  );
}
