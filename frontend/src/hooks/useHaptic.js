import { useCallback } from 'react';

/**
 * useHaptic — triggers device vibration (mobile) via the Vibration API.
 * Silently no-ops on unsupported browsers.
 */
export function useHaptic() {
  const vibrate = useCallback((pattern = 30) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  }, []);

  return {
    tap:    () => vibrate(15),        // light tap
    success: () => vibrate([30, 30, 30]), // triple pulse — task done
    delete: () => vibrate(60),        // firm thud — delete
    error:  () => vibrate([50, 30, 50]), // double buzz — error
  };
}
