
const { app, BrowserWindow, ipcMain, dialog, shell, Notification, screen } = require('electron');
const https = require('https');
const path = require('path');
const fs = require('fs');
const { setupAutoUpdater } = require('./updater');
const localDb = require('./localDb');
const { LocalGateway } = require('./localGateway');
const { remoteTunnel } = require('./remoteTunnel');
const { rendererServer } = require('./rendererServer');
const { setupMailInboxIpc } = require('./mailInbox');
const { sendWindowToBack } = require('./windowZorder');

const localGateway = new LocalGateway();

/** 결제 중 메인 창 외부 이동 차단 플래그 (createWindow 리스너에서 참조) */
let paymentNavigationLocked = false;
let korpayPayWin = null;

function isTrustedRendererUrl(rawUrl) {
    try {
        const url = new URL(rawUrl);
        if (url.protocol === 'file:') {
            const appRoot = path.resolve(__dirname, '..').toLowerCase();
            return decodeURIComponent(url.pathname).replace(/^\/([A-Za-z]:)/, '$1')
                .replace(/\//g, path.sep).toLowerCase().startsWith(appRoot);
        }
        return (url.protocol === 'http:' || url.protocol === 'https:') && (
            url.hostname === 'localhost'
            || url.hostname === '127.0.0.1'
            || (url.hostname === 'ez-hub.kr' && url.pathname.startsWith('/ezpw'))
        );
    } catch {
        return false;
    }
}

function assertTrustedIpc(event) {
    const senderUrl = event?.senderFrame?.url || event?.sender?.getURL?.() || '';
    if (!isTrustedRendererUrl(senderUrl)) {
        throw new Error('허용되지 않은 화면에서 요청했습니다.');
    }
}

function assertSafeFilePath(value) {
    const raw = String(value || '').trim();
    if (!raw || raw.length > 4096 || raw.includes('\0') || !path.isAbsolute(raw)) {
        throw new Error('올바른 절대 경로가 아닙니다.');
    }
    const normalized = path.resolve(raw);
    const lowered = normalized.toLowerCase();
    if (
        lowered.startsWith('\\\\.\\')
        || lowered.startsWith('\\\\?\\globalroot')
        || lowered === String(process.env.WINDIR || 'C:\\Windows').toLowerCase()
        || lowered.startsWith(`${String(process.env.WINDIR || 'C:\\Windows').toLowerCase()}\\`)
    ) {
        throw new Error('시스템 경로에는 접근할 수 없습니다.');
    }
    return normalized;
}

async function atomicWriteFile(filePath, content, encoding) {
    const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    let handle;
    try {
        handle = await fs.promises.open(tmpPath, 'w');
        await handle.writeFile(content, encoding);
        await handle.sync();
        await handle.close();
        handle = null;
        await fs.promises.rename(tmpPath, filePath);
    } catch (error) {
        if (handle) await handle.close().catch(() => {});
        await fs.promises.unlink(tmpPath).catch(() => {});
        throw error;
    }
}

// Windows 토스트가 앱 이름으로 표시되도록 (electron-builder appId와 동일)
if (process.platform === 'win32') {
    app.setAppUserModelId('com.ezprintwork.app');
}

// 설치본 화면은 localhost 로 연다 (Firebase 기본 허용 도메인). IPv6(::1)로 안 가게 IPv4로 고정.
app.commandLine.appendSwitch('host-resolver-rules', 'MAP localhost 127.0.0.1');

/** 메인 창 헬퍼 — 채팅 OS 알림 / 작업표시줄 깜빡임 */
function getMainWindow() {
    return BrowserWindow.getAllWindows().find((w) => w && !w.isDestroyed()) || null;
}

function stopChatTaskbarFlash() {
    const win = getMainWindow();
    if (win) win.flashFrame(false);
}

function startChatTaskbarFlash() {
    const win = getMainWindow();
    if (!win || win.isDestroyed()) return;
    // 이미 이 창을 보고 있으면 깜빡임 불필요
    if (win.isFocused() && !win.isMinimized()) return;
    // 새 메시지마다 다시 깜빡임 (한 번 켜 둔 상태는 재시작되지 않음)
    win.flashFrame(false);
    win.flashFrame(true);
}

function restoreMainWindow() {
    const win = getMainWindow();
    if (!win) return;
    if (win.isMinimized()) win.restore();
    if (!win.isVisible()) win.show();
    win.focus();
    stopChatTaskbarFlash();
}

/** 토스트 클릭 여부 — close 이벤트에서 깜빡임 여부 판단 */
let chatNotifyClicked = false;
/** 새 토스트로 교체할 때 이전 close로 깜빡이지 않도록 */
let suppressNextChatNotifyCloseFlash = false;
let activeChatNotification = null;
/** 다른 창 작업 중에도 EzPrintWork를 맨 뒤에 유지 */
let pinToBack = false;
/** 모니터링 모드 — 브라우저 전체화면이 아니라 이 창을 해당 모니터에 붙인다 */
let monitoringFullscreen = false;
let monitoringDisplayId = null;

function getControlWindow() {
    return getMainWindow() || BrowserWindow.getFocusedWindow();
}

function applyPinToBack(win) {
    if (!pinToBack) return;
    const target = win && !win.isDestroyed() ? win : getMainWindow();
    if (!target || target.isDestroyed() || target.isMinimized()) return;
    sendWindowToBack(target);
}

// 프로토콜 등록 (ezpw://)
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('ezpw', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('ezpw');
}

const WINDOW_MIN_WIDTH = 800;
const WINDOW_MIN_HEIGHT = 600;

function windowStatePath() {
    return path.join(app.getPath('userData'), 'window-state.json');
}

function displayIdForWindow(win) {
    try {
        return screen.getDisplayMatching(win.getBounds()).id;
    } catch {
        return monitoringDisplayId;
    }
}

function loadWindowState() {
    try {
        const raw = JSON.parse(fs.readFileSync(windowStatePath(), 'utf8'));
        const width = Math.max(WINDOW_MIN_WIDTH, Math.round(Number(raw.width) || 0));
        const height = Math.max(WINDOW_MIN_HEIGHT, Math.round(Number(raw.height) || 0));
        const x = Math.round(Number(raw.x));
        const y = Math.round(Number(raw.y));
        const displayId = Number(raw.displayId);
        const hasDisplayId = Number.isFinite(displayId);
        monitoringFullscreen = !!raw.monitoring;
        monitoringDisplayId = hasDisplayId ? displayId : null;
        if (!Number.isFinite(width) || !Number.isFinite(height)) {
            return { width: 1300, height: 900, monitoring: monitoringFullscreen };
        }
        const state = {
            width,
            height,
            isMaximized: !!raw.isMaximized,
            monitoring: monitoringFullscreen,
            displayId: hasDisplayId ? displayId : undefined,
        };
        if (!Number.isFinite(x) || !Number.isFinite(y)) return state;

        const displays = screen.getAllDisplays();
        const savedDisplay = hasDisplayId ? displays.find((d) => d.id === displayId) : null;
        if (hasDisplayId && !savedDisplay) {
            return { ...state, x, y, displayMissing: true };
        }

        const bounds = { x, y, width, height };
        const area = (savedDisplay || screen.getDisplayMatching(bounds)).workArea;
        const overlapW = Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x);
        const overlapH = Math.min(bounds.y + bounds.height, area.y + area.height) - Math.max(bounds.y, area.y);
        if (overlapW < 120 || overlapH < 80) {
            return {
                ...state,
                x: area.x,
                y: area.y,
                width: Math.min(width, area.width),
                height: Math.min(height, area.height),
            };
        }
        return { ...state, ...bounds };
    } catch {
        monitoringFullscreen = false;
        monitoringDisplayId = null;
        return { width: 1300, height: 900, monitoring: false };
    }
}

function saveWindowState(win) {
    if (!win || win.isDestroyed()) return;
    try {
        const isMaximized = win.isMaximized();
        const bounds = typeof win.getNormalBounds === 'function' ? win.getNormalBounds() : win.getBounds();
        const displayId = displayIdForWindow(win);
        if (displayId != null) monitoringDisplayId = displayId;
        fs.writeFileSync(windowStatePath(), JSON.stringify({
            x: Math.round(bounds.x),
            y: Math.round(bounds.y),
            width: Math.max(WINDOW_MIN_WIDTH, Math.round(bounds.width)),
            height: Math.max(WINDOW_MIN_HEIGHT, Math.round(bounds.height)),
            isMaximized,
            displayId: monitoringDisplayId,
            monitoring: monitoringFullscreen,
        }));
    } catch (err) {
        console.warn('[WindowState] save failed:', err);
    }
}

function applyMonitoringFullscreen(win, enabled) {
    if (!win || win.isDestroyed()) return;
    monitoringFullscreen = !!enabled;
    try {
        win.webContents.setBackgroundThrottling(!monitoringFullscreen);
    } catch {
        /* ignore */
    }
    if (monitoringFullscreen) {
        const displayId = displayIdForWindow(win);
        if (displayId != null) monitoringDisplayId = displayId;
        if (!win.isFullScreen()) win.setFullScreen(true);
    } else if (win.isFullScreen()) {
        win.setFullScreen(false);
    }
    saveWindowState(win);
}

function revealRestoredWindow(win, state) {
    if (!win || win.isDestroyed()) return;
    if (state.monitoring) {
        monitoringFullscreen = true;
        try {
            win.webContents.setBackgroundThrottling(false);
        } catch {
            /* ignore */
        }
        const displayId = displayIdForWindow(win);
        if (displayId != null) monitoringDisplayId = displayId;
        if (!win.isFullScreen()) win.setFullScreen(true);
    } else if (state.isMaximized) {
        win.maximize();
    }
    win.show();
    if (!state.monitoring) win.focus();
}

function placeWindowOnDisplay(win, display, state) {
    const area = state.monitoring ? display.bounds : display.workArea;
    win.setBounds({
        x: area.x,
        y: area.y,
        width: Math.min(state.width || area.width, area.width),
        height: Math.min(state.height || area.height, area.height),
    });
}

function showWindowWhenDisplayReady(win, state) {
    if (!state.displayMissing) {
        revealRestoredWindow(win, state);
        return;
    }
    const tryAttach = () => {
        if (win.isDestroyed()) return true;
        const display = screen.getAllDisplays().find((d) => d.id === state.displayId);
        if (!display) return false;
        placeWindowOnDisplay(win, display, state);
        revealRestoredWindow(win, state);
        return true;
    };
    if (tryAttach()) return;

    const onAdded = () => {
        if (tryAttach()) cleanup();
    };
    const timer = setTimeout(() => {
        cleanup();
        if (!win.isDestroyed() && !win.isVisible()) revealRestoredWindow(win, state);
    }, 20000);
    function cleanup() {
        clearTimeout(timer);
        screen.removeListener('display-added', onAdded);
    }
    screen.on('display-added', onAdded);
}

function watchMonitoringDisplay(win) {
    const onAdded = (_event, display) => {
        if (!monitoringFullscreen || win.isDestroyed()) return;
        if (monitoringDisplayId != null && display.id !== monitoringDisplayId) return;
        let currentId = null;
        try {
            currentId = screen.getDisplayMatching(win.getBounds()).id;
        } catch {
            currentId = null;
        }
        if (currentId === display.id && win.isFullScreen() && win.isVisible()) return;
        win.setFullScreen(false);
        win.setBounds({
            x: display.bounds.x,
            y: display.bounds.y,
            width: display.bounds.width,
            height: display.bounds.height,
        });
        win.setFullScreen(true);
        if (!win.isVisible()) win.show();
    };
    screen.on('display-added', onAdded);
    win.once('closed', () => screen.removeListener('display-added', onAdded));
}

async function createWindow() {
    const state = loadWindowState();
    const winOptions = {
        width: state.width || 1300,
        height: state.height || 900,
        minWidth: WINDOW_MIN_WIDTH,
        minHeight: WINDOW_MIN_HEIGHT,
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            backgroundThrottling: !state.monitoring,
        },
        title: "EzPrintWork",
        autoHideMenuBar: true,
        frame: false // 타이틀바 및 브라우저 기본 프레임을 숨겨 프로그램 창처럼 구현
    };
    if (Number.isFinite(state.x) && Number.isFinite(state.y)) {
        winOptions.x = state.x;
        winOptions.y = state.y;
    }
    const win = new BrowserWindow(winOptions);
    watchMonitoringDisplay(win);

    win.once('ready-to-show', () => {
        showWindowWhenDisplayReady(win, state);
    });

    let saveTimer = null;
    const scheduleSaveWindowState = () => {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => saveWindowState(win), 400);
    };
    win.on('move', scheduleSaveWindowState);
    win.on('resize', scheduleSaveWindowState);
    win.on('maximize', scheduleSaveWindowState);
    win.on('unmaximize', scheduleSaveWindowState);

    win.on('blur', () => applyPinToBack(win));
    win.on('focus', () => stopChatTaskbarFlash());

    // 렌더러가 정상 종료 보고(라이선스·NAS presence)를 마칠 때까지 창 닫기 대기
    let sessionEndAllowClose = false;
    let sessionEndInProgress = false;
    win.on('close', (e) => {
        saveWindowState(win);
        if (sessionEndAllowClose || win.isDestroyed()) return;
        if (sessionEndInProgress) {
            e.preventDefault();
            return;
        }
        e.preventDefault();
        sessionEndInProgress = true;

        const finishClose = () => {
            sessionEndAllowClose = true;
            sessionEndInProgress = false;
            if (!win.isDestroyed()) win.close();
        };

        const timeout = setTimeout(finishClose, 3000);
        const onEnded = () => {
            clearTimeout(timeout);
            ipcMain.removeListener('app-session-ended', onEnded);
            finishClose();
        };
        ipcMain.once('app-session-ended', onEnded);
        try {
            win.webContents.send('app-session-ending');
        } catch {
            clearTimeout(timeout);
            ipcMain.removeListener('app-session-ended', onEnded);
            finishClose();
        }
    });

    // 웹 UI(JS/CSS) 캐시만 갱신 — localStorage·IndexedDB는 유지
    // (직원 '선택회사 저장'·'자동 로그인 유지' 및 Firebase persistence 보존)
    win.webContents.session.clearCache().catch(() => {});
    win.webContents.session.clearStorageData({
        storages: ['serviceworkers', 'cachestorage'],
    }).catch(() => {});

    // 팝업에 preload를 물려주면 앱 세션이 새로 claim되어 메인 창이 로그아웃될 수 있음.
    // preload 없이 허용: 문서 미리보기·코페이·구글/Firebase. 그 외는 외부 브라우저.
    win.webContents.setWindowOpenHandler(({ url }) => {
        const noPreloadPrefs = {
            nodeIntegration: false,
            contextIsolation: true,
        };
        const allowNoPreload = (width, height) => ({
            action: 'allow',
            overrideBrowserWindowOptions: {
                width,
                height,
                autoHideMenuBar: true,
                webPreferences: noPreloadPrefs,
            },
        });

        if (!url || url === 'about:blank') {
            return allowNoPreload(520, 740);
        }

        try {
            const u = new URL(url);
            const host = u.hostname;
            const hash = u.hash || '';
            const isAppHost =
                host === 'localhost' ||
                host === '127.0.0.1' ||
                host === 'ez-hub.kr';
            const isDocPreview =
                isAppHost &&
                (hash.includes('/job-order-preview/') || hash.includes('/quote-preview/'));
            if (isDocPreview) {
                return allowNoPreload(1280, 900);
            }

            const inAppPopup =
                host === 'payments.korpay.com' ||
                host.endsWith('.korpay.com') ||
                host === 'accounts.google.com' ||
                host.endsWith('.google.com') ||
                host.endsWith('.firebaseapp.com') ||
                host.endsWith('.googleapis.com');
            if (inAppPopup) {
                return allowNoPreload(520, 740);
            }
        } catch (_) {
            return { action: 'deny' };
        }

        shell.openExternal(url).catch(() => {});
        return { action: 'deny' };
    });

    // preload가 있는 메인 창은 앱 출처 밖으로 이동하지 못하게 한다.
    const guardMainNavigation = (event, url) => {
        if (isTrustedRendererUrl(url) && !paymentNavigationLocked) return;
        event.preventDefault();
        if (/^https:\/\//i.test(String(url || '')) && !paymentNavigationLocked) {
            shell.openExternal(url).catch(() => {});
        }
    };
    win.webContents.on('will-navigate', guardMainNavigation);
    win.webContents.on('will-redirect', guardMainNavigation);

    if (process.env.ELECTRON_START_URL) {
        await win.loadURL(process.env.ELECTRON_START_URL);
    } else if (process.defaultApp || !app.isPackaged) {
        await win.loadURL('http://localhost:5173/');
    } else {
        // file:// 은 Firebase 구글 로그인이 auth/unauthorized-domain 로 막힘 → 루프백만 사용
        const distDir = path.join(__dirname, '..', 'dist');
        const url = await rendererServer.ensure(distDir, app.getPath('userData'));
        await win.loadURL(url);
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

    app.whenReady().then(async () => {
        ensureDesktopShortcut();
        const win = await createWindow();
        setupAutoUpdater(win);
        void localGateway.start();
        // 앱이 프로토콜 호출로 처음 켜졌을 때 처리
        handleProtocolUrl(process.argv);
    });
}

app.on('before-quit', () => {
    remoteTunnel.stop();
    rendererServer.stop();
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
ipcMain.handle('select-directory', async (event, defaultPath) => {
    const parent = BrowserWindow.fromWebContents(event.sender)
        || BrowserWindow.getFocusedWindow()
        || BrowserWindow.getAllWindows()[0];
    const start = typeof defaultPath === 'string' ? defaultPath.trim() : '';
    const dialogOptions = {
        properties: ['openDirectory'],
        ...(start ? { defaultPath: start } : {}),
    };
    const { canceled, filePaths } = parent
        ? await dialog.showOpenDialog(parent, dialogOptions)
        : await dialog.showOpenDialog(dialogOptions);
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

// 2. 경로 선택 (작업 등록용) — Windows에서 openFile+openDirectory 혼합 시 NAS UNC가 막혀 폴더만 선택
ipcMain.handle('select-file-or-folder', async (_event, options = {}) => {
    const defaultPath =
        (typeof options === 'string' ? options : options?.defaultPath || '').trim() || undefined;
    const { canceled, filePaths } = await dialog.showOpenDialog({
        title: '경로 선택',
        defaultPath,
        // openFile과 같이 쓰면 「이 위치를 열 수 없습니다」가 NAS에서 자주 발생
        properties: ['openDirectory'],
    });
    return canceled ? null : resolveUncPath(filePaths[0]);
});

/** 메모장 첨부 — 다중 파일. 기본 위치 내 PC(C:\), 선택 후 그 폴더 탐색기 열기 */
ipcMain.handle('select-files', async (_event, options = {}) => {
    const filters =
        Array.isArray(options?.filters) && options.filters.length
            ? options.filters
            : [
                { name: '첨부 파일', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'pdf', 'ai', 'psd', 'eps', 'zip', 'txt', 'doc', 'docx'] },
                { name: '모든 파일', extensions: ['*'] },
            ];
    // Windows: C:\ ≈ 내 PC에서 드라이브 선택에 가까운 시작점
    const defaultPath = options?.defaultPath || 'C:\\';
    const openSelectedFolder = options?.openSelectedFolderAfter !== false;

    const { canceled, filePaths } = await dialog.showOpenDialog({
        title: '메모장 첨부 파일 선택',
        defaultPath,
        properties: ['openFile', 'multiSelections'],
        filters,
    });
    if (canceled || !filePaths?.length) return [];

    const resolved = filePaths.map((p) => resolveUncPath(p));
    if (openSelectedFolder) {
        try {
            const folder = path.dirname(resolved[0]);
            if (folder) await shell.openPath(folder);
        } catch (_) { /* ignore */ }
    }
    return resolved;
});

ipcMain.handle('copy-file', async (event, { source, dest }) => {
    try {
        assertTrustedIpc(event);
        if (!source || !dest) return { success: false, error: '경로가 비어 있습니다.' };
        source = assertSafeFilePath(source);
        dest = assertSafeFilePath(dest);
        const dir = path.dirname(dest);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.copyFileSync(source, dest);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('ensure-dir', async (event, dirPath) => {
    try {
        assertTrustedIpc(event);
        if (!dirPath) return { success: false, error: '경로가 비어 있습니다.' };
        dirPath = assertSafeFilePath(dirPath);
        if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
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

// 3. 경로 열기 (탐색기/기본 앱)
ipcMain.handle('open-path', async (event, targetPath) => {
    if (!targetPath) return false;
    try {
        assertTrustedIpc(event);
        targetPath = assertSafeFilePath(targetPath);
        await shell.openPath(targetPath);
        return true;
    } catch (e) {
        console.error("경로 열기 오류:", e);
        return false;
    }
});

/** 파일이면 탐색기에서 해당 위치 선택 표시, 폴더면 폴더 열기 */
ipcMain.handle('reveal-in-folder', async (event, targetPath) => {
    if (!targetPath) return false;
    try {
        assertTrustedIpc(event);
        targetPath = assertSafeFilePath(targetPath);
        if (fs.existsSync(targetPath) && fs.statSync(targetPath).isFile()) {
            shell.showItemInFolder(targetPath);
            return true;
        }
        const result = await shell.openPath(targetPath);
        return !result;
    } catch (e) {
        console.error('위치 열기 오류:', e);
        return false;
    }
});

// 4. 파일 저장 (비동기 — NAS 동기 I/O로 창 멈춤 방지)
ipcMain.handle('save-file', async (event, { path: filePath, content, expectedMtime }) => {
    try {
        assertTrustedIpc(event);
        filePath = assertSafeFilePath(filePath);
        if (expectedMtime !== undefined && expectedMtime !== null && expectedMtime !== '') {
            let current = 0;
            try {
                const st = await fs.promises.stat(filePath);
                current = st.mtimeMs;
            } catch (err) {
                const code = err && typeof err === 'object' && 'code' in err ? err.code : null;
                if (code !== 'ENOENT') throw err;
            }
            if (Number(expectedMtime) !== current) {
                return { success: false, conflict: true };
            }
        }
        const dir = path.dirname(filePath);
        await atomicWriteFile(filePath, content, 'utf8');
        return { success: true };
    } catch (e) {
        console.error("파일 저장 중 오류 발생:", e);
        const errMsg = e instanceof Error ? e.message : (typeof e === 'string' ? e : JSON.stringify(e));
        return { success: false, error: errMsg || '알 수 없는 파일 저장 오류' };
    }
});

ipcMain.handle('save-file-base64', async (event, { path: filePath, data }) => {
    try {
        assertTrustedIpc(event);
        filePath = assertSafeFilePath(filePath);
        const dir = path.dirname(filePath);
        await atomicWriteFile(filePath, Buffer.from(String(data || ''), 'base64'));
        return { success: true };
    } catch (e) {
        console.error('바이너리 파일 저장 중 오류 발생:', e);
        const errMsg = e instanceof Error ? e.message : (typeof e === 'string' ? e : JSON.stringify(e));
        return { success: false, error: errMsg || '알 수 없는 파일 저장 오류' };
    }
});

ipcMain.handle('read-file-base64', async (event, filePath) => {
    try {
        assertTrustedIpc(event);
        filePath = assertSafeFilePath(filePath);
        const stats = await fs.promises.stat(filePath);
        const buf = await fs.promises.readFile(filePath);
        return { success: true, data: buf.toString('base64'), mtime: stats.mtimeMs };
    } catch (e) {
        const code = e && typeof e === 'object' && 'code' in e ? e.code : null;
        return { success: false, error: code === 'ENOENT' ? 'ENOENT' : e.message };
    }
});

ipcMain.handle('delete-file', async (event, filePath) => {
    try {
        assertTrustedIpc(event);
        if (!filePath) return { success: false, error: '경로가 비어 있습니다.' };
        filePath = assertSafeFilePath(filePath);
        if (fs.existsSync(filePath)) await fs.promises.unlink(filePath);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// 5. 파일 읽기 (비동기)
ipcMain.handle('read-file', async (event, filePath) => {
    try {
        assertTrustedIpc(event);
        filePath = assertSafeFilePath(filePath);
        try {
            const stats = await fs.promises.stat(filePath);
            const data = await fs.promises.readFile(filePath, 'utf8');
            return { success: true, data, mtime: stats.mtimeMs };
        } catch (err) {
            const code = err && typeof err === 'object' && 'code' in err ? err.code : null;
            if (code !== 'ENOENT') {
                throw err;
            }
        }
        // 자가 치유: 확장자 없는 레거시 파일 마이그레이션 (.json 파일 요청 시 확장자 없는 파일 자동 로드 및 복사)
        if (filePath.endsWith('.json')) {
            const noExtPath = filePath.slice(0, -5);
            try {
                const stats = await fs.promises.stat(noExtPath);
                console.log(`[Self-Healing] Migrating extensionless database file: ${noExtPath} -> ${filePath}`);
                const data = await fs.promises.readFile(noExtPath, 'utf8');
                await fs.promises.writeFile(filePath, data, 'utf8');
                return { success: true, data, mtime: stats.mtimeMs };
            } catch {
                /* no legacy file */
            }
        }
        return { success: false, error: 'ENOENT' };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// 6. 파일 존재 여부 확인
ipcMain.handle('exists', async (event, filePath) => {
    assertTrustedIpc(event);
    return fs.existsSync(assertSafeFilePath(filePath));
});

// 6.1. 폴더 존재 및 읽기/쓰기 권한 검사
ipcMain.handle('check-directory-status', async (event, dirPath) => {
    assertTrustedIpc(event);
    return await checkDirectoryStatus(assertSafeFilePath(dirPath));
});

// 7.0. 앱 사용자 데이터 폴더 (네트워크 장애 시 보관 섀도 복사)
const KOREAN_HOLIDAY_ICS_URL =
    'https://calendar.google.com/calendar/ical/ko.south_korea%23holiday%40group.v.calendar.google.com/public/basic.ics';

function fetchKoreanHolidayIcs() {
    const readUrl = (url, redirectsLeft) => new Promise((resolve) => {
        const req = https.get(url, { headers: { 'User-Agent': 'EzPrintWork' } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectsLeft > 0) {
                res.resume();
                const next = new URL(res.headers.location, url).toString();
                resolve(readUrl(next, redirectsLeft - 1));
                return;
            }
            if (res.statusCode !== 200) {
                res.resume();
                resolve({ ok: false, error: `http-${res.statusCode}` });
                return;
            }
            let data = '';
            let settled = false;
            const finish = (result) => {
                if (settled) return;
                settled = true;
                resolve(result);
            };
            res.setEncoding('utf8');
            res.on('data', (chunk) => {
                data += chunk;
                if (data.length > 2_000_000) {
                    req.destroy();
                    finish({ ok: false, error: 'too-large' });
                }
            });
            res.on('end', () => finish({ ok: true, ics: data }));
        });
        req.setTimeout(8000, () => {
            req.destroy();
            resolve({ ok: false, error: 'timeout' });
        });
        req.on('error', (error) => resolve({ ok: false, error: error.message || 'network' }));
    });
    return readUrl(KOREAN_HOLIDAY_ICS_URL, 3);
}

ipcMain.handle('fetch-korean-holidays', async (event) => {
    assertTrustedIpc(event);
    return fetchKoreanHolidayIcs();
});

ipcMain.handle('get-user-data-path', async () => {
    try {
        return app.getPath('userData');
    } catch (e) {
        console.error('userData 경로 획득 중 오류:', e);
        return null;
    }
});

ipcMain.handle('gateway-set-config', async (event, config) => {
    assertTrustedIpc(event);
    if (config?.archiveRoot) config.archiveRoot = assertSafeFilePath(config.archiveRoot);
    localGateway.setConfig(config || {});
    await localGateway.start();
    return { ok: true };
});

ipcMain.handle('gateway-get-info', async (event) => {
    assertTrustedIpc(event);
    const info = await localGateway.start();
    return { ...info, remoteUrl: remoteTunnel.getUrl() || undefined };
});

ipcMain.handle('gateway-set-hub-tunnel', async (event, enabled) => {
    assertTrustedIpc(event);
    if (!enabled) {
        remoteTunnel.stop();
        return { ok: true, remoteUrl: null };
    }
    const info = await localGateway.start();
    if (info?.port) await remoteTunnel.ensure(info.port);
    return { ok: true, remoteUrl: remoteTunnel.getUrl() || null };
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

ipcMain.handle('local-db-upsert-job-and-clients', async (event, { tenantId, job, clients }) => {
    try {
        assertTrustedIpc(event);
        const ok = localDb.upsertJobAndClients(tenantId, job, clients || []);
        return { success: !!ok };
    } catch (e) {
        return { success: false, error: e.message };
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

ipcMain.handle('local-db-append-audit', async (event, { tenantId, auditEvent }) => {
    try {
        assertTrustedIpc(event);
        return { success: localDb.appendAuditEvent(tenantId, auditEvent) };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// 8. 창 제어 (최소화, 최대화, 닫기)
ipcMain.on('window-minimize', () => {
    const win = getControlWindow();
    if (win) win.minimize();
});

ipcMain.on('window-maximize', () => {
    const win = getControlWindow();
    if (win) {
        if (win.isMaximized()) {
            win.unmaximize();
        } else {
            win.maximize();
        }
    }
});

ipcMain.on('window-close', () => {
    const win = getControlWindow();
    if (win) win.close();
});

ipcMain.on('window-lower', () => {
    const win = getControlWindow();
    if (win) sendWindowToBack(win);
});

ipcMain.handle('window-pin-back', async (_event, enabled) => {
    pinToBack = !!enabled;
    const win = getControlWindow();
    if (win && pinToBack) sendWindowToBack(win);
    return { ok: true, enabled: pinToBack };
});

ipcMain.handle('window-monitoring-fullscreen', (event, enabled) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return { ok: false, enabled: false };
    applyMonitoringFullscreen(win, !!enabled);
    return { ok: true, enabled: monitoringFullscreen };
});

/**
 * 코페이 결제창 — 메인 BrowserWindow와 분리 (세션/로그인 킥·returnUrl 네비게이션 간섭 방지)
 * payload: { action: string, fields: Array<[string, string]> }
 */
ipcMain.handle('set-payment-navigation-lock', async (_event, locked) => {
    paymentNavigationLocked = !!locked;
    return { ok: true, locked: paymentNavigationLocked };
});

function isAppResultUrl(url) {
    try {
        const u = new URL(url);
        const blob = `${u.hash || ''}${u.pathname || ''}${u.search || ''}`;
        if (u.hostname === 'ez-hub.kr') {
            return /#\/payment\/(success|fail)/i.test(blob) || /\/payment\/(success|fail)/i.test(blob);
        }
        if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
            return /#\/payment\/(success|fail)/i.test(blob) || /\/payment\/(success|fail)/i.test(blob);
        }
    } catch (_) {
        /* ignore */
    }
    return false;
}

function extractPaymentReason(url) {
    try {
        const u = new URL(url);
        const fromSearch = u.searchParams.get('reason');
        if (fromSearch) return fromSearch;
        const qi = u.hash.indexOf('?');
        if (qi >= 0) {
            return new URLSearchParams(u.hash.slice(qi + 1)).get('reason') || '';
        }
    } catch (_) {
        /* ignore */
    }
    return '';
}

function paymentResultHtml(kind, detail) {
    const title = kind === 'success' ? '결제가 완료되었습니다' : kind === 'fail' ? '결제가 취소되거나 실패했습니다' : '결제 창';
    const color = kind === 'success' ? '#059669' : kind === 'fail' ? '#e11d48' : '#334155';
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;background:#0f172a;color:#e2e8f0;">
<h1 style="color:${color};font-size:22px;margin-bottom:12px;">${title}</h1>
<p style="opacity:.8;font-size:14px;max-width:420px;text-align:center;line-height:1.5;white-space:pre-wrap;">${detail || '이 창을 닫고 메인 화면에서 요금제를 확인해 주세요.'}</p>
<button onclick="window.close()" style="margin-top:24px;padding:12px 28px;border:0;border-radius:12px;background:#2563eb;color:#fff;font-weight:700;cursor:pointer;">창 닫기</button>
</body></html>`;
}

function resolveKorpayBridgeUrl() {
    if (process.env.ELECTRON_START_URL) {
        try {
            return new URL('/korpay-bridge.html', process.env.ELECTRON_START_URL).href;
        } catch (_) {
            /* fall through */
        }
    }
    if (process.defaultApp || !app.isPackaged) {
        return 'http://localhost:5173/korpay-bridge.html';
    }
    return 'https://ez-hub.kr/ezpw/korpay-bridge.html';
}

ipcMain.handle('open-korpay-payment', async (_event, payload = {}) => {
    const sdkBase = String(payload.sdkBase || '').trim().replace(/\/$/, '');
    const payment = payload.payment && typeof payload.payment === 'object' ? payload.payment : null;
    if (!sdkBase || !/^https?:\/\//i.test(sdkBase) || !payment) {
        return { ok: false, error: '결제 파라미터가 올바르지 않습니다.' };
    }

    // 이전 실패 화면을 재사용하지 않음
    try {
        if (korpayPayWin && !korpayPayWin.isDestroyed()) {
            korpayPayWin.removeAllListeners('closed');
            korpayPayWin.destroy();
        }
    } catch (_) {
        /* ignore */
    }
    korpayPayWin = null;

    const cfgJson = JSON.stringify({ sdkBase, payment }).replace(/</g, '\\u003c');
    const bridgeUrl = resolveKorpayBridgeUrl();

    // parent 없이 독립 창 — 팝업 차단/부모 제약과 무관하게 표시
    korpayPayWin = new BrowserWindow({
        width: 920,
        height: 720,
        modal: false,
        autoHideMenuBar: true,
        title: '카드 결제',
        alwaysOnTop: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            partition: 'persist:korpay-payment',
        },
    });

    const payWin = korpayPayWin;
    payWin.setMenuBarVisibility(false);
    let resultKind = 'closed';

    const showResult = (kind, detail) => {
        resultKind = kind;
        payWin
            .loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(paymentResultHtml(kind, detail)))
            .catch(() => {});
    };

    const intercept = (event, url) => {
        // 지연 없이 즉시 가로챔 — 늦추면 ez-hub 로그인 SPA가 결제창에 로드됨
        if (!url || url.startsWith('data:') || url.startsWith('file:')) return;
        try {
            const host = new URL(url).hostname;
            if (
                host === 'payments.korpay.com' ||
                host.endsWith('.korpay.com') ||
                host.includes('cloudfunctions.net')
            ) {
                return;
            }
            // 브릿지 자신은 허용
            if (
                (host === 'localhost' || host === '127.0.0.1') &&
                /korpay-bridge\.html/i.test(url)
            ) {
                return;
            }
        } catch (_) {
            /* continue */
        }
        // ez-hub / 앱 로그인·결제결과 로의 이동은 전부 차단 후 요약 화면
        if (
            isAppResultUrl(url) ||
            /ez-hub\.kr/i.test(url) ||
            (/localhost|127\.0\.0\.1/i.test(url) && !/korpay-bridge\.html/i.test(url))
        ) {
            console.log('[Korpay] blocked navigation to app:', url);
            event.preventDefault();
            const fail = /payment\/fail|login/i.test(url) || !/payment\/success/i.test(url);
            const reason = extractPaymentReason(url);
            showResult(
                fail ? 'fail' : 'success',
                fail
                    ? `결제가 완료되지 않았습니다.${reason ? `\n사유 코드: ${reason}` : ''}${
                        reason === 'E013'
                          ? '\n(요청 시간 만료 — 결제 준비 시각이 서버 UTC로 잡혀 만료된 경우가 많습니다. 수정 배포 후 다시 시도해 주세요.)'
                          : ''
                      }\n\n메인 창에서 다시 결제를 시도해 주세요.`
                    : '결제가 승인되었습니다. 창을 닫은 뒤 메인 화면 요금제를 확인해 주세요.'
            );
        }
    };

    payWin.webContents.on('will-navigate', intercept);
    payWin.webContents.on('will-redirect', intercept);

    // DevTools는 기본 비활성 — 필요 시 Ctrl+Shift+I
    // (열어두면 결제 iframe 영역이 줄어 타임아웃으로 보이기 쉬움)

    try {
        await new Promise((resolve, reject) => {
            const finish = () => {
                try {
                    if (korpayPayWin === payWin) korpayPayWin = null;
                } catch (_) {
                    /* ignore */
                }
                resolve();
            };
            payWin.on('closed', finish);

            payWin.webContents.once('did-finish-load', async () => {
                try {
                    await payWin.webContents.executeJavaScript(
                        `window.__EZPW_START_KORPAY__ && window.__EZPW_START_KORPAY__(${cfgJson});`,
                        true
                    );
                } catch (err) {
                    console.warn('[Korpay] start failed:', err);
                    showResult('fail', `결제창 시작 실패: ${err && err.message ? err.message : String(err)}`);
                }
            });

            payWin.loadURL(bridgeUrl).catch((err) => {
                console.warn('[Korpay] loadURL failed:', err);
                try {
                    payWin.close();
                } catch (_) {
                    /* ignore */
                }
                reject(err);
            });
        });
    } catch (err) {
        return { ok: false, error: err && err.message ? err.message : '결제창을 열 수 없습니다.' };
    }

    return { ok: true, closed: true, result: resultKind };
});

/**
 * 사내 메신저 OS 토스트 + 작업표시줄 깜빡임.
 * 다른 창이 앞에 있으면 메시지가 오는 즉시 아이콘을 깜빡인다.
 * 클릭 시 창 복원 + 렌더러에 chat-notification-clicked 전달.
 */
ipcMain.handle('chat-notify', async (_event, payload = {}) => {
    const title = String(payload.title || '새 메시지').slice(0, 120);
    const body = String(payload.body || '').slice(0, 240);

    chatNotifyClicked = false;
    startChatTaskbarFlash();

    if (!Notification.isSupported()) {
        return { ok: false, reason: 'unsupported' };
    }

    try {
        if (activeChatNotification) {
            suppressNextChatNotifyCloseFlash = true;
            try {
                activeChatNotification.close();
            } catch (_) {
                /* ignore */
            }
            activeChatNotification = null;
        }

        const notification = new Notification({
            title,
            body,
            silent: true, // 앱 내 띵동과 중복 방지
        });
        activeChatNotification = notification;

        notification.on('click', () => {
            chatNotifyClicked = true;
            activeChatNotification = null;
            restoreMainWindow();
            const win = getMainWindow();
            if (win) {
                win.webContents.send('chat-notification-clicked', {
                    messageId: payload.messageId || null,
                    senderId: payload.senderId || null,
                    receiverId: payload.receiverId || null,
                });
            }
            stopChatTaskbarFlash();
        });

        notification.on('close', () => {
            if (activeChatNotification === notification) {
                activeChatNotification = null;
            }
            if (suppressNextChatNotifyCloseFlash) {
                suppressNextChatNotifyCloseFlash = false;
                return;
            }
            // 클릭으로 확인한 경우는 깜빡이지 않음
            if (!chatNotifyClicked) {
                startChatTaskbarFlash();
            }
        });

        notification.show();
        return { ok: true };
    } catch (e) {
        startChatTaskbarFlash();
        return { ok: false, reason: e?.message || String(e) };
    }
});

/** 채팅 확인 시 작업표시줄 깜빡임 중지 */
ipcMain.on('chat-notify-clear', () => {
    chatNotifyClicked = true;
    if (activeChatNotification) {
        suppressNextChatNotifyCloseFlash = true;
        try {
            activeChatNotification.close();
        } catch (_) {
            /* ignore */
        }
        activeChatNotification = null;
    }
    stopChatTaskbarFlash();
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

setupMailInboxIpc(ipcMain);

ipcMain.handle('open-external', async (_event, url) => {
    const s = String(url || '');
    const allowed =
        /^https:\/\//i.test(s)
        || /^ms-settings:/i.test(s)
        || /^ms-phone:/i.test(s)
        || /^ms-windows-store:/i.test(s)
        || /^supertoss:/i.test(s);
    if (!allowed) return { ok: false };
    try {
        await shell.openExternal(s);
        return { ok: true };
    } catch (err) {
        return { ok: false, error: err?.message || String(err) };
    }
});
