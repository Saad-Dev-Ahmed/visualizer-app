'use client'

import StudioSidebar from "./studio-sidebar"
import StudioVisualizerRoom from "./studio-visualizer-room"

export default function StudioShell() {

  return (
    <div className="w-full">
      <div className="flex gap-8">
        <div className="studio-sidebar h-lvh w-2/12 p-4 border border-border shadow-2xl">
          <StudioSidebar />
        </div>
        <div className="studio-visualizer-room w-2/3">
          <StudioVisualizerRoom />
        </div>
      </div>
    </div>
  )
}
