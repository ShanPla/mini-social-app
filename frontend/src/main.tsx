import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { reloadForStaleChunk } from './lib/reloadOnce'
import { initTheme } from './lib/theme'

/* Follow the device theme and other tabs from here on (index.html did the first paint) */
initTheme()

/* Vite reports a missing chunk or stylesheet here before React sees it.
   One guarded reload picks up the new deploy; otherwise the error boundary
   takes over as usual. */
window.addEventListener('vite:preloadError', (event) => {
  if (reloadForStaleChunk()) event.preventDefault()
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
