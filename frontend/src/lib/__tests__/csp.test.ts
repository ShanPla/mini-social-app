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

describe('vercel.json', () => {
  /* Vercel refuses to deploy a config that is not valid JSON (a regex written
     with a single backslash broke a deploy once), and nothing else parses it */
  it('is valid JSON', () => {
    expect(() => JSON.parse(vercelJson)).not.toThrow();
  });

  it('keeps app routes on the SPA and sends real files past it', () => {
    const { rewrites } = JSON.parse(vercelJson) as { rewrites: { source: string }[] };
    /* Vercel sources are path-to-regexp style; the pattern inside the parens is a plain regex */
    const inner = rewrites[0].source.replace(/^\/\(/, '').replace(/\)$/, '');
    const spa = new RegExp(`^/${inner}$`);
    for (const path of ['/feed', '/post/abc', '/profile/123e4567-e89b', '/messages/x', '/']) {
      expect(spa.test(path)).toBe(true);
    }
    for (const path of ['/robots.txt', '/assets/index-abc.js', '/manifest.webmanifest']) {
      expect(spa.test(path)).toBe(false);
    }
  });
});

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
