const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');

let db = null;

const AUX_TABLES = ['quotes', 'papers', 'leaves', 'instructions'];

function getDbPath() {
    const { app } = require('electron');
    return path.join(app.getPath('userData'), 'ezprintwork-local.db');
}

function ensureAuxTables(database) {
    for (const table of AUX_TABLES) {
        database.exec(`
            CREATE TABLE IF NOT EXISTS ${table} (
                tenant_id TEXT NOT NULL,
                id TEXT NOT NULL,
                data TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (tenant_id, id)
            );
            CREATE INDEX IF NOT EXISTS idx_${table}_tenant ON ${table}(tenant_id);
        `);
    }
}

function getDb() {
    if (db) return db;
    const dbPath = getDbPath();
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.exec(`
        CREATE TABLE IF NOT EXISTS jobs (
            tenant_id TEXT NOT NULL,
            id TEXT NOT NULL,
            data TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (tenant_id, id)
        );
        CREATE INDEX IF NOT EXISTS idx_jobs_tenant ON jobs(tenant_id);
        CREATE TABLE IF NOT EXISTS clients (
            tenant_id TEXT NOT NULL,
            id TEXT NOT NULL,
            data TEXT NOT NULL,
            PRIMARY KEY (tenant_id, id)
        );
        CREATE TABLE IF NOT EXISTS settings (
            tenant_id TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS kv (
            tenant_id TEXT NOT NULL,
            key TEXT NOT NULL,
            value TEXT NOT NULL,
            PRIMARY KEY (tenant_id, key)
        );
        CREATE TABLE IF NOT EXISTS audit_log (
            tenant_id TEXT NOT NULL,
            id TEXT NOT NULL,
            created_at TEXT NOT NULL,
            action TEXT NOT NULL,
            entity_type TEXT,
            entity_id TEXT,
            previous_hash TEXT,
            hash TEXT NOT NULL,
            data TEXT NOT NULL,
            PRIMARY KEY (tenant_id, id)
        );
        CREATE INDEX IF NOT EXISTS idx_audit_tenant_time
            ON audit_log(tenant_id, created_at);
    `);
    ensureAuxTables(db);
    return db;
}

function closeDb() {
    if (db) {
        db.close();
        db = null;
    }
}

function loadAuxCollection(database, tenantId, table) {
    return database
        .prepare(`SELECT data FROM ${table} WHERE tenant_id = ?`)
        .all(tenantId)
        .map((row) => JSON.parse(row.data));
}

function loadTenantBundle(tenantId) {
    const database = getDb();
    const jobs = database.prepare('SELECT data FROM jobs WHERE tenant_id = ?').all(tenantId)
        .map((row) => JSON.parse(row.data));
    const clients = database.prepare('SELECT data FROM clients WHERE tenant_id = ?').all(tenantId)
        .map((row) => JSON.parse(row.data));
    const settingsRow = database.prepare('SELECT data FROM settings WHERE tenant_id = ?').get(tenantId);
    const settings = settingsRow ? JSON.parse(settingsRow.data) : null;
    const countRow = database.prepare('SELECT COUNT(*) as c FROM jobs WHERE tenant_id = ?').get(tenantId);
    const quotes = loadAuxCollection(database, tenantId, 'quotes');
    const papers = loadAuxCollection(database, tenantId, 'papers');
    const leaves = loadAuxCollection(database, tenantId, 'leaves');
    const instructions = loadAuxCollection(database, tenantId, 'instructions');
    return {
        jobs,
        clients,
        settings,
        jobCount: countRow?.c || 0,
        quotes,
        papers,
        leaves,
        instructions,
    };
}

function saveJobs(tenantId, jobs) {
    const database = getDb();
    const now = new Date().toISOString();
    const del = database.prepare('DELETE FROM jobs WHERE tenant_id = ?');
    const ins = database.prepare('INSERT OR REPLACE INTO jobs (tenant_id, id, data, updated_at) VALUES (?, ?, ?, ?)');
    const tx = database.transaction((rows) => {
        del.run(tenantId);
        for (const job of rows) {
            if (!job?.id) continue;
            ins.run(tenantId, job.id, JSON.stringify(job), job.updatedAt || job.createdAt || now);
        }
    });
    tx(jobs);
    return jobs.length;
}

function upsertJob(tenantId, job) {
    if (!job?.id) return false;
    const database = getDb();
    const now = new Date().toISOString();
    database.prepare(
        'INSERT OR REPLACE INTO jobs (tenant_id, id, data, updated_at) VALUES (?, ?, ?, ?)'
    ).run(tenantId, job.id, JSON.stringify(job), job.updatedAt || job.createdAt || now);
    return true;
}

function deleteJob(tenantId, jobId) {
    getDb().prepare('DELETE FROM jobs WHERE tenant_id = ? AND id = ?').run(tenantId, jobId);
}

function saveClients(tenantId, clients) {
    const database = getDb();
    const del = database.prepare('DELETE FROM clients WHERE tenant_id = ?');
    const ins = database.prepare('INSERT OR REPLACE INTO clients (tenant_id, id, data) VALUES (?, ?, ?)');
    const tx = database.transaction((rows) => {
        del.run(tenantId);
        for (const client of rows) {
            if (!client?.id) continue;
            ins.run(tenantId, client.id, JSON.stringify(client));
        }
    });
    tx(clients);
    return clients.length;
}

function upsertClient(tenantId, client) {
    if (!client?.id) return false;
    getDb().prepare('INSERT OR REPLACE INTO clients (tenant_id, id, data) VALUES (?, ?, ?)')
        .run(tenantId, client.id, JSON.stringify(client));
    return true;
}

function upsertJobAndClientsInDb(database, tenantId, job, clients) {
    if (!tenantId || !job?.id) return false;
    const now = new Date().toISOString();
    const jobStmt = database.prepare(
        'INSERT OR REPLACE INTO jobs (tenant_id, id, data, updated_at) VALUES (?, ?, ?, ?)'
    );
    const clientStmt = database.prepare(
        'INSERT OR REPLACE INTO clients (tenant_id, id, data) VALUES (?, ?, ?)'
    );
    const tx = database.transaction(() => {
        for (const client of clients || []) {
            if (!client?.id) throw new Error('client id required');
            clientStmt.run(tenantId, client.id, JSON.stringify(client));
        }
        jobStmt.run(
            tenantId,
            job.id,
            JSON.stringify(job),
            job.updatedAt || job.createdAt || now
        );
    });
    tx();
    return true;
}

function upsertJobAndClients(tenantId, job, clients) {
    return upsertJobAndClientsInDb(getDb(), tenantId, job, clients);
}

function deleteClient(tenantId, clientId) {
    getDb().prepare('DELETE FROM clients WHERE tenant_id = ? AND id = ?').run(tenantId, clientId);
}

function assertAuxTable(table) {
    if (!AUX_TABLES.includes(table)) {
        throw new Error(`invalid-aux-table:${table}`);
    }
}

function saveAuxCollection(tenantId, table, items) {
    assertAuxTable(table);
    const database = getDb();
    const now = new Date().toISOString();
    const del = database.prepare(`DELETE FROM ${table} WHERE tenant_id = ?`);
    const ins = database.prepare(
        `INSERT OR REPLACE INTO ${table} (tenant_id, id, data, updated_at) VALUES (?, ?, ?, ?)`
    );
    const tx = database.transaction((rows) => {
        del.run(tenantId);
        for (const row of rows) {
            if (!row?.id) continue;
            ins.run(tenantId, row.id, JSON.stringify(row), row.updatedAt || row.createdAt || now);
        }
    });
    tx(items || []);
    return (items || []).length;
}

function upsertAuxEntity(tenantId, table, entity) {
    assertAuxTable(table);
    if (!entity?.id) return false;
    const now = new Date().toISOString();
    getDb()
        .prepare(
            `INSERT OR REPLACE INTO ${table} (tenant_id, id, data, updated_at) VALUES (?, ?, ?, ?)`
        )
        .run(tenantId, entity.id, JSON.stringify(entity), entity.updatedAt || entity.createdAt || now);
    return true;
}

function deleteAuxEntity(tenantId, table, id) {
    assertAuxTable(table);
    getDb().prepare(`DELETE FROM ${table} WHERE tenant_id = ? AND id = ?`).run(tenantId, id);
}

function saveSettings(tenantId, settingsObj) {
    const now = new Date().toISOString();
    getDb().prepare(
        'INSERT OR REPLACE INTO settings (tenant_id, data, updated_at) VALUES (?, ?, ?)'
    ).run(tenantId, JSON.stringify(settingsObj), now);
}

function getKv(tenantId, key) {
    const row = getDb().prepare('SELECT value FROM kv WHERE tenant_id = ? AND key = ?').get(tenantId, key);
    return row?.value ?? null;
}

function setKv(tenantId, key, value) {
    getDb().prepare('INSERT OR REPLACE INTO kv (tenant_id, key, value) VALUES (?, ?, ?)')
        .run(tenantId, key, value);
}

function appendAuditEvent(tenantId, event) {
    if (!tenantId || !event?.action) return false;
    const database = getDb();
    const previous = database.prepare(
        'SELECT hash FROM audit_log WHERE tenant_id = ? ORDER BY created_at DESC, id DESC LIMIT 1'
    ).get(tenantId);
    const createdAt = new Date().toISOString();
    const id = `${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}`;
    const data = JSON.stringify(event.data || {});
    const previousHash = previous?.hash || '';
    const hash = crypto.createHash('sha256').update([
        tenantId, id, createdAt, event.action, event.entityType || '',
        event.entityId || '', previousHash, data,
    ].join('|')).digest('hex');
    database.prepare(`
        INSERT INTO audit_log (
            tenant_id, id, created_at, action, entity_type, entity_id,
            previous_hash, hash, data
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        tenantId, id, createdAt, event.action, event.entityType || null,
        event.entityId || null, previousHash, hash, data
    );
    return true;
}

module.exports = {
    getDbPath,
    closeDb,
    loadTenantBundle,
    saveJobs,
    upsertJob,
    deleteJob,
    saveClients,
    upsertClient,
    upsertJobAndClients,
    deleteClient,
    saveAuxCollection,
    upsertAuxEntity,
    deleteAuxEntity,
    saveSettings,
    getKv,
    setKv,
    upsertJobAndClientsInDb,
    appendAuditEvent,
};
