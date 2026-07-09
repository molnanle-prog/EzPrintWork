const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SITUATION_FILE = 'situation-mirror.json';
const ARCHIVE_FILE = 'jobs-archive.json';
const DEFAULT_GATEWAY_PORT = 3847;

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Ezpw-Gateway-Token',
};

/** 웹과 동일한 규칙 — src/utils/gatewayToken.ts */
function deriveStoreGatewayToken(tenantId) {
    const id = String(tenantId || '').trim();
    if (!id) return '';
    let hash = 2166136261;
    const raw = `ezpw-gw-v1:${id}`;
    for (let i = 0; i < raw.length; i++) {
        hash ^= raw.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    const a = (hash >>> 0).toString(36);
    let hash2 = 5381;
    for (let i = 0; i < raw.length; i++) {
        hash2 = ((hash2 << 5) + hash2) ^ raw.charCodeAt(i);
    }
    const b = (hash2 >>> 0).toString(36);
    return `${a}${b}`.slice(0, 24);
}

function readRequestBody(req) {
    return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', (chunk) => {
            data += chunk;
            if (data.length > 20 * 1024 * 1024) {
                reject(new Error('body too large'));
            }
        });
        req.on('end', () => resolve(data));
        req.on('error', reject);
    });
}

class LocalGateway {
    constructor() {
        this.server = null;
        this.port = 0;
        this.archiveRoot = null;
        this.tenantId = null;
        this.gatewayToken = null;
    }

    setConfig({ archiveRoot, tenantId, gatewayToken }) {
        this.archiveRoot = archiveRoot ? String(archiveRoot).replace(/[\\/]$/, '') : null;
        this.tenantId = tenantId || null;
        this.gatewayToken = gatewayToken || (tenantId ? deriveStoreGatewayToken(tenantId) : null);
    }

    isAuthorized(req, url) {
        if (!this.gatewayToken) return true;
        const headerToken = req.headers['x-ezpw-gateway-token'];
        const queryToken = url.searchParams.get('token');
        const provided = (headerToken || queryToken || '').trim();
        return provided === this.gatewayToken;
    }

    readJsonFile(name) {
        if (!this.archiveRoot) return null;
        const filePath = path.join(this.archiveRoot, name);
        try {
            if (!fs.existsSync(filePath)) return null;
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch (error) {
            console.warn('[LocalGateway] read failed:', filePath, error.message);
            return null;
        }
    }

    writeJsonFile(name, payload) {
        if (!this.archiveRoot) return false;
        const filePath = path.join(this.archiveRoot, name);
        try {
            fs.mkdirSync(this.archiveRoot, { recursive: true });
            fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
            return true;
        } catch (error) {
            console.warn('[LocalGateway] write failed:', filePath, error.message);
            return false;
        }
    }

    mergeJobs(existing, incoming) {
        const map = new Map();
        for (const job of existing || []) {
            if (job?.id) map.set(job.id, job);
        }
        for (const job of incoming || []) {
            if (!job?.id) continue;
            const prev = map.get(job.id);
            map.set(job.id, prev ? { ...prev, ...job } : job);
        }
        return [...map.values()];
    }

    getLanAddresses() {
        const addrs = [];
        const nets = os.networkInterfaces();
        for (const name of Object.keys(nets)) {
            for (const net of nets[name] || []) {
                if (net.family === 'IPv4' && !net.internal) {
                    addrs.push(net.address);
                }
            }
        }
        return addrs;
    }

    getInfo() {
        return {
            port: this.port,
            baseUrl: this.port ? `http://127.0.0.1:${this.port}` : '',
            lanUrls: this.port ? this.getLanAddresses().map((ip) => `http://${ip}:${this.port}`) : [],
        };
    }

    start() {
        if (this.server) return Promise.resolve(this.getInfo());

        return new Promise((resolve) => {
            this.server = http.createServer(async (req, res) => {
                if (req.method === 'OPTIONS') {
                    res.writeHead(204, CORS);
                    res.end();
                    return;
                }

                let url;
                try {
                    url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
                } catch {
                    res.writeHead(400, CORS);
                    res.end('Bad request');
                    return;
                }

                if (url.pathname === '/health') {
                    res.writeHead(200, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({
                        ok: true,
                        ...this.getInfo(),
                        authRequired: !!this.gatewayToken,
                    }));
                    return;
                }

                if (url.pathname === '/api/v1/mirror' && req.method === 'GET') {
                    if (!this.isAuthorized(req, url)) {
                        res.writeHead(401, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
                        res.end(JSON.stringify({ ok: false, error: 'unauthorized' }));
                        return;
                    }
                    const tenantId = url.searchParams.get('tenantId') || this.tenantId;
                    const situation = this.readJsonFile(SITUATION_FILE);
                    const archive = this.readJsonFile(ARCHIVE_FILE);
                    const jobs = (archive?.jobs?.length ? archive.jobs : situation?.jobs) || [];

                    res.writeHead(200, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({
                        tenantId,
                        version: situation?.version ?? archive?.version ?? 1,
                        updatedAt: situation?.updatedAt || archive?.updatedAt || null,
                        companyName: situation?.companyName,
                        kanbanLayout: situation?.kanbanLayout,
                        statusDefinitions: situation?.statusDefinitions,
                        jobs,
                        clients: situation?.clients || [],
                        settings: situation?.settings || {},
                        staff: situation?.staff || [],
                    }));
                    return;
                }

                if (url.pathname === '/api/v1/jobs/partial' && req.method === 'POST') {
                    if (!this.isAuthorized(req, url)) {
                        res.writeHead(401, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
                        res.end(JSON.stringify({ ok: false, error: 'unauthorized' }));
                        return;
                    }
                    // 웹은 조회 전용 — POST는 매장 PC 내부/레거시만. 외부 쓰기는 거부 권장이나 NAS 경유 유지.
                    if (!this.archiveRoot) {
                        res.writeHead(503, CORS);
                        res.end('NAS path not configured');
                        return;
                    }
                    try {
                        const raw = await readRequestBody(req);
                        const body = JSON.parse(raw || '{}');
                        const jobs = Array.isArray(body.jobs) ? body.jobs : [];
                        if (jobs.length === 0) {
                            res.writeHead(400, CORS);
                            res.end('jobs required');
                            return;
                        }
                        const tenantId = body.tenantId || this.tenantId;
                        const now = new Date().toISOString();
                        const archive = this.readJsonFile(ARCHIVE_FILE);
                        const merged = this.mergeJobs(archive?.jobs, jobs);
                        const archivePayload = {
                            version: archive?.version ?? 1,
                            tenantId,
                            updatedAt: now,
                            jobs: merged,
                        };
                        if (!this.writeJsonFile(ARCHIVE_FILE, archivePayload)) {
                            res.writeHead(500, CORS);
                            res.end('write failed');
                            return;
                        }
                        const situation = this.readJsonFile(SITUATION_FILE);
                        if (situation) {
                            this.writeJsonFile(SITUATION_FILE, {
                                ...situation,
                                tenantId,
                                updatedAt: now,
                                jobs: this.mergeJobs(situation.jobs, jobs),
                            });
                        }
                        res.writeHead(200, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
                        res.end(JSON.stringify({ ok: true, updatedAt: now, count: jobs.length }));
                        return;
                    } catch (error) {
                        res.writeHead(400, CORS);
                        res.end(error?.message || 'invalid body');
                        return;
                    }
                }

                res.writeHead(404, CORS);
                res.end('Not found');
            });

            const listenOn = (port) => {
                this.server.listen(port, '0.0.0.0', () => {
                    this.port = this.server.address().port;
                    console.log('[LocalGateway] listening on', this.getInfo().baseUrl);
                    resolve(this.getInfo());
                });
            };

            this.server.once('error', (error) => {
                if (error?.code === 'EADDRINUSE') {
                    console.warn(`[LocalGateway] port ${DEFAULT_GATEWAY_PORT} already in use, fallback random port`);
                    this.server.removeAllListeners('error');
                    listenOn(0);
                    return;
                }
                console.error('[LocalGateway] failed to start:', error);
                this.server = null;
                this.port = 0;
                resolve(this.getInfo());
            });

            listenOn(DEFAULT_GATEWAY_PORT);
        });
    }

    stop() {
        if (!this.server) return;
        this.server.close();
        this.server = null;
        this.port = 0;
    }
}

module.exports = { LocalGateway };
