"use client";

import { CheckIcon, PackageIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ProductSwatch } from "@/components/visualizer/product-swatch";
import type { Product } from "@/lib/products";

export function ProductDetailsSheet({
  product,
  open,
  onOpenChange,
  onApply,
  onOrderSample,
  applied,
}: {
  product: Product | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (id: string) => void;
  onOrderSample: () => void;
  applied: boolean;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        {product && (
          <>
            <SheetHeader>
              <SheetTitle>{product.name}</SheetTitle>
              <SheetDescription>
                {product.brand} · SKU {product.sku}
              </SheetDescription>
            </SheetHeader>

            <div className="flex flex-col gap-6 overflow-y-auto px-4">
              <ProductSwatch
                product={product}
                sizePx={512}
                className="aspect-[4/3] w-full"
              />

              <p className="text-sm text-muted-foreground">
                {product.description}
              </p>

              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{product.family}</Badge>
                <Badge variant="outline">{product.stoneSize}</Badge>
                {product.new && <Badge>New</Badge>}
              </div>

              <Separator />

              <div className="flex flex-col gap-3">
                <h3 className="text-sm font-semibold">In the mix</h3>
                <ul className="flex flex-col gap-2">
                  {mixShares(product).map(({ color, share }) => (
                    <li key={color} className="flex items-center gap-3">
                      <span
                        className="size-5 shrink-0 rounded-full ring-1 ring-black/10"
                        style={{ backgroundColor: color }}
                      />
                      <span className="flex-1">
                        <span
                          className="block h-1.5 rounded-full bg-brand/70"
                          style={{ width: `${share}%` }}
                        />
                      </span>
                      <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
                        {share}%
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <Separator />

              <dl className="grid grid-cols-2 gap-4 text-sm">
                <Spec label="Aggregate grade" value={product.stoneSize} />
                <Spec
                  label="Average stone"
                  value={`${product.grainMm.toFixed(1)} mm`}
                />
                <Spec label="Finish" value={finishLabel(product.gloss)} />
                <Spec label="Laid depth" value="18 mm" />
              </dl>
            </div>

            <SheetFooter>
              <Button
                onClick={() => onApply(product.id)}
                disabled={applied}
                className="w-full"
              >
                {applied ? <CheckIcon data-icon="inline-start" /> : null}
                {applied ? "Applied to your photo" : "Apply to your photo"}
              </Button>
              <Button variant="outline" onClick={onOrderSample} className="w-full">
                <PackageIcon data-icon="inline-start" />
                Order a sample
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function mixShares(product: Product) {
  const total = product.stones.reduce((sum, s) => sum + s.weight, 0);
  return product.stones.map((s) => ({
    color: s.color,
    share: Math.round((s.weight / total) * 100),
  }));
}

function finishLabel(gloss: number) {
  if (gloss < 0.3) return "Matt";
  if (gloss < 0.38) return "Satin";
  return "Gloss";
}
