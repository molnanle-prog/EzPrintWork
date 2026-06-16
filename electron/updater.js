const { app, ipcMain } = require('electron');

const { autoUpdater } = require('electron-updater');



let mainWindow = null;

let isManualUpdateCheck = false;



function sendUpdaterStatus(payload) {

    if (mainWindow && !mainWindow.isDestroyed()) {

        mainWindow.webContents.send('updater-status', payload);

    }

}



function setupAutoUpdater(win) {

    mainWindow = win;



    autoUpdater.autoDownload = false;

    autoUpdater.autoInstallOnAppQuit = false;

    autoUpdater.allowDowngrade = false;

    // 업데이트 파일은 앱 캐시에만 저장 (바탕화면·다운로드 폴더에 Setup.exe 생성 방지)
    autoUpdater.autoUpdaterCacheDirName = 'ezprintwork-updater';

    // GitHub private 저장소는 releases.atom 404 → ez-hub.kr/downloads/latest.yml 사용

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

    });



    autoUpdater.on('update-not-available', (info) => {

        sendUpdaterStatus({

            phase: 'none',

            version: info?.version || app.getVersion(),

        });

    });



    autoUpdater.on('error', (err) => {

        sendUpdaterStatus({

            phase: 'error',

            message: err?.message || String(err),

            silent: !isManualUpdateCheck,

        });

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

        sendUpdaterStatus({

            phase: 'downloaded',

            version: info.version,

        });

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

        try {

            await autoUpdater.downloadUpdate();

            return { ok: true };

        } catch (err) {

            return { ok: false, error: err?.message || String(err) };

        }

    });



    ipcMain.handle('updater-install', () => {

        autoUpdater.quitAndInstall(true, true);

        return { ok: true };

    });



    ipcMain.handle('get-app-version', () => app.getVersion());



    // 앱 기동 후 잠시 뒤 업데이트 확인 (실패 시 토스트 없음)

    setTimeout(() => {

        autoUpdater.checkForUpdates().catch((err) => {

            console.warn('[AutoUpdater] check failed:', err?.message || err);

        });

    }, 6000);

}



module.exports = { setupAutoUpdater };

