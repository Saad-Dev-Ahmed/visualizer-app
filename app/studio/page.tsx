import { Brand } from '@/components/brand'
import StudioImagePicker from '@/components/studio/studio-image-picker'


export default function page() {
    return (
        <div className="flex flex-1 flex-col">
            <header className="border-b">
                <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-4">
                    <Brand />
                    <p className="hidden text-sm text-muted-foreground sm:block">
                        Resin Bound Visualizer
                    </p>
                </div>
            </header>

            <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10 lg:py-14">
                <StudioImagePicker />
            </main>
        </div>
    )
}
