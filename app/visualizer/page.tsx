import { VisualizerShell } from "@/components/visualizer/visualizer-shell";

export default async function VisualizerPage({
  searchParams,
}: PageProps<"/visualizer">) {
  const { blend } = await searchParams;

  return (
    <VisualizerShell
      initialProductId={typeof blend === "string" ? blend : undefined}
    />
  );
}
