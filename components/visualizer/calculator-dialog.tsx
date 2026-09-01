"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
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
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Product } from "@/lib/products";

/** Compacted density of a dried resin bound aggregate, kg per cubic metre. */
const AGGREGATE_DENSITY = 1600;
/** Resin is dosed as a percentage of aggregate weight. */
const RESIN_RATIO = 0.065;
const AGGREGATE_BAG_KG = 25;
const RESIN_KIT_KG = 7.5;

export function CalculatorDialog({
  open,
  onOpenChange,
  product,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product;
}) {
  const [area, setArea] = React.useState("40");
  const [depth, setDepth] = React.useState("18");

  const areaM2 = Number(area) || 0;
  const depthMm = Number(depth) || 0;

  const aggregateKg = areaM2 * (depthMm / 1000) * AGGREGATE_DENSITY;
  const resinKg = aggregateKg * RESIN_RATIO;
  const bags = Math.ceil(aggregateKg / AGGREGATE_BAG_KG);
  const kits = Math.ceil(resinKg / RESIN_KIT_KG);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Resin Bound Calculator</DialogTitle>
          <DialogDescription>
            Materials for {product.name} at the depth you enter. Add around 5%
            for cuts and waste.
          </DialogDescription>
        </DialogHeader>

        <FieldGroup className="px-4">
          <Field>
            <FieldLabel htmlFor="calc-area">Surface area</FieldLabel>
            <Input
              id="calc-area"
              type="number"
              inputMode="decimal"
              min={0}
              value={area}
              onChange={(e) => setArea(e.target.value)}
            />
            <FieldDescription>In square metres.</FieldDescription>
          </Field>

          <Field>
            <FieldLabel>Laid depth</FieldLabel>
            <ToggleGroup
              variant="outline"
              value={[depth]}
              onValueChange={(value) => value[0] && setDepth(value[0])}
            >
              <ToggleGroupItem value="15">15 mm</ToggleGroupItem>
              <ToggleGroupItem value="18">18 mm</ToggleGroupItem>
              <ToggleGroupItem value="24">24 mm</ToggleGroupItem>
            </ToggleGroup>
            <FieldDescription>
              18mm suits footpaths and patios; 24mm is usual for vehicle
              driveways.
            </FieldDescription>
          </Field>

          <Separator />

          <dl className="grid grid-cols-2 gap-4">
            <Result
              label="Aggregate"
              value={`${aggregateKg.toFixed(0)} kg`}
              detail={`${bags} × ${AGGREGATE_BAG_KG}kg bags`}
            />
            <Result
              label="Resin"
              value={`${resinKg.toFixed(1)} kg`}
              detail={`${kits} × ${RESIN_KIT_KG}kg kits`}
            />
          </dl>
        </FieldGroup>

        <DialogFooter>
          <DialogClose render={<Button variant="outline">Close</Button>} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Result({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-xl font-bold tabular-nums">{value}</dd>
      <dd className="text-xs text-muted-foreground">{detail}</dd>
    </div>
  );
}
