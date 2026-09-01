"use client";

import * as React from "react";
import { CheckIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
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
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { ProductSwatch } from "@/components/visualizer/product-swatch";
import type { Product } from "@/lib/products";

export type EnquiryKind = "sample" | "quote";

const COPY: Record<EnquiryKind, { title: string; description: string; cta: string; done: string }> = {
  sample: {
    title: "Order a sample",
    description:
      "We'll post you a physical sample so you can check the colour in daylight before committing.",
    cta: "Send me a sample",
    done: "Your sample is on its way. It usually arrives within three working days.",
  },
  quote: {
    title: "Need a quote?",
    description:
      "Tell us roughly how big the area is and an approved installer near you will get back to you.",
    cta: "Request a quote",
    done: "Thanks — an installer covering your postcode will be in touch shortly.",
  },
};

export function EnquiryDialog({
  kind,
  open,
  onOpenChange,
  product,
}: {
  kind: EnquiryKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product;
}) {
  const copy = COPY[kind];
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [postcode, setPostcode] = React.useState("");
  const [area, setArea] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [state, setState] = React.useState<"idle" | "sending" | "sent">("idle");

  // Reopening for a different blend should not show the previous result.
  const [lastOpened, setLastOpened] = React.useState<string | null>(null);
  const openedAs = open ? kind : null;
  if (openedAs !== lastOpened) {
    setLastOpened(openedAs);
    if (open) {
      setState("idle");
      setError(null);
    }
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setState("sending");
    setError(null);
    try {
      const res = await fetch("/api/enquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          name,
          email,
          postcode,
          productId: product.id,
          areaM2: area ? Number(area) : undefined,
          notes,
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Something went wrong.");
      setState("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setState("idle");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>

        {state === "sent" ? (
          <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-brand/10 text-brand">
              <CheckIcon className="size-7" />
            </div>
            <p className="text-sm text-muted-foreground">{copy.done}</p>
          </div>
        ) : (
          <form onSubmit={submit} id="enquiry-form">
            <FieldGroup className="px-4">
              <div className="flex items-center gap-3 rounded-lg border p-3">
                <ProductSwatch product={product} className="size-12" />
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground">
                    {product.brand}
                  </span>
                  <span className="text-sm font-semibold">{product.name}</span>
                </div>
              </div>

              <Field data-invalid={error ? true : undefined}>
                <FieldLabel htmlFor="enq-name">Your name</FieldLabel>
                <Input
                  id="enq-name"
                  required
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="enq-email">Email</FieldLabel>
                <Input
                  id="enq-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="enq-postcode">Postcode</FieldLabel>
                <Input
                  id="enq-postcode"
                  required
                  autoComplete="postal-code"
                  value={postcode}
                  onChange={(e) => setPostcode(e.target.value)}
                />
                <FieldDescription>
                  Used to find installers who cover your area.
                </FieldDescription>
              </Field>

              {kind === "quote" && (
                <>
                  <Field>
                    <FieldLabel htmlFor="enq-area">
                      Approximate area (m²)
                    </FieldLabel>
                    <Input
                      id="enq-area"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      value={area}
                      onChange={(e) => setArea(e.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="enq-notes">Anything else?</FieldLabel>
                    <Textarea
                      id="enq-notes"
                      rows={3}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </Field>
                </>
              )}

              {error && <FieldError>{error}</FieldError>}
            </FieldGroup>
          </form>
        )}

        <DialogFooter>
          {state === "sent" ? (
            <DialogClose render={<Button>Done</Button>} />
          ) : (
            <>
              <DialogClose render={<Button variant="outline">Cancel</Button>} />
              <Button
                type="submit"
                form="enquiry-form"
                disabled={state === "sending"}
              >
                {state === "sending" && <Spinner data-icon="inline-start" />}
                {copy.cta}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
