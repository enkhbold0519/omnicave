import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * webOS loads packaged apps from file://.
 * Chromium blocks <script type="module" crossorigin> over file://,
 * so for production builds we emit one classic IIFE bundle and
 * strip the module/crossorigin attributes from index.html.
 */
function webosFileProtocol(): Plugin {
  return {
    name: 'webos-file-protocol',
    apply: 'build',
    enforce: 'post',
    transformIndexHtml(html) {
      return html
        .replace(/<script type="module" crossorigin/g, '<script defer')
        .replace(/<link rel="stylesheet" crossorigin/g, '<link rel="stylesheet"')
        .replace(/<link rel="modulepreload"[^>]*>/g, '')
    },
  }
}

export default defineConfig({
  plugins: [react(), webosFileProtocol()],
  base: './', // relative asset paths, required inside the .ipk
  build: {
    outDir: 'dist',
    target: 'chrome87', // conservative; webOS OSE web runtime is Chromium-based
    modulePreload: false,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'assets/app.js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
  server: {
    host: true, // listen on LAN too (http://<your-ip>:5173)
    port: 5173,
    // Vite blocks unknown Host headers; allow tunnel domains for external access
    allowedHosts: ['.trycloudflare.com', '.ngrok-free.app'],
    // browser dev: /api goes to the FastAPI backend, so one tunnel URL serves both
    proxy: { '/api': { target: 'http://localhost:8000', changeOrigin: true } },
  },
})
