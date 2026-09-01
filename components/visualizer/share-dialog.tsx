"use client";

import * as React from "react";
import { CheckIcon, CopyIcon, DownloadIcon, Share2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { FieldDescription } from "@/components/ui/field";

export function ShareDialog({
  open,
  onOpenChange,
  url,
  onDownload,
  onShareFile,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  onDownload: () => void;
  onShareFile: () => void;
}) {
  const [copied, setCopied] = React.useState(false);
  // Only read during the open state, which is always client-side.
  const canShareFile = typeof navigator !== "undefined" && "share" in navigator;

  React.useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(id);
  }, [copied]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share this visual</DialogTitle>
          <DialogDescription>
            The link reopens the visualizer on this blend. Your own photo stays
            on your device, so send the image itself if you uploaded one.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 px-4">
          <InputGroup>
            <InputGroupInput readOnly value={url} aria-label="Share link" />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                size="icon-xs"
                aria-label="Copy link"
                onClick={async () => {
                  await navigator.clipboard.writeText(url);
                  setCopied(true);
                }}
              >
                {copied ? <CheckIcon /> : <CopyIcon />}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>

          <FieldDescription>
            {copied ? "Copied to your clipboard." : "Anyone with the link can open it."}
          </FieldDescription>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={onDownload} className="flex-1">
              <DownloadIcon data-icon="inline-start" />
              Download image
            </Button>
            {canShareFile && (
              <Button variant="outline" onClick={onShareFile} className="flex-1">
                <Share2Icon data-icon="inline-start" />
                Share image
              </Button>
            )}
          </div>
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="ghost">Close</Button>} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
