import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // PORT lets the Claude preview pick a free port when 5173 is taken
  // host: true also serves on the local network, so a phone on the same Wi-Fi can open it
  server: { port: Number(process.env.PORT) || 5173, host: true },
})
