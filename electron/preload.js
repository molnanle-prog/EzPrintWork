
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    selectDirectory: (defaultPath) => ipcRenderer.invoke('select-directory', defaultPath || ''),
    selectFileOrFolder: (defaultPath) => ipcRenderer.invoke('select-file-or-folder', defaultPath || ''),
    /** 메모장 등 다중 파일 선택 — options: { filters, defaultPath, openSelectedFolderAfter } */
    selectFiles: (options) => ipcRenderer.invoke('select-files', options || {}),
    /** 바이너리 파일 복사 (NAS 첨부용) */
    copyFile: (source, dest) => ipcRenderer.invoke('copy-file', { source, dest }),
    resolveUncPath: (path) => ipcRenderer.invoke('resolve-unc-path', path),
    openPath: (path) => ipcRenderer.invoke('open-path', path),
    revealInFolder: (path) => ipcRenderer.invoke('reveal-in-folder', path),
    createDatabaseFile: (defaultPath) => ipcRenderer.invoke('create-database-file', defaultPath),
    saveFile: (path, content, expectedMtime) =>
        ipcRenderer.invoke('save-file', { path, content, expectedMtime }),
    saveFileBase64: (path, data) => ipcRenderer.invoke('save-file-base64', { path, data }),
    readFile: (path) => ipcRenderer.invoke('read-file', path),
    readFileBase64: (path) => ipcRenderer.invoke('read-file-base64', path),
    deleteFile: (path) => ipcRenderer.invoke('delete-file', path),
    exists: (path) => ipcRenderer.invoke('exists', path),
    ensureDir: (path) => ipcRenderer.invoke('ensure-dir', path),
    checkDirectoryStatus: (path) => ipcRenderer.invoke('check-directory-status', path),
    getDocumentsPath: () => ipcRenderer.invoke('get-documents-path'),
    getUserDataPath: () => ipcRenderer.invoke('get-user-data-path'),
    findLegacyDbFiles: () => ipcRenderer.invoke('find-legacy-db-files'),
    minimize: () => ipcRenderer.send('window-minimize'),
    maximize: () => ipcRenderer.send('window-maximize'),
    close: () => ipcRenderer.send('window-close'),
    lower: () => ipcRenderer.send('window-lower'),
    pinToBack: (enabled) => ipcRenderer.invoke('window-pin-back', !!enabled),
    setMonitoringFullscreen: (enabled) => ipcRenderer.invoke('window-monitoring-fullscreen', !!enabled),
    /** 메인 창 닫기 직전 — 세션 종료 훅 */
    onAppSessionEnding: (callback) => {
        const handler = () => callback();
        ipcRenderer.on('app-session-ending', handler);
        return () => ipcRenderer.removeListener('app-session-ending', handler);
    },
    notifyAppSessionEnded: () => ipcRenderer.send('app-session-ended'),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    fetchKoreanHolidays: () => ipcRenderer.invoke('fetch-korean-holidays'),
    updaterCheck: () => ipcRenderer.invoke('updater-check'),
    updaterDownload: () => ipcRenderer.invoke('updater-download'),
    updaterInstall: () => ipcRenderer.invoke('updater-install'),
    onUpdaterStatus: (callback) => {
        const handler = (_event, payload) => callback(payload);
        ipcRenderer.on('updater-status', handler);
        return () => ipcRenderer.removeListener('updater-status', handler);
    },
    onUpdaterBeforeInstall: (callback) => {
        const handler = (_event, payload) => callback(payload);
        ipcRenderer.on('updater-before-install', handler);
        return () => ipcRenderer.removeListener('updater-before-install', handler);
    },
    notifyUpdaterFlushReady: (requestId, ok) =>
        ipcRenderer.send('updater-flush-ack', { requestId, ok: ok === true }),
    createDesktopShortcut: () => ipcRenderer.invoke('create-desktop-shortcut'),
    getOpenAtLogin: () => ipcRenderer.invoke('get-open-at-login'),
    setOpenAtLogin: (enabled) => ipcRenderer.invoke('set-open-at-login', enabled),
    localDbLoad: (tenantId) => ipcRenderer.invoke('local-db-load', tenantId),
    localDbSaveJobs: (tenantId, jobs) => ipcRenderer.invoke('local-db-save-jobs', { tenantId, jobs }),
    localDbUpsertJob: (tenantId, job) => ipcRenderer.invoke('local-db-upsert-job', { tenantId, job }),
    localDbDeleteJob: (tenantId, jobId) => ipcRenderer.invoke('local-db-delete-job', { tenantId, jobId }),
    localDbSaveClients: (tenantId, clients) => ipcRenderer.invoke('local-db-save-clients', { tenantId, clients }),
    localDbUpsertClient: (tenantId, client) => ipcRenderer.invoke('local-db-upsert-client', { tenantId, client }),
    localDbUpsertJobAndClients: (tenantId, job, clients) =>
        ipcRenderer.invoke('local-db-upsert-job-and-clients', { tenantId, job, clients }),
    localDbDeleteClient: (tenantId, clientId) => ipcRenderer.invoke('local-db-delete-client', { tenantId, clientId }),
    localDbSaveSettings: (tenantId, settings) => ipcRenderer.invoke('local-db-save-settings', { tenantId, settings }),
    localDbSaveAux: (tenantId, collection, items) =>
        ipcRenderer.invoke('local-db-save-aux', { tenantId, collection, items }),
    localDbUpsertAux: (tenantId, collection, entity) =>
        ipcRenderer.invoke('local-db-upsert-aux', { tenantId, collection, entity }),
    localDbDeleteAux: (tenantId, collection, id) =>
        ipcRenderer.invoke('local-db-delete-aux', { tenantId, collection, id }),
    localDbAppendAudit: (tenantId, auditEvent) =>
        ipcRenderer.invoke('local-db-append-audit', { tenantId, auditEvent }),
    gatewaySetConfig: (config) => ipcRenderer.invoke('gateway-set-config', config),
    gatewayGetInfo: () => ipcRenderer.invoke('gateway-get-info'),
    gatewaySetHubTunnel: (enabled) => ipcRenderer.invoke('gateway-set-hub-tunnel', !!enabled),
    onRemoteTunnelReady: (callback) => {
        const handler = (_event, url) => callback(url);
        ipcRenderer.on('remote-tunnel-ready', handler);
        return () => ipcRenderer.removeListener('remote-tunnel-ready', handler);
    },
    /** 단면(simplex) 인쇄 — 양면 방지 */
    printDocument: () => ipcRenderer.invoke('print-document'),
    /** 인쇄와 동일 레이아웃으로 PDF 저장 */
    printDocumentToPdf: (defaultFileName) =>
        ipcRenderer.invoke('print-document-to-pdf', { defaultFileName }),
    /** 사내 메신저: OS 토스트 → 닫히면 작업표시줄 깜빡임 */
    chatNotify: (payload) => ipcRenderer.invoke('chat-notify', payload || {}),
    chatNotifyClear: () => ipcRenderer.send('chat-notify-clear'),
    /** 코페이 결제 — 메인 창과 분리된 BrowserWindow */
    openKorpayPayment: (payload) => ipcRenderer.invoke('open-korpay-payment', payload || {}),
    setPaymentNavigationLock: (locked) => ipcRenderer.invoke('set-payment-navigation-lock', !!locked),
    mailInboxGet: () => ipcRenderer.invoke('mail-inbox-get'),
    mailInboxSave: (payload) => ipcRenderer.invoke('mail-inbox-save', payload || {}),
    mailInboxClear: () => ipcRenderer.invoke('mail-inbox-clear'),
    mailInboxTest: () => ipcRenderer.invoke('mail-inbox-test'),
    mailInboxList: (payload) => ipcRenderer.invoke('mail-inbox-list', payload || {}),
    mailInboxRead: (uid) => ipcRenderer.invoke('mail-inbox-read', { uid }),
    openExternal: (url) => ipcRenderer.invoke('open-external', url),
    onChatNotificationClicked: (callback) => {
        const handler = (_event, payload) => callback(payload);
        ipcRenderer.on('chat-notification-clicked', handler);
        return () => ipcRenderer.removeListener('chat-notification-clicked', handler);
    },
});
