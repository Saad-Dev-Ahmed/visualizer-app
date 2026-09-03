"use client";

import * as React from "react";
import {
  ArrowRightIcon,
  HeartIcon,
  LayoutGridIcon,
  ListIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ProductSwatch } from "@/components/visualizer/product-swatch";
import { FiltersPopover, type Filters } from "@/components/visualizer/filters-popover";
import { PRODUCTS, type Product } from "@/lib/products";

export type ViewMode = "list" | "grid";

type Props = {
  selectedId: string;
  onSelect: (id: string) => void;
  onShowDetails: (product: Product) => void;
  favourites: ReadonlySet<string>;
  onToggleFavourite: (id: string) => void;
  filters: Filters;
  onFiltersChange: (next: Filters) => void;
  className?: string;
};

export function ProductSidebar({
  selectedId,
  onSelect,
  onShowDetails,
  favourites,
  onToggleFavourite,
  filters,
  onFiltersChange,
  className,
}: Props) {
  const [view, setView] = React.useState<ViewMode>("list");
  const [query, setQuery] = React.useState("");
  const [searching, setSearching] = React.useState(false);
  const [disclaimer, setDisclaimer] = React.useState(true);

  const results = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return PRODUCTS.filter((p) => {
      if (q && !`${p.name} ${p.sku} ${p.family}`.toLowerCase().includes(q)) {
        return false;
      }
      if (filters.families.length && !filters.families.includes(p.family)) {
        return false;
      }
      if (filters.sizes.length && !filters.sizes.includes(p.stoneSize)) {
        return false;
      }
      if (filters.favouritesOnly && !favourites.has(p.id)) return false;
      return true;
    });
  }, [query, filters, favourites]);

  return (
    <aside
      className={cn(
        "flex min-h-0 w-full shrink-0 flex-col border-r bg-sidebar lg:w-[21rem]",
        className
      )}
    >
      <div className="flex items-center justify-between px-4 py-3">
        <Brand />
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                aria-label="Show saved blends"
                onClick={() =>
                  onFiltersChange({
                    ...filters,
                    favouritesOnly: !filters.favouritesOnly,
                  })
                }
              >
                <HeartIcon
                  className={cn(
                    filters.favouritesOnly && "fill-brand text-brand"
                  )}
                />
              </Button>
            }
          />
          <TooltipContent>Saved blends</TooltipContent>
        </Tooltip>
      </div>

      <div className="flex flex-col gap-2 px-4 pb-3">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Search blends"
            aria-pressed={searching}
            onClick={() => {
              setSearching((s) => !s);
              if (searching) setQuery("");
            }}
          >
            <SearchIcon />
          </Button>

          <FiltersPopover filters={filters} onChange={onFiltersChange} />

          <ToggleGroup
            spacing={0}
            variant="outline"
            value={[view]}
            onValueChange={(value) => value[0] && setView(value[0] as ViewMode)}
          >
            <ToggleGroupItem value="list" aria-label="List view">
              <ListIcon />
            </ToggleGroupItem>
            <ToggleGroupItem value="grid" aria-label="Grid view">
              <LayoutGridIcon />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {searching && (
          <InputGroup>
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              autoFocus
              placeholder="Search blends"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </InputGroup>
        )}
      </div>

      <Separator />

      <ScrollArea className="min-h-0 flex-1">
        {results.length === 0 ? (
          <Empty className="py-14">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SearchIcon />
              </EmptyMedia>
              <EmptyTitle>No blends match</EmptyTitle>
              <EmptyDescription>
                Try a different search or clear your filters.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : view === "list" ? (
          <ul className="flex flex-col">
            {results.map((product) => (
              <ProductRow
                key={product.id}
                product={product}
                selected={product.id === selectedId}
                favourite={favourites.has(product.id)}
                onSelect={() => onSelect(product.id)}
                onToggleFavourite={() => onToggleFavourite(product.id)}
                onShowDetails={() => onShowDetails(product)}
              />
            ))}
          </ul>
        ) : (
          <ul className="grid grid-cols-2 gap-3 p-3">
            {results.map((product) => (
              <ProductTile
                key={product.id}
                product={product}
                selected={product.id === selectedId}
                favourite={favourites.has(product.id)}
                onSelect={() => onSelect(product.id)}
                onToggleFavourite={() => onToggleFavourite(product.id)}
              />
            ))}
          </ul>
        )}
      </ScrollArea>

      {disclaimer && (
        <>
          <Separator />
          <div className="flex items-center justify-between gap-2 px-4 py-2.5">
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  >
                    View disclaimer
                  </button>
                }
              />
              <TooltipContent className="max-w-64">
                Colours are rendered on screen and will vary from the laid
                product. Always confirm against a physical sample.
              </TooltipContent>
            </Tooltip>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Hide disclaimer"
              onClick={() => setDisclaimer(false)}
            >
              <XIcon />
            </Button>
          </div>
        </>
      )}
    </aside>
  );
}

/* ------------------------------------------------------------------ */

function ProductRow({
  product,
  selected,
  favourite,
  onSelect,
  onToggleFavourite,
  onShowDetails,
}: {
  product: Product;
  selected: boolean;
  favourite: boolean;
  onSelect: () => void;
  onToggleFavourite: () => void;
  onShowDetails: () => void;
}) {
  return (
    <li
      className={cn(
        "relative border-b px-4 py-3 transition-colors",
        selected ? "bg-brand/5 ring-1 ring-brand ring-inset" : "hover:bg-accent/60"
      )}
    >
      <div className="flex gap-3">
        <div className="relative shrink-0">
          <ProductSwatch product={product} className="size-14" />
          <FavouriteButton active={favourite} onClick={onToggleFavourite} />
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <p className="truncate text-xs text-muted-foreground">{product.brand}</p>
          {/* Stretched target: the whole row selects, the link below still wins. */}
          <button
            type="button"
            onClick={onSelect}
            aria-pressed={selected}
            className="text-left text-sm font-semibold after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
          >
            {product.name}
          </button>

          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {product.new && <Badge variant="secondary">New</Badge>}
            {product.popular && <Badge variant="outline">Popular</Badge>}
          </div>

          <p className="mt-2 text-xs text-muted-foreground">SKU: {product.sku}</p>
          <button
            type="button"
            onClick={onShowDetails}
            className="relative z-10 mt-0.5 flex w-fit items-center gap-1 text-xs font-medium text-warm hover:underline"
          >
            More product details
            <ArrowRightIcon className="size-3" />
          </button>
        </div>
      </div>
    </li>
  );
}

function ProductTile({
  product,
  selected,
  favourite,
  onSelect,
  onToggleFavourite,
}: {
  product: Product;
  selected: boolean;
  favourite: boolean;
  onSelect: () => void;
  onToggleFavourite: () => void;
}) {
  return (
    <li className="relative">
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className={cn(
          "flex w-full flex-col gap-2 rounded-lg border p-2 text-left transition",
          selected
            ? "border-brand ring-1 ring-brand"
            : "hover:border-muted-foreground/40"
        )}
      >
        <ProductSwatch product={product} className="aspect-square w-full" />
        <span className="truncate text-xs font-semibold">{product.name}</span>
      </button>
      <FavouriteButton active={favourite} onClick={onToggleFavourite} />
    </li>
  );
}

function FavouriteButton({
  active,
  onClick,
}: {
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={active ? "Remove from saved blends" : "Save this blend"}
      aria-pressed={active}
      className="absolute top-1 left-1 z-10 flex size-6 items-center justify-center rounded-full bg-white/85 text-foreground shadow-sm backdrop-blur transition hover:bg-white focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <HeartIcon className={cn("size-3.5", active && "fill-brand text-brand")} />
    </button>
  );
}
