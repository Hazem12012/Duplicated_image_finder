const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

let mainWindow;
let pythonServer = null;

function createWindow() {
  // Verify preload script exists
  const preloadPath = path.join(__dirname, 'preload.js');
  if (!fs.existsSync(preloadPath)) {
    console.error('ERROR: preload.js not found at:', preloadPath);
    console.error('Current directory:', __dirname);
  } else {
    console.log('Preload script found at:', preloadPath);
  }

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    backgroundColor: '#1e1e1e',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath,
      webSecurity: true,
      enableRemoteModule: false
    },
    icon: path.join(__dirname, 'assets', 'icon.png'), // Optional icon
    titleBarStyle: 'default',
    frame: true
  });
  
  // Log when window is ready
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('Window finished loading');
    // Send a message to verify preload worked
    mainWindow.webContents.executeJavaScript(`
      console.log('Checking electronAPI...');
      console.log('electronAPI available:', typeof window.electronAPI !== 'undefined');
      if (window.electronAPI) {
        console.log('electronAPI methods:', Object.keys(window.electronAPI));
      }
    `).catch(err => console.error('Error checking electronAPI:', err));
  });
  
  // Log preload errors
  mainWindow.webContents.on('preload-error', (event, preloadPath, error) => {
    console.error('PRELOAD ERROR:', preloadPath);
    console.error('Error details:', error);
  });
  
  // Log console messages from renderer
  mainWindow.webContents.on('console-message', (event, level, message) => {
    if (level === 3) { // Error level
      console.error('Renderer error:', message);
    }
  });

  mainWindow.loadFile('index.html');

  // Open DevTools in development
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Start Python API server
function startPythonServer() {
  const pythonScript = path.join(__dirname, 'api_server.py');
  
  // Check if Python is available
  const pythonCommand = process.platform === 'win32' ? 'python' : 'python3';
  
  pythonServer = spawn(pythonCommand, [pythonScript], {
    cwd: __dirname,
    stdio: 'pipe'
  });

  pythonServer.stdout.on('data', (data) => {
    const output = data.toString();
    // Filter out Flask development server warnings
    if (!output.includes('WARNING: This is a development server') && 
        !output.includes('Do not use it in a production deployment')) {
      console.log(`Python Server: ${output.trim()}`);
    }
  });

  pythonServer.stderr.on('data', (data) => {
    const output = data.toString();
    // Filter out Flask development server warnings
    if (!output.includes('WARNING: This is a development server') && 
        !output.includes('Do not use it in a production deployment') &&
        !output.includes('Press CTRL+C to quit')) {
      console.error(`Python Server Error: ${output.trim()}`);
    }
  });

  pythonServer.on('close', (code) => {
    console.log(`Python server exited with code ${code}`);
  });

  // Wait a bit for server to start
  setTimeout(() => {
    if (mainWindow) {
      mainWindow.webContents.send('python-server-ready');
    }
  }, 2000);
}

// Stop Python server
function stopPythonServer() {
  if (pythonServer) {
    pythonServer.kill();
    pythonServer = null;
  }
}

// Handle folder selection
ipcMain.handle('select-folder', async () => {
  try {
    console.log('Folder selection dialog requested');
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'multiSelections'],
      title: 'Select Image Folder(s)'
    });
    
    console.log('Dialog result:', result);
    
    if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
      console.log('Selected folders:', result.filePaths);
      return result.filePaths;
    }
    console.log('Dialog cancelled or no folders selected');
    return null;
  } catch (error) {
    console.error('Error in select-folder handler:', error);
    throw error;
  }
});

// Handle file selection for output
ipcMain.handle('select-output-folder', async () => {
  try {
    console.log('Output folder selection dialog requested');
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Output Folder'
    });
    
    console.log('Output folder dialog result:', result);
    
    if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
      console.log('Selected output folder:', result.filePaths[0]);
      return result.filePaths[0];
    }
    console.log('Output folder dialog cancelled');
    return null;
  } catch (error) {
    console.error('Error in select-output-folder handler:', error);
    throw error;
  }
});

app.whenReady().then(() => {
  // Verify preload script before creating window
  const preloadPath = path.join(__dirname, 'preload.js');
  if (!fs.existsSync(preloadPath)) {
    console.error('CRITICAL ERROR: preload.js not found!');
    console.error('Expected at:', preloadPath);
    console.error('Current directory:', __dirname);
    console.error('Files in directory:', fs.readdirSync(__dirname).filter(f => f.endsWith('.js')));
  }
  
  createWindow();
  startPythonServer();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  stopPythonServer();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopPythonServer();
});

