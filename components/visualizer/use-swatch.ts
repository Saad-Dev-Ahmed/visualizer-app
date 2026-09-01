"use client";

import * as React from "react";

import { getSwatchDataUrl } from "@/lib/texture/aggregate";
import type { Product } from "@/lib/products";

/**
 * Swatches are drawn on a canvas, so they can only exist after mount. The
 * generator caches by id, so re-renders and remounts are free.
 */
export function useSwatch(product: Product, sizePx = 128) {
  const [url, setUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    // Yield first so a long list does not block paint on its own swatches.
    const id = window.setTimeout(() => {
      const next = getSwatchDataUrl(product, sizePx);
      if (active) setUrl(next);
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(id);
    };
  }, [product, sizePx]);

  return url;
}
