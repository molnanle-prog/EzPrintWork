
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8'));

function versionManifestPlugin(buildId: string): Plugin {
  return {
    name: 'ezpw-version-manifest',
    writeBundle(_options, bundle) {
      const outDir = path.resolve(__dirname, 'dist');
      const manifest = {
        version: pkg.version,
        buildId,
        builtAt: new Date().toISOString(),
      };
      fs.writeFileSync(path.join(outDir, 'version.json'), JSON.stringify(manifest, null, 2));

      const indexPath = path.join(outDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        let html = fs.readFileSync(indexPath, 'utf-8');
        if (!html.includes('name="ezpw-build-id"')) {
          html = html.replace(
            '</head>',
            `    <meta name="ezpw-build-id" content="${buildId}" />\n  </head>`
          );
          fs.writeFileSync(indexPath, html);
        }
      }

      for (const file of Object.keys(bundle)) {
        if (file.endsWith('index.html') && 'source' in bundle[file]) {
          // writeBundle hook already patched dist/index.html
        }
      }
    },
  };
}

function getNormalizedRoot() {
  let r = fs.realpathSync.native(__dirname);
  if (r[1] === ':') {
    r = r[0].toUpperCase() + r.slice(1);
  }
  return r.replace(/\\/g, '/');
}

const buildId = `${pkg.version}-${Date.now()}`;

// https://vitejs.dev/config/
export default defineConfig({
  root: getNormalizedRoot(),
  plugins: [react(), versionManifestPlugin(buildId)],
  base: './', // Important for Electron build
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_BUILD_ID__: JSON.stringify(buildId),
  },
  build: {
    outDir: 'dist',
  },
});

