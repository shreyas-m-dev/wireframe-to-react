import { useCallback, useEffect, useState } from 'react';

const KEY = 'w2r.theme';
const CHOICES = ['system', 'light', 'dark'];

function stored() {
  try { const value = localStorage.getItem(KEY); return CHOICES.includes(value) ? value : 'system'; } catch { return 'system'; }
}

function resolve(choice) {
  if (choice !== 'system') return choice;
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function applyInitialTheme() {
  document.documentElement.dataset.theme = resolve(stored());
}

export function useTheme() {
  const [choice, setChoice] = useState(stored);
  useEffect(() => {
    const apply = () => { document.documentElement.dataset.theme = resolve(choice); };
    apply();
    const media = window.matchMedia?.('(prefers-color-scheme: light)');
    media?.addEventListener?.('change', apply);
    return () => media?.removeEventListener?.('change', apply);
  }, [choice]);
  const cycle = useCallback(() => {
    setChoice((current) => {
      const next = CHOICES[(CHOICES.indexOf(current) + 1) % CHOICES.length];
      try { localStorage.setItem(KEY, next); } catch { /* storage unavailable: choice lasts for this tab */ }
      return next;
    });
  }, []);
  return { choice, resolved: resolve(choice), cycle };
}
