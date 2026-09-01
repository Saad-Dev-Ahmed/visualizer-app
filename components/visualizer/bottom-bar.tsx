"use client";

import { RotateCwIcon, RulerIcon, Undo2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ProductSwatch } from "@/components/visualizer/product-swatch";
import type { Product } from "@/lib/products";

export function BottomBar({
  product,
  scale,
  onScaleChange,
  onRotate,
  onReset,
}: {
  product: Product;
  scale: number;
  onScaleChange: (value: number) => void;
  onRotate: () => void;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t bg-background px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <ProductSwatch product={product} className="size-11 shrink-0" />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-xs text-muted-foreground">
            {product.brand}
          </span>
          <span className="truncate text-sm font-semibold">{product.name}</span>
        </div>
      </div>

      <Separator orientation="vertical" className="hidden h-9 sm:block" />

      <Button variant="ghost" onClick={onReset}>
        <Undo2Icon data-icon="inline-start" />
        Reset
      </Button>

      <Tooltip>
        <TooltipTrigger
          render={
            <Button variant="ghost" onClick={onRotate}>
              <RotateCwIcon data-icon="inline-start" />
              Rotate
            </Button>
          }
        />
        <TooltipContent>Turn the aggregate 15° on the surface</TooltipContent>
      </Tooltip>

      <div className="flex min-w-48 flex-1 items-center gap-3 sm:max-w-64">
        <RulerIcon className="size-4 shrink-0 text-muted-foreground" />
        <Slider
          aria-label="Stone scale"
          min={0.4}
          max={2.5}
          step={0.05}
          value={[scale]}
          onValueChange={(value) => {
            const next = Array.isArray(value) ? value[0] : value;
            onScaleChange(next);
          }}
        />
        <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
          {scale.toFixed(2)}×
        </span>
      </div>
    </div>
  );
}
