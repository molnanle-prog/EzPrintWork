const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/** 배포용 GH_TOKEN — .env.deploy → gh auth token → 환경변수 */
function loadDeployEnv(projectRoot = path.resolve(__dirname, '..')) {
  const envPath = path.join(projectRoot, '.env.deploy');
  if (fs.existsSync(envPath)) {
    for (const rawLine of fs.readFileSync(envPath, 'utf-8').split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  }

  if (!process.env.GH_TOKEN && !process.env.GITHUB_TOKEN) {
    try {
      const token = execSync('gh auth token', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      if (token) process.env.GH_TOKEN = token;
    } catch {
      /* gh 미로그인 */
    }
  }
}

module.exports = { loadDeployEnv };
