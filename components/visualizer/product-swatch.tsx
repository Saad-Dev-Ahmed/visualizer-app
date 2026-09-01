"use client";

import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useSwatch } from "@/components/visualizer/use-swatch";
import type { Product } from "@/lib/products";

export function ProductSwatch({
  product,
  className,
  sizePx = 128,
}: {
  product: Product;
  className?: string;
  sizePx?: number;
}) {
  const url = useSwatch(product, sizePx);

  if (!url) return <Skeleton className={cn("rounded-md", className)} />;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={`${product.name} aggregate`}
      className={cn("rounded-md object-cover", className)}
      draggable={false}
    />
  );
}
