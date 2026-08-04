import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';
import mkcert from 'vite-plugin-mkcert';

// getUserMedia / getDisplayMedia need a secure context. `localhost` counts as
// one, so plain `npm run dev` is enough when publisher and viewer are the same
// machine. Testing from another device over the LAN needs real HTTPS:
//   npm run dev:https -- --host
// which turns on vite-plugin-mkcert. That installs a local CA on first run and
// therefore asks for your sudo password once.
const useHttps = process.env.HTTPS === 'true';

export default defineConfig({
  plugins: [vue(), ...(useHttps ? [mkcert()] : [])],
  server: {
    https: useHttps,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
