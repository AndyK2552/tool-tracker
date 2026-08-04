import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
  registerType: 'autoUpdate',
  devOptions: {
    enabled: true,
  },
  manifest: {
    name: 'Tool Tracker',
    short_name: 'ToolTracker',
    description: 'Check tools in and out by scanning QR codes',
    theme_color: '#1e293b',
    background_color: '#1e293b',
    display: 'standalone',
    icons: [
      {
        src: 'pwa-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: 'pwa-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  },
}),
  ],
})