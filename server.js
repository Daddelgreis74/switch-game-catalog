const express = require('express');
const fileUpload = require('express-fileupload');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');
const { createCatalogDb } = require('./db');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const GAMES_DIR = process.env.GAMES_DIR || path.join(__dirname, 'games');
const KEYS_PATH = process.env.KEYS_PATH || path.join(__dirname, 'config', 'prod.keys');
const CACHE_DIR = path.join(__dirname, 'public', 'cache');
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'games_db.json');
const SQLITE_PATH = process.env.SQLITE_PATH || path.join(path.dirname(DB_PATH), 'catalog.db');
const PYTHON_PATH = process.env.PYTHON_PATH || (process.platform === 'win32' ? 'python' : 'python3');

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
ensureDir(path.join(os.tmpdir(), 'switch_uploads'));

const catalogDb = createCatalogDb({
    sqlitePath: SQLITE_PATH,
    cacheDir: CACHE_DIR,
    appDir: __dirname
});

const getCandidateKeysPaths = () => {
    const candidates = [];
    if (KEYS_PATH) {
        candidates.push(KEYS_PATH);
        candidates.push(path.join(KEYS_PATH, 'prod.keys'));
        candidates.push(path.join(path.dirname(KEYS_PATH), 'prod.keys'));
    }
    candidates.push(path.join(CACHE_DIR, 'prod.keys'));
    candidates.push(path.join(CACHE_DIR, 'keys', 'prod.keys'));

    const dbDir = path.dirname(DB_PATH);
    candidates.push(path.join(dbDir, 'prod.keys'));
    candidates.push(path.join(dbDir, 'keys', 'prod.keys'));

    candidates.push(path.join(GAMES_DIR, 'prod.keys'));
    candidates.push(path.join(GAMES_DIR, '.config', 'prod.keys'));

    candidates.push(path.join(__dirname, 'prod.keys'));
    candidates.push(path.join(__dirname, 'config', 'prod.keys'));
    candidates.push(path.join(__dirname, 'keys', 'prod.keys'));

    candidates.push(path.join(os.tmpdir(), 'prod.keys'));
    candidates.push('/tmp/prod.keys');

    try {
        const homeDir = process.env.HOME || process.env.USERPROFILE || '';
        if (homeDir) {
            candidates.push(path.join(homeDir, '.switch', 'prod.keys'));
        }
    } catch (e) {}

    return candidates;
};

const getKeysPath = () => {
    for (const p of getCandidateKeysPaths()) {
        try {
            if (fs.existsSync(p) && fs.statSync(p).isFile() && fs.statSync(p).size > 0) {
                return p;
            }
        } catch (e) {}
    }
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
    if (process.env.PYTHON_PATH) return process.env.PYTHON_PATH;
    const bundledPython = path.join(__dirname, 'runtime', 'python', 'python.exe');
    if (process.platform === 'win32' && fs.existsSync(bundledPython)) {
        return bundledPython;
    }
    const customPython = path.join(os.homedir(), 'AppData', 'Local', 'Python', 'bin', 'python.exe');
    if (process.platform === 'win32' && fs.existsSync(customPython)) {
        return customPython;
    }
    return PYTHON_PATH;
};

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
        return JSON.parse(fs.readFileSync(dbFile, 'utf8'));
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
    for (const target of saveTargets) {
        try {
            const dir = path.dirname(target);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(target, data, 'utf8');
            return true;
        } catch (e) {}
    }
    return false;
};

const getHactoolPath = () => {
    if (process.env.HACTOOL_PATH && fs.existsSync(process.env.HACTOOL_PATH)) {
        return process.env.HACTOOL_PATH;
    }
    const localBin = path.join(__dirname, 'bin', process.platform === 'win32' ? 'hactool.exe' : 'hactool');
    if (fs.existsSync(localBin)) return localBin;
    if (fs.existsSync('/usr/local/bin/hactool')) return '/usr/local/bin/hactool';
    return localBin;
};

// Sync existing JSON DB into SQLite on startup
catalogDb.syncFromGamesJson(loadDatabase());

app.use(express.json());

// Cookie & Session middleware
const parseCookies = (req) => {
    const list = {};
    const rc = req.headers.cookie;
    if (!rc) return list;
    rc.split(';').forEach((cookie) => {
        const parts = cookie.split('=');
        const key = parts.shift().trim();
        const val = decodeURIComponent(parts.join('='));
        if (key) list[key] = val;
    });
    return list;
};

app.use((req, res, next) => {
    const cookies = parseCookies(req);
    req.sessionToken = cookies.nsw_session || null;
    req.user = req.sessionToken ? catalogDb.getSessionUser(req.sessionToken) : null;
    next();
});

const requireAuth = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Authentication required.' });
    }
    next();
};

const escapeHtml = (str) => String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const ALLOWED_GAME_EXTS = new Set(['.nsp', '.nsz', '.xci', '.xcz', '.zip']);

// Root route: Redirect to /en or /de
app.get('/', (req, res) => {
    const acceptLang = (req.headers['accept-language'] || '').toLowerCase();
    const targetLang = acceptLang.startsWith('de') ? 'de' : 'en';
    res.redirect(302, `/${targetLang}`);
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/favicon.ico', (req, res) => {
    res.type('image/svg+xml');
    res.sendFile(path.join(__dirname, 'public', 'favicon.svg'));
});

function toBaseTitleId(titleId) {
    const cleanId = (titleId || '').trim().toLowerCase();
    if (!cleanId || cleanId === 'unknown' || cleanId.length < 13) return '';
    const nibble = parseInt(cleanId[12], 16);
    if (!Number.isNaN(nibble)) {
        return cleanId.substring(0, 12) + (nibble & 0xE).toString(16) + '000';
    }
    return cleanId.substring(0, 13) + '000';
}

async function cacheRemoteIcon(baseTitleId, iconUrl) {
    if (!iconUrl || !/^https?:\/\//i.test(iconUrl)) return '';
    try {
        if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
        for (const ext of ['jpg', 'png', 'webp']) {
            const existingPath = path.join(CACHE_DIR, `${baseTitleId}.${ext}`);
            if (fs.existsSync(existingPath) && fs.statSync(existingPath).size > 0) {
                return `cache/${baseTitleId}.${ext}`;
            }
        }
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        const resp = await fetch(iconUrl, {
            signal: controller.signal,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        clearTimeout(timeoutId);
        if (!resp.ok) return '';
        const ct = (resp.headers.get('content-type') || '').toLowerCase();
        const ext = ct.includes('png') ? 'png' : (ct.includes('webp') ? 'webp' : 'jpg');
        const buf = Buffer.from(await resp.arrayBuffer());
        if (buf.length === 0) return '';
        const target = path.join(CACHE_DIR, `${baseTitleId}.${ext}`);
        fs.writeFileSync(target, buf);
        return `cache/${baseTitleId}.${ext}`;
    } catch {
        return '';
    }
}

// Helper: Fetch rich metadata from TitleDB API and cache in SQLite & games_db.json
async function fetchOnlineMetadata(baseTitleId, lang = 'en') {
    const normalizedBaseId = toBaseTitleId(baseTitleId);
    if (!normalizedBaseId || normalizedBaseId.length < 16) return null;

    try {
        const fetchUrl = `https://api.nlib.cc/nx/${normalizedBaseId.toUpperCase()}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const response = await fetch(fetchUrl, {
            signal: controller.signal,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        clearTimeout(timeoutId);

        if (!response.ok) return null;

        const data = await response.json();
        const description = data.description || data.intro || '';
        const categories = Array.isArray(data.category) ? data.category : [];
        const languages = Array.isArray(data.languages) ? data.languages : [];
        const releaseDate = data.releaseDate ? String(data.releaseDate) : '';
        const screenshots = (data.screens && Array.isArray(data.screens.screenshots)) ? data.screens.screenshots : [];
        const players = data.numberOfPlayers ? String(data.numberOfPlayers) : '';
        const publisher = data.publisher ? String(data.publisher) : '';
        const remoteIconUrl = data.icon || `https://api.nlib.cc/nx/${normalizedBaseId.toUpperCase()}/icon`;
        const iconPath = await cacheRemoteIcon(normalizedBaseId, remoteIconUrl);

        catalogDb.updateGameOnlineMetadata(normalizedBaseId, {
            description,
            categories,
            languages,
            releaseDate,
            screenshots,
            players,
            iconPath,
            publisher,
            lang
        });

        const db = loadDatabase();
        let dbChanged = false;
        for (const key of Object.keys(db)) {
            if (db[key].titleId && toBaseTitleId(db[key].titleId) === normalizedBaseId) {
                db[key].description = description;
                if (!Array.isArray(db[key].categories) || db[key].categories.length === 0) {
                    db[key].categories = categories;
                }
                if ((!Array.isArray(db[key].languages) || db[key].languages.length === 0) && languages.length > 0) {
                    db[key].languages = languages;
                }
                if (!db[key].icon && iconPath) {
                    db[key].icon = iconPath;
                }
                if ((!db[key].publisher || db[key].publisher === 'Unknown Publisher') && publisher) {
                    db[key].publisher = publisher;
                }
                db[key].releaseDate = releaseDate;
                db[key].screenshots = screenshots;
                db[key].metadataLang = lang;
                dbChanged = true;
            }
        }
        if (dbChanged) saveDatabase(db);

        return { titleId: normalizedBaseId, description, categories, languages, releaseDate, screenshots, players, icon: iconPath, publisher, metadataLang: lang };
    } catch (err) {
        console.warn(`Metadata fetch error for ${normalizedBaseId}: ${err.message}`);
        return null;
    }
}

async function enrichLibraryMetadata() {
    const { items } = catalogDb.queryCatalog({ limit: 5000 });
    const missing = items.filter(g =>
        g.titleId &&
        !g.titleId.startsWith('unknown_') &&
        (!g.icon || (!g.categories || g.categories.length === 0) || (!g.descriptionEn && !g.descriptionDe))
    );
    if (missing.length === 0) return;

    const concurrency = 4;
    for (let i = 0; i < missing.length; i += concurrency) {
        const batch = missing.slice(i, i + concurrency);
        await Promise.allSettled(batch.map(g => fetchOnlineMetadata(g.titleId, 'en')));
    }
}

// API: Paginated, filtered & sorted catalog
app.get('/api/catalog', (req, res) => {
    if (!hasKeys()) {
        return res.json({ keysMissing: true, items: [], total: 0, totalPages: 1, page: 1 });
    }
    const categories = req.query.c ? String(req.query.c).split(',').filter(Boolean) : [];
    const languages = req.query.l ? String(req.query.l).split(',').filter(Boolean) : [];
    const result = catalogDb.queryCatalog({
        page: Number(req.query.p) || 1,
        limit: Number(req.query.limit) || 45,
        search: String(req.query.s || ''),
        categories,
        languages,
        sortBy: String(req.query.sb || 'release_date'),
        sortOrder: String(req.query.so || 'desc')
    });
    res.json(result);
});

// API: Legacy raw games list (kept for compatibility / healthchecks)
app.get('/api/games', (req, res) => {
    if (!hasKeys()) {
        return res.json({ keysMissing: true });
    }
    res.json(loadDatabase());
});

// API: Full game detail page payload
app.get('/api/games/:titleId', async (req, res) => {
    const { titleId } = req.params;
    const lang = (req.query.lang || 'en').toLowerCase() === 'de' ? 'de' : 'en';

    let details = catalogDb.getGameDetails(titleId, req.user?.id || null);
    if (!details) {
        return res.status(404).json({ error: 'Game not found.' });
    }

    if ((!details.icon || (!details.descriptionEn && !details.descriptionDe)) && details.titleId && !details.titleId.startsWith('unknown_')) {
        await fetchOnlineMetadata(details.titleId, lang);
        details = catalogDb.getGameDetails(details.titleId, req.user?.id || null);
    }

    res.json(details);
});

// API: Online metadata endpoint
app.get('/api/metadata/:titleId', async (req, res) => {
    const titleId = (req.params.titleId || '').trim().toLowerCase();
    const lang = (req.query.lang || 'en').toLowerCase() === 'de' ? 'de' : 'en';

    if (!titleId || titleId === 'unknown' || titleId.length < 16) {
        return res.status(400).json({ error: 'Invalid Title ID' });
    }

    const baseTitleId = toBaseTitleId(titleId);
    const existing = catalogDb.getGameDetails(baseTitleId);
    if (existing && (existing.descriptionEn || existing.descriptionDe)) {
        return res.json({
            titleId: baseTitleId,
            description: (lang === 'de' && existing.descriptionDe) ? existing.descriptionDe : existing.descriptionEn,
            categories: existing.categories,
            releaseDate: existing.releaseDate,
            screenshots: existing.screenshots,
            players: existing.players
        });
    }

    const meta = await fetchOnlineMetadata(baseTitleId, lang);
    if (!meta) {
        return res.status(404).json({ error: 'Metadata not found.' });
    }
    res.json(meta);
});

app.get('/api/taxonomy', (req, res) => {
    res.json(catalogDb.getTaxonomyOptions());
});

app.put('/api/games/:titleId/taxonomy', (req, res) => {
    const { titleId } = req.params;
    const { categories, languages } = req.body || {};
    if (!Array.isArray(categories) || !Array.isArray(languages)) {
        return res.status(400).json({ error: 'categories and languages must be arrays.' });
    }

    const updated = catalogDb.updateGameTaxonomy(titleId, { categories, languages });
    if (!updated) {
        return res.status(404).json({ error: 'Game not found.' });
    }

    const db = loadDatabase();
    let dbChanged = false;
    const baseTarget = toBaseTitleId(updated.titleId) || updated.titleId.toLowerCase();
    for (const key of Object.keys(db)) {
        if (db[key].titleId && toBaseTitleId(db[key].titleId) === baseTarget) {
            db[key].categories = updated.categories;
            db[key].languages = updated.languages;
            dbChanged = true;
        }
    }
    if (dbChanged) saveDatabase(db);

    res.json(updated);
});

// --- Auth & User Routes ---
const requireAdmin = (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin privileges required.' });
    next();
};

const requireStaff = (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
    if (!['admin', 'coadmin'].includes(req.user.role)) return res.status(403).json({ error: 'Admin or Co-Admin privileges required.' });
    next();
};

// --- Admin Settings Routes ---
app.post('/api/admin/taxonomy', requireStaff, (req, res) => {
    try {
        const { kind, name } = req.body || {};
        const result = catalogDb.addTaxonomyItem(kind, name);
        res.status(201).json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.put('/api/admin/taxonomy', requireStaff, (req, res) => {
    try {
        const { kind, oldName, newName } = req.body || {};
        const result = catalogDb.renameTaxonomyItem(kind, oldName, newName);

        const col = kind === 'category' ? 'categories' : 'languages';
        const db = loadDatabase();
        let dbChanged = false;
        for (const key of Object.keys(db)) {
            if (Array.isArray(db[key][col])) {
                const next = db[key][col].map(item =>
                    item.toLowerCase() === String(oldName).trim().toLowerCase() ? String(newName).trim() : item
                );
                if (JSON.stringify(next) !== JSON.stringify(db[key][col])) {
                    db[key][col] = next;
                    dbChanged = true;
                }
            }
        }
        if (dbChanged) saveDatabase(db);

        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.delete('/api/admin/taxonomy', requireStaff, (req, res) => {
    try {
        const { kind, name } = req.body || {};
        const result = catalogDb.deleteTaxonomyItem(kind, name);

        const col = kind === 'category' ? 'categories' : 'languages';
        const db = loadDatabase();
        let dbChanged = false;
        for (const key of Object.keys(db)) {
            if (Array.isArray(db[key][col])) {
                const next = db[key][col].filter(item => item.toLowerCase() !== String(name).trim().toLowerCase());
                if (next.length !== db[key][col].length) {
                    db[key][col] = next;
                    dbChanged = true;
                }
            }
        }
        if (dbChanged) saveDatabase(db);

        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.get('/api/admin/users', requireAdmin, (req, res) => {
    res.json({ users: catalogDb.listUsers() });
});

app.post('/api/admin/users', requireAdmin, (req, res) => {
    try {
        const { username, password, role } = req.body || {};
        const user = catalogDb.adminCreateUser({ username, password, role });
        res.status(201).json({ user });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.put('/api/admin/users/:id', requireAdmin, (req, res) => {
    try {
        const { role, password } = req.body || {};
        const user = catalogDb.adminUpdateUser(req.params.id, { role, password }, req.user.id);
        res.json({ user });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
    try {
        const result = catalogDb.adminDeleteUser(req.params.id, req.user.id);
        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.get('/api/auth/me', (req, res) => {
    res.json({ user: req.user || null });
});

app.post('/api/auth/register', (req, res) => {
    try {
        const { username, password } = req.body || {};
        const user = catalogDb.registerUser(username, password);
        const token = catalogDb.createSession(user.id);
        res.cookie('nsw_session', token, {
            httpOnly: true,
            sameSite: 'lax',
            maxAge: 30 * 24 * 60 * 60 * 1000
        });
        res.status(201).json({ user });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.post('/api/auth/login', (req, res) => {
    try {
        const { username, password } = req.body || {};
        const { token, user } = catalogDb.loginUser(username, password);
        res.cookie('nsw_session', token, {
            httpOnly: true,
            sameSite: 'lax',
            maxAge: 30 * 24 * 60 * 60 * 1000
        });
        res.json({ user });
    } catch (err) {
        res.status(401).json({ error: err.message });
    }
});

app.post('/api/auth/logout', (req, res) => {
    if (req.sessionToken) {
        catalogDb.logoutSession(req.sessionToken);
    }
    res.clearCookie('nsw_session');
    res.json({ ok: true });
});

app.get('/api/users/:username', (req, res) => {
    const profile = catalogDb.getPublicUserProfile(req.params.username);
    if (!profile) {
        return res.status(404).json({ error: 'User not found.' });
    }
    res.json(profile);
});

// --- Comments & Ratings Routes ---
app.get('/api/comments/latest', (req, res) => {
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 15));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    res.json({ comments: catalogDb.getLatestComments(limit, offset) });
});

app.post('/api/games/:titleId/comments', requireAuth, (req, res) => {
    try {
        const { content, parentId } = req.body || {};
        const comment = catalogDb.addComment(req.params.titleId, req.user.id, content, parentId);
        res.status(201).json({ comment });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.put('/api/comments/:id', requireAuth, (req, res) => {
    try {
        const { content } = req.body || {};
        catalogDb.editComment(Number(req.params.id), req.user.id, req.user.role === 'admin', content);
        res.json({ ok: true });
    } catch (err) {
        res.status(err.message === 'Forbidden.' ? 403 : 400).json({ error: err.message });
    }
});

app.delete('/api/comments/:id', requireAuth, (req, res) => {
    try {
        catalogDb.deleteComment(Number(req.params.id), req.user.id, req.user.role === 'admin');
        res.json({ ok: true });
    } catch (err) {
        res.status(err.message === 'Forbidden.' ? 403 : 400).json({ error: err.message });
    }
});

app.post('/api/games/:titleId/rating', requireAuth, (req, res) => {
    try {
        const { score } = req.body || {};
        const result = catalogDb.setRating(req.params.titleId, req.user.id, score);
        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// --- Library Scan, Download, Delete, Upload & Keys ---
const runScannerSync = (callback) => {
    const pythonCmd = resolvePythonCmd();
    const scannerScript = path.join(__dirname, 'scanner_helper.py');
    const keysPath = getKeysPath();
    const hactoolPath = getHactoolPath();
    const args = [scannerScript, GAMES_DIR, hactoolPath, keysPath, CACHE_DIR, DB_PATH];

    console.log(`Running scan command: ${pythonCmd} ${args.join(' ')}`);
    execFile(pythonCmd, args, { maxBuffer: 50 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (stderr) console.error(`Scanner stderr: ${stderr}`);
        if (error) return callback(error);

        let parsed = null;
        try {
            parsed = JSON.parse(stdout);
        } catch {
            parsed = loadDatabase();
        }
        catalogDb.syncFromGamesJson(parsed);
        enrichLibraryMetadata()
            .then(() => callback(null, parsed))
            .catch(() => callback(null, parsed));
    });
};

app.post('/api/scan', (req, res) => {
    runScannerSync((error, dbContent) => {
        if (error) {
            console.error(`Scanner error: ${error.message}`);
            return res.status(500).json({ error: 'Scan failed.', details: error.message });
        }
        res.json(dbContent || {});
    });
});

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

app.delete('/api/games/:dbKey', (req, res) => {
    const { dbKey } = req.params;
    const db = loadDatabase();
    const game = db[dbKey];

    if (!game) {
        return res.status(404).json({ error: 'Game not found in database.' });
    }

    if (game.filePath && isInsideDir(GAMES_DIR, game.filePath) && fs.existsSync(game.filePath)) {
        try {
            fs.unlinkSync(game.filePath);
        } catch (e) {
            console.warn(`Could not delete file: ${e.message}`);
        }
    }

    if (game.icon) {
        const iconPath = path.join(__dirname, 'public', game.icon);
        const publicDir = path.join(__dirname, 'public');
        if (isInsideDir(publicDir, iconPath) && fs.existsSync(iconPath)) {
            try { fs.unlinkSync(iconPath); } catch (e) {}
        }
    }

    delete db[dbKey];
    saveDatabase(db);
    catalogDb.syncFromGamesJson(db);

    res.json({ message: 'Game successfully deleted.', dbKey });
});

app.post('/api/upload', (req, res) => {
    req.setTimeout(0);
    if (res.setTimeout) res.setTimeout(0);

    const fileName = req.query.name;
    if (!fileName) {
        return res.status(400).json({ error: 'Dateiname fehlt im Query-Parameter (?name=...)' });
    }

    const safeName = path.basename(fileName.replace(/\\/g, '/'));
    if (!/\.(nsp|nsz|xci|xcz|zip)$/i.test(safeName)) {
        return res.status(400).json({ error: 'Nur .nsp, .nsz, .xci, .xcz oder .zip erlaubt.' });
    }

    const destPath = path.join(GAMES_DIR, safeName);
    if (!isInsideDir(GAMES_DIR, destPath)) {
        return res.status(400).json({ error: 'Ungültiger Dateipfad.' });
    }

    console.log(`Piping upload stream to: ${destPath}`);
    const writeStream = fs.createWriteStream(destPath, { highWaterMark: 1024 * 1024 });
    req.pipe(writeStream);

    writeStream.on('error', (err) => {
        console.error(`Write stream error: ${err}`);
        if (err.code === 'EACCES') {
            return res.status(500).json({
                error: 'Keine Schreibberechtigung auf den Spiele-Ordner (/games).'
            });
        }
        res.status(500).json({ error: 'Fehler beim Schreiben der Datei auf Festplatte: ' + err.message });
    });

    req.on('aborted', () => {
        console.warn(`Upload aborted by client: ${safeName}`);
        writeStream.destroy();
        if (fs.existsSync(destPath)) {
            try { fs.unlinkSync(destPath); } catch (e) {}
        }
    });

    req.on('error', (err) => {
        console.error(`Request stream error: ${err}`);
        writeStream.destroy();
        if (fs.existsSync(destPath)) {
            try { fs.unlinkSync(destPath); } catch (e) {}
        }
        if (!res.headersSent) {
            res.status(500).json({ error: 'Verbindungsabbruch während des Uploads: ' + err.message });
        }
    });

    writeStream.on('finish', () => {
        console.log(`Upload completed: ${safeName}. Triggering automatic scan...`);
        runScannerSync((scanErr) => {
            if (scanErr) {
                console.error(`Auto-scan error: ${scanErr.message}`);
                return res.json({ message: 'Upload abgeschlossen, aber automatischer Scan fehlgeschlagen.', file: safeName });
            }
            res.json({ message: 'Upload und Scan erfolgreich abgeschlossen.', file: safeName });
        });
    });
});

app.post('/api/upload-keys', fileUpload({ limits: { fileSize: 10 * 1024 * 1024 } }), (req, res) => {
    let keysContent = '';
    if (req.body && req.body.keysContent) {
        keysContent = req.body.keysContent;
    } else if (req.files && req.files.keysFile) {
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

    if (!saveKeysContent(keysContent)) {
        return res.status(500).json({ error: 'Fehler beim Speichern der Schlüssel auf der Festplatte.' });
    }

    res.json({ message: 'Keys erfolgreich gespeichert und persistiert!' });
});

// SPA Routes for /:lang (en|de) and sub-pages
const spaEntry = path.join(__dirname, 'public', 'index.html');
app.get([
    '/:lang(en|de)',
    '/:lang(en|de)/game/:titleId',
    '/:lang(en|de)/settings',
    '/:lang(en|de)/profile',
    '/:lang(en|de)/user/:username'
], (req, res) => {
    res.sendFile(spaEntry);
});

const server = app.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(` NSW Game Catalog Server v2.0.0 is running!`);
    console.log(` URL: http://localhost:${PORT}`);
    console.log(` Games Directory: ${GAMES_DIR}`);
    console.log(` Keys Path: ${KEYS_PATH}`);
    console.log(` SQLite DB: ${catalogDb.dbPath}`);
    console.log(`==================================================`);
    setTimeout(() => {
        enrichLibraryMetadata().catch(err => console.warn(`Startup metadata enrich skipped: ${err.message}`));
    }, 1000);
});

server.timeout = 0;
server.requestTimeout = 0;
server.keepAliveTimeout = 0;
server.headersTimeout = 0;
