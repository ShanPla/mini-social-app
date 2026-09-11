import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
