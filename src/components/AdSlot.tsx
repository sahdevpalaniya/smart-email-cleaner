import { useEffect } from 'react'

/**
 * Reusable Google AdSense slot.
 *
 * Set your publisher ID in VITE_ADSENSE_CLIENT (e.g. "ca-pub-1234567890123456")
 * and create ad units in the AdSense dashboard to get each `slot` ID.
 *
 * NOTE: Google AdSense policy and the Gmail API user-data policy prohibit ads
 * placed next to private email content. Keep ads on non-email surfaces (the
 * logged-out login page, marketing/about pages). The Dashboard slot below is
 * intentionally generic ("Your folders" overview), but review compliance for
 * your account before shipping ads there.
 */

const CLIENT = import.meta.env.VITE_ADSENSE_CLIENT as string | undefined

interface Props {
  /** AdSense ad-unit slot ID */
  slot: string
  className?: string
  /** AdSense format, e.g. 'auto' (responsive) or 'fluid' */
  format?: string
  /** Responsive full-width behaviour */
  responsive?: boolean
}

export function AdSlot({ slot, className, format = 'auto', responsive = true }: Props) {
  useEffect(() => {
    if (!CLIENT) return
    try {
      // The AdSense script registers `window.adsbygoogle`; pushing an empty
      // object tells it to fill the most recently rendered <ins> element.
      ;(window as unknown as { adsbygoogle: unknown[] }).adsbygoogle =
        (window as unknown as { adsbygoogle?: unknown[] }).adsbygoogle || []
      ;(window as unknown as { adsbygoogle: unknown[] }).adsbygoogle.push({})
    } catch {
      /* ad blocker, or script not loaded — fail silently */
    }
  }, [])

  // Without a configured publisher ID there is nothing to render.
  if (!CLIENT) return null

  return (
    <ins
      key={slot}
      className={`adsbygoogle block ${className ?? ''}`}
      style={{ display: 'block' }}
      data-ad-client={CLIENT}
      data-ad-slot={slot}
      data-ad-format={format}
      data-full-width-responsive={responsive ? 'true' : 'false'}
    />
  )
}
