import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

const api = `http://localhost:${process.env.STUDIO_PORT || 4321}`;

export default defineConfig({
  plugins: [solid()],
  server: { port: 5173, proxy: { '/api': api, '/video': api, '/engine': api, '/music': api } },
});
