import { Brand } from "@/components/brand";
import { MobileCapture } from "@/components/picker/mobile-capture";

export default async function MobileUploadPage({ params }: PageProps<"/m/[id]">) {
  const { id } = await params;

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b">
        <div className="flex items-center justify-center px-6 py-4">
          <Brand />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 py-8">
        <MobileCapture sessionId={id} />
      </main>
    </div>
  );
}
