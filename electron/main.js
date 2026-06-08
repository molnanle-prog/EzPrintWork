
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

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
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        },
        title: "EzPrintWork",
        autoHideMenuBar: true,
        frame: false // 타이틀바 및 브라우저 기본 프레임을 숨겨 프로그램 창처럼 구현
    });

    // [보안 및 웹 캐시 강제 갱신장치]
    // Electron 내부 웹 캐시 및 세션 스토리지 정보가 완고하게 갱신되지 않아 
    // 서버의 최신 보안 패치(자동 로그인 리셋 기능 등)가 적용되지 않는 현상을 방지하기 위해 
    // 창이 로드되기 직전 세션 캐시를 깨끗하게 강제 삭제 조치합니다.
    win.webContents.session.clearCache().catch(() => {});
    win.webContents.session.clearStorageData({
        storages: ['cookies', 'localstorage', 'indexdb', 'websql', 'serviceworkers', 'cachestorage']
    }).catch(() => {});

    if (process.env.ELECTRON_START_URL) {
        win.loadURL(process.env.ELECTRON_START_URL);
    } else {
        win.loadURL('https://ez-hub.kr/ezpw/');
    }
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
        createWindow();
        startLocalServer();
        // 앱이 프로토콜 호출로 처음 켜졌을 때 처리
        handleProtocolUrl(process.argv);
    });
}

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// --- 폴더 연결 및 권한 검사 헬퍼 함수 ---
async function checkDirectoryStatusHelper(dirPath) {
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

// --- 웹 브라우저 연동용 로컬 HTTP 서버 (127.0.0.1:23230) ---
const http = require('http');
let localServer;

function startLocalServer() {
    localServer = http.createServer(async (req, res) => {
        // CORS 헤더 및 Chrome Private Network Access(PNA) 허용 설정
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', '*');
        res.setHeader('Access-Control-Allow-Private-Network', 'true'); // 중요: 크롬 브라우저의 로컬 보안(PNA) 우회 헤더

        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }

        try {
            // URL 파싱
            const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

            if (reqUrl.pathname === '/select') {
                const { canceled, filePaths } = await dialog.showOpenDialog({
                    properties: ['openFile', 'openDirectory']
                });
                const selectedPath = canceled ? '' : filePaths[0];
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ path: selectedPath }));
            } else if (reqUrl.pathname === '/open') {
                const targetPath = reqUrl.searchParams.get('path');
                if (!targetPath) {
                    res.writeHead(400);
                    res.end('Missing path');
                    return;
                }
                await shell.openPath(targetPath);
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ success: true }));
            } else if (reqUrl.pathname === '/read-file') {
                const targetPath = reqUrl.searchParams.get('path');
                if (!targetPath) {
                    res.writeHead(400);
                    res.end('Missing path');
                    return;
                }
                let data = null;
                if (fs.existsSync(targetPath)) {
                    data = fs.readFileSync(targetPath, 'utf8');
                } else if (targetPath.endsWith('.json')) {
                    // 자가 치유: 확장자 없는 레거시 파일 마이그레이션 (.json으로 로드 시도할 때 확장자 없는 파일이 있으면 마이그레이션)
                    const noExtPath = targetPath.slice(0, -5);
                    if (fs.existsSync(noExtPath)) {
                        console.log(`[Self-Healing HTTP] Migrating extensionless file: ${noExtPath} -> ${targetPath}`);
                        try {
                            data = fs.readFileSync(noExtPath, 'utf8');
                            fs.writeFileSync(targetPath, data, 'utf8');
                        } catch (err) {
                            console.error(`[Self-Healing HTTP] Migration failed:`, err);
                        }
                    }
                }

                if (data !== null) {
                    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ success: true, data }));
                } else {
                    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ success: false, error: 'ENOENT' }));
                }
            } else if (reqUrl.pathname === '/save-file') {
                let body = '';
                req.on('data', chunk => {
                    body += chunk.toString();
                });
                req.on('end', () => {
                    try {
                        const { path: filePath, content } = JSON.parse(body);
                        if (!filePath) {
                            res.writeHead(400);
                            res.end('Missing path');
                            return;
                        }
                        const dir = path.dirname(filePath);
                        if (!fs.existsSync(dir)) {
                            fs.mkdirSync(dir, { recursive: true });
                        }
                        fs.writeFileSync(filePath, content, 'utf8');
                        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                        res.end(JSON.stringify({ success: true }));
                    } catch (e) {
                        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
                        res.end(JSON.stringify({ success: false, error: e.message }));
                    }
                });
                return;
            } else if (reqUrl.pathname === '/check-directory') {
                const targetPath = reqUrl.searchParams.get('path');
                if (!targetPath) {
                    res.writeHead(400);
                    res.end('Missing path');
                    return;
                }
                const status = await checkDirectoryStatusHelper(targetPath);
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify(status));
            } else if (reqUrl.pathname === '/get-documents-path') {
                const docPath = app.getPath('documents');
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ path: docPath }));
            } else {
                res.writeHead(404);
                res.end('Not Found');
            }
        } catch (error) {
            console.error("로컬 서버 오류:", error);
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: error.message }));
        }
    });

    localServer.listen(23230, '127.0.0.1', () => {
        console.log('Local helper server running on http://127.0.0.1:23230');
    });
}

app.on('will-quit', () => {
    if (localServer) {
        localServer.close();
    }
});

// --- IPC 핸들러 (실제 시스템 기능) ---

// 1. 폴더 선택창 열기 (NAS 설정용)
ipcMain.handle('select-directory', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openDirectory']
    });
    return canceled ? null : filePaths[0];
});

// 2. 파일 또는 폴더 선택 (작업 등록용)
ipcMain.handle('select-file-or-folder', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openFile', 'openDirectory']
    });
    return canceled ? null : filePaths[0];
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
    
    let finalPath = filePath;
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
        return { success: false, error: e.message };
    }
});

// 5. 파일 읽기
ipcMain.handle('read-file', async (event, filePath) => {
    try {
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf8');
            return { success: true, data };
        }
        // 자가 치유: 확장자 없는 레거시 파일 마이그레이션 (.json 파일 요청 시 확장자 없는 파일 자동 로드 및 복사)
        if (filePath.endsWith('.json')) {
            const noExtPath = filePath.slice(0, -5);
            if (fs.existsSync(noExtPath)) {
                console.log(`[Self-Healing] Migrating extensionless database file: ${noExtPath} -> ${filePath}`);
                const data = fs.readFileSync(noExtPath, 'utf8');
                fs.writeFileSync(filePath, data, 'utf8');
                return { success: true, data };
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
    return await checkDirectoryStatusHelper(dirPath);
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
