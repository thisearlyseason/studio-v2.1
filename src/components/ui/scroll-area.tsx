"use client"

import * as React from "react"
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"

type ScrollAreaProps = React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root> & {
  showScrollHint?: boolean
  scrollHintLabel?: string
}

const ScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  ScrollAreaProps
>(({ className, children, showScrollHint = false, scrollHintLabel = "More settings below", ...props }, ref) => {
  const [hasMoreBelow, setHasMoreBelow] = React.useState(false)
  const viewportRef = React.useRef<HTMLDivElement>(null)

  const updateScrollHint = React.useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport || !showScrollHint) return
    setHasMoreBelow(viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight > 8)
  }, [showScrollHint])

  React.useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || !showScrollHint) return
    updateScrollHint()
    const observer = new ResizeObserver(updateScrollHint)
    observer.observe(viewport)
    if (viewport.firstElementChild) observer.observe(viewport.firstElementChild)
    return () => observer.disconnect()
  }, [children, showScrollHint, updateScrollHint])

  return (
    <ScrollAreaPrimitive.Root
      ref={ref}
      className={cn("relative overflow-hidden", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport ref={viewportRef} onScroll={updateScrollHint} className="h-full w-full rounded-[inherit] overscroll-contain touch-pan-y">
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
      {showScrollHint && hasMoreBelow && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center bg-gradient-to-t from-black/80 via-black/40 to-transparent pb-2 pt-10" aria-hidden="true">
          <div className="flex items-center gap-1.5 rounded-full border border-white/15 bg-black/80 px-3 py-1.5 text-[8px] font-black uppercase tracking-widest text-white/80 shadow-xl backdrop-blur">
            {scrollHintLabel}<ChevronDown className="h-3 w-3 animate-bounce" />
          </div>
        </div>
      )}
    </ScrollAreaPrimitive.Root>
  )
})
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName

const ScrollBar = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(({ className, orientation = "vertical", ...props }, ref) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    ref={ref}
    orientation={orientation}
    className={cn(
      "flex touch-none select-none transition-colors",
      orientation === "vertical" &&
        "h-full w-2.5 border-l border-l-transparent p-[1px]",
      orientation === "horizontal" &&
        "h-2.5 flex-col border-t border-t-transparent p-[1px]",
      className
    )}
    {...props}
  >
    <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-border" />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
))
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName

export { ScrollArea, ScrollBar }
