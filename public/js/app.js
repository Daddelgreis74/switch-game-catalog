// Global state
let gamesData = {};
let filteredGames = [];

// DOM Elements
const gamesGrid = document.getElementById('games-grid');
const loadingState = document.getElementById('loading-state');
const emptyState = document.getElementById('empty-state');
const statCount = document.getElementById('stat-count');
const statSize = document.getElementById('stat-size');

const searchInput = document.getElementById('search-input');
const typeFilter = document.getElementById('type-filter');
const sortSelect = document.getElementById('sort-select');

const scanBtn = document.getElementById('scan-btn');
const toggleUploadBtn = document.getElementById('toggle-upload-btn');
const uploadPanel = document.getElementById('upload-panel');

// Upload Elements
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const uploadProgressContainer = document.getElementById('upload-progress-container');
const uploadFilename = document.getElementById('upload-filename');
const uploadPercent = document.getElementById('upload-percent');
const progressBarFill = document.getElementById('progress-bar-fill');
const uploadStatus = document.getElementById('upload-status');

// Modal Elements
const detailsModal = document.getElementById('details-modal');
const modalBackdrop = document.getElementById('modal-backdrop');
const modalClose = document.getElementById('modal-close');
const modalIcon = document.getElementById('modal-icon');
const modalType = document.getElementById('modal-type');
const modalTitle = document.getElementById('modal-title');
const modalPublisher = document.getElementById('modal-publisher');
const modalTitleId = document.getElementById('modal-title-id');
const modalSize = document.getElementById('modal-size');
const modalFilepath = document.getElementById('modal-filepath');
const modalNestedPath = document.getElementById('modal-nestedpath');
const modalNestedItem = document.getElementById('modal-nested-item');
const modalLanguages = document.getElementById('modal-languages');
const modalDownloadBtn = document.getElementById('modal-download-btn');
const modalDeleteBtn = document.getElementById('modal-delete-btn');

// Keys Upload Elements
const keysOverlay = document.getElementById('keys-overlay');
const keysDropZone = document.getElementById('keys-drop-zone');
const keysFileInput = document.getElementById('keys-file-input');
const keysUploadStatus = document.getElementById('keys-upload-status');


// API Endpoints
const API_GAMES = '/api/games';
const API_SCAN = '/api/scan';
const API_UPLOAD = '/api/upload';

// Init
document.addEventListener('DOMContentLoaded', () => {
    fetchGames();
    setupEventListeners();
    setupUploadEvents();
    setupKeysUploadEvents();
});

// Event Listeners
function setupEventListeners() {
    // Search, Filter & Sort
    searchInput.addEventListener('input', applyFiltersAndSort);
    typeFilter.addEventListener('change', applyFiltersAndSort);
    sortSelect.addEventListener('change', applyFiltersAndSort);

    // Scan
    scanBtn.addEventListener('click', triggerScan);

    // Toggle Upload
    toggleUploadBtn.addEventListener('click', () => {
        uploadPanel.classList.toggle('collapsed');
    });

    // Modal Close
    modalClose.addEventListener('click', hideModal);
    modalBackdrop.addEventListener('click', hideModal);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') hideModal();
    });
}

// Fetch Games from Server
async function fetchGames() {
    showLoading(true);
    try {
        const response = await fetch(API_GAMES);
        if (!response.ok) throw new Error('Failed to fetch library.');
        const result = await response.json();
        
        if (result.keysMissing) {
            showKeysOverlay(true);
            showLoading(false);
            return;
        }
        
        showKeysOverlay(false);
        gamesData = result;
        updateStats();
        applyFiltersAndSort();
    } catch (error) {
        console.error(error);
        showLoading(false);
        gamesGrid.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation" style="color: var(--neon-red)"></i><h3>Fehler beim Laden</h3><p>${error.message}</p></div>`;
    }
}

// Update Stats in Header
function updateStats() {
    const games = Object.values(gamesData);
    statCount.textContent = games.length;

    // Calculate total size of unique physical files
    const uniqueFiles = new Set();
    let totalBytes = 0;
    
    games.forEach(game => {
        if (!uniqueFiles.has(game.filePath)) {
            uniqueFiles.add(game.filePath);
            totalBytes += game.fileSize || 0;
        }
    });

    const totalGB = (totalBytes / (1024 * 1024 * 1024)).toFixed(1);
    statSize.textContent = `${totalGB} GB`;
}

// Apply Search, Filter, and Sort to local data
function applyFiltersAndSort() {
    const searchVal = searchInput.value.toLowerCase().trim();
    const typeVal = typeFilter.value;
    const sortVal = sortSelect.value;

    filteredGames = Object.entries(gamesData).map(([key, value]) => ({ dbKey: key, ...value }));

    // Filter by type
    if (typeVal !== 'all') {
        filteredGames = filteredGames.filter(game => game.type === typeVal);
    }

    // Filter by search
    if (searchVal) {
        filteredGames = filteredGames.filter(game => 
            game.title.toLowerCase().includes(searchVal) || 
            game.titleId.toLowerCase().includes(searchVal) || 
            (game.publisher && game.publisher.toLowerCase().includes(searchVal)) ||
            (game.fileName && game.fileName.toLowerCase().includes(searchVal))
        );
    }

    // Sort
    filteredGames.sort((a, b) => {
        if (sortVal === 'title-asc') {
            return a.title.localeCompare(b.title);
        } else if (sortVal === 'title-desc') {
            return b.title.localeCompare(a.title);
        } else if (sortVal === 'size-desc') {
            return (b.fileSize || 0) - (a.fileSize || 0);
        } else if (sortVal === 'size-asc') {
            return (a.fileSize || 0) - (b.fileSize || 0);
        }
        return 0;
    });

    renderGames();
}

// Render Games Grid
function renderGames() {
    showLoading(false);
    
    if (filteredGames.length === 0) {
        emptyState.classList.remove('hidden');
        return;
    }
    emptyState.classList.add('hidden');

    gamesGrid.innerHTML = '';
    
    filteredGames.forEach(game => {
        const card = document.createElement('div');
        const sizeGB = ((game.fileSize || 0) / (1024 * 1024 * 1024)).toFixed(1);
        
        // Setup card classes based on type for custom glows
        let typeClass = 'type-base';
        let badgeClass = 'badge-base';
        if (game.type === 'Update') {
            typeClass = 'type-update';
            badgeClass = 'badge-update';
        } else if (game.type === 'DLC') {
            typeClass = 'type-dlc';
            badgeClass = 'badge-dlc';
        }

        card.className = `game-card ${typeClass}`;
        
        // Use extracted cache icon or fallback
        const iconSrc = game.icon ? game.icon : 'images/fallback_icon.png';
        
        card.innerHTML = `
            <div class="card-image-wrapper">
                <img src="${iconSrc}" alt="${game.title}" onerror="this.src='https://raw.githubusercontent.com/blawar/titledb/master/images/0100152000022000.png'">
            </div>
            <div class="card-content">
                <div class="card-header-row">
                    <span class="badge ${badgeClass}">${game.type || 'Game'}</span>
                </div>
                <h3 class="game-title" title="${game.title}">${game.title}</h3>
                <span class="game-publisher">${game.publisher || 'Nintendo'}</span>
                <div class="game-meta-info">
                    <span><i class="fa-solid fa-file-zipper"></i> ${sizeGB} GB</span>
                    <span class="code" style="font-size: 0.75rem;">${game.titleId}</span>
                </div>
            </div>
            <div class="card-actions">
                <button class="btn btn-secondary card-details-btn"><i class="fa-solid fa-circle-info"></i> Details</button>
                <a href="/api/download/${game.dbKey}" class="btn btn-primary card-download-btn"><i class="fa-solid fa-download"></i> Laden</a>
            </div>
        `;
        
        // Bind events
        card.querySelector('.card-details-btn').addEventListener('click', () => showDetails(game));
        
        gamesGrid.appendChild(card);
    });
}

// Trigger Scan API
async function triggerScan() {
    scanBtn.disabled = true;
    scanBtn.innerHTML = '<i class="fa-solid fa-arrows-rotate fa-spin"></i> Scanne Verzeichnis...';
    showLoading(true);

    try {
        const response = await fetch(API_SCAN, { method: 'POST' });
        if (!response.ok) throw new Error('Scan process failed.');
        gamesData = await response.json();
        updateStats();
        applyFiltersAndSort();
    } catch (error) {
        console.error(error);
        alert(`Fehler beim Scannen: ${error.message}`);
    } finally {
        scanBtn.disabled = false;
        scanBtn.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> Bibliothek scannen';
        showLoading(false);
    }
}

// Drag and Drop & Upload Handling
function setupUploadEvents() {
    // Drag Over
    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            dropZone.classList.add('highlight');
        }, false);
    });

    // Drag Leave
    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            dropZone.classList.remove('highlight');
        }, false);
    });

    // Drop
    dropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length > 0) {
            handleFileUpload(files[0]);
        }
    });

    // Input Change
    fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) {
            handleFileUpload(fileInput.files[0]);
        }
    });
}

// AJAX Upload with Progress
function handleFileUpload(file) {
    uploadProgressContainer.classList.remove('hidden');
    uploadFilename.textContent = file.name;
    uploadPercent.textContent = '0%';
    progressBarFill.style.width = '0%';
    uploadStatus.textContent = 'Bereite Upload vor...';

    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append('gameFile', file);

    // Track Progress
    xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
            const percentComplete = Math.round((e.loaded / e.total) * 100);
            progressBarFill.style.width = percentComplete + '%';
            uploadPercent.textContent = percentComplete + '%';
            
            const uploadedMB = (e.loaded / (1024 * 1024)).toFixed(1);
            const totalMB = (e.total / (1024 * 1024)).toFixed(1);
            uploadStatus.textContent = `${uploadedMB} MB von ${totalMB} MB hochgeladen`;
        }
    });

    // Complete / Status Change
    xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
            progressBarFill.style.width = '100%';
            uploadPercent.textContent = '100%';
            uploadStatus.textContent = 'Upload erfolgreich! Auto-Scan läuft...';
            setTimeout(() => {
                uploadProgressContainer.classList.add('hidden');
                fetchGames(); // Reload database
            }, 3000);
        } else {
            let errorMsg = 'Upload fehlgeschlagen';
            try {
                const res = JSON.parse(xhr.responseText);
                if (res.error) errorMsg = res.error;
            } catch(e) {}
            uploadStatus.innerHTML = `<span style="color: var(--neon-red)"><i class="fa-solid fa-triangle-exclamation"></i> Fehler: ${errorMsg}</span>`;
        }
    });

    xhr.addEventListener('error', () => {
        uploadStatus.innerHTML = '<span style="color: var(--neon-red)"><i class="fa-solid fa-triangle-exclamation"></i> Netzwerkfehler beim Upload</span>';
    });

    xhr.open('POST', API_UPLOAD);
    xhr.send(formData);
}

// Show/Hide Loading
function showLoading(show) {
    if (show) {
        loadingState.classList.remove('hidden');
        gamesGrid.querySelectorAll('.game-card').forEach(card => card.classList.add('hidden'));
    } else {
        loadingState.classList.add('hidden');
    }
}

// Modal Details Dialog
function showDetails(game) {
    const sizeGB = ((game.fileSize || 0) / (1024 * 1024 * 1024)).toFixed(2);
    
    // Icon
    modalIcon.src = game.icon ? game.icon : 'images/fallback_icon.png';
    modalIcon.onerror = function() {
        this.src = 'https://raw.githubusercontent.com/blawar/titledb/master/images/0100152000022000.png';
    };

    // Badge styling based on type
    modalType.textContent = game.type || 'Game';
    modalType.className = 'badge';
    if (game.type === 'Update') {
        modalType.classList.add('badge-update');
    } else if (game.type === 'DLC') {
        modalType.classList.add('badge-dlc');
    } else {
        modalType.classList.add('badge-base');
    }

    modalTitle.textContent = game.title;
    modalPublisher.textContent = game.publisher || 'Nintendo';
    modalTitleId.textContent = game.titleId;
    modalSize.textContent = `${sizeGB} GB`;
    modalFilepath.textContent = game.filePath;

    // Nested path (if zipped)
    if (game.nestedPath) {
        modalNestedItem.classList.remove('hidden');
        modalNestedPath.textContent = game.nestedPath;
    } else {
        modalNestedItem.classList.add('hidden');
    }

    // Download Link
    modalDownloadBtn.href = `/api/download/${game.dbKey}`;

    // Languages Tags
    modalLanguages.innerHTML = '';
    if (game.languages && game.languages.length > 0) {
        game.languages.forEach(lang => {
            const tag = document.createElement('span');
            tag.className = 'lang-tag';
            tag.textContent = translateLanguage(lang);
            modalLanguages.appendChild(tag);
        });
    } else {
        modalLanguages.innerHTML = '<span class="text-muted">Keine Sprachen hinterlegt</span>';
    }

    // Setup delete button handler (clone to reset old listeners)
    const newDeleteBtn = modalDeleteBtn.cloneNode(true);
    modalDeleteBtn.parentNode.replaceChild(newDeleteBtn, modalDeleteBtn);
    
    newDeleteBtn.addEventListener('click', async () => {
        const confirmDelete = confirm(`Bist du sicher, dass du das Spiel "${game.title}" (${game.type}) und die zugehörige Datei permanent von der Festplatte löschen möchtest?`);
        if (!confirmDelete) return;
        
        try {
            const response = await fetch(`/api/games/${game.dbKey}`, { method: 'DELETE' });
            if (!response.ok) throw new Error('Fehler beim Löschen des Spiels.');
            
            const result = await response.json();
            alert(result.message || 'Spiel erfolgreich gelöscht.');
            hideModal();
            fetchGames(); // Refresh the grid
        } catch (err) {
            console.error(err);
            alert(`Fehler: ${err.message}`);
        }
    });

    detailsModal.classList.remove('hidden');
}

function hideModal() {
    detailsModal.classList.add('hidden');
}

// Utility to translate Switch lang names to user-friendly names
function translateLanguage(lang) {
    const translations = {
        "Japanese": "Japanisch (JA)",
        "AmericanEnglish": "Englisch (US)",
        "BritishEnglish": "Englisch (UK)",
        "French": "Französisch (FR)",
        "German": "Deutsch (DE)",
        "Italian": "Italienisch (IT)",
        "Spanish": "Spanisch (ES)",
        "Dutch": "Niederländisch (NL)",
        "Portuguese": "Portugiesisch (PT)",
        "Russian": "Russisch (RU)",
        "Korean": "Koreanisch (KO)",
        "ChineseSimplified": "Chinesisch (Vereinfacht)",
        "TraditionalChinese": "Chinesisch (Traditionell)",
        "CanadianFrench": "Französisch (Kanada)",
        "LatinAmericanSpanish": "Spanisch (Lateinamerika)",
        "SimplifiedChinese": "Chinesisch (Vereinfacht)"
    };
    return translations[lang] || lang;
}

function showKeysOverlay(show) {
    if (show) {
        keysOverlay.classList.remove('hidden');
    } else {
        keysOverlay.classList.add('hidden');
    }
}

function setupKeysUploadEvents() {
    // Click on drop zone triggers file input
    keysDropZone.addEventListener('click', () => {
        keysFileInput.click();
    });

    // Drag events
    ['dragenter', 'dragover'].forEach(eventName => {
        keysDropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            keysDropZone.style.borderColor = 'var(--neon-red)';
            keysDropZone.style.background = 'rgba(255, 60, 95, 0.08)';
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        keysDropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            keysDropZone.style.borderColor = 'rgba(255, 60, 95, 0.3)';
            keysDropZone.style.background = 'rgba(255, 60, 95, 0.02)';
        }, false);
    });

    // Drop
    keysDropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length > 0) {
            handleKeysUpload(files[0]);
        }
    });

    // File Input change
    keysFileInput.addEventListener('change', () => {
        if (keysFileInput.files.length > 0) {
            handleKeysUpload(keysFileInput.files[0]);
        }
    });
}

function handleKeysUpload(file) {
    if (file.name !== 'prod.keys' && file.name !== 'keys.txt') {
        keysUploadStatus.innerHTML = '<span style="color: var(--neon-red)"><i class="fa-solid fa-triangle-exclamation"></i> Fehler: Datei muss "prod.keys" heißen!</span>';
        return;
    }

    keysUploadStatus.innerHTML = '<i class="fa-solid fa-arrows-rotate fa-spin"></i> Lade Keys hoch...';

    const formData = new FormData();
    formData.append('keysFile', file);

    fetch('/api/upload-keys', {
        method: 'POST',
        body: formData
    })
    .then(async response => {
        const res = await response.json();
        if (!response.ok) throw new Error(res.error || 'Upload failed');
        
        keysUploadStatus.innerHTML = '<span style="color: #2ec4b6"><i class="fa-solid fa-circle-check"></i> Keys geladen! Starte Scan...</span>';
        setTimeout(() => {
            fetchGames(); // Reload library, which will trigger scan and hide overlay
        }, 1500);
    })
    .catch(error => {
        console.error(error);
        keysUploadStatus.innerHTML = `<span style="color: var(--neon-red)"><i class="fa-solid fa-triangle-exclamation"></i> ${error.message}</span>`;
    });
}
