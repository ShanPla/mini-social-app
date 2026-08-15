import { useState, useEffect } from 'react';

export function timeAgo(dateStr: string): string {
  const date = new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z');
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  if (days < 7) return `${days}d ago`;
  if (weeks < 5) return `${weeks}w ago`;
  if (months < 12) return `${months}mo ago`;
  return `${years}y ago`;
}

/* Hook version — auto-updates every 30 seconds */
export function useTimeAgo(dateStr: string): string {
  const [label, setLabel] = useState(() => timeAgo(dateStr));

  useEffect(() => {
    setLabel(timeAgo(dateStr));
    const interval = setInterval(() => {
      setLabel(timeAgo(dateStr));
    }, 30000);
    return () => clearInterval(interval);
  }, [dateStr]);

  return label;
}