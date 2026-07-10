
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    selectDirectory: () => ipcRenderer.invoke('select-directory'),
    selectFileOrFolder: () => ipcRenderer.invoke('select-file-or-folder'),
    openPath: (path) => ipcRenderer.invoke('open-path', path),
    createDatabaseFile: (defaultPath) => ipcRenderer.invoke('create-database-file', defaultPath),
    saveFile: (path, content) => ipcRenderer.invoke('save-file', { path, content }),
    readFile: (path) => ipcRenderer.invoke('read-file', path),
    exists: (path) => ipcRenderer.invoke('exists', path),
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
    gatewaySetConfig: (config) => ipcRenderer.invoke('gateway-set-config', config),
    gatewayGetInfo: () => ipcRenderer.invoke('gateway-get-info'),
});
