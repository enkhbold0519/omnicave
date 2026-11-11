import { useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * OS reduce-motion and screen-reader settings, shared by every component through one
 * subscription (many pressables read this, so per-component listeners would be wasteful).
 */
type Prefs = { reduceMotion: boolean; screenReader: boolean };

let prefs: Prefs = { reduceMotion: false, screenReader: false };
const listeners = new Set<() => void>();
let started = false;

function update(patch: Partial<Prefs>) {
  prefs = { ...prefs, ...patch };
  listeners.forEach((l) => l());
}

function start() {
  if (started) return;
  started = true;
  AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => update({ reduceMotion }));
  AccessibilityInfo.isScreenReaderEnabled().then((screenReader) => update({ screenReader }));
  // Lives for the whole app session, so the subscriptions are never removed.
  AccessibilityInfo.addEventListener('reduceMotionChanged', (reduceMotion) => update({ reduceMotion }));
  AccessibilityInfo.addEventListener('screenReaderChanged', (screenReader) => update({ screenReader }));
}

function subscribe(listener: () => void) {
  start();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => prefs;

export function useAccessibilityPrefs(): Prefs {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
