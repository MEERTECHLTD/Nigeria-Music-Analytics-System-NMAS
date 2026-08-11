/**
 * Theme control.
 *
 * Three states, not two. "System" is a real choice — a reader who has set their
 * OS to dark should get dark without opting in, and a reader who wants this
 * interface light regardless should be able to say so. A two-way toggle cannot
 * express the difference between "I want light" and "I haven't chosen".
 *
 * The choice is written to `data-theme` on the root element, which both
 * stylesheets key off, and persisted so it survives a reload. When the state is
 * "system" the attribute is removed entirely, letting the media query decide.
 */

import { useCallback, useEffect, useState } from 'react';

export type ThemeChoice = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'nmas-theme';
const ORDER: ThemeChoice[] = ['system', 'light', 'dark'];

function readStored(): ThemeChoice {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    // storage unavailable (private mode, blocked cookies) — fall back to system
  }
  return 'system';
}

export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
}

/**
 * Apply the stored choice before React renders, so the first paint is already
 * correct. Called from main.tsx — without it the page flashes the default
 * palette before hydrating.
 */
export function initTheme(): void {
  applyTheme(readStored());
}

export function useTheme(): [ThemeChoice, (next: ThemeChoice) => void, () => void] {
  const [choice, setChoice] = useState<ThemeChoice>(readStored);

  useEffect(() => {
    applyTheme(choice);
    try {
      localStorage.setItem(STORAGE_KEY, choice);
    } catch {
      // non-fatal: the theme still applies for this session
    }
  }, [choice]);

  // While on "system", follow the OS if it changes mid-session.
  useEffect(() => {
    if (choice !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [choice]);

  const cycle = useCallback(() => {
    setChoice((c) => ORDER[(ORDER.indexOf(c) + 1) % ORDER.length]);
  }, []);

  return [choice, setChoice, cycle];
}
