import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Robust check for matchMedia availability
    if (!window.matchMedia) {
      setIsMobile(false);
      return;
    }

    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    
    // Hardened listener attachment handling modern and legacy browser APIs
    try {
      if (mql.addEventListener) {
        mql.addEventListener("change", onChange)
      } else if ((mql as any).addListener) {
        (mql as any).addListener(onChange)
      }
    } catch (e) {
      console.warn("useIsMobile: Failed to attach media listener", e);
    }
    
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    
    return () => {
      try {
        if (mql.removeEventListener) {
          mql.removeEventListener("change", onChange)
        } else if ((mql as any).removeListener) {
          (mql as any).removeListener(onChange)
        }
      } catch (e) {
        // Silent cleanup
      }
    }
  }, [])

  // Return a boolean (default to false if state is undefined)
  return !!isMobile
}