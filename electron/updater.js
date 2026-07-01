const { app, BrowserWindow, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');

let mainWindow = null;
let isManualUpdateCheck = false;
let isUpdateDownloadActive = false;
let installScheduled = false;
let pendingUpdateVersion = null;
let downloadCompleteFallbackTimer = null;

function clearDownloadCompleteFallback() {
    if (downloadCompleteFallbackTimer != null) {
        clearTimeout(downloadCompleteFallbackTimer);
        downloadCompleteFallbackTimer = null;
    }
}

/** progress 100%인데 update-downloaded가 누락될 때 설치 강제 진행 */
function scheduleDownloadCompleteFallback(version) {
    if (installScheduled || !isUpdateDownloadActive) return;
    clearDownloadCompleteFallback();
    downloadCompleteFallbackTimer = setTimeout(() => {
        if (installScheduled || !isUpdateDownloadActive) return;
        console.warn('[AutoUpdater] update-downloaded 미수신 — 설치 강제 진행');
        isUpdateDownloadActive = false;
        sendUpdaterStatus({ phase: 'downloaded', version });
        runQuitAndInstall(version);
    }, 6000);
}

function sendUpdaterStatus(payload) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('updater-status', payload);
    }
}

function closeAllWindowsForInstall() {
    for (const win of BrowserWindow.getAllWindows()) {
        try {
            if (!win.isDestroyed()) {
                win.removeAllListeners('close');
                win.destroy();
            }
        } catch (_) {
            /* ignore */
        }
    }
}

function runQuitAndInstall(version) {
    if (installScheduled) return;
    installScheduled = true;

    sendUpdaterStatus({
        phase: 'installing',
        version,
        message: '설치 프로그램을 실행합니다. 잠시만 기다려 주세요.',
    });

    setTimeout(() => {
        closeAllWindowsForInstall();
        autoUpdater.quitAndInstall(false, true);
    }, 400);
}

function setupAutoUpdater(win) {
    mainWindow = win;

    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowDowngrade = false;
    autoUpdater.autoUpdaterCacheDirName = 'ezprintwork-updater';

    autoUpdater.setFeedURL({
        provider: 'generic',
        url: 'https://ez-hub.kr/downloads/',
    });

    autoUpdater.on('checking-for-update', () => {
        sendUpdaterStatus({ phase: 'checking' });
    });

    autoUpdater.on('update-available', (info) => {
        pendingUpdateVersion = info.version;
        sendUpdaterStatus({
            phase: 'available',
            version: info.version,
            releaseDate: info.releaseDate,
        });
    });

    autoUpdater.on('update-not-available', (info) => {
        sendUpdaterStatus({
            phase: 'none',
            version: info?.version || app.getVersion(),
        });
    });

    autoUpdater.on('error', (err) => {
        const silent = !isManualUpdateCheck && !isUpdateDownloadActive && !installScheduled;
        clearDownloadCompleteFallback();
        sendUpdaterStatus({
            phase: 'error',
            message: err?.message || String(err),
            silent,
        });
        isUpdateDownloadActive = false;
        installScheduled = false;
    });

    autoUpdater.on('download-progress', (progress) => {
        const version = pendingUpdateVersion || autoUpdater.updateInfo?.version;
        sendUpdaterStatus({
            phase: 'downloading',
            version,
            percent: progress.percent,
            transferred: progress.transferred,
            total: progress.total,
        });
        if (progress.percent >= 99.5) {
            scheduleDownloadCompleteFallback(version || app.getVersion());
        }
    });

    autoUpdater.on('update-downloaded', (info) => {
        clearDownloadCompleteFallback();
        isUpdateDownloadActive = false;
        pendingUpdateVersion = info.version;
        sendUpdaterStatus({
            phase: 'downloaded',
            version: info.version,
        });
        runQuitAndInstall(info.version);
    });

    ipcMain.handle('updater-check', async () => {
        isManualUpdateCheck = true;
        try {
            const result = await autoUpdater.checkForUpdates();
            return {
                ok: true,
                currentVersion: app.getVersion(),
                updateInfo: result?.updateInfo
                    ? {
                          version: result.updateInfo.version,
                          releaseDate: result.updateInfo.releaseDate,
                      }
                    : null,
            };
        } catch (err) {
            return {
                ok: false,
                currentVersion: app.getVersion(),
                error: err?.message || String(err),
            };
        } finally {
            isManualUpdateCheck = false;
        }
    });

    ipcMain.handle('updater-download', async () => {
        isUpdateDownloadActive = true;
        installScheduled = false;
        sendUpdaterStatus({ phase: 'downloading', percent: 0 });
        try {
            await autoUpdater.downloadUpdate();
            clearDownloadCompleteFallback();
            if (!installScheduled) {
                const version =
                    autoUpdater.updateInfo?.version || pendingUpdateVersion || app.getVersion();
                isUpdateDownloadActive = false;
                sendUpdaterStatus({ phase: 'downloaded', version });
                runQuitAndInstall(version);
            }
            return { ok: true };
        } catch (err) {
            clearDownloadCompleteFallback();
            sendUpdaterStatus({
                phase: 'error',
                message: err?.message || String(err),
                silent: false,
            });
            isUpdateDownloadActive = false;
            return { ok: false, error: err?.message || String(err) };
        }
    });

    ipcMain.handle('updater-install', () => {
        runQuitAndInstall(app.getVersion());
        return { ok: true };
    });

    ipcMain.handle('get-app-version', () => app.getVersion());

    const runInitialCheck = () => {
        autoUpdater.checkForUpdates().catch((err) => {
            console.warn('[AutoUpdater] check failed:', err?.message || err);
        });
    };

    if (win && !win.isDestroyed()) {
        win.webContents.once('did-finish-load', () => {
            setTimeout(runInitialCheck, 1200);
        });
    } else {
        setTimeout(runInitialCheck, 3000);
    }
}

module.exports = { setupAutoUpdater };
