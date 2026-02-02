/**
 * Hook to detect if the app is running in PWA mode.
 */

/**
 * Check if we're running in PWA mode (set by vite.config.pwa.ts)
 */
export function isPwaMode(): boolean {
  return import.meta.env.VITE_PWA_MODE === 'true'
}

/**
 * Hook for components to check PWA mode
 */
export function usePwaMode(): boolean {
  return isPwaMode()
}
