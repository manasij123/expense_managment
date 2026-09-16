import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
  },
  server: {
    proxy: {
      // Flask backend (functions/app.py) — run separately with
      // functions/venv/Scripts/python.exe app.py
      '/api': 'http://127.0.0.1:5000',
      '/authorize': 'http://127.0.0.1:5000',
      '/save_fcm_token': 'http://127.0.0.1:5000',
      '/search_history': 'http://127.0.0.1:5000',
      '/logout': 'http://127.0.0.1:5000',
    },
  },
})
