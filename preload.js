const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
     updateModel: (modelName) => ipcRenderer.send('update-model', modelName),
     addNewModel: (modelInfo) => ipcRenderer.send('add-new-model', modelInfo),
     getCurrentModel: () => ipcRenderer.sendSync('get-current-model'),
     startServer: () => ipcRenderer.send('start-server'),
     stopServer: () => ipcRenderer.send('stop-server'),
     serverStatus: () => ipcRenderer.sendSync('server-status')
});
