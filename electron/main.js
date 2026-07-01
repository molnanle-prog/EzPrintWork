
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { setupAutoUpdater } = require('./updater');

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

    // 웹 UI(JS/CSS) 캐시만 갱신 — localStorage·IndexedDB는 유지
    // (직원 '선택회사 저장'·'자동 로그인 유지' 및 Firebase persistence 보존)
    win.webContents.session.clearCache().catch(() => {});
    win.webContents.session.clearStorageData({
        storages: ['serviceworkers', 'cachestorage'],
    }).catch(() => {});

    if (process.env.ELECTRON_START_URL) {
        win.loadURL(process.env.ELECTRON_START_URL);
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
        const win = createWindow();
        setupAutoUpdater(win);
        // 앱이 프로토콜 호출로 처음 켜졌을 때 처리
        handleProtocolUrl(process.argv);
    });
}

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// --- 드라이브 문자 -> 원격 UNC 경로 자동 변환 헬퍼 함수 ---
function resolveUncPath(localPath) {
    if (!localPath) return localPath;
    const match = localPath.match(/^([A-Za-z]):\\(.*)/);
    if (!match) return localPath;
    
    const drive = match[1].toUpperCase() + ':';
    const relativePath = match[2];
    
    try {
        const { execSync } = require('child_process');
        const output = execSync(`net use ${drive}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
        const remoteMatch = output.match(/(?:Remote name|원격 이름)\s+([^\r\n]+)/i);
        if (remoteMatch) {
            const uncBase = remoteMatch[1].trim();
            // Windows 경로 백슬래시 슬래시 구분선 안전 결합
            const joined = path.join(uncBase, relativePath);
            console.log(`[UNC Resolver] Resolved ${localPath} -> ${joined}`);
            return joined;
        }
    } catch (e) {
        // Fail silent, return original
    }
    return localPath;
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

ipcMain.handle('create-desktop-shortcut', async () => {
    if (process.platform !== 'win32') {
        return { ok: false, error: 'Windows에서만 지원됩니다.' };
    }

    try {
        const desktopDir = app.getPath('desktop');
        const shortcutPath = path.join(desktopDir, 'EzPrintWork.lnk');
        const target = process.execPath;
        const icon = resolveShortcutIconPath();

        const ok = shell.writeShortcutLink(shortcutPath, 'replace', {
            target,
            cwd: path.dirname(target),
            icon,
            iconIndex: 0,
            description: 'EzPrintWork - 인쇄소 업무 관리',
            args: '',
        });

        if (!ok) {
            return { ok: false, error: '바로가기 생성에 실패했습니다.' };
        }

        return { ok: true, path: shortcutPath };
    } catch (error) {
        return { ok: false, error: error?.message || '바로가기 생성 중 오류가 발생했습니다.' };
    }
});
