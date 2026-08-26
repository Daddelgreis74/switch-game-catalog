// Global state
let gamesData = {};
let filteredGames = [];
let currentLang = 'en';

// I18N Translations Dictionary
const i18n = {
    en: {
        app_title: "NSW Game Catalog & Library",
        stats: {
            games: "Games",
            total_size: "Total Size"
        },
        header: {
            upload: "Upload",
            scan: "Scan Library",
            scanning: "Scanning directory..."
        },
        upload: {
            title: "Upload Games",
            description: "Drag & drop game files (.nsp, .nsz, .zip, .xci) here or click to browse",
            select_btn: "Select Files",
            uploading: "Uploading...",
            preparing: "Preparing upload...",
            success: "Upload successful! Auto-scan running...",
            queue_remaining: " ({count} remaining in queue)",
            progress_status: "{uploaded} MB of {total} MB uploaded",
            network_error: "Network error during upload",
            error_prefix: "Error: "
        },
        filter: {
            search_placeholder: "Search by game title, publisher, or Title ID...",
            type_label: "Type:",
            all_types: "All Types",
            base_games: "Base Games",
            updates: "Updates",
            dlcs: "DLCs",
            sort_label: "Sort:",
            sort_title_asc: "Title (A-Z)",
            sort_title_desc: "Title (Z-A)",
            sort_size_desc: "Size (Largest)",
            sort_size_asc: "Size (Smallest)"
        },
        loading: {
            text: "Loading game library...",
            error_title: "Error Loading Library",
            scan_failed: "Scan process failed.",
            scan_error: "Scan error: "
        },
        empty: {
            title: "No games found",
            description: "Add game files to your games folder and click \"Scan Library\"."
        },
        card: {
            base_game: "Base Game",
            update: "Update",
            dlc: "+ {count} DLC",
            details_btn: "Details & Files"
        },
        modal: {
            title_id: "Title ID",
            size: "File Size",
            filepath: "File Path",
            nestedpath: "Path in ZIP",
            languages: "Supported Languages",
            no_languages: "No language metadata available",
            installed_files: "Installed Files",
            close: "Close",
            download: "Download",
            delete: "Delete",
            delete_confirm: "Are you sure you want to permanently delete \"{filename}\" from disk?",
            delete_success: "File successfully deleted.",
            delete_error: "Failed to delete file."
        },
        footer: {
            disclaimer: "Nintendo and Nintendo Switch are registered trademarks of Nintendo Co., Ltd. NSW Game Catalog is an independent open-source application and is not affiliated with, endorsed by, or sponsored by Nintendo."
        },
        keys: {
            title: "Console Keys Missing",
            description: "To decrypt game metadata and extract title covers, this server requires your <strong>prod.keys</strong>.",
            dropzone: "Drag & drop your <strong>prod.keys</strong> here",
            browse: "or click to select",
            wrong_file: "Error: File must be named \"prod.keys\"!",
            uploading: "Uploading keys...",
            success: "Keys loaded! Starting scan..."
        },
        languages: {
            "Japanese": "Japanese (JA)",
            "AmericanEnglish": "English (US)",
            "BritishEnglish": "English (UK)",
            "French": "French (FR)",
            "German": "German (DE)",
            "Italian": "Italian (IT)",
            "Spanish": "Spanish (ES)",
            "Dutch": "Dutch (NL)",
            "Portuguese": "Portuguese (PT)",
            "Russian": "Russian (RU)",
            "Korean": "Korean (KO)",
            "ChineseSimplified": "Chinese (Simplified)",
            "TraditionalChinese": "Chinese (Traditional)",
            "CanadianFrench": "French (Canada)",
            "LatinAmericanSpanish": "Spanish (Latin America)",
            "SimplifiedChinese": "Chinese (Simplified)"
        }
    },
    de: {
        app_title: "NSW Game Catalog & Spielebibliothek",
        stats: {
            games: "Spiele",
            total_size: "Gesamtgröße"
        },
        header: {
            upload: "Upload",
            scan: "Bibliothek scannen",
            scanning: "Scanne Verzeichnis..."
        },
        upload: {
            title: "Spiele hochladen",
            description: "Ziehe deine Spieldateien (.nsp, .nsz, .zip, .xci) hierher oder klicke zum Durchsuchen",
            select_btn: "Dateien auswählen",
            uploading: "Hochladen...",
            preparing: "Bereite Upload vor...",
            success: "Upload erfolgreich! Auto-Scan läuft...",
            queue_remaining: " (Noch {count} in der Warteschlange)",
            progress_status: "{uploaded} MB von {total} MB hochgeladen",
            network_error: "Netzwerkfehler beim Upload",
            error_prefix: "Fehler: "
        },
        filter: {
            search_placeholder: "Suche nach Spielname, Publisher oder Title ID...",
            type_label: "Typ:",
            all_types: "Alle Typen",
            base_games: "Hauptspiele",
            updates: "Updates",
            dlcs: "DLCs",
            sort_label: "Sortierung:",
            sort_title_asc: "Name (A-Z)",
            sort_title_desc: "Name (Z-A)",
            sort_size_desc: "Größe (Absteigend)",
            sort_size_asc: "Größe (Aufsteigend)"
        },
        loading: {
            text: "Lade Spiele-Bibliothek...",
            error_title: "Fehler beim Laden",
            scan_failed: "Scan-Vorgang fehlgeschlagen.",
            scan_error: "Fehler beim Scannen: "
        },
        empty: {
            title: "Keine Spiele gefunden",
            description: "Füge Spieldateien in das Spieleverzeichnis ein und klicke auf \"Bibliothek scannen\"."
        },
        card: {
            base_game: "Hauptspiel",
            update: "Update",
            dlc: "+ {count} DLC",
            details_btn: "Details & Dateien"
        },
        modal: {
            title_id: "Title ID",
            size: "Dateigröße",
            filepath: "Dateipfad",
            nestedpath: "Pfad in ZIP",
            languages: "Unterstützte Sprachen",
            no_languages: "Keine Sprachen hinterlegt",
            installed_files: "Installierte Dateien",
            close: "Schließen",
            download: "Herunterladen",
            delete: "Löschen",
            delete_confirm: "Bist du sicher, dass du die Datei \"{filename}\" permanent von der Festplatte löschen möchtest?",
            delete_success: "Datei erfolgreich gelöscht.",
            delete_error: "Fehler beim Löschen der Datei."
        },
        footer: {
            disclaimer: "Nintendo und Nintendo Switch sind eingetragene Marken der Nintendo Co., Ltd. NSW Game Catalog ist eine unabhängige Open-Source-Anwendung und steht in keiner Verbindung zu Nintendo."
        },
        keys: {
            title: "Konsolenschlüssel fehlen",
            description: "Um die Metadaten deiner Spiele entschlüsseln zu können, benötigt dieser Server deine <strong>prod.keys</strong>.",
            dropzone: "Zieh deine <strong>prod.keys</strong> hierher",
            browse: "oder klicke zum Auswählen",
            wrong_file: "Fehler: Datei muss \"prod.keys\" heißen!",
            uploading: "Lade Keys hoch...",
            success: "Keys geladen! Starte Scan..."
        },
        languages: {
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
        }
    }
};

// Helper: Get nested i18n text
function t(path, replacements = {}) {
    const keys = path.split('.');
    let val = i18n[currentLang];
    for (const k of keys) {
        if (val && val[k] !== undefined) {
            val = val[k];
        } else {
            return path;
        }
    }
    if (typeof val === 'string') {
        Object.entries(replacements).forEach(([k, v]) => {
            val = val.replace(`{${k}}`, v);
        });
    }
    return val;
}

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

// Language Switcher Elements
const langBtnEn = document.getElementById('lang-btn-en');
const langBtnDe = document.getElementById('lang-btn-de');

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
    initLanguage();
    fetchGames();
    setupEventListeners();
    setupUploadEvents();
    setupKeysUploadEvents();
});

// Initialize Language Selection
function initLanguage() {
    const savedLang = localStorage.getItem('nsw_lang');
    if (savedLang && (savedLang === 'en' || savedLang === 'de')) {
        currentLang = savedLang;
    } else {
        const browserLang = (navigator.language || navigator.userLanguage || '').toLowerCase();
        currentLang = browserLang.startsWith('de') ? 'de' : 'en';
    }
    applyLanguage(currentLang);
}

// Switch and Apply Language
function setLanguage(lang) {
    if (lang !== 'en' && lang !== 'de') return;
    currentLang = lang;
    localStorage.setItem('nsw_lang', lang);
    applyLanguage(lang);
    applyFiltersAndSort(); // Re-render games grid with updated texts
}

function applyLanguage(lang) {
    document.documentElement.lang = lang;
    document.title = t('app_title');

    // Update Language Buttons
    if (langBtnEn && langBtnDe) {
        langBtnEn.classList.toggle('active', lang === 'en');
        langBtnDe.classList.toggle('active', lang === 'de');
    }

    // Translate all elements with data-i18n attribute
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        el.innerHTML = t(key);
    });

    // Translate all placeholders with data-i18n-placeholder
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        el.placeholder = t(key);
    });
}

// Event Listeners
function setupEventListeners() {
    // Language buttons
    if (langBtnEn) langBtnEn.addEventListener('click', () => setLanguage('en'));
    if (langBtnDe) langBtnDe.addEventListener('click', () => setLanguage('de'));

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
        gamesGrid.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation" style="color: var(--neon-red)"></i><h3>${t('loading.error_title')}</h3><p>${error.message}</p></div>`;
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

// Helper to group games by their Base Title ID
function groupGames(flatGames) {
    const groups = {};
    
    flatGames.forEach(game => {
        let baseTitleId = 'unknown';
        // Extract base Title ID (16 hex chars, base ends in 000)
        if (game.titleId && game.titleId !== 'unknown' && game.titleId.length >= 13) {
            baseTitleId = game.titleId.substring(0, 13).toLowerCase() + '000';
        } else {
            baseTitleId = 'unknown_' + (game.dbKey || Math.random().toString());
        }
        
        if (!groups[baseTitleId]) {
            groups[baseTitleId] = [];
        }
        groups[baseTitleId].push(game);
    });
    
    const grouped = [];
    Object.entries(groups).forEach(([baseTitleId, files]) => {
        const baseGame = files.find(f => f.type === 'Base' || f.type === 'Base Game');
        const main = baseGame ? { ...baseGame } : { ...files[0] };
        
        main.allFiles = files;
        main.updatesCount = files.filter(f => f.type === 'Update').length;
        main.dlcsCount = files.filter(f => f.type === 'DLC').length;
        main.hasBaseGame = !!baseGame;

        // Inherit icon and publisher if base game has none
        if (!main.icon) {
            const fileWithIcon = files.find(f => f.icon);
            if (fileWithIcon) main.icon = fileWithIcon.icon;
        }
        if (!main.publisher || main.publisher === 'Unknown Publisher') {
            const fileWithPub = files.find(f => f.publisher && f.publisher !== 'Unknown Publisher');
            if (fileWithPub) main.publisher = fileWithPub.publisher;
        }
        
        grouped.push(main);
    });
    
    return grouped;
}

// Apply Search, Filter, and Sort to local data
function applyFiltersAndSort() {
    const searchVal = searchInput.value.toLowerCase().trim();
    const typeVal = typeFilter.value;
    const sortVal = sortSelect.value;

    let flatList = Object.entries(gamesData).map(([key, value]) => ({ dbKey: key, ...value }));
    let groupedList = groupGames(flatList);

    // Filter by type
    if (typeVal !== 'all') {
        if (typeVal === 'Base Game' || typeVal === 'Base') {
            groupedList = groupedList.filter(g => g.hasBaseGame);
        } else if (typeVal === 'Update') {
            groupedList = groupedList.filter(g => g.updatesCount > 0);
        } else if (typeVal === 'DLC') {
            groupedList = groupedList.filter(g => g.dlcsCount > 0);
        }
    }

    // Filter by search query
    if (searchVal) {
        groupedList = groupedList.filter(g => {
            const titleMatch = (g.title || '').toLowerCase().includes(searchVal);
            const pubMatch = (g.publisher || '').toLowerCase().includes(searchVal);
            const idMatch = (g.titleId || '').toLowerCase().includes(searchVal);
            const fileMatch = g.allFiles.some(f => 
                (f.fileName || '').toLowerCase().includes(searchVal) ||
                (f.nestedPath || '').toLowerCase().includes(searchVal)
            );
            return titleMatch || pubMatch || idMatch || fileMatch;
        });
    }

    // Sort
    groupedList.sort((a, b) => {
        if (sortVal === 'title-asc') {
            return (a.title || '').localeCompare(b.title || '');
        } else if (sortVal === 'title-desc') {
            return (b.title || '').localeCompare(a.title || '');
        } else if (sortVal === 'size-desc') {
            const sizeA = a.allFiles.reduce((sum, f) => sum + (f.fileSize || 0), 0);
            const sizeB = b.allFiles.reduce((sum, f) => sum + (f.fileSize || 0), 0);
            return sizeB - sizeA;
        } else if (sortVal === 'size-asc') {
            const sizeA = a.allFiles.reduce((sum, f) => sum + (f.fileSize || 0), 0);
            const sizeB = b.allFiles.reduce((sum, f) => sum + (f.fileSize || 0), 0);
            return sizeA - sizeB;
        }
        return 0;
    });

    renderGames(groupedList);
}

// Render Games Grid
function renderGames(gamesList) {
    gamesGrid.innerHTML = '';
    
    if (gamesList.length === 0) {
        emptyState.classList.remove('hidden');
        return;
    }
    
    emptyState.classList.add('hidden');

    gamesList.forEach(game => {
        const card = document.createElement('div');
        
        const totalSizeBytes = game.allFiles.reduce((sum, f) => sum + (f.fileSize || 0), 0);
        const sizeGB = (totalSizeBytes / (1024 * 1024 * 1024)).toFixed(2);
        
        let typeClass = 'type-base';
        if (!game.hasBaseGame && game.updatesCount > 0) {
            typeClass = 'type-update';
        } else if (!game.hasBaseGame && game.dlcsCount > 0) {
            typeClass = 'type-dlc';
        }

        card.className = `game-card ${typeClass}`;
        
        const iconSrc = game.icon ? game.icon : 'favicon.svg';
        
        let badgesHtml = '';
        if (game.hasBaseGame) {
            badgesHtml += `<span class="badge badge-base">${t('card.base_game')}</span>`;
        }
        if (game.updatesCount > 0) {
            badgesHtml += `<span class="badge badge-update">${t('card.update')}</span>`;
        }
        if (game.dlcsCount > 0) {
            badgesHtml += `<span class="badge badge-dlc">${t('card.dlc', { count: game.dlcsCount })}</span>`;
        }

        const displayTitleId = (game.titleId && game.titleId !== 'unknown' && game.titleId.length >= 16) 
            ? game.titleId.substring(0, 13) + '000' 
            : (game.titleId || '-');

        card.innerHTML = `
            <div class="card-image-wrapper">
                <img src="${iconSrc}" alt="${game.title}" onerror="this.onerror=null; this.src='favicon.svg';">
            </div>
            <div class="card-content">
                <div class="card-header-row" style="display: flex; gap: 6px; flex-wrap: wrap;">
                    ${badgesHtml}
                </div>
                <h3 class="game-title" title="${game.title}">${game.title}</h3>
                <span class="game-publisher">${game.publisher || 'Nintendo'}</span>
                <div class="game-meta-info">
                    <span><i class="fa-solid fa-file-zipper"></i> ${sizeGB} GB</span>
                    <span class="code" style="font-size: 0.75rem;">${displayTitleId}</span>
                </div>
            </div>
            <div class="card-actions">
                <button class="btn btn-secondary card-details-btn" style="width: 100%; justify-content: center;"><i class="fa-solid fa-circle-info"></i> ${t('card.details_btn')}</button>
            </div>
        `;
        
        card.querySelector('.card-details-btn').addEventListener('click', () => showDetails(game));
        
        gamesGrid.appendChild(card);
    });
}

// Trigger Scan API
async function triggerScan() {
    scanBtn.disabled = true;
    scanBtn.innerHTML = `<i class="fa-solid fa-arrows-rotate fa-spin"></i> ${t('header.scanning')}`;
    showLoading(true);

    try {
        const response = await fetch(API_SCAN, { method: 'POST' });
        if (!response.ok) throw new Error(t('loading.scan_failed'));
        gamesData = await response.json();
        updateStats();
        applyFiltersAndSort();
    } catch (error) {
        console.error(error);
        alert(`${t('loading.scan_error')}${error.message}`);
    } finally {
        scanBtn.disabled = false;
        scanBtn.innerHTML = `<i class="fa-solid fa-arrows-rotate"></i> <span>${t('header.scan')}</span>`;
        showLoading(false);
    }
}

// Drag and Drop & Upload Queue Handling
let uploadQueue = [];
let isUploading = false;

function setupUploadEvents() {
    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            dropZone.classList.add('highlight');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            dropZone.classList.remove('highlight');
        }, false);
    });

    dropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length > 0) {
            queueFilesForUpload(files);
        }
    });

    fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) {
            queueFilesForUpload(fileInput.files);
        }
    });
}

function queueFilesForUpload(filesList) {
    for (let i = 0; i < filesList.length; i++) {
        uploadQueue.push(filesList[i]);
    }
    processUploadQueue();
}

function processUploadQueue() {
    if (isUploading) return;
    if (uploadQueue.length === 0) {
        setTimeout(() => {
            if (uploadQueue.length === 0 && !isUploading) {
                uploadProgressContainer.classList.add('hidden');
            }
        }, 3000);
        return;
    }

    const file = uploadQueue.shift();
    isUploading = true;
    
    uploadProgressContainer.classList.remove('hidden');
    const remainingText = uploadQueue.length > 0 ? t('upload.queue_remaining', { count: uploadQueue.length }) : '';
    uploadFilename.textContent = file.name + remainingText;
    uploadPercent.textContent = '0%';
    progressBarFill.style.width = '0%';
    uploadStatus.textContent = t('upload.preparing');

    handleFileUpload(file, () => {
        isUploading = false;
        setTimeout(processUploadQueue, 500);
    });
}

// AJAX Upload with Progress
function handleFileUpload(file, callback) {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
            const percentComplete = Math.round((e.loaded / e.total) * 100);
            progressBarFill.style.width = percentComplete + '%';
            uploadPercent.textContent = percentComplete + '%';
            
            const uploadedMB = (e.loaded / (1024 * 1024)).toFixed(1);
            const totalMB = (e.total / (1024 * 1024)).toFixed(1);
            uploadStatus.textContent = t('upload.progress_status', { uploaded: uploadedMB, total: totalMB });
        }
    });

    xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
            progressBarFill.style.width = '100%';
            uploadPercent.textContent = '100%';
            uploadStatus.textContent = t('upload.success');
            
            fetchGames(); 
            
            setTimeout(() => {
                if (callback) callback();
            }, 3000);
        } else {
            let errorMsg = 'Upload failed';
            try {
                const res = JSON.parse(xhr.responseText);
                if (res.error) errorMsg = res.error;
            } catch(e) {}
            uploadStatus.innerHTML = `<span style="color: var(--neon-red)"><i class="fa-solid fa-triangle-exclamation"></i> ${t('upload.error_prefix')}${errorMsg}</span>`;
            
            setTimeout(() => {
                if (callback) callback();
            }, 3000);
        }
    });

    xhr.addEventListener('error', () => {
        uploadStatus.innerHTML = `<span style="color: var(--neon-red)"><i class="fa-solid fa-triangle-exclamation"></i> ${t('upload.network_error')}</span>`;
        setTimeout(() => {
            if (callback) callback();
        }, 3000);
    });

    xhr.open('POST', `${API_UPLOAD}?name=${encodeURIComponent(file.name)}`);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.send(file);
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
    modalIcon.src = game.icon ? game.icon : 'favicon.svg';
    modalIcon.onerror = function() {
        this.onerror = null;
        this.src = 'favicon.svg';
    };

    modalType.textContent = game.hasBaseGame ? t('card.base_game') : (game.updatesCount > 0 ? t('card.update') : 'DLC');
    modalType.className = 'badge';
    if (game.hasBaseGame) {
        modalType.classList.add('badge-base');
    } else if (game.updatesCount > 0) {
        modalType.classList.add('badge-update');
    } else {
        modalType.classList.add('badge-dlc');
    }

    modalTitle.textContent = game.title;
    modalPublisher.textContent = game.publisher || 'Nintendo';
    modalTitleId.textContent = (game.titleId && game.titleId !== 'unknown' && game.titleId.length >= 16)
        ? game.titleId.substring(0, 13) + '000'
        : (game.titleId || '-');
    
    modalSize.parentElement.style.display = 'none';
    modalFilepath.parentElement.style.display = 'none';
    modalNestedItem.style.display = 'none';

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
        modalLanguages.innerHTML = `<span class="text-muted">${t('modal.no_languages')}</span>`;
    }

    // Render Files List
    const filesContainer = document.getElementById('modal-files-container');
    filesContainer.innerHTML = '';

    game.allFiles.forEach(file => {
        const fileRow = document.createElement('div');
        fileRow.className = 'file-row';
        
        const sizeGB = ((file.fileSize || 0) / (1024 * 1024 * 1024)).toFixed(2);
        
        let typeBadgeClass = 'badge-base';
        let typeText = t('card.base_game');
        if (file.type === 'Update') {
            typeBadgeClass = 'badge-update';
            typeText = t('card.update');
        } else if (file.type === 'DLC') {
            typeBadgeClass = 'badge-dlc';
            typeText = 'DLC';
        }
        
        fileRow.innerHTML = `
            <span class="badge ${typeBadgeClass}" style="min-width: 65px; text-align: center;">${typeText}</span>
            <div class="file-name" title="${file.fileName}">${file.fileName}</div>
            <span class="file-size">${sizeGB} GB</span>
            <div class="file-actions">
                <a href="/api/download/${file.dbKey}" class="btn-icon btn-icon-primary" title="${t('modal.download')}"><i class="fa-solid fa-download"></i></a>
                <button class="btn-icon btn-icon-danger file-delete-btn" title="${t('modal.delete')}"><i class="fa-solid fa-trash-can"></i></button>
            </div>
        `;
        
        // Bind individual file delete button
        fileRow.querySelector('.file-delete-btn').addEventListener('click', async () => {
            const confirmDelete = confirm(t('modal.delete_confirm', { filename: file.fileName }));
            if (!confirmDelete) return;
            
            try {
                const response = await fetch(`/api/games/${file.dbKey}`, { method: 'DELETE' });
                if (!response.ok) throw new Error(t('modal.delete_error'));
                
                const result = await response.json();
                alert(result.message || t('modal.delete_success'));
                
                hideModal();
                fetchGames();
            } catch (err) {
                console.error(err);
                alert(`${t('upload.error_prefix')}${err.message}`);
            }
        });
        
        filesContainer.appendChild(fileRow);
    });

    detailsModal.classList.remove('hidden');
}

function hideModal() {
    detailsModal.classList.add('hidden');
}

// Utility to translate Switch lang names to user-friendly names
function translateLanguage(lang) {
    const langObj = i18n[currentLang].languages || {};
    return langObj[lang] || lang;
}

function showKeysOverlay(show) {
    if (show) {
        keysOverlay.classList.remove('hidden');
    } else {
        keysOverlay.classList.add('hidden');
    }
}

function setupKeysUploadEvents() {
    keysDropZone.addEventListener('click', () => {
        keysFileInput.click();
    });

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

    keysDropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length > 0) {
            handleKeysUpload(files[0]);
        }
    });

    keysFileInput.addEventListener('change', () => {
        if (keysFileInput.files.length > 0) {
            handleKeysUpload(keysFileInput.files[0]);
        }
    });
}

async function handleKeysUpload(file) {
    if (file.name !== 'prod.keys' && file.name !== 'keys.txt') {
        keysUploadStatus.innerHTML = `<span style="color: var(--neon-red)"><i class="fa-solid fa-triangle-exclamation"></i> ${t('keys.wrong_file')}</span>`;
        return;
    }

    keysUploadStatus.innerHTML = `<i class="fa-solid fa-arrows-rotate fa-spin"></i> ${t('keys.uploading')}`;

    try {
        const textContent = await file.text();
        if (!textContent || textContent.trim().length === 0) {
            throw new Error('Die hochgeladene Datei ist leer.');
        }

        const response = await fetch('/api/upload-keys', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keysContent: textContent })
        });

        const rawText = await response.text();
        let res = {};
        try {
            res = JSON.parse(rawText);
        } catch (e) {
            throw new Error(rawText.substring(0, 120) || 'Ungültige Server-Antwort.');
        }

        if (!response.ok) {
            throw new Error(res.error || 'Upload fehlgeschlagen');
        }

        keysUploadStatus.innerHTML = `<span style="color: #2ec4b6"><i class="fa-solid fa-circle-check"></i> ${t('keys.success')}</span>`;
        setTimeout(() => {
            showKeysOverlay(false);
            fetchGames();
        }, 1200);
    } catch (error) {
        console.error(error);
        keysUploadStatus.innerHTML = `<span style="color: var(--neon-red)"><i class="fa-solid fa-triangle-exclamation"></i> ${error.message}</span>`;
    }
}
