import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { FileBasedRouterPlugin } from './lib/vite-plugins/file-based-router'
import tailwindcss from '@tailwindcss/vite'
import DynamicAliasPlugin from './lib/vite-plugins/dynamic-alias'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    FileBasedRouterPlugin(),
    DynamicAliasPlugin(),
  ],
  root: "./app",
  envDir: path.resolve(__dirname, "../.."),
  resolve: {
    alias: {
      "@recommand": __dirname,
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    allowedHosts: ["localhost"],
    hmr: {
      clientPort: 5173,
    },
    watch: {
      ignored: ['**/.env', '**/.env.*']
    }
  },
})
