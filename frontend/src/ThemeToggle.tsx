/**
 * Theme toggle button.
 *
 * Cycles system → light → dark. Announces the state currently in effect rather
 * than the next one, so a screen reader reports what the reader is looking at.
 */

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme, type ThemeChoice } from './theme';

const META: Record<ThemeChoice, { label: string; Icon: typeof Sun; hint: string }> = {
  system: { label: 'System', Icon: Monitor, hint: 'Following your system setting' },
  light: { label: 'Light', Icon: Sun, hint: 'Light, regardless of system setting' },
  dark: { label: 'Dark', Icon: Moon, hint: 'Dark, regardless of system setting' },
};

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [choice, , cycle] = useTheme();
  const { label, Icon, hint } = META[choice];

  return (
    <button
      type="button"
      onClick={cycle}
      title={`Theme: ${hint}. Activate to change.`}
      aria-label={`Theme: ${label}. ${hint}. Activate to change.`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.35rem',
        padding: '0.3rem 0.65rem',
        border: 'none',
        cursor: 'pointer',
        font: 'inherit',
        fontSize: '0.75rem',
        background: 'transparent',
        color: 'var(--nmas-ink)',
        whiteSpace: 'nowrap',
      }}
    >
      <Icon size={13} aria-hidden />
      {compact ? null : label}
    </button>
  );
}
