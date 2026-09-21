const http = require('http');
const fs = require('fs');
const path = require('path');

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.ico': 'image/x-icon',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.map': 'application/json',
    '.wasm': 'application/wasm',
};

class RendererServer {
    constructor() {
        this.server = null;
        this.port = 0;
        this.root = '';
    }

    ensure(distDir) {
        if (this.server && this.port) {
            return Promise.resolve(`http://localhost:${this.port}/`);
        }
        this.root = path.resolve(distDir);
        return new Promise((resolve, reject) => {
            this.server = http.createServer((req, res) => this.handle(req, res));
            this.server.once('error', reject);
            // 밖 네트워크에는 안 열고, 설치한 그 PC 안에서만 화면을 연다
            this.server.listen(0, '127.0.0.1', () => {
                const addr = this.server.address();
                this.port = addr && addr.port ? addr.port : 0;
                if (!this.port) {
                    reject(new Error('renderer server port unavailable'));
                    return;
                }
                resolve(`http://localhost:${this.port}/`);
            });
        });
    }

    handle(req, res) {
        try {
            const raw = decodeURIComponent((req.url || '/').split('?')[0]);
            let rel = raw === '/' ? '/index.html' : raw;
            const filePath = path.resolve(this.root, `.${rel}`);
            if (!filePath.toLowerCase().startsWith(this.root.toLowerCase())) {
                res.writeHead(403);
                res.end();
                return;
            }
            let servePath = filePath;
            if (!fs.existsSync(servePath) || fs.statSync(servePath).isDirectory()) {
                servePath = path.join(this.root, 'index.html');
            }
            const ext = path.extname(servePath).toLowerCase();
            const body = fs.readFileSync(servePath);
            res.writeHead(200, {
                'Content-Type': MIME[ext] || 'application/octet-stream',
                'Cache-Control': 'no-store',
            });
            res.end(body);
        } catch {
            res.writeHead(404);
            res.end();
        }
    }

    stop() {
        if (this.server) {
            this.server.close();
            this.server = null;
            this.port = 0;
        }
    }
}

const rendererServer = new RendererServer();

module.exports = { rendererServer };
