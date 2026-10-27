import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/icon-192.png", "icons/icon-512.png"],
      manifest: {
        name: "ProfitMind — Shop Management",
        short_name: "ProfitMind",
        description: "Offline-first shop management for Ugandan retail — POS, debtors, stock, and an AI advisor grounded in your own numbers.",
        theme_color: "#2A4E3B",
        background_color: "#EDEFE6",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // App shell + static assets are cached for offline use. All of this
        // app's real data (products, sales, debtors) lives in localStorage,
        // not in cached network responses, so offline use doesn't depend on
        // Workbox at all — this only keeps the UI itself loadable offline.
        globPatterns: ["**/*.{js,css,html,svg,png,ico}"],
        // Handles taps on notifications (opens the app on the right tab).
        importScripts: ["sw-notify.js"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: { cacheName: "google-fonts-stylesheets" },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-webfonts",
              expiration: { maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          recharts: ["recharts"],
          "lucide-react": ["lucide-react"],
        },
      },
    },
  },
});
