import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  esbuild: { drop: ['debugger'], pure: ['console.log', 'console.debug', 'console.info'], legalComments: 'none' },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 700,
    reportCompressedSize: false,
    cssMinify: true,
    modulePreload: { polyfill: false },
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        // Libraries change rarely, so they get their own files and stay cached between deploys.
        manualChunks: {
          react: ['react', 'react-dom'],
          supabase: ['@supabase/supabase-js'],
          livekit: ['livekit-client'],
        },
      },
    },
  },
})
