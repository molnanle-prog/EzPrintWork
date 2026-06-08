
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
    findLegacyDbFiles: () => ipcRenderer.invoke('find-legacy-db-files'),
    minimize: () => ipcRenderer.send('window-minimize'),
    maximize: () => ipcRenderer.send('window-maximize'),
    close: () => ipcRenderer.send('window-close')
});
