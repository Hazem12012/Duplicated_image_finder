const API_BASE_URL = 'http://localhost:5000';

let selectedFolders = [];
let duplicateGroups = [];
let isScanning = false;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing...');
    console.log('window object:', typeof window);
    console.log('electronAPI available:', !!window.electronAPI);
    console.log('window keys:', Object.keys(window).filter(k => k.includes('electron')));
    
    if (window.electronAPI) {
        console.log('✓ electronAPI is available');
        console.log('electronAPI methods:', Object.keys(window.electronAPI));
    } else {
        console.error('✗ electronAPI is NOT available');
        console.error('This usually means the preload script failed to load');
    }
    
    initializeEventListeners();
    checkPythonServer();
    
    // Check if electronAPI is available - try multiple times
    let checkCount = 0;
    const checkAPI = () => {
        checkCount++;
        const statusDiv = document.getElementById('apiStatus');
        
        if (!window.electronAPI) {
            console.warn(`electronAPI check ${checkCount}: Still not available`);
            
            if (checkCount < 5) {
                // Try again
                setTimeout(checkAPI, 500);
            } else {
                // Give up after 5 tries
                console.error('WARNING: electronAPI is still not available after multiple checks!');
                updateProgress('Error: Electron API not loaded. Please restart the app.', 0);
                if (statusDiv) {
                    statusDiv.textContent = '⚠️ Electron API not available - Please restart the app';
                    statusDiv.style.display = 'block';
                    statusDiv.style.color = '#ff4444';
                }
            }
        } else {
            console.log('✓ electronAPI is available');
            if (statusDiv) {
                statusDiv.textContent = '✓ Ready';
                statusDiv.style.color = '#4CAF50';
                statusDiv.style.display = 'block';
                setTimeout(() => {
                    statusDiv.style.display = 'none';
                }, 3000);
            }
        }
    };
    
    // Start checking after a short delay
    setTimeout(checkAPI, 500);
});

function initializeEventListeners() {
    // Folder selection
    document.getElementById('selectFolderBtn').addEventListener('click', selectFolders);
    document.getElementById('selectOutputBtn').addEventListener('click', selectOutputFolder);
    
    // Settings
    document.getElementById('similarityThreshold').addEventListener('input', (e) => {
        document.getElementById('thresholdValue').textContent = e.target.value + '%';
    });
    
    document.getElementById('hashThreshold').addEventListener('input', (e) => {
        document.getElementById('hashThresholdValue').textContent = e.target.value;
    });
    
    // Action buttons
    document.getElementById('scanBtn').addEventListener('click', startScan);
    document.getElementById('deleteBtn').addEventListener('click', deleteDuplicates);
    document.getElementById('organizeBtn').addEventListener('click', organizeByPerson);
    document.getElementById('clearResultsBtn').addEventListener('click', clearResults);
}

function checkPythonServer() {
    fetch(`${API_BASE_URL}/health`)
        .then(response => response.json())
        .then(data => {
            if (data.status === 'ok') {
                updateProgress('Python server ready', 0);
            }
        })
        .catch(error => {
            updateProgress('Waiting for Python server...', 0);
            setTimeout(checkPythonServer, 2000);
        });
}

async function selectFolders() {
    console.log('Select folders clicked');
    
    const btn = document.getElementById('selectFolderBtn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Opening...';
    }
    
    if (!window.electronAPI) {
        console.error('electronAPI is not available!');
        const statusDiv = document.getElementById('apiStatus');
        if (statusDiv) {
            statusDiv.textContent = '⚠️ Electron API not available - Please restart';
            statusDiv.style.display = 'block';
        }
        alert('Error: Electron API not available.\n\nPlease:\n1. Close the app completely\n2. Restart using start.bat\n\nIf the problem persists, check the console (F12) for errors.');
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Select Folder(s)';
        }
        return;
    }
    
    if (!window.electronAPI.selectFolder) {
        console.error('selectFolder method not available!');
        alert('Error: Folder selection method not available. Please restart the application.');
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Select Folder(s)';
        }
        return;
    }
    
    try {
        console.log('Calling electronAPI.selectFolder()...');
        const folders = await window.electronAPI.selectFolder();
        console.log('Received folders:', folders);
        
        if (folders && folders.length > 0) {
            selectedFolders = folders;
            updateSelectedFolders();
            document.getElementById('folderPath').value = folders.length === 1 
                ? folders[0] 
                : `${folders.length} folders selected`;
            console.log('Folders selected successfully:', selectedFolders);
        } else {
            console.log('No folders selected (user cancelled)');
        }
    } catch (error) {
        console.error('Error selecting folders:', error);
        alert('Error selecting folders: ' + error.message + '\n\nCheck the console (F12) for details.');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Select Folder(s)';
        }
    }
}

async function selectOutputFolder() {
    console.log('Select output folder clicked');
    
    if (!window.electronAPI) {
        console.error('electronAPI is not available!');
        alert('Error: Electron API not available. Please restart the application.');
        return;
    }
    
    if (!window.electronAPI.selectOutputFolder) {
        console.error('selectOutputFolder method not available!');
        alert('Error: Output folder selection not available. Please restart the application.');
        return;
    }
    
    try {
        console.log('Calling electronAPI.selectOutputFolder()...');
        const folder = await window.electronAPI.selectOutputFolder();
        console.log('Received output folder:', folder);
        
        if (folder) {
            document.getElementById('outputFolder').value = folder;
            console.log('Output folder set successfully');
        } else {
            console.log('No output folder selected (user cancelled)');
        }
    } catch (error) {
        console.error('Error selecting output folder:', error);
        alert('Error selecting output folder: ' + error.message);
    }
}

function updateSelectedFolders() {
    const container = document.getElementById('selectedFolders');
    container.innerHTML = '';
    
    selectedFolders.forEach((folder, index) => {
        const tag = document.createElement('div');
        tag.className = 'folder-tag';
        tag.innerHTML = `
            <span>${folder}</span>
            <span class="remove" onclick="removeFolder(${index})">×</span>
        `;
        container.appendChild(tag);
    });
}

function removeFolder(index) {
    selectedFolders.splice(index, 1);
    updateSelectedFolders();
    if (selectedFolders.length === 0) {
        document.getElementById('folderPath').value = '';
    } else if (selectedFolders.length === 1) {
        document.getElementById('folderPath').value = selectedFolders[0];
    } else {
        document.getElementById('folderPath').value = `${selectedFolders.length} folders selected`;
    }
}

async function startScan() {
    if (selectedFolders.length === 0) {
        alert('Please select at least one folder');
        return;
    }
    
    if (isScanning) {
        return;
    }
    
    isScanning = true;
    duplicateGroups = [];
    
    document.getElementById('scanBtn').disabled = true;
    document.getElementById('deleteBtn').disabled = true;
    document.getElementById('organizeBtn').disabled = true;
    
    clearResults();
    updateProgress('Scanning for duplicates...', 10);
    
    const settings = {
        source_dirs: selectedFolders,
        output_dir: document.getElementById('outputFolder').value || 'organized_images',
        hash_threshold: parseInt(document.getElementById('hashThreshold').value),
        similarity_threshold: parseInt(document.getElementById('similarityThreshold').value) / 100,
        use_cnn: document.getElementById('useCNN').checked,
        auto_delete_low_res: document.getElementById('autoDeleteLowRes').checked,
        move_duplicates: document.getElementById('moveDuplicates').checked
    };
    
    try {
        updateProgress('Finding duplicates...', 30);
        
        const response = await fetch(`${API_BASE_URL}/api/find-duplicates`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(settings)
        });
        
        if (!response.ok) {
            throw new Error('Failed to scan images');
        }
        
        const data = await response.json();
        
        // Check for errors in response
        if (data.error) {
            throw new Error(data.error);
        }
        
        // Convert duplicates object to array
        duplicateGroups = data.duplicates ? Object.values(data.duplicates) : [];
        
        console.log('Scan results:', {
            total_images: data.total_images,
            duplicate_groups: duplicateGroups.length,
            duplicates_found: data.duplicates_found
        });
        
        updateProgress('Scan complete!', 100);
        displayResults(duplicateGroups);
        updateStatistics(data);
        
        document.getElementById('deleteBtn').disabled = duplicateGroups.length === 0;
        document.getElementById('organizeBtn').disabled = false; // Enable organize button after scan
        
    } catch (error) {
        console.error('Error scanning:', error);
        updateProgress('Error: ' + error.message, 0);
        alert('Error scanning images: ' + error.message);
    } finally {
        isScanning = false;
        document.getElementById('scanBtn').disabled = false;
    }
}

function displayResults(groups) {
    const container = document.getElementById('resultsContainer');
    container.innerHTML = '';
    
    if (!groups || groups.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>✅ No duplicates found!</p></div>';
        return;
    }
    
    console.log('Displaying', groups.length, 'duplicate groups');
    
    groups.forEach((group, groupIndex) => {
        if (!group || !group.files) {
            console.warn('Invalid group at index', groupIndex, group);
            return;
        }
        const groupDiv = document.createElement('div');
        groupDiv.className = 'duplicate-group';
        
        const files = group.files || [];
        const resolutions = group.resolutions || {};
        
        // Sort by resolution (highest first)
        const sortedFiles = files.map(file => {
            const res = resolutions[file] || [0, 0, 0];
            // Get file size from file system if possible
            let fileSize = 'N/A';
            try {
                if (window.electronAPI && window.electronAPI.getFileSize) {
                    const sizeBytes = window.electronAPI.getFileSize(file);
                    if (sizeBytes > 0) {
                        fileSize = formatBytes(sizeBytes);
                    }
                }
            } catch (e) {
                // Ignore
            }
            return {
                path: file,
                width: res[0] || 0,
                height: res[1] || 0,
                pixels: res[2] || 0,
                size: fileSize
            };
        }).sort((a, b) => b.pixels - a.pixels);
        
        groupDiv.innerHTML = `
            <div class="group-header">
                <div>
                    <span class="group-title">Group ${groupIndex + 1}</span>
                    <span class="group-count">(${files.length} duplicates)</span>
                </div>
            </div>
            ${sortedFiles.map((file, idx) => {
                const isKeep = idx === 0;
                return `
                    <div class="duplicate-item ${isKeep ? 'keep' : 'delete'}">
                        <img src="${getImageSrc(file.path)}" alt="Image" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'120\' height=\'120\'%3E%3Crect fill=\'%23333\' width=\'120\' height=\'120\'/%3E%3Ctext x=\'50%25\' y=\'50%25\' text-anchor=\'middle\' dy=\'.3em\' fill=\'%23999\' font-size=\'12\'%3EImage%3C/text%3E%3C/svg%3E'">
                        <div class="duplicate-info">
                            <div class="duplicate-path">${file.path}</div>
                            <div class="duplicate-details">
                                <div class="detail-item">
                                    <span class="detail-label">Resolution</span>
                                    <span class="detail-value">${file.width}×${file.height}</span>
                                </div>
                                <div class="detail-item">
                                    <span class="detail-label">Pixels</span>
                                    <span class="detail-value">${formatNumber(file.pixels)}</span>
                                </div>
                                <div class="detail-item">
                                    <span class="detail-label">Size</span>
                                    <span class="detail-value">${file.size}</span>
                                </div>
                            </div>
                        </div>
                        <div>
                            <span class="duplicate-badge ${isKeep ? 'badge-keep' : 'badge-delete'}">
                                ${isKeep ? '✓ KEEP' : '✗ DELETE'}
                            </span>
                        </div>
                    </div>
                `;
            }).join('')}
        `;
        
        container.appendChild(groupDiv);
    });
}

function updateStatistics(data) {
    const totalImages = data.total_images || 0;
    const duplicatesFound = data.duplicates_found || 0;
    const groups = duplicateGroups.length;
    const spaceSaved = data.space_saved || 0;
    
    document.getElementById('totalImages').textContent = totalImages;
    document.getElementById('duplicatesFound').textContent = duplicatesFound;
    document.getElementById('duplicateGroups').textContent = groups;
    document.getElementById('spaceSaved').textContent = formatBytes(spaceSaved);
}

function updateProgress(text, percent) {
    document.getElementById('progressText').textContent = text;
    const progressBar = document.getElementById('progressBar');
    progressBar.style.setProperty('--width', percent + '%');
    progressBar.setAttribute('data-percent', percent);
}

function clearResults() {
    document.getElementById('resultsContainer').innerHTML = 
        '<div class="empty-state"><p>👆 Select folder(s) and click "Scan Images" to find duplicates</p></div>';
    duplicateGroups = [];
    updateStatistics({ total_images: 0, duplicates_found: 0, space_saved: 0 });
}

async function deleteDuplicates() {
    if (duplicateGroups.length === 0) {
        return;
    }
    
    const totalToDelete = duplicateGroups.reduce((sum, g) => sum + (g.files ? g.files.length - 1 : 0), 0);
    const confirmed = confirm(`Are you sure you want to delete ${totalToDelete} duplicate image(s)?`);
    if (!confirmed) {
        return;
    }
    
    // Convert array back to object format for API
    const duplicatesObj = {};
    duplicateGroups.forEach((group, index) => {
        duplicatesObj[`group_${index}`] = group;
    });
    
    const settings = {
        duplicates: duplicatesObj,
        move_duplicates: document.getElementById('moveDuplicates').checked,
        auto_delete_low_res: document.getElementById('autoDeleteLowRes').checked
    };
    
    try {
        updateProgress('Deleting duplicates...', 50);
        
        const response = await fetch(`${API_BASE_URL}/api/delete-duplicates`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(settings)
        });
        
        if (!response.ok) {
            throw new Error('Failed to delete duplicates');
        }
        
        const data = await response.json();
        updateProgress('Duplicates deleted!', 100);
        alert(`Successfully ${data.action} ${data.count} duplicate(s)`);
        
        // Refresh scan
        setTimeout(() => startScan(), 1000);
        
    } catch (error) {
        console.error('Error deleting:', error);
        updateProgress('Error: ' + error.message, 0);
        alert('Error deleting duplicates: ' + error.message);
    }
}

async function organizeByPerson() {
    if (selectedFolders.length === 0) {
        alert('Please select at least one folder');
        return;
    }
    
    // Disable button during processing
    const btn = document.getElementById('organizeBtn');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Processing...';
    
    const settings = {
        source_dirs: selectedFolders,
        output_dir: document.getElementById('outputFolder').value || 'organized_images',
        use_cnn: document.getElementById('useCNN').checked
    };
    
    try {
        updateProgress('Starting organization by person...', 10);
        console.log('Organizing images by person with settings:', settings);
        
        const response = await fetch(`${API_BASE_URL}/api/organize-by-person`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(settings)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(errorData.error || 'Failed to organize images');
        }
        
        const data = await response.json();
        console.log('Organization result:', data);
        
        updateProgress('Organization complete!', 100);
        
        // Show detailed results
        let message = `✅ Organization Complete!\n\n`;
        message += `Images processed: ${data.images_processed}/${data.total_images}\n`;
        message += `Images with faces detected: ${data.faces_detected || 0}\n`;
        message += `Images without faces: ${data.no_faces || 0}\n`;
        message += `Person folders created: ${data.person_folders}\n`;
        message += `Output directory: ${data.output_dir}\n`;
        
        if (data.person_folders === 0 && data.faces_detected === 0) {
            message += `\n⚠️ No faces were detected in any images.\n`;
            message += `This could mean:\n`;
            message += `- Images don't contain clear faces\n`;
            message += `- face-recognition library needs to be installed\n`;
            message += `- Try using HOG model instead of CNN`;
        }
        
        if (data.errors && data.errors.length > 0) {
            message += `\n⚠️ ${data.errors.length} error(s) occurred`;
        }
        
        alert(message);
        
        // Update statistics
        if (data.person_folders > 0) {
            updateProgress(`Organized into ${data.person_folders} person folder(s)`, 100);
        }
        
    } catch (error) {
        console.error('Error organizing:', error);
        updateProgress('Error: ' + error.message, 0);
        
        let errorMessage = 'Error organizing images: ' + error.message;
        if (error.message.includes('face_recognition') || error.message.includes('dlib')) {
            errorMessage += '\n\nMake sure face-recognition library is properly installed.\n';
            errorMessage += 'Try: pip install face-recognition';
        }
        
        alert(errorMessage);
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

// Helper functions
function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function getImageSrc(filePath) {
    // Normalize path for file:// URL
    if (window.electronAPI && window.electronAPI.normalizePath) {
        const normalized = window.electronAPI.normalizePath(filePath);
        // Handle Windows drive letters (C:/path)
        if (normalized.match(/^[A-Z]:\//)) {
            return `file:///${normalized}`;
        }
        return `file://${normalized.startsWith('/') ? '' : '/'}${normalized}`;
    }
    // Fallback
    return `file:///${filePath.replace(/\\/g, '/')}`;
}

// Make removeFolder available globally
window.removeFolder = removeFolder;

