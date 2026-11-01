import { describe, it, expect } from 'vitest';
import indexHtml from '../../../index.html?raw';
import vercelJson from '../../../vercel.json?raw';

/* The CSP in vercel.json allows the inline theme script by hash. If anyone edits
   that script without updating the hash, the page would lose its no-flash theme
   in production, so this fails first. Line endings are normalised because the
   repo stores LF while a Windows checkout may hold CRLF. */
async function sha256Base64(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

describe('Content-Security-Policy', () => {
  it('lists the hash of every inline script in index.html', async () => {
    const html = indexHtml.replace(/\r\n/g, '\n');
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    expect(scripts.length).toBeGreaterThan(0);
    for (const text of scripts) {
      expect(vercelJson).toContain(`'sha256-${await sha256Base64(text)}'`);
    }
  });
});
