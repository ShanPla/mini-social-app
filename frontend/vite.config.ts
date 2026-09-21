import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/* Link previews (og:image, og:url) have to carry absolute URLs, so the host
   is stamped into index.html at build time. Vercel exposes the production
   domain to the build, which keeps this right if the domain ever changes;
   the fallback is for local builds and previews. */
const SITE_URL = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : 'https://mini-social-app-dusky.vercel.app'

function siteUrl(): Plugin {
  return {
    name: 'site-url',
    transformIndexHtml: (html) => html.replaceAll('__SITE_URL__', SITE_URL),
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), siteUrl()],
  build: {
    rolldownOptions: {
      output: {
        /* Vendor code changes far less often than the app, so it gets its own
           long-lived chunks: a deploy invalidates the app chunks, not these.
           Vite normalises module ids to forward slashes on every OS. */
        codeSplitting: {
          groups: [
            { name: 'vendor-react', test: /node_modules\/(react|react-dom|scheduler|react-router|react-router-dom)\// },
            { name: 'vendor-supabase', test: /node_modules\/@supabase\// },
          ],
        },
      },
    },
  },
})
