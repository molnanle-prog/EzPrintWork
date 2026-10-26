const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SITUATION_FILE = 'situation-mirror.json';
const ARCHIVE_FILE = 'jobs-archive.json';
const BOARD_LIVE_FILE = 'board-live.json';
const BOARD_LIVE_LIMIT = 25;
const CHAT_FILE = 'chat-messages.json';
const CHAT_LIVE_FILE = 'chat-live.json';
const CHAT_LIVE_LIMIT = 40;
const CHAT_ARCHIVE_FOLDER = 'chat-archive';
const HOT_CHAT_LIMIT = 300;
const PRESENCE_FILE = 'presence-sessions.json';
const UI_PREFS_FILE = 'ui-prefs.json';
const AUX_FILES = {
    quotes: 'quotes-live.json',
    papers: 'papers-live.json',
    leaves: 'leaves-live.json',
    instructions: 'instructions-live.json',
};
const SMS_PREPAID_INBOX_FILE = 'sms-prepaid-inbox.json';
const DEFAULT_GATEWAY_PORT = 3847;

const BASE_CORS = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Ezpw-Gateway-Token',
    'Access-Control-Max-Age': '600',
};
const MAX_REQUEST_BODY_BYTES = 12 * 1024 * 1024;

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
            if (Buffer.byteLength(data, 'utf8') > MAX_REQUEST_BODY_BYTES) {
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
        // 매장 PC가 게시한 시크릿(우선). 없으면 레거시 derive만으로도 웹 호환 가능
        const token = String(gatewayToken || '').trim();
        this.gatewayToken = token.length >= 16 ? token : null;
    }

    corsHeaders(req) {
        const origin = String(req.headers.origin || '').trim();
        if (!origin) return BASE_CORS;
        try {
            const parsed = new URL(origin);
            const allowed =
                parsed.protocol === 'file:'
                || ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && (
                    parsed.hostname === 'localhost'
                    || parsed.hostname === '127.0.0.1'
                    || parsed.hostname === 'ez-hub.kr'
                ));
            return allowed
                ? { ...BASE_CORS, 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }
                : BASE_CORS;
        } catch {
            return BASE_CORS;
        }
    }

    isOriginAllowed(req) {
        const origin = String(req.headers.origin || '').trim();
        return !origin || Object.prototype.hasOwnProperty.call(this.corsHeaders(req), 'Access-Control-Allow-Origin');
    }

    resolveTenantId(requested) {
        const configured = String(this.tenantId || '').trim();
        const candidate = String(requested || configured).trim();
        if (!configured || !candidate || candidate !== configured) {
            throw new Error('tenant mismatch');
        }
        return configured;
    }

    isAuthorized(req, url) {
        const headerToken = req.headers['x-ezpw-gateway-token'];
        const queryToken = url.searchParams.get('token');
        const provided = (headerToken || queryToken || '').trim();
        if (!provided) return false;

        // 1) 저장된 시크릿 일치
        if (this.gatewayToken && provided === this.gatewayToken) return true;

        // 2) 시크릿이 아직 발급되지 않은 구버전만 계산형 토큰을 임시 허용
        if (!this.gatewayToken && this.tenantId) {
            const legacy = deriveStoreGatewayToken(this.tenantId);
            if (legacy && provided === legacy) return true;
        }

        // 시크릿·레거시 모두 없으면 거부 (개방 금지)
        return false;
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

    jobRev(job) {
        const rev = job && job.rev;
        return typeof rev === 'number' && Number.isFinite(rev) ? rev : -1;
    }

    isNewerJob(incoming, prev) {
        const ri = this.jobRev(incoming);
        const rp = this.jobRev(prev);
        if (ri >= 0 || rp >= 0) {
            if (ri !== rp) return ri > rp;
        }
        const ti = Date.parse((incoming && (incoming.updatedAt || incoming.createdAt)) || '') || 0;
        const tp = Date.parse((prev && (prev.updatedAt || prev.createdAt)) || '') || 0;
        return ti >= tp;
    }

    chatTime(message) {
        return Date.parse((message && (message.timestamp || message.createdAt)) || '') || 0;
    }

    isChatIdNewer(nextId, prevId) {
        const head = (value) => {
            const raw = String(value || '').split('-')[0];
            return /^\d{10,}$/.test(raw) ? Number(raw) : NaN;
        };
        const a = head(nextId);
        const b = head(prevId);
        if (Number.isFinite(a) && Number.isFinite(b) && a !== b) return a >= b;
        return String(nextId || '') >= String(prevId || '');
    }

    /** 새 글 신호. 전체 대화 대신 최근 글만 남긴다. */
    publishChatLive(messages, reads) {
        if (!this.archiveRoot) return false;
        const incoming = (Array.isArray(messages) ? messages : [])
            .filter((m) => m && m.id)
            .slice(-CHAT_LIVE_LIMIT);
        const incomingReads = reads && typeof reads === 'object' ? reads : {};
        if (!incoming.length && !Object.keys(incomingReads).length) return false;
        const filePath = path.join(this.archiveRoot, CHAT_LIVE_FILE);
        for (let attempt = 0; attempt < 3; attempt++) {
            const exists = fs.existsSync(filePath);
            const current = this.readJsonFile(CHAT_LIVE_FILE);
            if (exists && !current) return false;
            const base = current || { seq: 0, messages: [], reads: {} };
            const map = new Map();
            for (const m of Array.isArray(base.messages) ? base.messages : []) {
                if (m && m.id) map.set(m.id, m);
            }
            for (const m of incoming) {
                const prev = map.get(m.id);
                if (!prev || this.chatTime(m) >= this.chatTime(prev)) map.set(m.id, m);
            }
            const nextMessages = Array.from(map.values())
                .sort((a, b) => this.chatTime(a) - this.chatTime(b))
                .slice(-CHAT_LIVE_LIMIT);
            const nextReads = { ...(base.reads && typeof base.reads === 'object' ? base.reads : {}) };
            for (const [staffId, msgId] of Object.entries(incomingReads)) {
                if (!staffId || !msgId) continue;
                const prev = nextReads[staffId];
                if (!prev || this.isChatIdNewer(msgId, prev)) nextReads[staffId] = msgId;
            }
            const wrote = this.writeJsonFile(CHAT_LIVE_FILE, {
                version: 1,
                tenantId: this.tenantId,
                seq: (Number(base.seq) || 0) + 1,
                updatedAt: new Date().toISOString(),
                messages: nextMessages,
                reads: nextReads,
                expectedGeneration: exists ? (Number(base.generation) || 0) : 0,
            });
            if (!wrote) continue;
            const verify = this.readJsonFile(CHAT_LIVE_FILE);
            const held = incoming.every((m) =>
                (Array.isArray(verify?.messages) ? verify.messages : []).some((row) => row && row.id === m.id)
            );
            const readsHeld = Object.entries(incomingReads).every(([staffId, msgId]) => {
                const row = verify?.reads?.[staffId];
                return !!row && this.isChatIdNewer(row, msgId);
            });
            if (held && readsHeld) return true;
        }
        return false;
    }

    /** 칸 이동 신호. 전체 목록 대신 바뀐 작업만 남긴다. */
    publishBoardLive(jobs) {
        const incoming = (Array.isArray(jobs) ? jobs : []).filter((job) => job && job.id).slice(0, BOARD_LIVE_LIMIT);
        if (!incoming.length) return false;
        const current = this.readJsonFile(BOARD_LIVE_FILE) || { seq: 0, changes: [] };
        const map = new Map();
        for (const job of Array.isArray(current.changes) ? current.changes : []) {
            if (job && job.id) map.set(job.id, job);
        }
        for (const job of incoming) {
            const prev = map.get(job.id);
            if (!prev || this.isNewerJob(job, prev)) map.set(job.id, job);
        }
        const changes = Array.from(map.values())
            .sort((a, b) => Date.parse(a.updatedAt || a.createdAt || '') - Date.parse(b.updatedAt || b.createdAt || ''))
            .slice(-BOARD_LIVE_LIMIT);
        return this.writeJsonFile(BOARD_LIVE_FILE, {
            version: 1,
            tenantId: this.tenantId,
            seq: (Number(current.seq) || 0) + 1,
            updatedAt: new Date().toISOString(),
            changes,
        });
    }

    writeJsonFile(name, payload) {
        if (!this.archiveRoot) return false;
        const filePath = path.join(this.archiveRoot, name);
        const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
        let fd = null;
        try {
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            let currentGeneration = 0;
            if (fs.existsSync(filePath)) {
                try {
                    const current = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                    currentGeneration = Number(current?.generation) || 0;
                    if (
                        Number.isFinite(payload?.expectedGeneration)
                        && Number(payload.expectedGeneration) !== currentGeneration
                    ) {
                        const conflictDir = path.join(this.archiveRoot, 'conflicts');
                        fs.mkdirSync(conflictDir, { recursive: true });
                        fs.writeFileSync(
                            path.join(conflictDir, `${name}.${Date.now()}.json`),
                            JSON.stringify(payload, null, 2),
                            'utf8'
                        );
                        return false;
                    }
                } catch {
                    const conflictDir = path.join(this.archiveRoot, 'conflicts');
                    fs.mkdirSync(conflictDir, { recursive: true });
                    fs.copyFileSync(filePath, path.join(conflictDir, `${name}.corrupt.${Date.now()}`));
                }
            }
            const next = {
                ...payload,
                generation: currentGeneration + 1,
            };
            delete next.expectedGeneration;
            fd = fs.openSync(tmpPath, 'w');
            fs.writeFileSync(fd, JSON.stringify(next, null, 2), 'utf8');
            fs.fsyncSync(fd);
            fs.closeSync(fd);
            fd = null;
            fs.renameSync(tmpPath, filePath);
            return true;
        } catch (error) {
            try { if (fd != null) fs.closeSync(fd); } catch { /* ignore */ }
            try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch { /* ignore */ }
            console.warn('[LocalGateway] write failed:', filePath, error.message);
            return false;
        }
    }

    messageTime(m) {
        const ms = Date.parse(m?.timestamp || m?.createdAt || '');
        return Number.isFinite(ms) ? ms : 0;
    }

    monthKeyFromMessage(m) {
        const t = this.messageTime(m);
        const d = t > 0 ? new Date(t) : new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }

    /** 핫 윈도우에서 밀려난 메시지를 월별 아카이브에 보관 */
    archiveChatOverflow(tenantId, overflow) {
        if (!this.archiveRoot || !Array.isArray(overflow) || overflow.length === 0) return;
        const byMonth = new Map();
        for (const m of overflow) {
            if (!m?.id) continue;
            const key = this.monthKeyFromMessage(m);
            const list = byMonth.get(key) || [];
            list.push(m);
            byMonth.set(key, list);
        }
        for (const [month, msgs] of byMonth) {
            const rel = path.join(CHAT_ARCHIVE_FOLDER, `${month}.json`);
            const existing = this.readJsonFile(rel);
            const map = new Map();
            for (const m of existing?.messages || []) {
                if (m?.id) map.set(m.id, m);
            }
            for (const m of msgs) {
                if (!m?.id) continue;
                const prev = map.get(m.id);
                if (!prev) {
                    map.set(m.id, m);
                    continue;
                }
                map.set(m.id, this.messageTime(m) >= this.messageTime(prev) ? { ...prev, ...m } : prev);
            }
            const merged = [...map.values()].sort((a, b) => this.messageTime(a) - this.messageTime(b));
            this.writeJsonFile(rel, {
                version: 1,
                tenantId,
                updatedAt: new Date().toISOString(),
                messages: merged,
            });
        }
    }

    /** beforeMs 이전 메시지 중 최근 pageSize개 (아카이브 역순) */
    loadOlderChatMessages(beforeMs, pageSize, excludeIds) {
        const collected = [];
        const exclude = excludeIds instanceof Set ? excludeIds : new Set(excludeIds || []);
        const cursor = new Date(beforeMs);
        for (let i = 0; i < 24 && collected.length < pageSize + 1; i++) {
            const y = cursor.getFullYear();
            const mo = String(cursor.getMonth() + 1).padStart(2, '0');
            const rel = path.join(CHAT_ARCHIVE_FOLDER, `${y}-${mo}.json`);
            const parsed = this.readJsonFile(rel);
            for (const m of parsed?.messages || []) {
                if (!m?.id || exclude.has(m.id)) continue;
                const t = this.messageTime(m);
                if (t > 0 && t < beforeMs) collected.push(m);
            }
            cursor.setMonth(cursor.getMonth() - 1);
        }
        collected.sort((a, b) => this.messageTime(a) - this.messageTime(b));
        const hasMore = collected.length > pageSize;
        const messages = hasMore ? collected.slice(collected.length - pageSize) : collected;
        return { messages, hasMore };
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

    clientTimestampMs(client) {
        const raw = client?.updatedAt || client?.createdAt;
        const ms = raw ? Date.parse(raw) : 0;
        return Number.isFinite(ms) ? ms : 0;
    }

    isIncomingClientNewer(incoming, prev) {
        const ri = typeof incoming?.rev === 'number' && Number.isFinite(incoming.rev) ? incoming.rev : -1;
        const rp = typeof prev?.rev === 'number' && Number.isFinite(prev.rev) ? prev.rev : -1;
        if (ri >= 0 || rp >= 0) {
            if (ri !== rp) return ri > rp;
        }
        return this.clientTimestampMs(incoming) >= this.clientTimestampMs(prev);
    }

    mergeClients(existing, incoming) {
        const map = new Map();
        for (const c of existing || []) {
            if (c?.id) map.set(c.id, c);
        }
        for (const c of incoming || []) {
            if (!c?.id) continue;
            const prev = map.get(c.id);
            if (!prev) {
                map.set(c.id, c);
                continue;
            }
            map.set(c.id, this.isIncomingClientNewer(c, prev) ? { ...prev, ...c } : prev);
        }
        return [...map.values()];
    }

    filterClientsByTombstones(clients, tombstones) {
        return (clients || []).filter((c) => {
            if (!c?.id) return false;
            const deletedMs = tombstones.get(c.id);
            if (!deletedMs) return true;
            return this.clientTimestampMs(c) > deletedMs;
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
                const CORS = this.corsHeaders(req);
                if (req.method === 'OPTIONS') {
                    if (!this.isOriginAllowed(req)) {
                        res.writeHead(403, CORS);
                        res.end();
                        return;
                    }
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

                const queryTenantId = url.searchParams.get('tenantId');
                if (
                    queryTenantId
                    && this.tenantId
                    && queryTenantId !== this.tenantId
                ) {
                    res.writeHead(403, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ ok: false, error: 'tenant-mismatch' }));
                    return;
                }
                if (!this.isOriginAllowed(req)) {
                    res.writeHead(403, CORS);
                    res.end('Origin not allowed');
                    return;
                }

                if (url.pathname === '/health') {
                    // NAS 경로·tenantId 등 민감 정보는 토큰 있을 때만 노출
                    const info = this.isAuthorized(req, url)
                        ? this.getInfo()
                        : { port: this.port, okHint: true };
                    res.writeHead(200, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({
                        ok: true,
                        ...info,
                        authRequired: !!this.gatewayToken,
                    }));
                    return;
                }

                if (url.pathname === '/api/v1/sms-prepaid-notice' && req.method === 'POST') {
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
                        const rawBody = await readRequestBody(req);
                        let text = String(url.searchParams.get('text') || '').trim();
                        if (!text && rawBody) {
                            try {
                                const parsed = JSON.parse(rawBody);
                                text = String(parsed?.text || parsed?.body || parsed?.message || '').trim();
                            } catch {
                                text = String(rawBody).trim();
                            }
                        }
                        if (!text) {
                            res.writeHead(400, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
                            res.end(JSON.stringify({ ok: false, error: 'empty text' }));
                            return;
                        }
                        const existing = this.readJsonFile(SMS_PREPAID_INBOX_FILE) || {};
                        const items = Array.isArray(existing.items) ? existing.items : [];
                        items.push({
                            id: `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
                            text: text.slice(0, 800),
                            at: new Date().toISOString(),
                        });
                        const ok = this.writeJsonFile(SMS_PREPAID_INBOX_FILE, {
                            version: 1,
                            tenantId: this.tenantId,
                            updatedAt: new Date().toISOString(),
                            items: items.slice(-50),
                        });
                        if (!ok) {
                            res.writeHead(500, CORS);
                            res.end('write failed');
                            return;
                        }
                        res.writeHead(200, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
                        res.end(JSON.stringify({ ok: true }));
                        return;
                    } catch (error) {
                        res.writeHead(400, CORS);
                        res.end(error?.message || 'invalid body');
                        return;
                    }
                }

                if (url.pathname === '/api/v1/sms-prepaid-inbox' && req.method === 'GET') {
                    if (!this.isAuthorized(req, url)) {
                        res.writeHead(401, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
                        res.end(JSON.stringify({ ok: false, error: 'unauthorized' }));
                        return;
                    }
                    const existing = this.readJsonFile(SMS_PREPAID_INBOX_FILE) || {};
                    const items = Array.isArray(existing.items) ? existing.items : [];
                    if (url.searchParams.get('drain') === '1') {
                        this.writeJsonFile(SMS_PREPAID_INBOX_FILE, {
                            version: 1,
                            tenantId: this.tenantId,
                            updatedAt: new Date().toISOString(),
                            items: [],
                        });
                    }
                    res.writeHead(200, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ ok: true, items }));
                    return;
                }

                if (url.pathname === '/api/v1/quote-header' && req.method === 'GET') {
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
                    const names = ['quote-header.png', 'quote-header.jpg', 'quote-header.jpeg', 'quote-header.webp'];
                    let found = null;
                    for (const name of names) {
                        const filePath = path.join(this.archiveRoot, name);
                        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
                            found = filePath;
                            break;
                        }
                    }
                    if (!found) {
                        res.writeHead(404, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
                        res.end(JSON.stringify({ ok: false, error: 'not-found' }));
                        return;
                    }
                    const ext = path.extname(found).toLowerCase();
                    const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
                    const buf = fs.readFileSync(found);
                    res.writeHead(200, { ...CORS, 'Content-Type': mime, 'Cache-Control': 'no-cache' });
                    res.end(buf);
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
                        const deletedIncoming = Array.isArray(body.deletedJobs) ? body.deletedJobs : [];
                        if (jobs.length === 0 && deletedIncoming.length === 0) {
                            res.writeHead(400, CORS);
                            res.end('jobs required');
                            return;
                        }
                        const tenantId = this.resolveTenantId(body.tenantId);
                        const now = new Date().toISOString();
                        const archive = this.readJsonFile(ARCHIVE_FILE);
                        const situation = this.readJsonFile(SITUATION_FILE);
                        const tombstones = this.buildTombstoneMap([
                            ...(situation?.deletedJobs || []),
                            ...(archive?.deletedJobs || []),
                            ...deletedIncoming,
                        ]);
                        const deletedJobs = [...tombstones.entries()].map(([id, ms]) => ({
                            id,
                            deletedAt: new Date(ms).toISOString(),
                        }));
                        const merged = this.filterJobsByTombstones(
                            this.mergeJobs(archive?.jobs, jobs),
                            tombstones
                        );
                        const archivePayload = {
                            version: archive?.version ?? 1,
                            tenantId,
                            updatedAt: now,
                            jobs: merged,
                            deletedJobs,
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
                                deletedJobs,
                            });
                        }
                        this.publishBoardLive(jobs);
                        res.writeHead(200, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
                        res.end(JSON.stringify({ ok: true, updatedAt: now, count: jobs.length }));
                        return;
                    } catch (error) {
                        res.writeHead(400, CORS);
                        res.end(error?.message || 'invalid body');
                        return;
                    }
                }

                if (url.pathname === '/api/v1/board-live' && req.method === 'GET') {
                    if (!this.isAuthorized(req, url)) {
                        res.writeHead(401, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
                        res.end(JSON.stringify({ ok: false, error: 'unauthorized' }));
                        return;
                    }
                    const live = this.readJsonFile(BOARD_LIVE_FILE) || {
                        version: 1,
                        tenantId: this.tenantId,
                        seq: 0,
                        updatedAt: null,
                        changes: [],
                    };
                    res.writeHead(200, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({
                        seq: Number(live.seq) || 0,
                        updatedAt: live.updatedAt || null,
                        changes: Array.isArray(live.changes) ? live.changes : [],
                    }));
                    return;
                }

                if (url.pathname === '/api/v1/chat-live' && req.method === 'GET') {
                    if (!this.isAuthorized(req, url)) {
                        res.writeHead(401, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
                        res.end(JSON.stringify({ ok: false, error: 'unauthorized' }));
                        return;
                    }
                    const live = this.readJsonFile(CHAT_LIVE_FILE) || {
                        version: 1,
                        tenantId: this.tenantId,
                        seq: 0,
                        updatedAt: null,
                        messages: [],
                        reads: {},
                    };
                    res.writeHead(200, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({
                        seq: Number(live.seq) || 0,
                        updatedAt: live.updatedAt || null,
                        messages: Array.isArray(live.messages) ? live.messages : [],
                        reads: live.reads && typeof live.reads === 'object' ? live.reads : {},
                    }));
                    return;
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
                        reads: chat.reads && typeof chat.reads === 'object' ? chat.reads : {},
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
                        const incomingReads =
                            body.reads && typeof body.reads === 'object' ? body.reads : {};
                        const tenantId = this.resolveTenantId(body.tenantId);
                        const chatPath = path.join(this.archiveRoot, CHAT_FILE);
                        const chatExists = fs.existsSync(chatPath);
                        const existing = this.readJsonFile(CHAT_FILE);
                        if (chatExists && !existing) {
                            res.writeHead(500, CORS);
                            res.end('chat file unreadable');
                            return;
                        }
                        const live = this.readJsonFile(CHAT_LIVE_FILE);
                        const map = new Map();
                        for (const m of existing?.messages || []) {
                            if (m?.id) map.set(m.id, m);
                        }
                        for (const m of Array.isArray(live?.messages) ? live.messages : []) {
                            if (m?.id && !map.has(m.id)) map.set(m.id, m);
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
                        if (messages.length > HOT_CHAT_LIMIT) {
                            const overflow = messages.slice(0, messages.length - HOT_CHAT_LIMIT);
                            this.archiveChatOverflow(tenantId, overflow);
                            messages = messages.slice(messages.length - HOT_CHAT_LIMIT);
                        }
                        const reads = {
                            ...(existing?.reads || {}),
                            ...(live?.reads && typeof live.reads === 'object' ? live.reads : {}),
                        };
                        for (const [staffId, msgId] of Object.entries(reads)) {
                            const fromFile = existing?.reads?.[staffId];
                            if (fromFile && this.isChatIdNewer(fromFile, msgId)) reads[staffId] = fromFile;
                        }
                        for (const [staffId, msgId] of Object.entries(incomingReads)) {
                            if (!staffId || !msgId) continue;
                            const prev = reads[staffId];
                            if (!prev || this.isChatIdNewer(msgId, prev)) reads[staffId] = msgId;
                        }
                        const now = new Date().toISOString();
                        const payload = {
                            version: 1,
                            tenantId,
                            updatedAt: now,
                            messages,
                            reads,
                        };
                        if (!this.writeJsonFile(CHAT_FILE, {
                            ...payload,
                            expectedGeneration: chatExists ? (Number(existing?.generation) || 0) : 0,
                        })) {
                            res.writeHead(500, CORS);
                            res.end('write failed');
                            return;
                        }
                        const beforeIds = new Set((existing?.messages || []).map((m) => m && m.id).filter(Boolean));
                        const added = incoming.filter((m) => m && m.id && !beforeIds.has(m.id));
                        this.publishChatLive(added, reads);
                        res.writeHead(200, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
                        res.end(JSON.stringify({ ok: true, updatedAt: now, count: messages.length }));
                        return;
                    } catch (error) {
                        res.writeHead(400, CORS);
                        res.end(error?.message || 'invalid body');
                        return;
                    }
                }

                if (url.pathname === '/api/v1/chat/older' && req.method === 'GET') {
                    if (!this.isAuthorized(req, url)) {
                        res.writeHead(401, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
                        res.end(JSON.stringify({ ok: false, error: 'unauthorized' }));
                        return;
                    }
                    const beforeRaw = url.searchParams.get('before') || '';
                    const beforeMs = Date.parse(beforeRaw) || Date.now();
                    const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '40', 10) || 40));
                    const excludeRaw = url.searchParams.get('exclude') || '';
                    const excludeIds = new Set(
                        excludeRaw
                            .split(',')
                            .map((s) => s.trim())
                            .filter(Boolean)
                            .slice(0, 500)
                    );
                    const result = this.loadOlderChatMessages(beforeMs, pageSize, excludeIds);
                    res.writeHead(200, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({
                        ok: true,
                        messages: result.messages,
                        hasMore: result.hasMore,
                    }));
                    return;
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
                        const tenantId = this.resolveTenantId(body.tenantId);
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
                        const clientTombs = this.buildTombstoneMap([
                            ...(existing?.deletedClients || []),
                            ...(body.deletedClients || []),
                        ]);
                        const mergedClients = this.filterClientsByTombstones(
                            this.mergeClients(existing?.clients, body.clients),
                            clientTombs
                        );
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
                            deletedClients: [...clientTombs.entries()].map(([id, ms]) => ({
                                id,
                                deletedAt: new Date(ms).toISOString(),
                            })),
                            clients: mergedClients,
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
                        identities: presence.identities && typeof presence.identities === 'object'
                            ? presence.identities
                            : {},
                    }));
                    return;
                }

                const auxMatch = url.pathname.match(/^\/api\/v1\/aux\/(quotes|papers|leaves|instructions)$/);
                if (auxMatch && req.method === 'GET') {
                    if (!this.isAuthorized(req, url)) {
                        res.writeHead(401, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
                        res.end(JSON.stringify({ ok: false, error: 'unauthorized' }));
                        return;
                    }
                    const collection = auxMatch[1];
                    const fileName = AUX_FILES[collection];
                    const tenantId = url.searchParams.get('tenantId') || this.tenantId;
                    const payload = this.readJsonFile(fileName) || {
                        version: 1,
                        tenantId,
                        collection,
                        updatedAt: new Date().toISOString(),
                        items: [],
                    };
                    res.writeHead(200, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({
                        version: payload.version ?? 1,
                        tenantId,
                        collection,
                        updatedAt: payload.updatedAt || new Date().toISOString(),
                        items: Array.isArray(payload.items) ? payload.items : [],
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
                        const tenantId = this.resolveTenantId(body.tenantId);
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

                if (url.pathname === '/api/v1/ui-prefs' && req.method === 'GET') {
                    if (!this.isAuthorized(req, url)) {
                        res.writeHead(401, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
                        res.end(JSON.stringify({ ok: false, error: 'unauthorized' }));
                        return;
                    }
                    const tenantId = url.searchParams.get('tenantId') || this.tenantId;
                    const prefs = this.readJsonFile(UI_PREFS_FILE) || {
                        version: 1,
                        tenantId,
                        updatedAt: new Date().toISOString(),
                        users: {},
                    };
                    res.writeHead(200, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({
                        version: prefs.version ?? 1,
                        tenantId,
                        updatedAt: prefs.updatedAt || new Date().toISOString(),
                        users: prefs.users && typeof prefs.users === 'object' && !Array.isArray(prefs.users)
                            ? prefs.users
                            : {},
                    }));
                    return;
                }

                if (url.pathname === '/api/v1/ui-prefs' && req.method === 'POST') {
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
                        const tenantId = this.resolveTenantId(body.tenantId);
                        const userKey = String(body.userKey || '').trim().toLowerCase();
                        if (!userKey) {
                            res.writeHead(400, CORS);
                            res.end('userKey required');
                            return;
                        }
                        const now = new Date().toISOString();
                        const existing = this.readJsonFile(UI_PREFS_FILE);
                        const users = {
                            ...(existing?.users && typeof existing.users === 'object' && !Array.isArray(existing.users)
                                ? existing.users
                                : {}),
                        };
                        users[userKey] = {
                            hiddenBoardStatusKeys: Array.isArray(body.hiddenBoardStatusKeys)
                                ? body.hiddenBoardStatusKeys.filter((k) => typeof k === 'string')
                                : [],
                            updatedAt: now,
                        };
                        const payload = {
                            version: body.version ?? existing?.version ?? 1,
                            tenantId,
                            updatedAt: now,
                            users,
                        };
                        if (!this.writeJsonFile(UI_PREFS_FILE, payload)) {
                            res.writeHead(500, CORS);
                            res.end('write failed');
                            return;
                        }
                        res.writeHead(200, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
                        res.end(JSON.stringify({ ok: true, updatedAt: now, userKey }));
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
