const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SITUATION_FILE = 'situation-mirror.json';
const ARCHIVE_FILE = 'jobs-archive.json';
const CHAT_FILE = 'chat-messages.json';
const PRESENCE_FILE = 'presence-sessions.json';
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

    mergeJobVisibilityFields(base, prev, incoming) {
        const CLEAR_FIELDS = [
            'managementCardPinnedAt',
            'boardHiddenAt',
            'boardHiddenBy',
            'boardHiddenReason',
        ];
        const prevPinned = !!prev.managementCardPinnedAt;
        const incomingPinned = !!incoming.managementCardPinnedAt;
        const incomingWins = this.isIncomingJobNewer(incoming, prev);

        let visibility = {};
        const pickVis = (j) => {
            const o = {};
            if (j.managementCardPinnedAt) o.managementCardPinnedAt = j.managementCardPinnedAt;
            if (j.boardHiddenAt) o.boardHiddenAt = j.boardHiddenAt;
            if (j.boardHiddenBy) o.boardHiddenBy = j.boardHiddenBy;
            if (j.boardHiddenReason) o.boardHiddenReason = j.boardHiddenReason;
            return o;
        };

        if (incomingPinned && !prevPinned) {
            visibility = pickVis(incoming);
        } else if (!incomingPinned && prevPinned) {
            visibility = incomingWins ? {} : pickVis(prev);
        } else if (incomingPinned && prevPinned) {
            if (incomingWins) {
                visibility = pickVis(incoming);
            } else {
                const inMs = Date.parse(incoming.managementCardPinnedAt || '') || 0;
                const prMs = Date.parse(prev.managementCardPinnedAt || '') || 0;
                visibility = pickVis(inMs >= prMs ? incoming : prev);
            }
        } else if (incomingWins) {
            visibility = pickVis(incoming);
        } else {
            visibility = pickVis(prev);
        }

        const out = { ...base };
        for (const key of CLEAR_FIELDS) delete out[key];
        return { ...out, ...visibility };
    }

    isIncomingJobNewer(incoming, prev) {
        const ri = typeof incoming?.rev === 'number' ? incoming.rev : -1;
        const rp = typeof prev?.rev === 'number' ? prev.rev : -1;
        if (ri >= 0 || rp >= 0) {
            if (ri !== rp) return ri > rp;
        }
        const ti = Date.parse(incoming?.updatedAt || incoming?.createdAt || '') || 0;
        const tp = Date.parse(prev?.updatedAt || prev?.createdAt || '') || 0;
        return ti >= tp;
    }

    mergeJobs(existing, incoming) {
        const CLEAR_FIELDS = [
            'managementCardPinnedAt',
            'boardHiddenAt',
            'boardHiddenBy',
            'boardHiddenReason',
        ];
        const map = new Map();
        for (const job of existing || []) {
            if (job?.id) map.set(job.id, job);
        }
        for (const job of incoming || []) {
            if (!job?.id) continue;
            const prev = map.get(job.id);
            if (!prev) {
                map.set(job.id, job);
                continue;
            }
            const incomingWins = this.isIncomingJobNewer(job, prev);
            let merged;
            if (incomingWins) {
                merged = { ...prev, ...job };
                for (const key of CLEAR_FIELDS) {
                    if (!(key in job) || job[key] == null) {
                        delete merged[key];
                    }
                }
            } else {
                merged = { ...prev };
            }
            map.set(job.id, this.mergeJobVisibilityFields(merged, prev, job));
        }
        return [...map.values()];
    }

    buildTombstoneMap(deletedJobs) {
        const map = new Map();
        for (const row of deletedJobs || []) {
            if (!row?.id || !row.deletedAt) continue;
            const ms = Date.parse(row.deletedAt);
            if (!Number.isFinite(ms)) continue;
            const prev = map.get(row.id);
            if (!prev || ms > prev) map.set(row.id, ms);
        }
        return map;
    }

    filterJobsByTombstones(jobs, tombstones) {
        const jobTs = (job) => {
            const raw = job?.updatedAt || job?.createdAt;
            const ms = raw ? Date.parse(raw) : 0;
            return Number.isFinite(ms) ? ms : 0;
        };
        return (jobs || []).filter((job) => {
            if (!job?.id) return false;
            const deletedMs = tombstones.get(job.id);
            if (!deletedMs) return true;
            return jobTs(job) > deletedMs;
        });
    }

    pickMirrorPayload(situation, archive) {
        const deletedJobs = [
            ...(situation?.deletedJobs || []),
            ...(archive?.deletedJobs || []),
        ];
        const tombstones = this.buildTombstoneMap(deletedJobs);
        const merged = this.mergeJobs(situation?.jobs, archive?.jobs);
        const jobs = this.filterJobsByTombstones(merged, tombstones);
        const sTs = situation?.updatedAt ? Date.parse(situation.updatedAt) : 0;
        const aTs = archive?.updatedAt ? Date.parse(archive.updatedAt) : 0;
        const updatedAt =
            sTs >= aTs ? situation?.updatedAt || archive?.updatedAt : archive?.updatedAt || situation?.updatedAt;
        const tombstonePayload = [...tombstones.entries()].map(([id, ms]) => ({
            id,
            deletedAt: new Date(ms).toISOString(),
        }));
        return { jobs, deletedJobs: tombstonePayload, updatedAt };
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
            archiveRoot: this.archiveRoot || null,
            tenantId: this.tenantId || null,
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
                    const mirror = this.pickMirrorPayload(situation, archive);

                    res.writeHead(200, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({
                        tenantId,
                        version: situation?.version ?? archive?.version ?? 1,
                        updatedAt: mirror.updatedAt,
                        companyName: situation?.companyName,
                        kanbanLayout: situation?.kanbanLayout,
                        statusDefinitions: situation?.statusDefinitions,
                        jobs: mirror.jobs,
                        deletedJobs: mirror.deletedJobs,
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
                        const situation = this.readJsonFile(SITUATION_FILE);
                        const tombstones = this.buildTombstoneMap([
                            ...(situation?.deletedJobs || []),
                            ...(archive?.deletedJobs || []),
                        ]);
                        const merged = this.filterJobsByTombstones(
                            this.mergeJobs(archive?.jobs, jobs),
                            tombstones
                        );
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
                        if (situation) {
                            const sitMerged = this.filterJobsByTombstones(
                                this.mergeJobs(situation.jobs, jobs),
                                tombstones
                            );
                            this.writeJsonFile(SITUATION_FILE, {
                                ...situation,
                                tenantId,
                                updatedAt: now,
                                jobs: sitMerged,
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

                if (url.pathname === '/api/v1/chat' && req.method === 'GET') {
                    if (!this.isAuthorized(req, url)) {
                        res.writeHead(401, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
                        res.end(JSON.stringify({ ok: false, error: 'unauthorized' }));
                        return;
                    }
                    const tenantId = url.searchParams.get('tenantId') || this.tenantId;
                    const chat = this.readJsonFile(CHAT_FILE) || {
                        version: 1,
                        tenantId,
                        updatedAt: new Date().toISOString(),
                        messages: [],
                    };
                    res.writeHead(200, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({
                        version: chat.version ?? 1,
                        tenantId,
                        updatedAt: chat.updatedAt || new Date().toISOString(),
                        messages: Array.isArray(chat.messages) ? chat.messages : [],
                    }));
                    return;
                }

                if (url.pathname === '/api/v1/chat' && req.method === 'POST') {
                    if (!this.isAuthorized(req, url)) {
                        res.writeHead(401, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
                        res.end(JSON.stringify({ ok: false, error: 'unauthorized' }));
                        return;
                    }
                    if (!this.archiveRoot) {
                        res.writeHead(503, CORS);
                        res.end('NAS path not configured');
                        return;
                    }
                    try {
                        const raw = await readRequestBody(req);
                        const body = JSON.parse(raw || '{}');
                        const incoming = Array.isArray(body.messages) ? body.messages : [];
                        const tenantId = body.tenantId || this.tenantId;
                        const existing = this.readJsonFile(CHAT_FILE);
                        const map = new Map();
                        for (const m of existing?.messages || []) {
                            if (m?.id) map.set(m.id, m);
                        }
                        for (const m of incoming) {
                            if (!m?.id) continue;
                            const prev = map.get(m.id);
                            if (!prev) {
                                map.set(m.id, m);
                                continue;
                            }
                            const prevTs = Date.parse(prev.timestamp || prev.createdAt || '') || 0;
                            const nextTs = Date.parse(m.timestamp || m.createdAt || '') || 0;
                            map.set(m.id, nextTs >= prevTs ? { ...prev, ...m } : prev);
                        }
                        let messages = [...map.values()].sort((a, b) => {
                            const ta = Date.parse(a.timestamp || a.createdAt || '') || 0;
                            const tb = Date.parse(b.timestamp || b.createdAt || '') || 0;
                            return ta - tb;
                        });
                        const MAX = 5000;
                        if (messages.length > MAX) messages = messages.slice(messages.length - MAX);
                        const now = new Date().toISOString();
                        const payload = {
                            version: 1,
                            tenantId,
                            updatedAt: now,
                            messages,
                        };
                        if (!this.writeJsonFile(CHAT_FILE, payload)) {
                            res.writeHead(500, CORS);
                            res.end('write failed');
                            return;
                        }
                        res.writeHead(200, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
                        res.end(JSON.stringify({ ok: true, updatedAt: now, count: messages.length }));
                        return;
                    } catch (error) {
                        res.writeHead(400, CORS);
                        res.end(error?.message || 'invalid body');
                        return;
                    }
                }

                if (url.pathname === '/api/v1/mirror' && req.method === 'POST') {
                    if (!this.isAuthorized(req, url)) {
                        res.writeHead(401, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
                        res.end(JSON.stringify({ ok: false, error: 'unauthorized' }));
                        return;
                    }
                    if (!this.archiveRoot) {
                        res.writeHead(503, CORS);
                        res.end('NAS path not configured');
                        return;
                    }
                    try {
                        const raw = await readRequestBody(req);
                        const body = JSON.parse(raw || '{}');
                        const tenantId = body.tenantId || this.tenantId;
                        const now = new Date().toISOString();
                        const existing = this.readJsonFile(SITUATION_FILE);
                        const incomingJobs = Array.isArray(body.jobs) ? body.jobs : [];
                        const tombstones = this.buildTombstoneMap([
                            ...(existing?.deletedJobs || []),
                            ...(body.deletedJobs || []),
                        ]);
                        const mergedJobs = this.filterJobsByTombstones(
                            this.mergeJobs(existing?.jobs, incomingJobs),
                            tombstones
                        );
                        const clientsMap = new Map();
                        for (const c of existing?.clients || []) {
                            if (c?.id) clientsMap.set(c.id, c);
                        }
                        for (const c of body.clients || []) {
                            if (c?.id) clientsMap.set(c.id, c);
                        }
                        const payload = {
                            version: body.version ?? existing?.version ?? 1,
                            tenantId,
                            updatedAt: now,
                            companyName: body.companyName || existing?.companyName,
                            kanbanLayout: body.kanbanLayout || existing?.kanbanLayout,
                            statusDefinitions: body.statusDefinitions || existing?.statusDefinitions,
                            jobs: mergedJobs,
                            deletedJobs: [...tombstones.entries()].map(([id, ms]) => ({
                                id,
                                deletedAt: new Date(ms).toISOString(),
                            })),
                            clients: [...clientsMap.values()],
                            settings: body.settings || existing?.settings || {},
                            staff: body.staff || existing?.staff || [],
                        };
                        if (!this.writeJsonFile(SITUATION_FILE, payload)) {
                            res.writeHead(500, CORS);
                            res.end('write failed');
                            return;
                        }
                        const archive = this.readJsonFile(ARCHIVE_FILE);
                        if (archive || incomingJobs.length) {
                            const archMerged = this.filterJobsByTombstones(
                                this.mergeJobs(archive?.jobs, incomingJobs),
                                tombstones
                            );
                            this.writeJsonFile(ARCHIVE_FILE, {
                                version: archive?.version ?? 1,
                                tenantId,
                                updatedAt: now,
                                jobs: archMerged,
                                deletedJobs: payload.deletedJobs,
                            });
                        }
                        res.writeHead(200, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
                        res.end(JSON.stringify({ ok: true, updatedAt: now, count: mergedJobs.length }));
                        return;
                    } catch (error) {
                        res.writeHead(400, CORS);
                        res.end(error?.message || 'invalid body');
                        return;
                    }
                }

                if (url.pathname === '/api/v1/presence' && req.method === 'GET') {
                    if (!this.isAuthorized(req, url)) {
                        res.writeHead(401, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
                        res.end(JSON.stringify({ ok: false, error: 'unauthorized' }));
                        return;
                    }
                    const tenantId = url.searchParams.get('tenantId') || this.tenantId;
                    const presence = this.readJsonFile(PRESENCE_FILE) || {
                        version: 1,
                        tenantId,
                        updatedAt: new Date().toISOString(),
                        sessions: {},
                    };
                    res.writeHead(200, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({
                        version: presence.version ?? 1,
                        tenantId,
                        updatedAt: presence.updatedAt || new Date().toISOString(),
                        sessions: presence.sessions && typeof presence.sessions === 'object'
                            ? presence.sessions
                            : {},
                    }));
                    return;
                }

                if (url.pathname === '/api/v1/presence' && req.method === 'POST') {
                    if (!this.isAuthorized(req, url)) {
                        res.writeHead(401, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
                        res.end(JSON.stringify({ ok: false, error: 'unauthorized' }));
                        return;
                    }
                    if (!this.archiveRoot) {
                        res.writeHead(503, CORS);
                        res.end('NAS path not configured');
                        return;
                    }
                    try {
                        const raw = await readRequestBody(req);
                        const body = JSON.parse(raw || '{}');
                        const tenantId = body.tenantId || this.tenantId;
                        const now = new Date().toISOString();
                        const existing = this.readJsonFile(PRESENCE_FILE);
                        const sessions = {
                            ...(existing?.sessions && typeof existing.sessions === 'object'
                                ? existing.sessions
                                : {}),
                            ...(body.sessions && typeof body.sessions === 'object' ? body.sessions : {}),
                        };
                        const payload = {
                            version: body.version ?? existing?.version ?? 1,
                            tenantId,
                            updatedAt: now,
                            sessions,
                        };
                        if (!this.writeJsonFile(PRESENCE_FILE, payload)) {
                            res.writeHead(500, CORS);
                            res.end('write failed');
                            return;
                        }
                        res.writeHead(200, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
                        res.end(JSON.stringify({
                            ok: true,
                            updatedAt: now,
                            count: Object.keys(sessions).length,
                        }));
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
