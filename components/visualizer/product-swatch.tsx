"use client";

import { cn } from "@/lib/utils";
import { stonePhoto } from "@/lib/stones/manifest";
import type { Product } from "@/lib/products";

export function ProductSwatch({
  product,
  className,
}: {
  product: Product;
  className?: string;
}) {
  return (
    // Every use is a few dozen pixels wide, so next/image buys nothing here.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={stonePhoto(product.id)}
      alt={`${product.name} aggregate`}
      className={cn("rounded-md object-cover", className)}
      draggable={false}
      loading="lazy"
      decoding="async"
    />
  );
}
