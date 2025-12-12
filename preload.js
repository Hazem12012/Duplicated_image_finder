// Preload script - runs in isolated context before page loads
try {
  const { contextBridge, ipcRenderer } = require('electron');
  const fs = require('fs');
  const path = require('path');

  console.log('[Preload] Script loading...');

  // Expose protected methods that allow the renderer process to use
  // the ipcRenderer without exposing the entire object
  contextBridge.exposeInMainWorld('electronAPI', {
    selectFolder: () => {
      console.log('[Preload] selectFolder called');
      return ipcRenderer.invoke('select-folder');
    },
    selectOutputFolder: () => {
      console.log('[Preload] selectOutputFolder called');
      return ipcRenderer.invoke('select-output-folder');
    },
    onPythonServerReady: (callback) => {
      console.log('[Preload] onPythonServerReady registered');
      return ipcRenderer.on('python-server-ready', callback);
    },
    getFileSize: (filePath) => {
      try {
        const stats = fs.statSync(filePath);
        return stats.size;
      } catch (e) {
        return 0;
      }
    },
    normalizePath: (filePath) => {
      // Normalize Windows paths for file:// URLs
      return filePath.replace(/\\/g, '/');
    }
  });

  console.log('[Preload] electronAPI exposed successfully');
  console.log('[Preload] Available methods:', Object.keys({
    selectFolder: true,
    selectOutputFolder: true,
    onPythonServerReady: true,
    getFileSize: true,
    normalizePath: true
  }));

} catch (error) {
  console.error('[Preload] ERROR loading preload script:', error);
  // Try to expose a minimal API even if there's an error
  try {
    const { contextBridge, ipcRenderer } = require('electron');
    contextBridge.exposeInMainWorld('electronAPI', {
      selectFolder: () => ipcRenderer.invoke('select-folder'),
      selectOutputFolder: () => ipcRenderer.invoke('select-output-folder'),
      onPythonServerReady: () => {},
      getFileSize: () => 0,
      normalizePath: (p) => p
    });
    console.log('[Preload] Fallback API exposed');
  } catch (fallbackError) {
    console.error('[Preload] Failed to expose fallback API:', fallbackError);
  }
}

