const express = require('express');
const fileUpload = require('express-fileupload');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec } = require('child_process');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const GAMES_DIR = process.env.GAMES_DIR || 'D:\\NintendoGames';
const KEYS_PATH = process.env.KEYS_PATH || 'D:\\prod.keys';
const HACTOOL_PATH = path.join(__dirname, 'bin', process.platform === 'win32' ? 'hactool.exe' : 'hactool');
const CACHE_DIR = path.join(__dirname, 'public', 'cache');
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'games_db.json');
const PYTHON_PATH = process.platform === 'win32' ? 'python' : 'python3'; // On Windows, we'll try standard python, or it can be configured

const getCandidateKeysPaths = () => {
    const candidates = [];
    
    // 1. Explicit KEYS_PATH env var
    if (KEYS_PATH) {
        candidates.push(KEYS_PATH);
        candidates.push(path.join(KEYS_PATH, 'prod.keys'));
        candidates.push(path.join(path.dirname(KEYS_PATH), 'prod.keys'));
    }
    
    // 2. Cache directory (Mounted & Persistent in TrueNAS)
    candidates.push(path.join(CACHE_DIR, 'prod.keys'));
    candidates.push(path.join(CACHE_DIR, 'keys', 'prod.keys'));
    
    // 3. Database directory
    const dbDir = path.dirname(DB_PATH);
    candidates.push(path.join(dbDir, 'prod.keys'));
    candidates.push(path.join(dbDir, 'keys', 'prod.keys'));
    
    // 4. Games directory (Mounted & Persistent in TrueNAS)
    candidates.push(path.join(GAMES_DIR, 'prod.keys'));
    candidates.push(path.join(GAMES_DIR, '.config', 'prod.keys'));
    
    // 5. App local directory
    candidates.push(path.join(__dirname, 'prod.keys'));
    candidates.push(path.join(__dirname, 'config', 'prod.keys'));
    candidates.push(path.join(__dirname, 'keys', 'prod.keys'));
    
    // 6. Temp directory (Always writable in Linux/Docker regardless of UID)
    candidates.push(path.join(os.tmpdir(), 'prod.keys'));
    candidates.push('/tmp/prod.keys');
    
    // 7. User home directory
    try {
        const homeDir = process.env.HOME || process.env.USERPROFILE || '';
        if (homeDir) {
            candidates.push(path.join(homeDir, '.switch', 'prod.keys'));
        }
    } catch (e) {}

    return candidates;
};

const getKeysPath = () => {
    const candidates = getCandidateKeysPaths();
    for (const p of candidates) {
        try {
            if (fs.existsSync(p) && fs.statSync(p).isFile() && fs.statSync(p).size > 0) {
                return p;
            }
        } catch (e) {}
    }
    // Fallback: return preferred persistent path
    return path.join(CACHE_DIR, 'prod.keys');
};

const hasKeys = () => {
    const p = getKeysPath();
    try {
        return fs.existsSync(p) && fs.statSync(p).isFile() && fs.statSync(p).size > 0;
    } catch (e) {
        return false;
    }
};

const saveKeysContent = (content) => {
    let savedAny = false;
    const saveTargets = [
        path.join(CACHE_DIR, 'prod.keys'),
        path.join(path.dirname(DB_PATH), 'prod.keys'),
        path.join(GAMES_DIR, 'prod.keys'),
        path.join(__dirname, 'prod.keys'),
        path.join(os.tmpdir(), 'prod.keys'),
        '/tmp/prod.keys'
    ];

    // If KEYS_PATH directory is writable, also save there
    try {
        if (KEYS_PATH) {
            const targetDir = fs.existsSync(KEYS_PATH) && fs.statSync(KEYS_PATH).isDirectory() 
                ? KEYS_PATH 
                : path.dirname(KEYS_PATH);
            if (fs.existsSync(targetDir)) {
                saveTargets.unshift(path.join(targetDir, 'prod.keys'));
            }
        }
    } catch (e) {}

    for (const target of saveTargets) {
        try {
            const dir = path.dirname(target);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(target, content, 'utf8');
            console.log(`Successfully saved prod.keys to: ${target}`);
            savedAny = true;
        } catch (err) {
            console.warn(`Could not save keys to ${target}: ${err.message}`);
        }
    }
    return savedAny;
};

const resolvePythonCmd = () => {
    let pythonCmd = PYTHON_PATH;
    const customPython = 'C:\\Users\\dadde\\AppData\\Local\\Python\\bin\\python.exe';
    if (process.platform === 'win32' && fs.existsSync(customPython)) {
        pythonCmd = `"${customPython}"`;
    }
    return pythonCmd;
};


// Ensure folder structures exist safely without throwing errors on read-only mounts
const ensureDir = (dirPath) => {
    try {
        if (dirPath && !fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
    } catch (e) {
        console.warn(`Directory check/creation note for ${dirPath}: ${e.message}`);
    }
};

ensureDir(GAMES_DIR);
ensureDir(CACHE_DIR);
ensureDir(path.dirname(DB_PATH));

const tempUploadsDir = path.join(os.tmpdir(), 'switch_uploads');
ensureDir(tempUploadsDir);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Favicon fallback route
app.get('/favicon.ico', (req, res) => {
    res.type('image/svg+xml');
    res.sendFile(path.join(__dirname, 'public', 'favicon.svg'));
});

// Configure fileupload middleware with temp files for large games
app.use(fileUpload({
    useTempFiles: true,
    tempFileDir: tempUploadsDir,
    limits: { fileSize: 40 * 1024 * 1024 * 1024 }, // 40 GB limit
    abortOnLimit: true
}));

const isInsideDir = (parentDir, targetPath) => {
    if (!parentDir || !targetPath) return false;
    const rel = path.relative(path.resolve(parentDir), path.resolve(targetPath));
    return !rel.startsWith('..') && !path.isAbsolute(rel);
};

const getExistingDbPath = () => {
    const possibleDbPaths = [
        DB_PATH,
        path.join(CACHE_DIR, 'games_db.json'),
        path.join(__dirname, 'games_db.json'),
        path.join(os.tmpdir(), 'games_db.json')
    ];
    for (const p of possibleDbPaths) {
        if (fs.existsSync(p)) return p;
    }
    return null;
};

const loadDatabase = () => {
    const dbFile = getExistingDbPath();
    if (!dbFile) return {};
    try {
        const data = fs.readFileSync(dbFile, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        return {};
    }
};

const saveDatabase = (db) => {
    const saveTargets = [
        DB_PATH,
        path.join(CACHE_DIR, 'games_db.json'),
        path.join(__dirname, 'games_db.json'),
        path.join(os.tmpdir(), 'games_db.json')
    ];
    const data = JSON.stringify(db, null, 2);
    let saved = false;
    for (const target of saveTargets) {
        try {
            const dir = path.dirname(target);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(target, data, 'utf8');
            saved = true;
            break;
        } catch (e) {}
    }
    return saved;
};

// API: Get games list
app.get('/api/games', (req, res) => {
    if (!hasKeys()) {
        return res.json({ keysMissing: true });
    }
    res.json(loadDatabase());
});

const getHactoolPath = () => {
    if (process.env.HACTOOL_PATH && fs.existsSync(process.env.HACTOOL_PATH)) {
        return process.env.HACTOOL_PATH;
    }
    const localBin = path.join(__dirname, 'bin', process.platform === 'win32' ? 'hactool.exe' : 'hactool');
    if (fs.existsSync(localBin)) {
        return localBin;
    }
    if (fs.existsSync('/usr/local/bin/hactool')) {
        return '/usr/local/bin/hactool';
    }
    return localBin;
};

// API: Trigger scan
app.post('/api/scan', (req, res) => {
    const pythonCmd = resolvePythonCmd();

    const scannerScript = path.join(__dirname, 'scanner_helper.py');
    const keysPath = getKeysPath();
    const hactoolPath = getHactoolPath();
    const cmd = `${pythonCmd} "${scannerScript}" "${GAMES_DIR}" "${hactoolPath}" "${keysPath}" "${CACHE_DIR}" "${DB_PATH}"`;

    console.log(`Running scan command: ${cmd}`);
    exec(cmd, { maxBuffer: 50 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (stderr) {
            console.error(`Scanner stderr: ${stderr}`);
        }
        if (error) {
            console.error(`Scanner error: ${error.message}`);
            return res.status(500).json({ 
                error: 'Scan failed.', 
                details: error.message,
                stderr: stderr ? stderr.slice(-400) : '' 
            });
        }
        try {
            const dbContent = JSON.parse(stdout);
            res.json(dbContent);
        } catch (e) {
            const db = loadDatabase();
            if (Object.keys(db).length > 0) {
                return res.json(db);
            }
            res.status(500).json({ error: 'Scan completed but failed to parse results.' });
        }
    });
});

// API: Download game file
app.get('/api/download/:dbKey', (req, res) => {
    const { dbKey } = req.params;
    const db = loadDatabase();
    const game = db[dbKey];
    
    if (!game || !game.filePath) {
        return res.status(404).json({ error: 'Game file not found in database.' });
    }
    
    if (!isInsideDir(GAMES_DIR, game.filePath)) {
        return res.status(403).json({ error: 'Access denied: file is outside games directory.' });
    }
    
    if (!fs.existsSync(game.filePath)) {
        return res.status(404).json({ error: 'File does not exist on disk.' });
    }
    
    res.download(game.filePath, game.fileName);
});

// API: Delete game file and cache entry
app.delete('/api/games/:dbKey', (req, res) => {
    const { dbKey } = req.params;
    const db = loadDatabase();
    const game = db[dbKey];
    
    if (!game) {
        return res.status(404).json({ error: 'Game not found in database.' });
    }
    
    // 1. Delete physical file if it exists and lies inside GAMES_DIR (Security check)
    if (game.filePath && isInsideDir(GAMES_DIR, game.filePath) && fs.existsSync(game.filePath)) {
        try {
            fs.unlinkSync(game.filePath);
            console.log(`Physically deleted file: ${game.filePath}`);
        } catch (e) {
            console.warn(`Could not delete file: ${e.message}`);
        }
    }
    
    // 2. Delete extracted icon if it exists and lies inside public folder (Security check)
    if (game.icon) {
        const iconPath = path.join(__dirname, 'public', game.icon);
        const publicDir = path.join(__dirname, 'public');
        if (isInsideDir(publicDir, iconPath) && fs.existsSync(iconPath)) {
            try {
                fs.unlinkSync(iconPath);
                console.log(`Deleted cached icon: ${iconPath}`);
            } catch (e) {
                console.warn(`Could not delete icon: ${e.message}`);
            }
        }
    }
    
    // 3. Remove from database
    delete db[dbKey];
    saveDatabase(db);
    
    res.json({ message: 'Game successfully deleted.', dbKey });
});

// API: Upload game file (Stream-based for high stability with 40GB+ files)
app.post('/api/upload', (req, res) => {
    const fileName = req.query.name;
    if (!fileName) {
        return res.status(400).json({ error: 'Dateiname fehlt im Query-Parameter (?name=...)' });
    }

    // Security: sanitize filename and normalize slashes
    const safeName = path.basename(fileName.replace(/\\/g, '/'));
    if (!/\.(nsp|nsz|xci|zip)$/i.test(safeName)) {
        return res.status(400).json({ error: 'Nur .nsp, .nsz, .xci oder .zip erlaubt.' });
    }

    const destPath = path.join(GAMES_DIR, safeName);
    
    // Security: verify that destPath resolves inside GAMES_DIR (prevent path traversal)
    if (!isInsideDir(GAMES_DIR, destPath)) {
        return res.status(400).json({ error: 'Ungültiger Dateipfad.' });
    }

    console.log(`Piping upload stream to: ${destPath}`);

    const writeStream = fs.createWriteStream(destPath);
    req.pipe(writeStream);

    writeStream.on('error', (err) => {
        console.error(`Write stream error: ${err}`);
        if (err.code === 'EACCES') {
            return res.status(500).json({ 
                error: 'Keine Schreibberechtigung auf den Spiele-Ordner (/games). Bitte in TrueNAS Custom App User ID auf 0 (root) oder Berechtigungen auf User 568 (apps) anpassen.' 
            });
        }
        res.status(500).json({ error: 'Fehler beim Schreiben der Datei auf Festplatte: ' + err.message });
    });

    req.on('error', (err) => {
        console.error(`Request stream error: ${err}`);
        writeStream.destroy();
        if (fs.existsSync(destPath)) {
            try { fs.unlinkSync(destPath); } catch (e) {}
        }
        if (!res.headersSent) {
            res.status(500).json({ error: 'Verbindungsabbruch während des Uploads.' });
        }
    });

    writeStream.on('finish', () => {
        console.log(`Upload completed. Triggering automatic scan...`);

        // Trigger scan automatically
        const pythonCmd = resolvePythonCmd();
        const scannerScript = path.join(__dirname, 'scanner_helper.py');
        const keysPath = getKeysPath();
        const hactoolPath = getHactoolPath();
        const cmd = `${pythonCmd} "${scannerScript}" "${GAMES_DIR}" "${hactoolPath}" "${keysPath}" "${CACHE_DIR}" "${DB_PATH}"`;

        exec(cmd, { maxBuffer: 50 * 1024 * 1024 }, (scanErr, stdout, stderr) => {
            if (scanErr) {
                console.error(`Auto-scan error: ${scanErr.message}`);
                return res.json({ message: 'Upload abgeschlossen, aber automatischer Scan fehlgeschlagen.', file: safeName });
            }
            res.json({ message: 'Upload und Scan erfolgreich abgeschlossen.', file: safeName });
        });
    });
});

// API: Upload prod.keys (supports JSON text payload and multipart upload)
app.post('/api/upload-keys', (req, res) => {
    let keysContent = '';

    // 1. Check if keys were sent as JSON { keysContent: "..." }
    if (req.body && req.body.keysContent) {
        keysContent = req.body.keysContent;
    } 
    // 2. Check if keys were sent as a file
    else if (req.files && req.files.keysFile) {
        const keysFile = req.files.keysFile;
        if (keysFile.name !== 'prod.keys' && keysFile.name !== 'keys.txt') {
            return res.status(400).json({ error: 'Die Datei muss "prod.keys" heißen.' });
        }
        if (keysFile.data) {
            keysContent = keysFile.data.toString('utf8');
        } else if (keysFile.tempFilePath && fs.existsSync(keysFile.tempFilePath)) {
            keysContent = fs.readFileSync(keysFile.tempFilePath, 'utf8');
        }
    }

    if (!keysContent || keysContent.trim().length === 0) {
        return res.status(400).json({ error: 'Keine gültigen Schlüsseldaten empfangen.' });
    }

    const saved = saveKeysContent(keysContent);
    if (!saved) {
        return res.status(500).json({ error: 'Fehler beim Speichern der Schlüssel auf der Festplatte.' });
    }

    res.json({ message: 'Keys erfolgreich gespeichert und persistiert!' });
});

const server = app.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(` Nintendo Switch Game Catalog Server is running!`);
    console.log(` URL: http://localhost:${PORT}`);
    console.log(` Games Directory: ${GAMES_DIR}`);
    console.log(` Keys Path: ${KEYS_PATH}`);
    console.log(`==================================================`);
});

// Disable timeout limits for large file uploads (40 GB+)
server.timeout = 0; 
server.keepAliveTimeout = 600000; // 10 minutes keep-alive
server.headersTimeout = 605000; // keep-alive + 5s
