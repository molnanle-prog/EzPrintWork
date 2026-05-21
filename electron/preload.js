
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    selectDirectory: () => ipcRenderer.invoke('select-directory'),
    selectFileOrFolder: () => ipcRenderer.invoke('select-file-or-folder'),
    openPath: (path) => ipcRenderer.invoke('open-path', path),
    createDatabaseFile: (defaultPath) => ipcRenderer.invoke('create-database-file', defaultPath),
    saveFile: (path, content) => ipcRenderer.invoke('save-file', { path, content }),
    readFile: (path) => ipcRenderer.invoke('read-file', path),
    exists: (path) => ipcRenderer.invoke('exists', path),
    getDocumentsPath: () => ipcRenderer.invoke('get-documents-path')
});
