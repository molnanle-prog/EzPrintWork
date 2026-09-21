const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const https = require('https');
const path = require('path');

const DOWNLOAD_URL =
    'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe';
const URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const tmp = `${dest}.part`;
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        const go = (current, hops) => {
            if (hops > 6) {
                reject(new Error('too many redirects'));
                return;
            }
            https
                .get(current, { headers: { 'User-Agent': 'EzPrintWork' } }, (res) => {
                    const loc = res.headers.location;
                    if (res.statusCode >= 300 && res.statusCode < 400 && loc) {
                        res.resume();
                        go(loc, hops + 1);
                        return;
                    }
                    if (res.statusCode !== 200) {
                        res.resume();
                        reject(new Error(`download failed: ${res.statusCode}`));
                        return;
                    }
                    const out = fs.createWriteStream(tmp);
                    res.pipe(out);
                    out.on('finish', () => {
                        out.close(() => {
                            try {
                                fs.renameSync(tmp, dest);
                                resolve(dest);
                            } catch (error) {
                                reject(error);
                            }
                        });
                    });
                    out.on('error', reject);
                })
                .on('error', reject);
        };
        go(url, 0);
    });
}

class RemoteTunnel {
    constructor() {
        this.child = null;
        this.remoteUrl = null;
        this.port = 0;
        this.ensurePromise = null;
    }

    getUrl() {
        return this.remoteUrl;
    }

    binaryPath() {
        return path.join(app.getPath('userData'), 'bin', 'cloudflared.exe');
    }

    async ensureBinary() {
        const dest = this.binaryPath();
        if (fs.existsSync(dest) && fs.statSync(dest).size > 1_000_000) return dest;
        await downloadFile(DOWNLOAD_URL, dest);
        return dest;
    }

    broadcast() {
        for (const win of BrowserWindow.getAllWindows()) {
            if (!win.isDestroyed()) {
                win.webContents.send('remote-tunnel-ready', this.remoteUrl);
            }
        }
    }

    stop() {
        if (this.child && !this.child.killed) {
            this.child.kill();
        }
        this.child = null;
        this.remoteUrl = null;
    }

    async ensure(localPort) {
        const port = Number(localPort) || 0;
        if (!port) return null;
        if (this.remoteUrl && this.port === port && this.child && !this.child.killed) {
            return this.remoteUrl;
        }
        if (this.ensurePromise && this.port === port) return this.ensurePromise;
        this.port = port;
        this.ensurePromise = this.start(port).finally(() => {
            this.ensurePromise = null;
        });
        return this.ensurePromise;
    }

    async start(localPort) {
        this.stop();
        let bin;
        try {
            bin = await this.ensureBinary();
        } catch (error) {
            console.warn('[RemoteTunnel] binary unavailable:', error);
            return null;
        }
        return new Promise((resolve) => {
            let settled = false;
            const finish = (url) => {
                if (settled) return;
                settled = true;
                this.remoteUrl = url || null;
                if (url) this.broadcast();
                resolve(url || null);
            };
            try {
                this.child = spawn(
                    bin,
                    ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${localPort}`],
                    { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }
                );
            } catch (error) {
                console.warn('[RemoteTunnel] spawn failed:', error);
                finish(null);
                return;
            }
            const onChunk = (buf) => {
                const text = String(buf || '');
                const match = URL_RE.exec(text);
                if (match) finish(match[0].replace(/\/$/, ''));
            };
            this.child.stdout.on('data', onChunk);
            this.child.stderr.on('data', onChunk);
            this.child.on('error', (error) => {
                console.warn('[RemoteTunnel] process error:', error);
                finish(null);
            });
            this.child.on('exit', () => {
                this.child = null;
                this.remoteUrl = null;
                finish(null);
            });
            setTimeout(() => {
                if (!settled) finish(this.remoteUrl);
            }, 20000);
        });
    }
}

const remoteTunnel = new RemoteTunnel();

module.exports = { remoteTunnel };
