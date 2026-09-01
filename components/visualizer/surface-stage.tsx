"use client";

import * as React from "react";
import { ChevronsLeftRightIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  SurfaceRenderer,
  type SceneGeometry,
  type SurfaceParams,
} from "@/lib/render/surface-renderer";
import type { Quad } from "@/lib/render/homography";

export type LoadedScene = {
  photo: HTMLImageElement;
  mask: HTMLImageElement | HTMLCanvasElement;
  geometry: SceneGeometry;
  width: number;
  height: number;
};

export type StageHandle = {
  /** Renders at the photo's native resolution and returns a PNG blob. */
  capture: () => Promise<Blob | null>;
};

type Props = {
  scene: LoadedScene;
  tile: ImageData | null;
  params: SurfaceParams;
  editing: boolean;
  onQuadChange: (quad: Quad) => void;
  onSplitChange: (split: number) => void;
  onError: (message: string) => void;
  className?: string;
};

const CORNER_LABELS = ["Far left", "Far right", "Near right", "Near left"];

export const SurfaceStage = React.forwardRef<StageHandle, Props>(
  function SurfaceStage(
    { scene, tile, params, editing, onQuadChange, onSplitChange, onError, className },
    ref
  ) {
    const containerRef = React.useRef<HTMLDivElement>(null);
    const canvasRef = React.useRef<HTMLCanvasElement>(null);
    const rendererRef = React.useRef<SurfaceRenderer | null>(null);
    const [box, setBox] = React.useState({ width: 0, height: 0 });
    const [dragging, setDragging] = React.useState<number | null>(null);

    /* ---- renderer lifecycle ---- */
    React.useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      try {
        rendererRef.current = new SurfaceRenderer(canvas);
      } catch (err) {
        onError(
          err instanceof Error ? err.message : "The visualizer could not start."
        );
        return;
      }
      const renderer = rendererRef.current;
      return () => {
        renderer?.dispose();
        rendererRef.current = null;
      };
      // The renderer owns the canvas for the lifetime of the component.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /* ---- fit the photo into the available space ---- */
    React.useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      const observer = new ResizeObserver(([entry]) => {
        const { width, height } = entry.contentRect;
        // Editing pulls the photo in so corner handles that sit outside the
        // frame are still reachable.
        const inset = editing ? 0.74 : 1;
        const aspect = scene.width / scene.height;
        let w = width * inset;
        let h = w / aspect;
        if (h > height * inset) {
          h = height * inset;
          w = h * aspect;
        }
        setBox({ width: Math.floor(w), height: Math.floor(h) });
      });
      observer.observe(el);
      return () => observer.disconnect();
    }, [scene.width, scene.height, editing]);

    /* ---- upload scene + geometry ---- */
    // Photo and mask are expensive to upload; geometry is a matrix. They are
    // tracked separately so dragging a corner does not re-upload the textures.
    const geometryRef = React.useRef(scene.geometry);
    // Declared before the upload effect so the ref is current by the time it
    // runs — effects in one component fire in declaration order.
    React.useEffect(() => {
      geometryRef.current = scene.geometry;
    }, [scene.geometry]);

    React.useEffect(() => {
      rendererRef.current?.setScene(scene.photo, scene.mask, geometryRef.current);
    }, [scene.photo, scene.mask]);

    React.useEffect(() => {
      rendererRef.current?.setGeometry(scene.geometry);
    }, [scene.geometry]);

    React.useEffect(() => {
      if (tile) rendererRef.current?.setAggregate(tile);
    }, [tile]);

    /* ---- draw ---- */
    React.useEffect(() => {
      const renderer = rendererRef.current;
      if (!renderer || box.width === 0) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      renderer.resize(box.width * dpr, box.height * dpr);
      renderer.setParams(params);
      const frame = requestAnimationFrame(() => renderer.render());
      return () => cancelAnimationFrame(frame);
    }, [box, params, tile, scene.photo, scene.mask, scene.geometry]);

    React.useImperativeHandle(ref, () => ({
      capture: async () => {
        const renderer = rendererRef.current;
        const canvas = canvasRef.current;
        if (!renderer || !canvas) return null;
        renderer.resize(scene.width, scene.height);
        renderer.setParams({ ...params, split: null });
        renderer.render();
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/png")
        );
        // Put the on-screen size back so the next paint is not stretched.
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        renderer.resize(box.width * dpr, box.height * dpr);
        renderer.setParams(params);
        renderer.render();
        return blob;
      },
    }));

    /* ---- corner dragging ---- */
    const moveCorner = React.useCallback(
      (index: number, clientX: number, clientY: number) => {
        const el = canvasRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const x = (clientX - rect.left) / rect.width;
        const y = (clientY - rect.top) / rect.height;
        const next = scene.geometry.quad.map((p, i) =>
          i === index ? ([clamp(x), clamp(y)] as [number, number]) : p
        ) as Quad;
        onQuadChange(next);
      },
      [scene.geometry.quad, onQuadChange]
    );

    React.useEffect(() => {
      if (dragging === null) return;
      const move = (e: PointerEvent) => moveCorner(dragging, e.clientX, e.clientY);
      const up = () => setDragging(null);
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      return () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
    }, [dragging, moveCorner]);

    const quad = scene.geometry.quad;

    return (
      <div
        ref={containerRef}
        className={cn(
          "relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-canvas",
          className
        )}
      >
        <div
          className="relative"
          style={{ width: box.width || 1, height: box.height || 1 }}
        >
          <canvas
            ref={canvasRef}
            className="block h-full w-full rounded-sm shadow-sm"
            style={{ width: box.width || 1, height: box.height || 1 }}
          />

          {params.split !== null && (
            <CompareOverlay
              split={params.split}
              onChange={(clientX) => {
                const el = canvasRef.current;
                if (!el) return;
                const rect = el.getBoundingClientRect();
                onSplitChange(
                  Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
                );
              }}
            />
          )}

          {editing && (
            <svg
              className="pointer-events-none absolute inset-0 h-full w-full overflow-hidden"
              viewBox="0 0 1 1"
              preserveAspectRatio="none"
            >
              <polygon
                points={quad.map(([x, y]) => `${x},${y}`).join(" ")}
                className="fill-brand/15 stroke-brand"
                strokeWidth={0.004}
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          )}

          {editing &&
            quad.map(([x, y], i) => (
              <button
                key={i}
                type="button"
                aria-label={`${CORNER_LABELS[i]} corner`}
                onPointerDown={(e) => {
                  e.preventDefault();
                  setDragging(i);
                }}
                onKeyDown={(e) => {
                  const step = e.shiftKey ? 0.02 : 0.005;
                  const delta: Record<string, [number, number]> = {
                    ArrowLeft: [-step, 0],
                    ArrowRight: [step, 0],
                    ArrowUp: [0, -step],
                    ArrowDown: [0, step],
                  };
                  const d = delta[e.key];
                  if (!d) return;
                  e.preventDefault();
                  const next = quad.map((p, j) =>
                    j === i ? ([clamp(p[0] + d[0]), clamp(p[1] + d[1])] as [number, number]) : p
                  ) as Quad;
                  onQuadChange(next);
                }}
                className={cn(
                  "absolute z-10 size-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-brand shadow-md transition",
                  "focus-visible:ring-[3px] focus-visible:ring-ring/60 focus-visible:outline-none",
                  dragging === i ? "scale-125" : "hover:scale-110"
                )}
                style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
              />
            ))}
        </div>
      </div>
    );
  }
);

function clamp(v: number) {
  // Corners are allowed well outside the frame: the reference rectangle
  // describes the whole ground plane, not just the visible part of it.
  return Math.min(1.8, Math.max(-0.8, v));
}

function CompareOverlay({
  split,
  onChange,
}: {
  split: number;
  onChange: (clientX: number) => void;
}) {
  const [dragging, setDragging] = React.useState(false);

  React.useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => onChange(e.clientX);
    const up = () => setDragging(false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [dragging, onChange]);

  return (
    <>
      <div
        className="absolute inset-y-0 z-10 w-px bg-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.25)]"
        style={{ left: `${split * 100}%` }}
      >
        <button
          type="button"
          aria-label="Drag to compare before and after"
          onPointerDown={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 0.1 : 0.02;
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
              e.preventDefault();
              const el = e.currentTarget.closest("div")?.parentElement;
              const rect = el?.getBoundingClientRect();
              if (!rect) return;
              const delta = e.key === "ArrowLeft" ? -step : step;
              onChange(rect.left + (split + delta) * rect.width);
            }
          }}
          className="absolute top-1/2 left-1/2 flex size-9 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full border-2 border-white bg-black/50 text-white shadow-lg backdrop-blur focus-visible:ring-[3px] focus-visible:ring-ring/60 focus-visible:outline-none"
        >
          <ChevronsLeftRightIcon className="size-4" />
        </button>
      </div>
      <span className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white">
        Before
      </span>
      <span className="pointer-events-none absolute right-3 bottom-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white">
        After
      </span>
    </>
  );
}
