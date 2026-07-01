/**
 * Small browser-storage helpers.
 *
 * Folder configuration is persisted to BOTH a cookie and localStorage:
 *   - cookie     → survives even if localStorage is cleared; portable, explicit.
 *   - localStorage → larger capacity fallback when the config outgrows a cookie.
 * Reads prefer whichever has data (localStorage first, since it can hold more).
 */

export function setCookie(name: string, value: string, days = 365): boolean {
  try {
    const expires = new Date(Date.now() + days * 86_400_000).toUTCString()
    const encoded = encodeURIComponent(value)
    // Browsers cap a single cookie around 4KB; don't bother if we'd exceed it.
    if (encoded.length > 3900) return false
    document.cookie = `${name}=${encoded}; expires=${expires}; path=/; SameSite=Lax`
    return true
  } catch {
    return false
  }
}

export function getCookie(name: string): string | null {
  try {
    const match = document.cookie.match(new RegExp(`(?:^|; )${name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1')}=([^;]*)`))
    return match ? decodeURIComponent(match[1]) : null
  } catch {
    return null
  }
}

export function deleteCookie(name: string): void {
  try {
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`
  } catch {
    /* ignore */
  }
}

/** Write a value to both cookie + localStorage. */
export function persist(name: string, value: string): void {
  setCookie(name, value)
  try {
    localStorage.setItem(name, value)
  } catch {
    /* ignore */
  }
}

/** Read from localStorage first (bigger), then cookie. */
export function restore(name: string): string | null {
  try {
    const ls = localStorage.getItem(name)
    if (ls != null) return ls
  } catch {
    /* ignore */
  }
  return getCookie(name)
}

/** Remove from both stores. */
export function forget(name: string): void {
  try {
    localStorage.removeItem(name)
  } catch {
    /* ignore */
  }
  deleteCookie(name)
}
