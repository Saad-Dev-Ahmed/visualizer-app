"use client";

import * as React from "react";
import { useState, useCallback } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowRightIcon, TriangleAlertIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { UploadDropzone } from "@/components/picker/upload-dropzone";
import { MobileUploadCard } from "@/components/picker/mobile-upload-card";
import { DEMO_SCENES } from "@/lib/scenes";
import { prepareUpload, UploadError } from "@/lib/image";
import { saveScene } from "@/lib/session";

export function RoomPicker() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = useCallback(() => {
    router.push("/visualizer");
  }, [router]);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      setBusy(true);
      try {
        const prepared = await prepareUpload(file);
        saveScene({ kind: "upload", ...prepared });
        go();
      } catch (err) {
        setError(
          err instanceof UploadError
            ? err.message
            : "That photo could not be opened. Try a different one."
        );
        setBusy(false);
      }
    },
    [go]
  );

  const handleMobilePhoto = useCallback(
    async (dataUrl: string) => {
      setBusy(true);
      try {
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        const prepared = await prepareUpload(
          new File([blob], "phone-photo.jpg", { type: blob.type })
        );
        saveScene({ kind: "upload", ...prepared });
        go();
      } catch {
        setError("The photo from your phone could not be opened.");
        setBusy(false);
      }
    },
    [go]
  );

  const pickDemo = (id: string) => {
    saveScene({ kind: "demo", id });
    go();
  };

  return (
    <div className="grid gap-10 lg:grid-cols-2 lg:gap-14">
      {/* Bring your own photo */}
      <section className="flex flex-col gap-5">
        <h2 className="text-2xl font-bold tracking-tight capitalize">
          See products <span className="text-warm">in your room</span>
        </h2>

        {error && (
          <Alert variant="destructive">
            <TriangleAlertIcon />
            <AlertTitle>That didn&apos;t work</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-4 rounded-2xl bg-muted/60 p-4 sm:p-6">
          <UploadDropzone onFile={handleFile} busy={busy} />
          <MobileUploadCard onPhoto={handleMobilePhoto} />
        </div>
      </section>

      {/* Or start from one of ours */}
      <section className="flex flex-col gap-5">
        <h2 className="text-2xl font-bold tracking-tight text-muted-foreground capitalize">
          or try our demo rooms
        </h2>

        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {DEMO_SCENES.map((scene) => (
            <li key={scene.id}>
              <button
                type="button"
                onClick={() => pickDemo(scene.id)}
                className="group flex w-full flex-col gap-2 rounded-xl text-left focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <div className="relative aspect-3/4 w-full overflow-hidden rounded-xl bg-muted ring-1 ring-border transition group-hover:ring-2 group-hover:ring-brand">
                  <Image
                    src={scene.photo}
                    alt={scene.caption}
                    fill
                    sizes="(min-width: 1024px) 18vw, 40vw"
                    className="object-cover transition duration-300 group-hover:scale-[1.03]"
                  />
                  <span className="absolute inset-x-0 bottom-0 flex translate-y-2 items-center gap-1 bg-linear-to-t from-black/70 to-transparent p-3 text-xs font-medium text-white opacity-0 transition group-hover:translate-y-0 group-hover:opacity-100">
                    Visualize <ArrowRightIcon className="size-3" />
                  </span>
                </div>
                <span className="text-sm font-semibold text-muted-foreground group-hover:text-foreground">
                  {scene.label}
                </span>
              </button>
            </li>
          ))}
        </ul>

        <p className="max-w-md text-sm text-muted-foreground">
          Every blend is rendered onto the photo in perspective, using the light
          and shadows already in the shot — so what you see is close to what gets
          laid.
        </p>
      </section>
    </div>
  );
}
