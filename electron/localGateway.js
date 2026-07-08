const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SITUATION_FILE = 'situation-mirror.json';
const ARCHIVE_FILE = 'jobs-archive.json';

class LocalGateway {
    constructor() {
        this.server = null;
        this.port = 0;
        this.archiveRoot = null;
        this.tenantId = null;
    }

    setConfig({ archiveRoot, tenantId }) {
        this.archiveRoot = archiveRoot ? String(archiveRoot).replace(/[\\/]$/, '') : null;
        this.tenantId = tenantId || null;
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
            this.server = http.createServer((req, res) => {
                const cors = {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type',
                };

                if (req.method === 'OPTIONS') {
                    res.writeHead(204, cors);
                    res.end();
                    return;
                }

                let url;
                try {
                    url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
                } catch {
                    res.writeHead(400, cors);
                    res.end('Bad request');
                    return;
                }

                if (url.pathname === '/health') {
                    res.writeHead(200, { ...cors, 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ ok: true, ...this.getInfo() }));
                    return;
                }

                if (url.pathname === '/api/v1/mirror') {
                    const tenantId = url.searchParams.get('tenantId') || this.tenantId;
                    const situation = this.readJsonFile(SITUATION_FILE);
                    const archive = this.readJsonFile(ARCHIVE_FILE);
                    const jobs = (archive?.jobs?.length ? archive.jobs : situation?.jobs) || [];

                    res.writeHead(200, { ...cors, 'Content-Type': 'application/json; charset=utf-8' });
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

                res.writeHead(404, cors);
                res.end('Not found');
            });

            this.server.listen(0, '0.0.0.0', () => {
                this.port = this.server.address().port;
                console.log('[LocalGateway] listening on', this.getInfo().baseUrl);
                resolve(this.getInfo());
            });
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
