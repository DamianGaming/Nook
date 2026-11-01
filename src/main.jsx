import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import '@fontsource-variable/figtree'
import './styles.css'
import './theme.js'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { installErrorReporting } from './errorReport.js'

import { registerServiceWorker } from './push.js'

installErrorReporting()
registerServiceWorker()

// Open the connection to the database while the app code is still loading.
try {
  const u = import.meta.env.VITE_SUPABASE_URL
  if (u) { const l = document.createElement('link'); l.rel = 'preconnect'; l.href = new URL(u).origin; l.crossOrigin = ''; document.head.appendChild(l) }
} catch { /* ignore */ }

createRoot(document.getElementById('root')).render(<ErrorBoundary><App /></ErrorBoundary>)
