import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  build: {
    rollupOptions: {
      output: {
        // The console is table-and-rule based and pulls in none of the charting
        // or backend SDKs. Splitting them keeps the first paint of a panel small;
        // the dashboard pays for recharts only when it is opened.
        manualChunks: {
          react: ['react', 'react-dom'],
          query: ['@tanstack/react-query'],
          charts: ['recharts'],
          firebase: ['firebase/app', 'firebase/analytics'],
        },
      },
    },
    chunkSizeWarningLimit: 700,
  },
});
