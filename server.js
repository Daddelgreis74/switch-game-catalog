const express = require('express');
const cors = require('cors');
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
const DB_PATH = path.join(__dirname, 'games_db.json');
const PYTHON_PATH = process.platform === 'win32' ? 'python' : 'python3'; // On Windows, we'll try standard python, or it can be configured

// Ensure folder structures exist
if (!fs.existsSync(GAMES_DIR)) {
    fs.mkdirSync(GAMES_DIR, { recursive: true });
}
if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
}
const tempUploadsDir = path.join(__dirname, 'temp_uploads');
if (!fs.existsSync(tempUploadsDir)) {
    fs.mkdirSync(tempUploadsDir, { recursive: true });
}

app.use(cors());
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
    // Determine python path. If local execution alias exists, we can use our custom path if configured,
    // otherwise default to 'python' or 'python3'
    let pythonCmd = PYTHON_PATH;
    
    // Check if custom python exists in the user's local path
    const customPython = 'C:\\Users\\dadde\\AppData\\Local\\Python\\bin\\python.exe';
    if (process.platform === 'win32' && fs.existsSync(customPython)) {
        pythonCmd = `"${customPython}"`;
    }

    const scannerScript = path.join(__dirname, 'scanner_helper.py');
    const cmd = `${pythonCmd} "${scannerScript}" "${GAMES_DIR}" "${HACTOOL_PATH}" "${KEYS_PATH}" "${CACHE_DIR}" "${DB_PATH}"`;

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
        
        // 1. Delete physical file if it exists
        if (game.filePath && fs.existsSync(game.filePath)) {
            fs.unlinkSync(game.filePath);
            console.log(`Physically deleted file: ${game.filePath}`);
        }
        
        // 2. Delete extracted icon if it exists
        if (game.icon) {
            const iconPath = path.join(__dirname, 'public', game.icon);
            if (fs.existsSync(iconPath)) {
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

// API: Upload game file
app.post('/api/upload', (req, res) => {
    if (!req.files || Object.keys(req.files).length === 0) {
        return res.status(400).json({ error: 'No files were uploaded.' });
    }

    const gameFile = req.files.gameFile;
    const destPath = path.join(GAMES_DIR, gameFile.name);

    console.log(`Uploading file to: ${destPath}`);
    
    gameFile.mv(destPath, (err) => {
        if (err) {
            console.error(`Upload error: ${err}`);
            return res.status(500).json({ error: 'Failed to save uploaded file.' });
        }
        
        console.log(`Upload completed. Triggering automatic scan...`);
        
        // Trigger scan automatically
        let pythonCmd = PYTHON_PATH;
        const customPython = 'C:\\Users\\dadde\\AppData\\Local\\Python\\bin\\python.exe';
        if (process.platform === 'win32' && fs.existsSync(customPython)) {
            pythonCmd = `"${customPython}"`;
        }
        const scannerScript = path.join(__dirname, 'scanner_helper.py');
        const cmd = `${pythonCmd} "${scannerScript}" "${GAMES_DIR}" "${HACTOOL_PATH}" "${KEYS_PATH}" "${CACHE_DIR}" "${DB_PATH}"`;
        
        exec(cmd, (scanErr, stdout, stderr) => {
            if (scanErr) {
                console.error(`Auto-scan error: ${scanErr.message}`);
                // Still return success of upload
                return res.json({ message: 'File uploaded, but automatic scan failed.', file: gameFile.name });
            }
            res.json({ message: 'File uploaded and scanned successfully.', file: gameFile.name });
        });
    });
});

app.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(` Nintendo Switch Game Catalog Server is running!`);
    console.log(` URL: http://localhost:${PORT}`);
    console.log(` Games Directory: ${GAMES_DIR}`);
    console.log(` Keys Path: ${KEYS_PATH}`);
    console.log(`==================================================`);
});
