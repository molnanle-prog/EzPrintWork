const { app, BrowserWindow, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');

let mainWindow = null;
let isManualUpdateCheck = false;
let isUpdateDownloadActive = false;
let installScheduled = false;

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

    autoUpdater.autoDownload = true;
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
        sendUpdaterStatus({
            phase: 'available',
            version: info.version,
            releaseDate: info.releaseDate,
        });
        sendUpdaterStatus({
            phase: 'downloading',
            version: info.version,
            percent: 0,
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
        sendUpdaterStatus({
            phase: 'error',
            message: err?.message || String(err),
            silent,
        });
        isUpdateDownloadActive = false;
        installScheduled = false;
    });

    autoUpdater.on('download-progress', (progress) => {
        sendUpdaterStatus({
            phase: 'downloading',
            percent: progress.percent,
            transferred: progress.transferred,
            total: progress.total,
        });
    });

    autoUpdater.on('update-downloaded', (info) => {
        isUpdateDownloadActive = false;
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
            return { ok: true };
        } catch (err) {
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

    setTimeout(() => {
        autoUpdater.checkForUpdates().catch((err) => {
            console.warn('[AutoUpdater] check failed:', err?.message || err);
        });
    }, 6000);
}

module.exports = { setupAutoUpdater };
