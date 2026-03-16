import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/auth':    'http://localhost:4000',
      '/chats':   'http://localhost:4000',
      '/upload':  'http://localhost:4000',
      '/uploads': 'http://localhost:4000',
      '/socket.io': {
        target: 'http://localhost:4000',
        ws: true,
      },
    },
  },
});
