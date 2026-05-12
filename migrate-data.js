const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const migration = require('./electron/migration');

async function run() {
    // 1. Path setup
    const userDataPath = process.env.APPDATA ? path.join(process.env.APPDATA, 'ezprintwork') : path.join(process.env.HOME, '.config', 'ezprintwork');
    const jsonPath = path.join(userDataPath, 'pm_db_v2.json');
    const dbPath = path.join(userDataPath, 'ezprintwork.db');

    console.log('Migration Source:', jsonPath);
    console.log('Migration Target:', dbPath);

    if (!fs.existsSync(jsonPath)) {
        console.error('Source JSON file not found at:', jsonPath);
        process.exit(1);
    }

    // 2. Initialize SQLite
    const db = new Database(dbPath);

    // Create tables
    const sqlPath = path.join(__dirname, 'electron', 'database_init.sql');
    const createTablesStmt = fs.readFileSync(sqlPath, 'utf8');
    db.exec(createTablesStmt);
    console.log('Tables initialized.');

    // 3. Migrate
    const result = await migration.migrateJsonToDb(jsonPath, db);
    console.log('Migration Result:', result);

    db.close();
    process.exit(result.success ? 0 : 1);
}

run();
