
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    selectDirectory: () => ipcRenderer.invoke('select-directory'),
    selectFileOrFolder: () => ipcRenderer.invoke('select-file-or-folder'),
    /** 메모장 등 다중 파일 선택 — options: { filters, defaultPath, openSelectedFolderAfter } */
    selectFiles: (options) => ipcRenderer.invoke('select-files', options || {}),
    /** 바이너리 파일 복사 (NAS 첨부용) */
    copyFile: (source, dest) => ipcRenderer.invoke('copy-file', { source, dest }),
    resolveUncPath: (path) => ipcRenderer.invoke('resolve-unc-path', path),
    openPath: (path) => ipcRenderer.invoke('open-path', path),
    revealInFolder: (path) => ipcRenderer.invoke('reveal-in-folder', path),
    createDatabaseFile: (defaultPath) => ipcRenderer.invoke('create-database-file', defaultPath),
    saveFile: (path, content) => ipcRenderer.invoke('save-file', { path, content }),
    readFile: (path) => ipcRenderer.invoke('read-file', path),
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
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    updaterCheck: () => ipcRenderer.invoke('updater-check'),
    updaterDownload: () => ipcRenderer.invoke('updater-download'),
    updaterInstall: () => ipcRenderer.invoke('updater-install'),
    onUpdaterStatus: (callback) => {
        const handler = (_event, payload) => callback(payload);
        ipcRenderer.on('updater-status', handler);
        return () => ipcRenderer.removeListener('updater-status', handler);
    },
    createDesktopShortcut: () => ipcRenderer.invoke('create-desktop-shortcut'),
    getOpenAtLogin: () => ipcRenderer.invoke('get-open-at-login'),
    setOpenAtLogin: (enabled) => ipcRenderer.invoke('set-open-at-login', enabled),
    localDbLoad: (tenantId) => ipcRenderer.invoke('local-db-load', tenantId),
    localDbSaveJobs: (tenantId, jobs) => ipcRenderer.invoke('local-db-save-jobs', { tenantId, jobs }),
    localDbUpsertJob: (tenantId, job) => ipcRenderer.invoke('local-db-upsert-job', { tenantId, job }),
    localDbDeleteJob: (tenantId, jobId) => ipcRenderer.invoke('local-db-delete-job', { tenantId, jobId }),
    localDbSaveClients: (tenantId, clients) => ipcRenderer.invoke('local-db-save-clients', { tenantId, clients }),
    localDbUpsertClient: (tenantId, client) => ipcRenderer.invoke('local-db-upsert-client', { tenantId, client }),
    localDbDeleteClient: (tenantId, clientId) => ipcRenderer.invoke('local-db-delete-client', { tenantId, clientId }),
    localDbSaveSettings: (tenantId, settings) => ipcRenderer.invoke('local-db-save-settings', { tenantId, settings }),
    localDbSaveAux: (tenantId, collection, items) =>
        ipcRenderer.invoke('local-db-save-aux', { tenantId, collection, items }),
    localDbUpsertAux: (tenantId, collection, entity) =>
        ipcRenderer.invoke('local-db-upsert-aux', { tenantId, collection, entity }),
    localDbDeleteAux: (tenantId, collection, id) =>
        ipcRenderer.invoke('local-db-delete-aux', { tenantId, collection, id }),
    gatewaySetConfig: (config) => ipcRenderer.invoke('gateway-set-config', config),
    gatewayGetInfo: () => ipcRenderer.invoke('gateway-get-info'),
    /** 단면(simplex) 인쇄 — 양면 방지 */
    printDocument: () => ipcRenderer.invoke('print-document'),
    /** 인쇄와 동일 레이아웃으로 PDF 저장 */
    printDocumentToPdf: (defaultFileName) =>
        ipcRenderer.invoke('print-document-to-pdf', { defaultFileName }),
});
