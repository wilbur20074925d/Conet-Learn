"use client"

import { GripVertical } from "lucide-react"
import * as ResizablePrimitive from "react-resizable-panels"

import { cn } from "@/lib/utils"

const ResizablePanelGroup = ({
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.PanelGroup>) => (
  <ResizablePrimitive.PanelGroup
    className={cn(
      "flex h-full w-full data-[panel-group-direction=vertical]:flex-col",
      className
    )}
    {...props}
  />
)

const ResizablePanel = ResizablePrimitive.Panel

const ResizableHandle = ({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.PanelResizeHandle> & {
  withHandle?: boolean
}) => (
  <ResizablePrimitive.PanelResizeHandle
    className={cn(
      withHandle
        ? "group relative flex w-4 shrink-0 cursor-col-resize items-center justify-center bg-transparent outline-none before:absolute before:inset-y-0 before:left-1/2 before:w-6 before:-translate-x-1/2 focus-visible:outline-none data-[panel-group-direction=vertical]:h-4 data-[panel-group-direction=vertical]:w-full data-[panel-group-direction=vertical]:cursor-row-resize data-[panel-group-direction=vertical]:before:inset-x-0 data-[panel-group-direction=vertical]:before:inset-y-auto data-[panel-group-direction=vertical]:before:left-0 data-[panel-group-direction=vertical]:before:top-1/2 data-[panel-group-direction=vertical]:before:h-6 data-[panel-group-direction=vertical]:before:w-full data-[panel-group-direction=vertical]:before:-translate-y-1/2 data-[panel-group-direction=vertical]:before:translate-x-0"
        : "relative flex w-px items-center justify-center bg-border after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full data-[panel-group-direction=vertical]:after:left-0 data-[panel-group-direction=vertical]:after:h-1 data-[panel-group-direction=vertical]:after:w-full data-[panel-group-direction=vertical]:after:-translate-y-1/2 data-[panel-group-direction=vertical]:after:translate-x-0 [&[data-panel-group-direction=vertical]>div]:rotate-90",
      className
    )}
    {...props}
  >
    {withHandle && (
      <>
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-3 left-1/2 w-px -translate-x-1/2 rounded-full bg-slate-200/90 transition-colors group-hover:bg-slate-400 group-data-[resize-handle-state=drag]:bg-slate-900 group-data-[panel-group-direction=vertical]:inset-x-3 group-data-[panel-group-direction=vertical]:inset-y-auto group-data-[panel-group-direction=vertical]:left-0 group-data-[panel-group-direction=vertical]:top-1/2 group-data-[panel-group-direction=vertical]:h-px group-data-[panel-group-direction=vertical]:w-auto group-data-[panel-group-direction=vertical]:-translate-y-1/2 group-data-[panel-group-direction=vertical]:translate-x-0"
        />
        <span className="z-10 flex h-12 w-[18px] items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm transition duration-150 group-hover:border-slate-300 group-hover:shadow-md group-data-[resize-handle-state=drag]:border-slate-900 group-data-[resize-handle-state=drag]:bg-slate-900 group-data-[panel-group-direction=vertical]:h-[18px] group-data-[panel-group-direction=vertical]:w-12">
          <GripVertical className="h-3.5 w-3.5 text-slate-400 transition-colors group-hover:text-slate-700 group-data-[resize-handle-state=drag]:text-white group-data-[panel-group-direction=vertical]:rotate-90" />
        </span>
      </>
    )}
  </ResizablePrimitive.PanelResizeHandle>
)

export { ResizablePanelGroup, ResizablePanel, ResizableHandle }
