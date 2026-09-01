import { cn } from "@/lib/utils";

export function Brand({ className }: { className?: string }) {
  return (
    <span className={cn("flex flex-col leading-none", className)}>
      <span className="text-xl font-bold tracking-tight text-brand">Daltex</span>
      <span className="text-[0.5rem] font-semibold tracking-[0.22em] text-muted-foreground uppercase">
        Resin Bound
      </span>
    </span>
  );
}
