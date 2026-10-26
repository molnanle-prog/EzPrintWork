const { app, BrowserWindow, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');

let mainWindow = null;
let isManualUpdateCheck = false;
let isUpdateDownloadActive = false;
let installScheduled = false;
let pendingUpdateVersion = null;
let downloadCompleteFallbackTimer = null;
let checkInFlight = null;
let updateDownloadedReady = false;
let flushRequestSequence = 0;

function parseVersionParts(v) {
    return String(v || '')
        .split('.')
        .map((n) => parseInt(n, 10) || 0);
}

/** a > b 이면 true */
function isNewerVersion(a, b) {
    const pa = parseVersionParts(a);
    const pb = parseVersionParts(b);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const da = pa[i] ?? 0;
        const db = pb[i] ?? 0;
        if (da > db) return true;
        if (da < db) return false;
    }
    return false;
}

function clearDownloadCompleteFallback() {
    if (downloadCompleteFallbackTimer != null) {
        clearTimeout(downloadCompleteFallbackTimer);
        downloadCompleteFallbackTimer = null;
    }
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

function requestRendererFlush(timeoutMs = 40000) {
    if (!mainWindow || mainWindow.isDestroyed()) return Promise.resolve(true);
    const requestId = `update-${Date.now()}-${++flushRequestSequence}`;
    return new Promise((resolve) => {
        let settled = false;
        const finish = (ok) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            ipcMain.removeListener('updater-flush-ack', onAck);
            resolve(ok);
        };
        const onAck = (event, payload = {}) => {
            if (event.sender !== mainWindow.webContents || payload.requestId !== requestId) return;
            finish(payload.ok === true);
        };
        const timer = setTimeout(() => finish(false), timeoutMs);
        ipcMain.on('updater-flush-ack', onAck);
        mainWindow.webContents.send('updater-before-install', { requestId });
    });
}

async function runQuitAndInstall(version) {
    if (installScheduled) return;
    if (!updateDownloadedReady) {
        sendUpdaterStatus({
            phase: 'error',
            message: '업데이트 파일 검증이 끝나지 않았습니다. 다운로드 완료 후 다시 시도해 주세요.',
            silent: false,
        });
        return;
    }
    installScheduled = true;

    sendUpdaterStatus({
        phase: 'flushing',
        version,
        currentVersion: app.getVersion(),
        message: '저장 중인 작업을 안전하게 마무리하고 있습니다.',
    });
    const flushed = await requestRendererFlush();
    if (!flushed) {
        installScheduled = false;
        sendUpdaterStatus({
            phase: 'error',
            message: '저장 대기 작업을 확인하지 못해 업데이트 설치를 중단했습니다. 다시 시도해 주세요.',
            silent: false,
        });
        return;
    }
    sendUpdaterStatus({
        phase: 'installing',
        version,
        currentVersion: app.getVersion(),
        message: '설치 프로그램을 실행합니다. 잠시만 기다려 주세요.',
    });

    setTimeout(() => {
        closeAllWindowsForInstall();
        autoUpdater.quitAndInstall(false, true);
    }, 400);
}

function getReadyUpdateInfo() {
    try {
        return autoUpdater.updateInfo || null;
    } catch {
        return null;
    }
}

async function ensureUpdateChecked() {
    const ready = getReadyUpdateInfo();
    if (ready?.version) return ready;

    if (checkInFlight) {
        return checkInFlight;
    }

    checkInFlight = autoUpdater
        .checkForUpdates()
        .then((result) => result?.updateInfo || getReadyUpdateInfo())
        .finally(() => {
            checkInFlight = null;
        });
    return checkInFlight;
}

function setupAutoUpdater(win) {
    mainWindow = win;

    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowDowngrade = false;
    autoUpdater.autoUpdaterCacheDirName = 'ezprintwork-updater';
    // CDN/프록시 캐시로 stale latest.yml을 받지 않도록
    autoUpdater.requestHeaders = {
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
    };

    autoUpdater.setFeedURL({
        provider: 'generic',
        url: 'https://ez-hub.kr/downloads/',
    });

    autoUpdater.on('checking-for-update', () => {
        if (!isUpdateDownloadActive && !installScheduled) {
            sendUpdaterStatus({ phase: 'checking' });
        }
    });

    autoUpdater.on('update-available', (info) => {
        if (isUpdateDownloadActive || installScheduled) return;
        const current = app.getVersion();
        if (!isNewerVersion(info.version, current)) {
            sendUpdaterStatus({ phase: 'none', version: current, currentVersion: current });
            return;
        }
        pendingUpdateVersion = info.version;
        sendUpdaterStatus({
            phase: 'available',
            version: info.version,
            currentVersion: current,
            releaseDate: info.releaseDate,
        });
    });

    autoUpdater.on('update-not-available', (info) => {
        if (isUpdateDownloadActive || installScheduled) return;
        pendingUpdateVersion = null;
        sendUpdaterStatus({
            phase: 'none',
            version: info?.version || app.getVersion(),
            currentVersion: app.getVersion(),
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
        updateDownloadedReady = false;
        // 설치 직전 오류만 롤백 — 이미 quitAndInstall 예정이면 유지
        if (!installScheduled) {
            installScheduled = false;
        }
    });

    autoUpdater.on('download-progress', (progress) => {
        const version = pendingUpdateVersion || autoUpdater.updateInfo?.version;
        sendUpdaterStatus({
            phase: 'downloading',
            version,
            currentVersion: app.getVersion(),
            percent: progress.percent,
            transferred: progress.transferred,
            total: progress.total,
        });
        if (progress.percent >= 99.5) {
            // 설치는 반드시 update-downloaded 이벤트 이후에만 진행한다.
        }
    });

    autoUpdater.on('update-downloaded', (info) => {
        clearDownloadCompleteFallback();
        isUpdateDownloadActive = false;
        updateDownloadedReady = true;
        pendingUpdateVersion = info.version;
        sendUpdaterStatus({
            phase: 'downloaded',
            version: info.version,
            currentVersion: app.getVersion(),
        });
        void runQuitAndInstall(info.version);
    });

    ipcMain.handle('updater-check', async () => {
        isManualUpdateCheck = true;
        try {
            if (isUpdateDownloadActive || installScheduled) {
                return {
                    ok: true,
                    currentVersion: app.getVersion(),
                    updateInfo: pendingUpdateVersion
                        ? { version: pendingUpdateVersion }
                        : null,
                    busy: true,
                };
            }
            const updateInfo = (await ensureUpdateChecked()) || null;
            const currentVersion = app.getVersion();
            if (updateInfo?.version && !isNewerVersion(updateInfo.version, currentVersion)) {
                pendingUpdateVersion = null;
                sendUpdaterStatus({ phase: 'none', version: currentVersion, currentVersion });
                return { ok: true, currentVersion, updateInfo: null };
            }
            if (updateInfo?.version) {
                pendingUpdateVersion = updateInfo.version;
            }
            return {
                ok: true,
                currentVersion,
                updateInfo: updateInfo
                    ? {
                          version: updateInfo.version,
                          releaseDate: updateInfo.releaseDate,
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
        if (installScheduled) {
            return { ok: true, busy: true, message: '이미 설치를 진행 중입니다.' };
        }
        if (isUpdateDownloadActive) {
            return { ok: true, busy: true, message: '이미 다운로드 중입니다.' };
        }

        isUpdateDownloadActive = true;
        updateDownloadedReady = false;
        sendUpdaterStatus({
            phase: 'downloading',
            percent: 0,
            version: pendingUpdateVersion || undefined,
            currentVersion: app.getVersion(),
        });

        try {
            // 이중 클릭·폴백 알림으로 updateInfo가 비어 있으면 먼저 확인
            let updateInfo = await ensureUpdateChecked();
            const currentVersion = app.getVersion();

            if (!updateInfo?.version) {
                isUpdateDownloadActive = false;
                sendUpdaterStatus({
                    phase: 'none',
                    version: currentVersion,
                    currentVersion,
                });
                return {
                    ok: false,
                    alreadyLatest: true,
                    error: '이미 최신 버전입니다. 추가 업데이트가 없습니다.',
                };
            }

            if (!isNewerVersion(updateInfo.version, currentVersion)) {
                isUpdateDownloadActive = false;
                pendingUpdateVersion = null;
                sendUpdaterStatus({
                    phase: 'none',
                    version: currentVersion,
                    currentVersion,
                });
                return {
                    ok: false,
                    alreadyLatest: true,
                    error: `이미 최신 버전(v${currentVersion})입니다.`,
                };
            }

            pendingUpdateVersion = updateInfo.version;
            try {
                await autoUpdater.downloadUpdate();
            } catch (dlErr) {
                const dlMsg = dlErr?.message || String(dlErr);
                if (/check update first/i.test(dlMsg)) {
                    await autoUpdater.checkForUpdates();
                    await autoUpdater.downloadUpdate();
                } else {
                    throw dlErr;
                }
            }
            clearDownloadCompleteFallback();
            return { ok: true };
        } catch (err) {
            clearDownloadCompleteFallback();
            const message = err?.message || String(err);
            // 이미 진행 중이면 에러로 보이지 않음
            if (/already in progress/i.test(message)) {
                return { ok: true, busy: true };
            }
            isUpdateDownloadActive = false;
            sendUpdaterStatus({
                phase: 'error',
                message: /check update first/i.test(message)
                    ? '업데이트 확인이 필요합니다. 다시 시도해 주세요.'
                    : message,
                silent: false,
            });
            return { ok: false, error: message };
        }
    });

    ipcMain.handle('updater-install', () => {
        if (installScheduled) {
            return { ok: true, busy: true };
        }
        if (!updateDownloadedReady) {
            return { ok: false, error: '업데이트 다운로드와 검증이 아직 완료되지 않았습니다.' };
        }
        void runQuitAndInstall(pendingUpdateVersion || app.getVersion());
        return { ok: true };
    });

    ipcMain.handle('get-app-version', () => app.getVersion());

    const runInitialCheck = (attempt = 1) => {
        if (isUpdateDownloadActive || installScheduled) return;
        autoUpdater
            .checkForUpdates()
            .then((result) => {
                if (isUpdateDownloadActive || installScheduled) return;
                const version = result?.updateInfo?.version;
                const current = app.getVersion();
                if (version && isNewerVersion(version, current)) {
                    pendingUpdateVersion = version;
                    sendUpdaterStatus({
                        phase: 'available',
                        version,
                        currentVersion: current,
                    });
                } else {
                    pendingUpdateVersion = null;
                    sendUpdaterStatus({ phase: 'none', version: current, currentVersion: current });
                }
            })
            .catch((err) => {
                console.warn(`[AutoUpdater] check failed (try ${attempt}):`, err?.message || err);
                if (attempt < 4 && !isUpdateDownloadActive && !installScheduled) {
                    setTimeout(() => runInitialCheck(attempt + 1), attempt * 8000);
                }
            });
    };

    if (win && !win.isDestroyed()) {
        win.webContents.once('did-finish-load', () => {
            setTimeout(() => runInitialCheck(1), 1500);
            setTimeout(() => runInitialCheck(1), 20000);
            setTimeout(() => runInitialCheck(1), 60000);
        });
    } else {
        setTimeout(() => runInitialCheck(1), 3000);
    }
}

module.exports = { setupAutoUpdater };
