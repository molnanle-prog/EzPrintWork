const fs = require('fs');
const os = require('os');
const path = require('path');

function resolveHomepageDir() {
  const projectRoot = path.resolve(__dirname, '..');
  const candidates = [
    process.env.EZ_HUB_HOMEPAGE,
    path.join(projectRoot, '..', 'ez-hub-homepage'),
    path.join(os.homedir(), 'Documents', 'GitHub', 'ez-hub-homepage'),
    path.join(os.homedir(), 'Desktop', 'ez-hub-homepage'),
  ].filter(Boolean);

  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      return path.resolve(dir);
    }
  }

  throw new Error(
    'ez-hub-homepage 폴더를 찾을 수 없습니다. EZ_HUB_HOMEPAGE 환경변수로 경로를 지정해 주세요.'
  );
}

module.exports = { resolveHomepageDir };
