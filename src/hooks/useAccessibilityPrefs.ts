import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** Tracks OS reduce-motion and screen-reader settings. */
export function useAccessibilityPrefs() {
  const [reduceMotion, setReduceMotion] = useState(false);
  const [screenReader, setScreenReader] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => mounted && setReduceMotion(v));
    AccessibilityInfo.isScreenReaderEnabled().then((v) => mounted && setScreenReader(v));
    const subs = [
      AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion),
      AccessibilityInfo.addEventListener('screenReaderChanged', setScreenReader),
    ];
    return () => {
      mounted = false;
      subs.forEach((s) => s.remove());
    };
  }, []);

  return { reduceMotion, screenReader };
}
