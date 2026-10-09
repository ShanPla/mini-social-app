import { defineConfig } from 'vitest/config'

/*
 * Unit tests for the pure helpers in src/lib. Anything that needs a browser
 * (uploads, dialogs, theming) is covered by the scripted runs instead.
 *
 * Separate from vite.config.ts on purpose: Vitest brings its own copy of Vite,
 * which is a major version behind the one that builds the app, and the two
 * plugin types do not agree. Nothing here needs the app's plugins; a component
 * test later would need @vitejs/plugin-react added to this file.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    /* supabaseClient.ts builds a client as it is imported, so give it values */
    env: {
      VITE_SUPABASE_URL: 'https://placeholder.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'placeholder-anon-key',
    },
  },
})
