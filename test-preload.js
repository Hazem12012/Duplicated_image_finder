// Quick test to verify preload script can be loaded
const path = require('path');
const fs = require('fs');

const preloadPath = path.join(__dirname, 'preload.js');

console.log('Testing preload script...');
console.log('Current directory:', __dirname);
console.log('Preload path:', preloadPath);
console.log('Preload exists:', fs.existsSync(preloadPath));

if (fs.existsSync(preloadPath)) {
  try {
    const content = fs.readFileSync(preloadPath, 'utf8');
    console.log('Preload file size:', content.length, 'bytes');
    console.log('Preload contains contextBridge:', content.includes('contextBridge'));
    console.log('Preload contains electronAPI:', content.includes('electronAPI'));
    console.log('✓ Preload script looks valid');
  } catch (error) {
    console.error('✗ Error reading preload:', error);
  }
} else {
  console.error('✗ Preload script not found!');
}

