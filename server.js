const express = require('express');
const fileUpload = require('express-fileupload');
const path = require('path');
const fs = require('fs');
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

const getKeysPath = () => {
    // 1. Check if KEYS_PATH is a direct file with content
    if (fs.existsSync(KEYS_PATH) && fs.statSync(KEYS_PATH).isFile() && fs.statSync(KEYS_PATH).size > 0) {
        return KEYS_PATH;
    }
    // 2. Check if a directory is mounted to KEYS_PATH and contains prod.keys
    const configKeysFile = path.join(KEYS_PATH, 'prod.keys');
    if (fs.existsSync(configKeysFile) && fs.statSync(configKeysFile).isFile() && fs.statSync(configKeysFile).size > 0) {
        return configKeysFile;
    }
    // 3. Check inside the database directory
    const dbDir = path.dirname(DB_PATH);
    const dbKeysFile = path.join(dbDir, 'prod.keys');
    if (fs.existsSync(dbKeysFile) && fs.statSync(dbKeysFile).isFile() && fs.statSync(dbKeysFile).size > 0) {
        return dbKeysFile;
    }
    // 4. Check local app directory
    const localKeysFile = path.join(__dirname, 'prod.keys');
    if (fs.existsSync(localKeysFile) && fs.statSync(localKeysFile).isFile() && fs.statSync(localKeysFile).size > 0) {
        return localKeysFile;
    }
    // Fallback: Return a writable path where we will save the keys (in database directory)
    return dbKeysFile; 
};

const hasKeys = () => {
    const p = getKeysPath();
    return fs.existsSync(p) && fs.statSync(p).isFile() && fs.statSync(p).size > 0;
};

const resolvePythonCmd = () => {
    let pythonCmd = PYTHON_PATH;
    const customPython = 'C:\\Users\\dadde\\AppData\\Local\\Python\\bin\\python.exe';
    if (process.platform === 'win32' && fs.existsSync(customPython)) {
        pythonCmd = `"${customPython}"`;
    }
    return pythonCmd;
};


// Ensure folder structures exist
if (!fs.existsSync(GAMES_DIR)) {
    fs.mkdirSync(GAMES_DIR, { recursive: true });
}
if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
}
const tempUploadsDir = path.join(GAMES_DIR, '.temp_uploads');
if (!fs.existsSync(tempUploadsDir)) {
    fs.mkdirSync(tempUploadsDir, { recursive: true });
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Configure fileupload middleware with temp files for large games
app.use(fileUpload({
    useTempFiles: true,
    tempFileDir: tempUploadsDir,
    limits: { fileSize: 40 * 1024 * 1024 * 1024 }, // 40 GB limit
    abortOnLimit: true
}));

// API: Get games list
app.get('/api/games', (req, res) => {
    if (!hasKeys()) {
        return res.json({ keysMissing: true });
    }

    if (fs.existsSync(DB_PATH)) {
        fs.readFile(DB_PATH, 'utf8', (err, data) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to read database.' });
            }
            try {
                res.json(JSON.parse(data));
            } catch (e) {
                res.json({});
            }
        });
    } else {
        res.json({});
    }
});

// API: Trigger scan
app.post('/api/scan', (req, res) => {
    const pythonCmd = resolvePythonCmd();

    const scannerScript = path.join(__dirname, 'scanner_helper.py');
    const keysPath = getKeysPath();
    const cmd = `${pythonCmd} "${scannerScript}" "${GAMES_DIR}" "${HACTOOL_PATH}" "${keysPath}" "${CACHE_DIR}" "${DB_PATH}"`;

    console.log(`Running scan command: ${cmd}`);
    exec(cmd, (error, stdout, stderr) => {
        if (stderr) {
            console.error(`Scanner stderr: ${stderr}`);
        }
        if (error) {
            console.error(`Scanner error: ${error.message}`);
            return res.status(500).json({ error: 'Scan failed.', details: error.message });
        }
        try {
            const dbContent = JSON.parse(stdout);
            res.json(dbContent);
        } catch (e) {
            // If stdout parsing failed, read from db path directly
            if (fs.existsSync(DB_PATH)) {
                try {
                    const data = fs.readFileSync(DB_PATH, 'utf8');
                    res.json(JSON.parse(data));
                } catch (readErr) {
                    res.status(500).json({ error: 'Scan completed but failed to parse results.' });
                }
            } else {
                res.status(500).json({ error: 'Scan completed but database was not created.' });
            }
        }
    });
});

// API: Download game file
app.get('/api/download/:dbKey', (req, res) => {
    const { dbKey } = req.params;
    
    if (!fs.existsSync(DB_PATH)) {
        return res.status(404).json({ error: 'Database not found.' });
    }
    
    try {
        const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
        const game = db[dbKey];
        
        if (!game || !game.filePath) {
            return res.status(404).json({ error: 'Game file not found in database.' });
        }
        
        if (!fs.existsSync(game.filePath)) {
            return res.status(404).json({ error: 'File does not exist on disk.' });
        }
        
        res.download(game.filePath, game.fileName);
    } catch (e) {
        res.status(500).json({ error: 'Error downloading file.' });
    }
});

// API: Delete game file and cache entry
app.delete('/api/games/:dbKey', (req, res) => {
    const { dbKey } = req.params;
    
    if (!fs.existsSync(DB_PATH)) {
        return res.status(404).json({ error: 'Database not found.' });
    }
    
    try {
        const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
        const game = db[dbKey];
        
        if (!game) {
            return res.status(404).json({ error: 'Game not found in database.' });
        }
        
        // 1. Delete physical file if it exists and lies inside GAMES_DIR (Security check)
        if (game.filePath) {
            const resolvedGamesDir = path.resolve(GAMES_DIR);
            const resolvedFilePath = path.resolve(game.filePath);
            if (resolvedFilePath.startsWith(resolvedGamesDir) && fs.existsSync(game.filePath)) {
                fs.unlinkSync(game.filePath);
                console.log(`Physically deleted file: ${game.filePath}`);
            }
        }
        
        // 2. Delete extracted icon if it exists and lies inside public folder (Security check)
        if (game.icon) {
            const iconPath = path.join(__dirname, 'public', game.icon);
            const resolvedPublicDir = path.resolve(path.join(__dirname, 'public'));
            const resolvedIconPath = path.resolve(iconPath);
            if (resolvedIconPath.startsWith(resolvedPublicDir) && fs.existsSync(iconPath)) {
                fs.unlinkSync(iconPath);
                console.log(`Deleted cached icon: ${iconPath}`);
            }
        }
        
        // 3. Remove from database
        delete db[dbKey];
        fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
        
        res.json({ message: 'Game successfully deleted.', dbKey });
    } catch (e) {
        console.error(`Error deleting game: ${e}`);
        res.status(500).json({ error: 'Failed to delete game file.' });
    }
});

// API: Upload game file (Stream-based for high stability with 40GB+ files)
app.post('/api/upload', (req, res) => {
    const fileName = req.query.name;
    if (!fileName) {
        return res.status(400).json({ error: 'Dateiname fehlt im Query-Parameter (?name=...)' });
    }

    // Security: sanitize filename and restrict file extensions
    const safeName = path.basename(fileName);
    if (!/\.(nsp|nsz|xci|zip)$/i.test(safeName)) {
        return res.status(400).json({ error: 'Nur .nsp, .nsz, .xci oder .zip erlaubt.' });
    }

    const destPath = path.join(GAMES_DIR, safeName);
    
    // Security: verify that destPath resolves inside GAMES_DIR (prevent path traversal)
    const resolvedGamesDir = path.resolve(GAMES_DIR);
    const resolvedDestPath = path.resolve(destPath);
    if (!resolvedDestPath.startsWith(resolvedGamesDir)) {
        return res.status(400).json({ error: 'Ungültiger Dateipfad.' });
    }

    console.log(`Piping upload stream to: ${destPath}`);

    const writeStream = fs.createWriteStream(destPath);
    req.pipe(writeStream);

    writeStream.on('error', (err) => {
        console.error(`Write stream error: ${err}`);
        res.status(500).json({ error: 'Fehler beim Schreiben der Datei auf Festplatte.' });
    });

    req.on('error', (err) => {
        console.error(`Request stream error: ${err}`);
        // Clean up partial file
        if (fs.existsSync(destPath)) {
            try { fs.unlinkSync(destPath); } catch (e) {}
        }
    });

    writeStream.on('finish', () => {
        console.log(`Upload completed. Triggering automatic scan...`);

        // Trigger scan automatically
        const pythonCmd = resolvePythonCmd();
        const scannerScript = path.join(__dirname, 'scanner_helper.py');
        const keysPath = getKeysPath();
        const cmd = `${pythonCmd} "${scannerScript}" "${GAMES_DIR}" "${HACTOOL_PATH}" "${keysPath}" "${CACHE_DIR}" "${DB_PATH}"`;

        exec(cmd, (scanErr, stdout, stderr) => {
            if (scanErr) {
                console.error(`Auto-scan error: ${scanErr.message}`);
                return res.json({ message: 'Upload abgeschlossen, aber automatischer Scan fehlgeschlagen.', file: safeName });
            }
            res.json({ message: 'Upload und Scan erfolgreich abgeschlossen.', file: safeName });
        });
    });
});

// API: Upload prod.keys
app.post('/api/upload-keys', (req, res) => {
    if (!req.files || Object.keys(req.files).length === 0) {
        return res.status(400).json({ error: 'No keys file was uploaded.' });
    }

    const keysFile = req.files.keysFile;
    
    if (keysFile.name !== 'prod.keys' && keysFile.name !== 'keys.txt') {
        return res.status(400).json({ error: 'Die Datei muss "prod.keys" heißen.' });
    }

    const destPath = getKeysPath();
    const destDir = path.dirname(destPath);
    
    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
    }

    console.log(`Saving uploaded keys to: ${destPath}`);
    
    keysFile.mv(destPath, (err) => {
        if (err) {
            console.error(`Keys upload error: ${err}`);
            return res.status(500).json({ error: 'Fehler beim Speichern der Keys.' });
        }
        res.json({ message: 'Keys erfolgreich hochgeladen!' });
    });
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
