
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';

function getNormalizedRoot() {
  let r = fs.realpathSync.native(__dirname);
  if (r[1] === ':') {
    r = r[0].toUpperCase() + r.slice(1);
  }
  return r.replace(/\\/g, '/');
}

// https://vitejs.dev/config/
export default defineConfig({
  root: getNormalizedRoot(),
  plugins: [react()],
  base: './', // Important for Electron build
  build: {
    outDir: 'dist',
  },
});

