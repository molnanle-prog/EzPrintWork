
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { setupAutoUpdater } = require('./updater');
const localDb = require('./localDb');
const { LocalGateway } = require('./localGateway');

const localGateway = new LocalGateway();

// 프로토콜 등록 (ezpw://)
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('ezpw', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('ezpw');
}

function createWindow() {
    const win = new BrowserWindow({
        width: 1300,
        height: 900,
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        },
        title: "EzPrintWork",
        autoHideMenuBar: true,
        frame: false // 타이틀바 및 브라우저 기본 프레임을 숨겨 프로그램 창처럼 구현
    });

    win.once('ready-to-show', () => {
        win.show();
        win.focus();
    });

    // 웹 UI(JS/CSS) 캐시만 갱신 — localStorage·IndexedDB는 유지
    // (직원 '선택회사 저장'·'자동 로그인 유지' 및 Firebase persistence 보존)
    win.webContents.session.clearCache().catch(() => {});
    win.webContents.session.clearStorageData({
        storages: ['serviceworkers', 'cachestorage'],
    }).catch(() => {});

    if (process.env.ELECTRON_START_URL) {
        win.loadURL(process.env.ELECTRON_START_URL);
    } else if (process.defaultApp || !app.isPackaged) {
        win.loadURL('http://localhost:5173/');
    } else {
        win.loadURL('https://ez-hub.kr/ezpw/');
    }

    return win;
}

// 프로토콜 파싱 및 폴더 열기 실행 함수
function handleProtocolUrl(argv) {
    const prefix = 'ezpw://open?path=';
    const arg = argv.find(a => a.startsWith(prefix) || a.startsWith('ezpw://'));
    if (!arg) return;

    try {
        let targetPath = '';
        if (arg.startsWith(prefix)) {
            targetPath = decodeURIComponent(arg.substring(prefix.length));
        } else {
            const urlObj = new URL(arg);
            targetPath = urlObj.searchParams.get('path') || '';
        }

        if (targetPath) {
            shell.openPath(targetPath);
        }
    } catch (e) {
        console.error('Protocol URL 파싱 오류:', e);
    }
}

// 싱글 인스턴스 락 설정 (중복 실행 방지 및 프로토콜 전달 연동)
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        // 이미 켜진 앱이 있으면 활성화
        const win = BrowserWindow.getAllWindows()[0];
        if (win) {
            if (win.isMinimized()) win.restore();
            win.focus();
        }
        // 웹 브라우저에서 보낸 주소(프로토콜) 처리
        handleProtocolUrl(commandLine);
    });

    app.whenReady().then(() => {
        ensureDesktopShortcut();
        const win = createWindow();
        setupAutoUpdater(win);
        void localGateway.start();
        // 앱이 프로토콜 호출로 처음 켜졌을 때 처리
        handleProtocolUrl(process.argv);
    });
}

app.on('before-quit', () => {
    localGateway.stop();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// --- 드라이브 문자 -> 원격 UNC(네트워크 절대경로) 변환 ---
// cmd.exe / powershell을 거치지 않음 (안랩 Safe Transaction 오탐 방지: execFileSync 직접 실행)
function joinUncBase(uncBase, relativePath) {
    const base = String(uncBase || '').replace(/[\\/]+$/, '');
    const rel = String(relativePath || '').replace(/^[\\/]+/, '');
    if (!rel) return base;
    // path.win32.join이 UNC(//server/share)를 깨뜨리지 않도록 직접 결합
    return `${base}\\${rel}`;
}

function getSystem32Exe(exeName) {
    const root = process.env.SystemRoot || 'C:\\Windows';
    return path.join(root, 'System32', exeName);
}

/** 영구 매핑: HKCU\Network\{문자}\RemotePath (reg.exe 직접 실행, cmd 미사용) */
function resolveMappedDriveViaRegistry(driveLetter) {
    const { execFileSync } = require('child_process');
    const letter = String(driveLetter || '').toUpperCase();
    if (!/^[A-Z]$/.test(letter)) return null;
    const output = execFileSync(
        getSystem32Exe('reg.exe'),
        ['query', `HKCU\\Network\\${letter}`, '/v', 'RemotePath'],
        { encoding: 'utf8', windowsHide: true, timeout: 5000 }
    );
    const match = String(output || '').match(/RemotePath\s+REG_\w+\s+(\\\\[^\r\n]+)/i);
    if (!match) return null;
    const unc = match[1].trim();
    return unc.startsWith('\\\\') ? unc : null;
}

/** 세션 매핑 포함: net.exe 직접 실행 (cmd 미사용) */
function resolveMappedDriveViaNetUse(driveLetter) {
    const { execFileSync } = require('child_process');
    const drive = `${String(driveLetter || '').toUpperCase()}:`;
    const output = execFileSync(
        getSystem32Exe('net.exe'),
        ['use', drive],
        { encoding: 'utf8', windowsHide: true, timeout: 5000 }
    );
    const remoteMatch = String(output || '').match(/(?:Remote name|원격 이름)\s+([^\r\n]+)/i);
    if (!remoteMatch) return null;
    const unc = remoteMatch[1].trim();
    return unc.startsWith('\\\\') ? unc : null;
}

function resolveUncPath(localPath) {
    if (!localPath) return localPath;
    const normalized = String(localPath).replace(/\//g, '\\');
    if (normalized.startsWith('\\\\')) return normalized;

    const match = normalized.match(/^([A-Za-z]):\\(.*)$/);
    if (!match) return localPath;

    const driveLetter = match[1];
    const relativePath = match[2];

    try {
        let uncBase = null;
        try {
            uncBase = resolveMappedDriveViaRegistry(driveLetter);
        } catch (e) {
            // 영구 매핑이 없으면 ERROR_FILE_NOT_FOUND 등 — 세션 매핑으로 재시도
        }
        if (!uncBase) {
            try {
                uncBase = resolveMappedDriveViaNetUse(driveLetter);
            } catch (e) {
                console.warn(`[UNC Resolver] net use failed for ${driveLetter}:`, e.message || e);
            }
        }
        if (uncBase) {
            const joined = joinUncBase(uncBase, relativePath);
            console.log(`[UNC Resolver] Resolved ${localPath} -> ${joined}`);
            return joined;
        }
    } catch (e) {
        console.warn('[UNC Resolver] unexpected error:', e.message || e);
    }
    console.warn(`[UNC Resolver] Keeping drive path (no mapping found): ${localPath}`);
    return normalized;
}

// --- 폴더 연결 및 권한 검사 ---
async function checkDirectoryStatus(dirPath) {
    if (!dirPath) return { success: false, error: '경로가 지정되지 않았습니다.' };
    try {
        if (!fs.existsSync(dirPath)) {
            return { success: false, error: '존재하지 않는 폴더 경로입니다.' };
        }
        const stats = fs.statSync(dirPath);
        if (!stats.isDirectory()) {
            return { success: false, error: '지정한 경로가 폴더가 아닙니다.' };
        }
        
        // 쓰기 테스트
        const testFile = path.join(dirPath, `.ezpw_test_${Date.now()}.tmp`);
        fs.writeFileSync(testFile, 'test', 'utf8');
        fs.unlinkSync(testFile);
        
        return { success: true, message: '정상 작동 (읽기/쓰기 가능)' };
    } catch (e) {
        return { success: false, error: `접근 권한이 없거나 오류가 발생했습니다: ${e.message}` };
    }
}

// --- IPC 핸들러 (데스크톱 앱 전용) ---

// 1. 폴더 선택창 열기 (NAS 설정용)
ipcMain.handle('select-directory', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openDirectory']
    });
    return canceled ? null : resolveUncPath(filePaths[0]);
});

/** 렌더러 저장 직전 — 드라이브 문자를 UNC로 재변환 */
ipcMain.handle('resolve-unc-path', async (_event, inputPath) => {
    if (!inputPath || typeof inputPath !== 'string') {
        return { ok: false, path: inputPath || null, unc: false, error: '경로가 없습니다.' };
    }
    const resolved = resolveUncPath(inputPath.trim());
    const unc = typeof resolved === 'string' && resolved.startsWith('\\\\');
    const stillDrive = typeof resolved === 'string' && /^[A-Za-z]:\\/.test(resolved);
    return {
        ok: true,
        path: resolved,
        unc,
        stillDrive,
        changed: resolved !== inputPath.trim().replace(/\//g, '\\'),
    };
});

// 2. 파일 또는 폴더 선택 (작업 등록용) — UNC 강제
ipcMain.handle('select-file-or-folder', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openFile', 'openDirectory']
    });
    return canceled ? null : resolveUncPath(filePaths[0]);
});

// 2.1. 새 데이터베이스 파일 생성
ipcMain.handle('create-database-file', async (event, content) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
        title: '새 데이터베이스 파일 생성',
        defaultPath: 'pm_db_v2.json',
        filters: [
            { name: 'JSON Files', extensions: ['json'] }
        ]
    });
    if (canceled || !filePath) return null;
    
    let finalPath = resolveUncPath(filePath);
    // .json.json 이중 확장자 결합 방지 보정
    if (finalPath.toLowerCase().endsWith('.json.json')) {
        finalPath = finalPath.slice(0, -5);
    }
    
    try {
        const dir = path.dirname(finalPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(finalPath, content, 'utf8');
        return finalPath;
    } catch (e) {
        console.error("데이터베이스 파일 생성 실패:", e);
        return null;
    }
});

// 3. 경로 열기 (탐색기 실행)
ipcMain.handle('open-path', async (event, targetPath) => {
    if (!targetPath) return false;
    try {
        // 파일이면 폴더를 열고 파일을 선택하게 하거나, 폴더면 폴더를 엶
        await shell.openPath(targetPath);
        return true;
    } catch (e) {
        console.error("경로 열기 오류:", e);
        return false;
    }
});

// 4. 파일 저장
ipcMain.handle('save-file', async (event, { path: filePath, content }) => {
    try {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, content, 'utf8');
        return { success: true };
    } catch (e) {
        console.error("파일 저장 중 오류 발생:", e);
        const errMsg = e instanceof Error ? e.message : (typeof e === 'string' ? e : JSON.stringify(e));
        return { success: false, error: errMsg || '알 수 없는 파일 저장 오류' };
    }
});

// 5. 파일 읽기
ipcMain.handle('read-file', async (event, filePath) => {
    try {
        if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            const data = fs.readFileSync(filePath, 'utf8');
            return { success: true, data, mtime: stats.mtimeMs };
        }
        // 자가 치유: 확장자 없는 레거시 파일 마이그레이션 (.json 파일 요청 시 확장자 없는 파일 자동 로드 및 복사)
        if (filePath.endsWith('.json')) {
            const noExtPath = filePath.slice(0, -5);
            if (fs.existsSync(noExtPath)) {
                console.log(`[Self-Healing] Migrating extensionless database file: ${noExtPath} -> ${filePath}`);
                const stats = fs.statSync(noExtPath);
                const data = fs.readFileSync(noExtPath, 'utf8');
                fs.writeFileSync(filePath, data, 'utf8');
                return { success: true, data, mtime: stats.mtimeMs };
            }
        }
        return { success: false, error: 'ENOENT' };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// 6. 파일 존재 여부 확인
ipcMain.handle('exists', async (event, filePath) => {
    return fs.existsSync(filePath);
});

// 6.1. 폴더 존재 및 읽기/쓰기 권한 검사
ipcMain.handle('check-directory-status', async (event, dirPath) => {
    return await checkDirectoryStatus(dirPath);
});

// 7.0. 앱 사용자 데이터 폴더 (네트워크 장애 시 보관 섀도 복사)
ipcMain.handle('get-user-data-path', async () => {
    try {
        return app.getPath('userData');
    } catch (e) {
        console.error('userData 경로 획득 중 오류:', e);
        return null;
    }
});

ipcMain.handle('gateway-set-config', async (_event, config) => {
    localGateway.setConfig(config || {});
    await localGateway.start();
    return { ok: true };
});

ipcMain.handle('gateway-get-info', async () => {
    await localGateway.start();
    return localGateway.getInfo();
});

// 7. 문서 폴더 경로 가져오기 (백업용)
ipcMain.handle('get-documents-path', async () => {
    try {
        return app.getPath('documents');
    } catch (e) {
        console.error("문서 폴더 경로 획득 중 오류:", e);
        return null;
    }
});

// 7.1. 구버전 및 백업 레거시 파일 자동 검색
ipcMain.handle('find-legacy-db-files', async () => {
    const results = [];
    try {
        // 1) AppData Roaming 스캔
        const appData = app.getPath('appData');
        const roamingLegacyPath = path.join(appData, 'ezprintwork', 'pm_db_v2.json');
        if (fs.existsSync(roamingLegacyPath)) {
            const stats = fs.statSync(roamingLegacyPath);
            results.push({
                name: 'pm_db_v2.json (춘천인쇄 로컬 구버전 데이터)',
                path: roamingLegacyPath,
                size: `${Math.round(stats.size / 1024)} KB`,
                mtime: stats.mtime.toISOString().replace('T', ' ').substring(0, 16)
            });
        }

        // 2) 내 문서 (Documents) 스캔
        const docs = app.getPath('documents');
        const defaultDbFolder = path.join(docs, 'EzPrintWork_DB');
        if (fs.existsSync(defaultDbFolder)) {
            const files = fs.readdirSync(defaultDbFolder);
            for (const file of files) {
                if (file.endsWith('.json') && file !== 'settings.json') {
                    const fullPath = path.join(defaultDbFolder, file);
                    const stats = fs.statSync(fullPath);
                    results.push({
                        name: `${file} (기본 내 문서 백업 데이터)`,
                        path: fullPath,
                        size: `${Math.round(stats.size / 1024)} KB`,
                        mtime: stats.mtime.toISOString().replace('T', ' ').substring(0, 16)
                    });
                }
            }
        }
    } catch (e) {
        console.error("레거시 파일 자동 검색 중 오류:", e);
    }
    return results;
});

// --- 로컬 SQLite (업무 DB — Firestore jobs 미사용) ---
ipcMain.handle('local-db-load', async (_event, tenantId) => {
    try {
        if (!tenantId) return { success: false, error: 'no-tenant' };
        const bundle = localDb.loadTenantBundle(tenantId);
        return { success: true, ...bundle };
    } catch (e) {
        return { success: false, error: e?.message || String(e) };
    }
});

ipcMain.handle('local-db-save-jobs', async (_event, { tenantId, jobs }) => {
    try {
        const count = localDb.saveJobs(tenantId, jobs || []);
        return { success: true, count };
    } catch (e) {
        return { success: false, error: e?.message || String(e) };
    }
});

ipcMain.handle('local-db-upsert-job', async (_event, { tenantId, job }) => {
    try {
        localDb.upsertJob(tenantId, job);
        return { success: true };
    } catch (e) {
        return { success: false, error: e?.message || String(e) };
    }
});

ipcMain.handle('local-db-delete-job', async (_event, { tenantId, jobId }) => {
    try {
        localDb.deleteJob(tenantId, jobId);
        return { success: true };
    } catch (e) {
        return { success: false, error: e?.message || String(e) };
    }
});

ipcMain.handle('local-db-save-clients', async (_event, { tenantId, clients }) => {
    try {
        const count = localDb.saveClients(tenantId, clients || []);
        return { success: true, count };
    } catch (e) {
        return { success: false, error: e?.message || String(e) };
    }
});

ipcMain.handle('local-db-upsert-client', async (_event, { tenantId, client }) => {
    try {
        localDb.upsertClient(tenantId, client);
        return { success: true };
    } catch (e) {
        return { success: false, error: e?.message || String(e) };
    }
});

ipcMain.handle('local-db-delete-client', async (_event, { tenantId, clientId }) => {
    try {
        localDb.deleteClient(tenantId, clientId);
        return { success: true };
    } catch (e) {
        return { success: false, error: e?.message || String(e) };
    }
});

ipcMain.handle('local-db-save-settings', async (_event, { tenantId, settings }) => {
    try {
        localDb.saveSettings(tenantId, settings);
        return { success: true };
    } catch (e) {
        return { success: false, error: e?.message || String(e) };
    }
});

ipcMain.handle('local-db-save-aux', async (_event, { tenantId, collection, items }) => {
    try {
        const count = localDb.saveAuxCollection(tenantId, collection, items || []);
        return { success: true, count };
    } catch (e) {
        return { success: false, error: e?.message || String(e) };
    }
});

ipcMain.handle('local-db-upsert-aux', async (_event, { tenantId, collection, entity }) => {
    try {
        localDb.upsertAuxEntity(tenantId, collection, entity);
        return { success: true };
    } catch (e) {
        return { success: false, error: e?.message || String(e) };
    }
});

ipcMain.handle('local-db-delete-aux', async (_event, { tenantId, collection, id }) => {
    try {
        localDb.deleteAuxEntity(tenantId, collection, id);
        return { success: true };
    } catch (e) {
        return { success: false, error: e?.message || String(e) };
    }
});

// 8. 창 제어 (최소화, 최대화, 닫기)
ipcMain.on('window-minimize', () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) win.minimize();
});

ipcMain.on('window-maximize', () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) {
        if (win.isMaximized()) {
            win.unmaximize();
        } else {
            win.maximize();
        }
    }
});

ipcMain.on('window-close', () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) win.close();
});

ipcMain.on('window-lower', () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) win.lower();
});

/** 문서 인쇄 — 단면(simplex) 강제, 배경 포함, 대화상자 표시 */
ipcMain.handle('print-document', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow();
    if (!win || win.isDestroyed()) {
        return { success: false, error: 'no-window' };
    }
    return await new Promise((resolve) => {
        try {
            win.webContents.print(
                {
                    silent: false,
                    printBackground: true,
                    duplexMode: 'simplex',
                    margins: { marginType: 'none' },
                    pageSize: 'A4',
                },
                (success, failureReason) => {
                    resolve({
                        success: !!success,
                        error: success ? undefined : (failureReason || 'print-failed'),
                    });
                }
            );
        } catch (e) {
            resolve({ success: false, error: e?.message || String(e) });
        }
    });
});

/**
 * 문서 PDF 저장 — printToPDF (미리보기·인쇄와 동일 Chromium 레이아웃)
 * html2canvas/jspdf 미사용 → 폰트 겹침·줄간격 왜곡 없음
 */
ipcMain.handle('print-document-to-pdf', async (event, { defaultFileName } = {}) => {
    const win = BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow();
    if (!win || win.isDestroyed()) {
        return { success: false, error: 'no-window' };
    }

    try {
        const pdfBuffer = await win.webContents.printToPDF({
            printBackground: true,
            landscape: false,
            pageSize: 'A4',
            margins: { marginType: 'none' },
            preferCSSPageSize: true,
        });

        const safeName =
            typeof defaultFileName === 'string' && defaultFileName.trim()
                ? defaultFileName.trim().replace(/[<>:"/\\|?*]/g, '_')
                : 'document.pdf';
        const withExt = /\.pdf$/i.test(safeName) ? safeName : `${safeName}.pdf`;

        const { filePath, canceled } = await dialog.showSaveDialog(win, {
            title: 'PDF로 저장',
            defaultPath: withExt,
            filters: [{ name: 'PDF', extensions: ['pdf'] }],
        });

        if (canceled || !filePath) {
            return { success: false, canceled: true };
        }

        fs.writeFileSync(filePath, pdfBuffer);
        return { success: true, filePath };
    } catch (e) {
        return { success: false, error: e?.message || String(e) };
    }
});

function resolveShortcutIconPath() {
    if (app.isPackaged) {
        return process.execPath;
    }

    const devIcon = path.join(__dirname, '..', 'public', 'icon.ico');
    if (fs.existsSync(devIcon)) {
        return devIcon;
    }

    return process.execPath;
}

function getWindowsDesktopDirs() {
    const dirs = new Set();

    const addDir = (dirPath) => {
        if (!dirPath) return;
        try {
            const resolved = path.resolve(dirPath);
            if (fs.existsSync(resolved)) dirs.add(resolved);
        } catch (_) {
            /* ignore */
        }
    };

    try {
        addDir(app.getPath('desktop'));
    } catch (_) {
        /* ignore */
    }

    const userProfile = process.env.USERPROFILE;
    if (userProfile) {
        addDir(path.join(userProfile, 'Desktop'));
        try {
            const entries = fs.readdirSync(userProfile, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory() && entry.name.toLowerCase().startsWith('onedrive')) {
                    addDir(path.join(userProfile, entry.name, 'Desktop'));
                }
            }
        } catch (_) {
            /* ignore */
        }
    }

    const publicRoot = process.env.PUBLIC;
    if (publicRoot) {
        addDir(path.join(publicRoot, 'Desktop'));
    }

    return [...dirs];
}

function buildShortcutOptions() {
    const target = process.execPath;
    const icon = resolveShortcutIconPath();
    return {
        target,
        cwd: path.dirname(target),
        icon,
        iconIndex: 0,
        description: 'EzPrintWork - 인쇄소 업무 관리',
        args: '',
    };
}

function writeDesktopShortcutToPath(shortcutPath, options) {
    try {
        if (fs.existsSync(shortcutPath)) {
            fs.unlinkSync(shortcutPath);
        }
    } catch (_) {
        /* ignore — replace/create may still succeed */
    }

    if (shell.writeShortcutLink(shortcutPath, 'create', options)) {
        return true;
    }
    if (fs.existsSync(shortcutPath) && shell.writeShortcutLink(shortcutPath, 'update', options)) {
        return true;
    }
    return shell.writeShortcutLink(shortcutPath, 'replace', options);
}

function createDesktopShortcutsEverywhere() {
    if (process.platform !== 'win32') {
        return { ok: false, error: 'Windows에서만 지원됩니다.', paths: [] };
    }

    const options = buildShortcutOptions();
    const createdPaths = [];

    for (const desktopDir of getWindowsDesktopDirs()) {
        const shortcutPath = path.join(desktopDir, 'EzPrintWork.lnk');
        if (writeDesktopShortcutToPath(shortcutPath, options)) {
            createdPaths.push(shortcutPath);
        }
    }

    if (createdPaths.length === 0) {
        return { ok: false, error: '바로가기 생성에 실패했습니다.', paths: [] };
    }

    return { ok: true, path: createdPaths[0], paths: createdPaths };
}

function ensureDesktopShortcut() {
    if (process.platform !== 'win32' || !app.isPackaged) return;
    const result = createDesktopShortcutsEverywhere();
    if (!result.ok) {
        console.warn('[Shortcut] 바탕화면 바로가기 자동 생성 실패:', result.error);
    }
}

function getOpenAtLoginState() {
    if (process.platform !== 'win32') {
        return { ok: false, enabled: false, supported: false };
    }
    try {
        const settings = app.getLoginItemSettings();
        return { ok: true, enabled: !!settings.openAtLogin, supported: true };
    } catch (error) {
        return { ok: false, enabled: false, supported: true, error: error?.message || String(error) };
    }
}

function setOpenAtLoginState(enabled) {
    if (process.platform !== 'win32') {
        return { ok: false, enabled: false, supported: false, error: 'Windows에서만 지원됩니다.' };
    }
    try {
        app.setLoginItemSettings({
            openAtLogin: !!enabled,
            openAsHidden: false,
            path: process.execPath,
            args: [],
            name: 'EzPrintWork',
        });
        const settings = app.getLoginItemSettings();
        return { ok: true, enabled: !!settings.openAtLogin, supported: true };
    } catch (error) {
        return { ok: false, enabled: false, supported: true, error: error?.message || String(error) };
    }
}

ipcMain.handle('create-desktop-shortcut', async () => {
    const result = createDesktopShortcutsEverywhere();
    if (!result.ok) {
        return { ok: false, error: result.error || '바로가기 생성에 실패했습니다.' };
    }
    return { ok: true, path: result.path, paths: result.paths };
});

ipcMain.handle('get-open-at-login', async () => getOpenAtLoginState());

ipcMain.handle('set-open-at-login', async (_event, enabled) => setOpenAtLoginState(!!enabled));
