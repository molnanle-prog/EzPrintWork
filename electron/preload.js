
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
});
