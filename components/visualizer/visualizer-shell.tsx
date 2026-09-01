"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, MoveDiagonalIcon, TriangleAlertIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "@/components/ui/toast";
import { Toolbar } from "@/components/visualizer/toolbar";
import { BottomBar } from "@/components/visualizer/bottom-bar";
import { ProductSidebar } from "@/components/visualizer/product-sidebar";
import { ProductDetailsSheet } from "@/components/visualizer/product-details-sheet";
import { CalculatorDialog } from "@/components/visualizer/calculator-dialog";
import { EnquiryDialog, type EnquiryKind } from "@/components/visualizer/enquiry-dialog";
import { ShareDialog } from "@/components/visualizer/share-dialog";
import {
  SurfaceStage,
  type LoadedScene,
  type StageHandle,
} from "@/components/visualizer/surface-stage";
import { EMPTY_FILTERS, type Filters } from "@/components/visualizer/filters-popover";

import { PRODUCTS, getProduct, type Product } from "@/lib/products";
import { DEMO_SCENES, DEFAULT_UPLOAD_METRES, DEFAULT_UPLOAD_QUAD, getDemoScene } from "@/lib/scenes";
import { loadScene, saveScene, type SceneSource } from "@/lib/session";
import { loadImage, maskFromQuad, prepareUpload, UploadError } from "@/lib/image";
import { getFloorTile, prewarmFloorTiles } from "@/lib/texture/aggregate";
import {
  getFavourites,
  getServerFavourites,
  subscribeFavourites,
  toggleFavourite,
} from "@/lib/favourites";
import { DEFAULT_PARAMS, type SurfaceParams } from "@/lib/render/surface-renderer";
import type { Quad } from "@/lib/render/homography";

const ROTATE_STEP = Math.PI / 12;

type SceneAssets = {
  source: SceneSource;
  photo: HTMLImageElement;
  /** Demo scenes ship a hand-checked mask; uploads derive theirs from the quad. */
  bakedMask: HTMLImageElement | null;
  width: number;
  height: number;
};

type LoadedSource = {
  assets: SceneAssets;
  quad: Quad;
  planeMetres: [number, number];
  /** A photo we know nothing about needs its surface marked out first. */
  editing: boolean;
};

/** Pure loader: no React state is touched until the images have resolved. */
async function loadSource(source: SceneSource): Promise<LoadedSource> {
  if (source.kind === "demo") {
    const demo = getDemoScene(source.id) ?? DEMO_SCENES[0];
    const [photo, mask] = await Promise.all([
      loadImage(demo.photo),
      loadImage(demo.mask),
    ]);
    return {
      assets: { source, photo, bakedMask: mask, width: demo.width, height: demo.height },
      quad: demo.quad,
      planeMetres: demo.planeMetres,
      editing: false,
    };
  }

  const photo = await loadImage(source.dataUrl);
  return {
    assets: {
      source,
      photo,
      bakedMask: null,
      width: source.width,
      height: source.height,
    },
    quad: DEFAULT_UPLOAD_QUAD,
    planeMetres: DEFAULT_UPLOAD_METRES,
    editing: true,
  };
}

export function VisualizerShell({ initialProductId }: { initialProductId?: string }) {
  const router = useRouter();
  const stageRef = React.useRef<StageHandle>(null);
  const uploadInputRef = React.useRef<HTMLInputElement>(null);

  /* ---------------- scene ---------------- */
  const [assets, setAssets] = React.useState<SceneAssets | null>(null);
  const [quad, setQuad] = React.useState<Quad>(DEFAULT_UPLOAD_QUAD);
  const [planeMetres, setPlaneMetres] =
    React.useState<[number, number]>(DEFAULT_UPLOAD_METRES);
  const [editing, setEditing] = React.useState(false);
  const [fatal, setFatal] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  const commit = React.useCallback((next: LoadedSource) => {
    setAssets(next.assets);
    setQuad(next.quad);
    setPlaneMetres(next.planeMetres);
    setEditing(next.editing);
    setFatal(null);
  }, []);

  const applySource = React.useCallback(
    async (source: SceneSource) => {
      try {
        commit(await loadSource(source));
      } catch {
        setFatal("That photo could not be loaded. Try picking another room.");
      } finally {
        setLoading(false);
      }
    },
    [commit]
  );

  React.useEffect(() => {
    let cancelled = false;
    loadSource(loadScene() ?? { kind: "demo", id: DEMO_SCENES[0].id })
      .then((next) => !cancelled && commit(next))
      .catch(
        () =>
          !cancelled &&
          setFatal("That photo could not be loaded. Try picking another room.")
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [commit]);

  /* ---------------- mask ---------------- */
  // For an upload the mask *is* the quad, so it is rebuilt as corners move.
  const mask = React.useMemo(() => {
    if (!assets) return null;
    if (assets.bakedMask) return assets.bakedMask;
    return maskFromQuad(quad, assets.width, assets.height, 3);
  }, [assets, quad]);

  const geometry = React.useMemo(
    () => ({ quad, planeMetres }),
    [quad, planeMetres]
  );

  const scene: LoadedScene | null = React.useMemo(() => {
    if (!assets || !mask) return null;
    return {
      photo: assets.photo,
      mask,
      geometry,
      width: assets.width,
      height: assets.height,
    };
  }, [assets, mask, geometry]);

  /* ---------------- products ---------------- */
  const [selectedId, setSelectedId] = React.useState(
    initialProductId && getProduct(initialProductId)
      ? initialProductId
      : PRODUCTS[0].id
  );
  const product = getProduct(selectedId) ?? PRODUCTS[0];

  const [tileState, setTileState] = React.useState<{
    id: string;
    data: ImageData;
  } | null>(null);

  React.useEffect(() => {
    // Generating a tile is a few hundred milliseconds of pixel work; yielding
    // first lets the selected state paint immediately.
    const id = window.setTimeout(
      () => setTileState({ id: product.id, data: getFloorTile(product) }),
      0
    );
    return () => window.clearTimeout(id);
  }, [product]);

  // Until the new blend is ready the previously uploaded texture stays on the
  // canvas, which reads better than flashing back to the bare photograph.
  const tile = tileState?.id === product.id ? tileState.data : null;
  const tileLoading = tile === null;

  React.useEffect(() => {
    prewarmFloorTiles(PRODUCTS.filter((p) => p.popular));
  }, []);

  const favourites = React.useSyncExternalStore(
    subscribeFavourites,
    getFavourites,
    getServerFavourites
  );

  const [filters, setFilters] = React.useState<Filters>(EMPTY_FILTERS);

  /* ---------------- surface params ---------------- */
  const [params, setParams] = React.useState<SurfaceParams>(DEFAULT_PARAMS);
  const patch = (next: Partial<SurfaceParams>) =>
    setParams((prev) => ({ ...prev, ...next }));

  /* ---------------- dialogs ---------------- */
  const [details, setDetails] = React.useState<Product | null>(null);
  const [calculator, setCalculator] = React.useState(false);
  const [enquiry, setEnquiry] = React.useState<EnquiryKind | null>(null);
  const [share, setShare] = React.useState(false);
  const [downloading, setDownloading] = React.useState(false);

  const shareUrl =
    typeof window === "undefined"
      ? ""
      : `${window.location.origin}/visualizer?blend=${selectedId}`;

  /* ---------------- actions ---------------- */
  const capture = React.useCallback(async () => {
    const blob = await stageRef.current?.capture();
    if (!blob) throw new Error("Nothing to export yet.");
    return blob;
  }, []);

  const download = React.useCallback(async () => {
    setDownloading(true);
    try {
      const blob = await capture();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `daltex-${product.id}.png`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.add({ title: "Could not save the image", type: "error" });
    } finally {
      setDownloading(false);
    }
  }, [capture, product.id]);

  const shareImage = React.useCallback(async () => {
    try {
      const blob = await capture();
      const file = new File([blob], `daltex-${product.id}.png`, {
        type: "image/png",
      });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `${product.name} on my driveway` });
      } else {
        await navigator.share({ url: shareUrl, title: product.name });
      }
    } catch {
      // The user dismissed the share sheet, or it is unsupported.
    }
  }, [capture, product.id, product.name, shareUrl]);

  const handleUploadFile = React.useCallback(
    async (file: File) => {
      setLoading(true);
      try {
        const prepared = await prepareUpload(file);
        const source: SceneSource = { kind: "upload", ...prepared };
        saveScene(source);
        await applySource(source);
      } catch (err) {
        toast.add({
          title: "That photo could not be used",
          description:
            err instanceof UploadError ? err.message : "Try a different image.",
          type: "error",
        });
        setLoading(false);
      }
    },
    [applySource]
  );

  const resetView = () =>
    setParams((prev) => ({
      ...prev,
      scale: DEFAULT_PARAMS.scale,
      rotation: DEFAULT_PARAMS.rotation,
      offset: DEFAULT_PARAMS.offset,
    }));

  /* ---------------- render ---------------- */
  if (fatal) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <Alert variant="destructive" className="max-w-md">
          <TriangleAlertIcon />
          <AlertTitle>The visualizer could not start</AlertTitle>
          <AlertDescription>
            {fatal}
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => router.push("/")}
            >
              Pick another room
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden lg:flex-row">
      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleUploadFile(file);
          e.target.value = "";
        }}
      />

      <ProductSidebar
        selectedId={selectedId}
        onSelect={setSelectedId}
        onShowDetails={setDetails}
        favourites={favourites}
        onToggleFavourite={toggleFavourite}
        filters={filters}
        onFiltersChange={setFilters}
        className="hidden lg:flex"
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Toolbar
          comparing={params.split !== null}
          editing={editing}
          downloading={downloading}
          onExit={() => router.push("/")}
          onToggleCompare={() =>
            patch({ split: params.split === null ? 0.5 : null })
          }
          onShare={() => setShare(true)}
          onDownload={() => void download()}
          onUpload={() => uploadInputRef.current?.click()}
          onCalculator={() => setCalculator(true)}
          onQuote={() => setEnquiry("quote")}
          onProductPage={() => setDetails(product)}
          onOrderSample={() => setEnquiry("sample")}
          onAdjustSurface={() => setEditing((e) => !e)}
          onResetView={resetView}
        />

        {editing && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-brand/5 px-4 py-2.5">
            <p className="flex items-center gap-2 text-sm">
              <MoveDiagonalIcon className="size-4 shrink-0 text-brand" />
              <span>
                Drag the four corners onto your surface — the two far corners
                sit where it meets the wall or fence.
              </span>
            </p>
            <Button size="sm" onClick={() => setEditing(false)}>
              <CheckIcon data-icon="inline-start" />
              Apply surface
            </Button>
          </div>
        )}

        {loading || !scene ? (
          <div className="flex min-h-0 flex-1 items-center justify-center bg-canvas">
            <Spinner className="size-8 text-muted-foreground" />
          </div>
        ) : (
          <div className="relative flex min-h-0 flex-1 flex-col">
            <SurfaceStage
              ref={stageRef}
              scene={scene}
              tile={tile}
              params={params}
              editing={editing}
              onQuadChange={setQuad}
              onSplitChange={(split) => patch({ split })}
              onError={setFatal}
            />
            {tileLoading && (
              <p
                aria-live="polite"
                className="pointer-events-none absolute top-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-background/90 px-3 py-1.5 text-xs font-medium shadow-sm backdrop-blur"
              >
                <Spinner className="size-3.5" />
                Preparing {product.name}
              </p>
            )}
          </div>
        )}

        <BottomBar
          product={product}
          scale={params.scale}
          onScaleChange={(scale) => patch({ scale })}
          onRotate={() => patch({ rotation: params.rotation + ROTATE_STEP })}
          onReset={resetView}
        />
      </div>

      <ProductDetailsSheet
        product={details}
        open={details !== null}
        onOpenChange={(open) => !open && setDetails(null)}
        applied={details?.id === selectedId}
        onApply={(id) => {
          setSelectedId(id);
          setDetails(null);
        }}
        onOrderSample={() => {
          setDetails(null);
          setEnquiry("sample");
        }}
      />

      <CalculatorDialog
        open={calculator}
        onOpenChange={setCalculator}
        product={product}
      />

      <EnquiryDialog
        kind={enquiry ?? "sample"}
        open={enquiry !== null}
        onOpenChange={(open) => !open && setEnquiry(null)}
        product={product}
      />

      <ShareDialog
        open={share}
        onOpenChange={setShare}
        url={shareUrl}
        onDownload={() => void download()}
        onShareFile={() => void shareImage()}
      />
    </div>
  );
}
