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

/** 설치본 화면 주소. 실행마다 포트가 바뀌면 localStorage·로그인 세션이 사라진다. */
const PREFERRED_RENDERER_PORT = 47321;
const RENDERER_PORT_SPAN = 20;
const PORT_FILE = 'renderer-origin-port.json';

function readSavedPort(userDataDir) {
    if (!userDataDir) return 0;
    try {
        const raw = fs.readFileSync(path.join(userDataDir, PORT_FILE), 'utf8');
        const port = Number(JSON.parse(raw).port);
        if (Number.isInteger(port) && port > 1024 && port < 65536) return port;
    } catch {
        /* 처음 실행 */
    }
    return 0;
}

function writeSavedPort(userDataDir, port) {
    if (!userDataDir) return;
    try {
        fs.mkdirSync(userDataDir, { recursive: true });
        fs.writeFileSync(path.join(userDataDir, PORT_FILE), JSON.stringify({ port }));
    } catch (err) {
        console.warn('[RendererServer] port save failed:', err);
    }
}

function portCandidates(userDataDir) {
    const ports = [];
    const push = (port) => {
        if (port && !ports.includes(port)) ports.push(port);
    };
    push(readSavedPort(userDataDir));
    for (let i = 0; i < RENDERER_PORT_SPAN; i += 1) {
        push(PREFERRED_RENDERER_PORT + i);
    }
    return ports;
}

function listenOnce(server, port) {
    return new Promise((resolve, reject) => {
        const onError = (err) => {
            cleanup();
            reject(err);
        };
        const onListening = () => {
            cleanup();
            const addr = server.address();
            resolve(addr && addr.port ? addr.port : port);
        };
        const cleanup = () => {
            server.removeListener('error', onError);
            server.removeListener('listening', onListening);
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(port, '127.0.0.1');
    });
}

class RendererServer {
    constructor() {
        this.server = null;
        this.port = 0;
        this.root = '';
    }

    async ensure(distDir, userDataDir) {
        if (this.server && this.port) {
            return `http://localhost:${this.port}/`;
        }
        this.root = path.resolve(distDir);
        this.server = http.createServer((req, res) => this.handle(req, res));
        let lastError = null;
        for (const port of portCandidates(userDataDir)) {
            try {
                // 밖 네트워크에는 안 열고, 설치한 그 PC 안에서만 화면을 연다
                this.port = await listenOnce(this.server, port);
                writeSavedPort(userDataDir, this.port);
                return `http://localhost:${this.port}/`;
            } catch (err) {
                lastError = err;
                if (err && err.code !== 'EADDRINUSE') break;
            }
        }
        this.server = null;
        this.port = 0;
        throw lastError || new Error('renderer server port unavailable');
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
