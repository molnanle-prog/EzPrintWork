const { app } = require('electron');
const Database = require('better-sqlite3');
const { upsertJobAndClientsInDb } = require('../electron/localDb.js');

app.whenReady().then(() => {
    const db = new Database(':memory:');
    try {
        db.exec(`
          CREATE TABLE jobs (
            tenant_id TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL,
            PRIMARY KEY (tenant_id, id)
          );
          CREATE TABLE clients (
            tenant_id TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL,
            PRIMARY KEY (tenant_id, id)
          );
        `);

        upsertJobAndClientsInDb(
            db,
            'tenant-test',
            { id: 'job-1', title: '작업', updatedAt: new Date().toISOString() },
            [{ id: 'client-1', name: '거래처', prepaidBalance: 9000 }]
        );
        const job = JSON.parse(db.prepare('SELECT data FROM jobs WHERE id = ?').get('job-1').data);
        const client = JSON.parse(
            db.prepare('SELECT data FROM clients WHERE id = ?').get('client-1').data
        );
        if (job.id !== 'job-1' || client.prepaidBalance !== 9000) {
            throw new Error('원자 저장 결과가 올바르지 않습니다.');
        }

        let rolledBack = false;
        try {
            upsertJobAndClientsInDb(
                db,
                'tenant-test',
                { id: 'job-2', title: '실패해야 함' },
                [{ name: 'id 없음' }]
            );
        } catch {
            rolledBack = true;
        }
        if (!rolledBack || db.prepare('SELECT 1 FROM jobs WHERE id = ?').get('job-2')) {
            throw new Error('트랜잭션 실패 롤백이 작동하지 않습니다.');
        }
        console.log('✓ 작업+선수금 SQLite 원자 저장 및 실패 롤백');
        app.exit(0);
    } catch (error) {
        console.error(error);
        app.exit(1);
    } finally {
        db.close();
    }
});
