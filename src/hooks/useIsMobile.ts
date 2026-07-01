import { useEffect, useState } from 'react'

/**
 * True while the viewport is phone-sized. Defaults to below Tailwind's `sm`
 * breakpoint (640px), so `isMobile` lines up with where the `sm:` utilities
 * start applying. Lets a component swap in a genuinely mobile-tuned layout where
 * responsive classes alone aren't enough — without duplicating the whole tree.
 */
export function useIsMobile(query = '(max-width: 639px)'): boolean {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  )

  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = () => setIsMobile(mql.matches)
    onChange() // sync in case the viewport changed before the listener attached
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return isMobile
}
