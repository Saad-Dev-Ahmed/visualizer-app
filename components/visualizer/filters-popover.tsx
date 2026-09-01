"use client";

import { ListFilterIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldSet,
  FieldLegend,
} from "@/components/ui/field";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  COLOUR_FAMILIES,
  STONE_SIZES,
  type ColourFamily,
  type StoneSize,
} from "@/lib/products";

export type Filters = {
  families: ColourFamily[];
  sizes: StoneSize[];
  favouritesOnly: boolean;
};

export const EMPTY_FILTERS: Filters = {
  families: [],
  sizes: [],
  favouritesOnly: false,
};

export function countFilters(f: Filters) {
  return f.families.length + f.sizes.length + (f.favouritesOnly ? 1 : 0);
}

export function FiltersPopover({
  filters,
  onChange,
}: {
  filters: Filters;
  onChange: (next: Filters) => void;
}) {
  const active = countFilters(filters);

  const toggleFamily = (family: ColourFamily, on: boolean) =>
    onChange({
      ...filters,
      families: on
        ? [...filters.families, family]
        : filters.families.filter((f) => f !== family),
    });

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="outline" className="flex-1 justify-center">
            <ListFilterIcon data-icon="inline-start" />
            Filters
            {active > 0 && (
              <Badge variant="secondary" className="ml-1">
                {active}
              </Badge>
            )}
          </Button>
        }
      />
      <PopoverContent align="start" className="w-72">
        <FieldGroup>
          <FieldSet>
            <FieldLegend variant="label">Colour family</FieldLegend>
            {COLOUR_FAMILIES.map((family) => (
              <Field key={family} orientation="horizontal">
                <Checkbox
                  id={`family-${family}`}
                  checked={filters.families.includes(family)}
                  onCheckedChange={(on) => toggleFamily(family, Boolean(on))}
                />
                <FieldLabel htmlFor={`family-${family}`} className="font-normal">
                  {family}
                </FieldLabel>
              </Field>
            ))}
          </FieldSet>

          <Separator />

          <Field>
            <FieldLabel>Stone size</FieldLabel>
            <ToggleGroup
              variant="outline"
              size="sm"
              multiple
              value={filters.sizes}
              onValueChange={(value) =>
                onChange({ ...filters, sizes: value as StoneSize[] })
              }
            >
              {STONE_SIZES.map((size) => (
                <ToggleGroupItem key={size} value={size}>
                  {size}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>

          <Separator />

          <Field orientation="horizontal">
            <Switch
              id="favourites-only"
              checked={filters.favouritesOnly}
              onCheckedChange={(on) =>
                onChange({ ...filters, favouritesOnly: Boolean(on) })
              }
            />
            <Label htmlFor="favourites-only" className="font-normal">
              Saved blends only
            </Label>
          </Field>

          <Button
            variant="ghost"
            size="sm"
            disabled={active === 0}
            onClick={() => onChange(EMPTY_FILTERS)}
          >
            Clear filters
          </Button>
        </FieldGroup>
      </PopoverContent>
    </Popover>
  );
}
