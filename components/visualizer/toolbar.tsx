"use client";

import {
  CalculatorIcon,
  DownloadIcon,
  EllipsisVerticalIcon,
  InfoIcon,
  MoveDiagonalIcon,
  PackageIcon,
  RotateCcwIcon,
  SendIcon,
  Share2Icon,
  SplitIcon,
  UploadIcon,
  XIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type ToolbarActions = {
  onExit: () => void;
  onToggleCompare: () => void;
  onShare: () => void;
  onDownload: () => void;
  onUpload: () => void;
  onCalculator: () => void;
  onQuote: () => void;
  onProductPage: () => void;
  onOrderSample: () => void;
  onAdjustSurface: () => void;
  onResetView: () => void;
  comparing: boolean;
  editing: boolean;
  downloading: boolean;
};

export function Toolbar(props: ToolbarActions) {
  const {
    onExit,
    onToggleCompare,
    onShare,
    onDownload,
    onUpload,
    onCalculator,
    onQuote,
    onProductPage,
    onOrderSample,
    onAdjustSurface,
    onResetView,
    comparing,
    editing,
    downloading,
  } = props;

  return (
    <header className="flex items-center gap-1 border-b bg-background px-2 py-2">
      <Button variant="ghost" onClick={onExit}>
        <XIcon data-icon="inline-start" />
        Exit
      </Button>

      <Separator orientation="vertical" className="mx-1 h-6" />

      <Button
        variant="ghost"
        onClick={onToggleCompare}
        aria-pressed={comparing}
        className={cn(comparing && "bg-accent text-accent-foreground")}
      >
        <SplitIcon data-icon="inline-start" />
        Compare
      </Button>

      <Button variant="ghost" onClick={onShare} className="hidden md:inline-flex">
        <Share2Icon data-icon="inline-start" />
        Share
      </Button>

      <Button
        variant="ghost"
        onClick={onDownload}
        disabled={downloading}
        className="hidden md:inline-flex"
      >
        <DownloadIcon data-icon="inline-start" />
        Download
      </Button>

      <Button variant="ghost" onClick={onUpload} className="hidden lg:inline-flex">
        <UploadIcon data-icon="inline-start" />
        Upload
      </Button>

      <Button
        variant="ghost"
        onClick={onCalculator}
        className="hidden xl:inline-flex"
      >
        <CalculatorIcon data-icon="inline-start" />
        Resin Bound Calculator
      </Button>

      <Button variant="ghost" onClick={onQuote} className="hidden xl:inline-flex">
        <SendIcon data-icon="inline-start" />
        Need a Quote?
      </Button>

      <Button
        variant="ghost"
        onClick={onProductPage}
        className="hidden 2xl:inline-flex"
      >
        <InfoIcon data-icon="inline-start" />
        Go to product page
      </Button>

      <div className="ml-auto flex items-center gap-1">
        <Button onClick={onOrderSample}>
          <PackageIcon data-icon="inline-start" />
          Order Sample
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" aria-label="More options">
                <span className="hidden sm:inline">Menu</span>
                <EllipsisVerticalIcon data-icon="inline-end" />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel>This photo</DropdownMenuLabel>
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={onAdjustSurface}>
                <MoveDiagonalIcon />
                {editing ? "Finish adjusting" : "Adjust surface area"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onResetView}>
                <RotateCcwIcon />
                Reset scale and rotation
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onUpload}>
                <UploadIcon />
                Use a different photo
              </DropdownMenuItem>
            </DropdownMenuGroup>

            <DropdownMenuSeparator />

            <DropdownMenuLabel>Next steps</DropdownMenuLabel>
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={onShare} className="md:hidden">
                <Share2Icon />
                Share
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDownload} className="md:hidden">
                <DownloadIcon />
                Download image
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onCalculator} className="xl:hidden">
                <CalculatorIcon />
                Resin Bound Calculator
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onQuote} className="xl:hidden">
                <SendIcon />
                Need a Quote?
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onProductPage} className="2xl:hidden">
                <InfoIcon />
                Go to product page
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
