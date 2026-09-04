"use client";

import { FileImageIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { useRef, useState } from "react";

export function UploadDropzone({
  onFile,
  busy,
}: {
  onFile: (file: File) => void;
  busy?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  // Drag events fire for every child element, so nesting is counted rather
  // than toggled — otherwise the highlight flickers as the pointer moves.
  const depth = useRef(0);

  const pick = () => inputRef.current?.click();

  return (
    <div
      onDragEnter={(e) => {
        e.preventDefault();
        depth.current += 1;
        setDragging(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => {
        e.preventDefault();
        depth.current -= 1;
        if (depth.current <= 0) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        depth.current = 0;
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) onFile(file);
      }}
      onClick={pick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          pick();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label="Upload a photo of your driveway, patio or path"
      aria-busy={busy}
      className={cn(
        "relative rounded-xl border border-dashed bg-card transition-colors",
        "focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
        dragging
          ? "border-brand bg-brand/5"
          : "border-border hover:border-muted-foreground/50"
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />

      <Empty className="min-h-76">
        <EmptyHeader>
          <EmptyMedia variant="icon" className="size-16">
            {busy ? (
              <Spinner className="size-8" />
            ) : (
              <FileImageIcon className="size-9" strokeWidth={1.5} />
            )}
          </EmptyMedia>
          <EmptyTitle className="text-base">
            {busy ? "Preparing your photo" : "Drag & Drop"}
          </EmptyTitle>
          <EmptyDescription>
            {busy ? (
              "One moment."
            ) : (
              <>
                or <span className="font-medium text-foreground underline">choose</span>{" "}
                an image
              </>
            )}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <p className="text-xs text-muted-foreground">
            JPG, PNG or WebP up to 20MB
          </p>
        </EmptyContent>
      </Empty>
    </div>
  );
}
