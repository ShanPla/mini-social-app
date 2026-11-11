import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../../lib/theme';
import './ThemeToggle.css';

type Props = {
  /* 'corner' pins it to the top corner of a page that has no bar (sign-in pages) */
  corner?: boolean;
};

/*
 * Flips light and dark, on every page: the app bar, the front page bar and the
 * sign-in pages. Settings also offers following the device.
 * The choice is kept on this device (lib/theme.ts), so it carries from the
 * front page through sign in to the feed.
 */
export default function ThemeToggle({ corner = false }: Props) {
  const { theme, setPreference } = useTheme();
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      className={`theme-toggle nav-theme-btn ${corner ? 'theme-toggle--corner' : ''}`}
      onClick={() => setPreference(dark ? 'light' : 'dark')}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={dark ? 'Light theme' : 'Dark theme'}
    >
      {dark ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}
