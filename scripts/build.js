const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const longRoot = fs.realpathSync.native(projectRoot).toLowerCase();
const shortRoot = projectRoot.toLowerCase();

function toShortPath(p) {
  if (typeof p !== 'string') return p;
  const lower = p.toLowerCase();
  if (lower.startsWith(longRoot)) {
    return projectRoot + p.substring(longRoot.length);
  }
  return p;
}

const originalRealpathSync = fs.realpathSync;
const originalRealpath = fs.realpath;

const customRealpathSync = function(p, options) {
  try {
    const res = originalRealpathSync(p, options);
    return toShortPath(res);
  } catch (e) {
    return toShortPath(p);
  }
};
Object.setPrototypeOf(customRealpathSync, originalRealpathSync);
Object.assign(customRealpathSync, originalRealpathSync);
fs.realpathSync = customRealpathSync;

const customRealpath = function(p, options, callback) {
  const cb = typeof options === 'function' ? options : callback;
  const opts = typeof options === 'object' ? options : {};
  originalRealpath(p, opts, (err, resolvedPath) => {
    if (err) {
      if (cb) cb(err, toShortPath(p));
    } else {
      if (cb) cb(null, toShortPath(resolvedPath));
    }
  });
};
Object.setPrototypeOf(customRealpath, originalRealpath);
Object.assign(customRealpath, originalRealpath);
fs.realpath = customRealpath;

const originalResolve = path.resolve;
path.resolve = function(...args) {
  const res = originalResolve(...args);
  return toShortPath(res);
};

console.log('Path patching complete. Running Vite build programmatically...');

// Load and run Vite build
const vitePath = path.join(projectRoot, 'node_modules', 'vite', 'dist', 'node', 'index.js');
import('file:///' + vitePath.replace(/\\/g, '/')).then(({ build }) => {
  const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf-8'));
  const buildId = `${pkg.version}-${Date.now()}`;
  return build({
    root: projectRoot.replace(/\\/g, '/'),
    base: './',
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __APP_BUILD_ID__: JSON.stringify(buildId),
    },
    build: {
      outDir: path.join(projectRoot, 'dist').replace(/\\/g, '/'),
    }
  }).then(() => {
    const distDir = path.join(projectRoot, 'dist');
    const manifest = {
      version: pkg.version,
      buildId,
      builtAt: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(distDir, 'version.json'), JSON.stringify(manifest, null, 2));

    const indexPath = path.join(distDir, 'index.html');
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

    console.log('Build succeeded programmatically with patched paths!');
    console.log(`version.json → v${pkg.version} (${buildId})`);
  });
}).catch((err) => {
  console.error('Build failed programmatically:', err);
  process.exit(1);
});
