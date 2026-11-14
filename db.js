const Database = require('better-sqlite3');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

const AVATAR_COLORS = [
    '#8b5cf6', '#7c3aed', '#3b82f6', '#06b6d4',
    '#10b981', '#f59e0b', '#ef4444', '#ec4899'
];

const VALID_ROLES = ['admin', 'coadmin', 'moderator', 'user'];

const STANDARD_CATEGORIES = [
    'Action', 'Adventure', 'Arcade', 'Board Game', 'Education',
    'Fighting', 'First-Person Shooter', 'Indie', 'Multiplayer',
    'Music', 'Party', 'Platformer', 'Puzzle', 'Racing',
    'RPG', 'Simulation', 'Sports', 'Strategy', 'Other'
];

const STANDARD_LANGUAGES = [
    'English', 'German', 'French', 'Spanish', 'Italian',
    'Dutch', 'Portuguese', 'Russian', 'Japanese', 'Korean',
    'Chinese (Simplified)', 'Chinese (Traditional)'
];

const LANGUAGE_ALIASES = {
    en: 'English',
    'en-us': 'English',
    'en-gb': 'English',
    americanenglish: 'English',
    britishenglish: 'English',
    english: 'English',
    de: 'German',
    german: 'German',
    deutsch: 'German',
    fr: 'French',
    'fr-ca': 'French',
    french: 'French',
    canadianfrench: 'French',
    es: 'Spanish',
    'es-419': 'Spanish',
    spanish: 'Spanish',
    latinamericanspanish: 'Spanish',
    it: 'Italian',
    italian: 'Italian',
    nl: 'Dutch',
    dutch: 'Dutch',
    pt: 'Portuguese',
    'pt-br': 'Portuguese',
    portuguese: 'Portuguese',
    ru: 'Russian',
    russian: 'Russian',
    ja: 'Japanese',
    jp: 'Japanese',
    japanese: 'Japanese',
    ko: 'Korean',
    kr: 'Korean',
    korean: 'Korean',
    zh: 'Chinese (Simplified)',
    'zh-cn': 'Chinese (Simplified)',
    'zh-hans': 'Chinese (Simplified)',
    chinesesimplified: 'Chinese (Simplified)',
    simplifiedchinese: 'Chinese (Simplified)',
    'zh-tw': 'Chinese (Traditional)',
    'zh-hant': 'Chinese (Traditional)',
    traditionalchinese: 'Chinese (Traditional)'
};

function normalizeLanguageName(raw) {
    const str = String(raw || '').trim();
    if (!str) return '';
    const key = str.toLowerCase().replace(/[\s_]+/g, '');
    return LANGUAGE_ALIASES[str.toLowerCase()] || LANGUAGE_ALIASES[key] || str;
}

function normalizeStringList(items, mapper = null) {
    if (!Array.isArray(items)) return [];
    const seen = new Set();
    const out = [];
    for (const item of items) {
        const val = mapper ? mapper(item) : String(item || '').trim();
        if (!val) continue;
        const key = val.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(val);
    }
    return out;
}

function resolveWritableDbPath(preferredPath, cacheDir, appDir) {
    const candidates = [
        preferredPath,
        path.join(cacheDir, 'catalog.db'),
        path.join(appDir, 'catalog.db'),
        path.join(os.tmpdir(), 'switch_catalog.db')
    ].filter(Boolean);

    for (const candidate of candidates) {
        try {
            const dir = path.dirname(candidate);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.accessSync(dir, fs.constants.W_OK);
            return candidate;
        } catch (err) {
            // Try next candidate
        }
    }
    return ':memory:';
}

function createCatalogDb({ sqlitePath, cacheDir, appDir }) {
    const dbPath = resolveWritableDbPath(sqlitePath, cacheDir, appDir);
    console.log(`Initializing SQLite database at: ${dbPath}`);
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    db.exec(`
        CREATE TABLE IF NOT EXISTS games (
            base_title_id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            publisher TEXT DEFAULT '',
            developer TEXT DEFAULT '',
            release_date TEXT DEFAULT '',
            description_en TEXT DEFAULT '',
            description_de TEXT DEFAULT '',
            categories TEXT DEFAULT '[]',
            languages TEXT DEFAULT '[]',
            players TEXT DEFAULT '',
            icon_path TEXT DEFAULT '',
            screenshots TEXT DEFAULT '[]',
            base_size INTEGER DEFAULT 0,
            total_size INTEGER DEFAULT 0,
            rating_avg REAL DEFAULT 0,
            rating_count INTEGER DEFAULT 0,
            updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS game_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            db_key TEXT UNIQUE NOT NULL,
            base_title_id TEXT NOT NULL,
            title_id TEXT NOT NULL,
            file_name TEXT NOT NULL,
            file_path TEXT NOT NULL,
            file_size INTEGER DEFAULT 0,
            file_type TEXT DEFAULT 'Base',
            version TEXT DEFAULT '0',
            nested_path TEXT DEFAULT '',
            FOREIGN KEY (base_title_id) REFERENCES games(base_title_id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL COLLATE NOCASE,
            password_hash TEXT NOT NULL,
            role TEXT DEFAULT 'user',
            avatar_color TEXT DEFAULT '#8b5cf6',
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            expires_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            base_title_id TEXT NOT NULL,
            user_id INTEGER NOT NULL,
            parent_id INTEGER DEFAULT NULL,
            content TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT NULL,
            FOREIGN KEY (base_title_id) REFERENCES games(base_title_id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS ratings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            base_title_id TEXT NOT NULL,
            user_id INTEGER NOT NULL,
            score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
            created_at TEXT DEFAULT (datetime('now')),
            UNIQUE(base_title_id, user_id),
            FOREIGN KEY (base_title_id) REFERENCES games(base_title_id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS taxonomy_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            kind TEXT NOT NULL CHECK (kind IN ('category', 'language')),
            name TEXT NOT NULL COLLATE NOCASE,
            UNIQUE(kind, name)
        );

        CREATE INDEX IF NOT EXISTS idx_game_files_base ON game_files(base_title_id);
        CREATE INDEX IF NOT EXISTS idx_comments_game ON comments(base_title_id);
        CREATE INDEX IF NOT EXISTS idx_comments_created ON comments(created_at DESC);
    `);

    const seedTaxonomyIfEmpty = (kind, defaults) => {
        const cnt = db.prepare('SELECT COUNT(*) AS cnt FROM taxonomy_items WHERE kind = ?').get(kind).cnt;
        if (cnt === 0) {
            const ins = db.prepare('INSERT OR IGNORE INTO taxonomy_items (kind, name) VALUES (?, ?)');
            const tx = db.transaction(() => {
                for (const item of defaults) ins.run(kind, item);
            });
            tx();
        }
    };
    seedTaxonomyIfEmpty('category', STANDARD_CATEGORIES);
    seedTaxonomyIfEmpty('language', STANDARD_LANGUAGES);

    const parseJsonSafe = (str, fallback) => {
        if (!str) return fallback;
        try {
            return JSON.parse(str);
        } catch {
            return fallback;
        }
    };

    const normalizeBaseId = (titleId, dbKey) => {
        if (titleId && titleId !== 'unknown' && titleId.length >= 13) {
            const clean = titleId.toLowerCase();
            const nibble = parseInt(clean[12], 16);
            if (!Number.isNaN(nibble)) {
                const baseNibble = (nibble & 0xE).toString(16);
                return clean.substring(0, 12) + baseNibble + '000';
            }
            return clean.substring(0, 13) + '000';
        }
        return `unknown_${dbKey}`;
    };

    const syncFromGamesJson = (jsonDb) => {
        if (!jsonDb || typeof jsonDb !== 'object') return;
        const grouped = new Map();

        for (const [dbKey, entry] of Object.entries(jsonDb)) {
            if (!entry || typeof entry !== 'object') continue;
            const baseId = normalizeBaseId(entry.titleId, dbKey);
            if (!grouped.has(baseId)) {
                grouped.set(baseId, []);
            }
            grouped.get(baseId).push({ dbKey, ...entry });
        }

        const upsertGame = db.prepare(`
            INSERT INTO games (
                base_title_id, title, publisher, developer, release_date,
                description_en, description_de, categories, languages,
                icon_path, screenshots, base_size, total_size, updated_at
            ) VALUES (
                @base_title_id, @title, @publisher, @developer, @release_date,
                @description_en, @description_de, @categories, @languages,
                @icon_path, @screenshots, @base_size, @total_size, datetime('now')
            )
            ON CONFLICT(base_title_id) DO UPDATE SET
                title = excluded.title,
                publisher = CASE WHEN excluded.publisher != '' AND excluded.publisher != 'Unknown Publisher' THEN excluded.publisher ELSE games.publisher END,
                release_date = CASE WHEN games.release_date = '' THEN excluded.release_date ELSE games.release_date END,
                description_en = CASE WHEN games.description_en = '' THEN excluded.description_en ELSE games.description_en END,
                categories = CASE WHEN games.categories = '[]' THEN excluded.categories ELSE games.categories END,
                languages = CASE WHEN games.languages = '[]' THEN excluded.languages ELSE games.languages END,
                icon_path = CASE WHEN excluded.icon_path != '' THEN excluded.icon_path ELSE games.icon_path END,
                screenshots = CASE WHEN games.screenshots = '[]' THEN excluded.screenshots ELSE games.screenshots END,
                base_size = excluded.base_size,
                total_size = excluded.total_size,
                updated_at = datetime('now')
        `);

        const insertFile = db.prepare(`
            INSERT INTO game_files (
                db_key, base_title_id, title_id, file_name, file_path,
                file_size, file_type, version, nested_path
            ) VALUES (
                @db_key, @base_title_id, @title_id, @file_name, @file_path,
                @file_size, @file_type, @version, @nested_path
            )
        `);

        const tx = db.transaction(() => {
            db.prepare('DELETE FROM game_files').run();

            const activeBaseIds = [];
            for (const [baseId, files] of grouped.entries()) {
                activeBaseIds.push(baseId);
                const baseFile = files.find(f => f.type === 'Base' || f.type === 'Base Game') || files[0];
                const withIcon = files.find(f => f.icon) || baseFile;
                const withPub = files.find(f => f.publisher && f.publisher !== 'Unknown Publisher') || baseFile;
                const withMeta = files.find(f => f.description || (f.categories && f.categories.length)) || baseFile;

                const langSet = new Set();
                const uniqueFilePaths = new Set();
                let totalSize = 0;
                for (const f of files) {
                    if (Array.isArray(f.languages)) {
                        f.languages.forEach(l => {
                            const norm = normalizeLanguageName(l);
                            if (norm) langSet.add(norm);
                        });
                    }
                    if (f.filePath && !uniqueFilePaths.has(f.filePath)) {
                        uniqueFilePaths.add(f.filePath);
                        totalSize += Number(f.fileSize) || 0;
                    }
                }

                upsertGame.run({
                    base_title_id: baseId,
                    title: baseFile.title || baseFile.fileName || baseId,
                    publisher: withPub.publisher || 'Unknown Publisher',
                    developer: withPub.publisher || '',
                    release_date: withMeta.releaseDate || '',
                    description_en: withMeta.description || '',
                    description_de: '',
                    categories: JSON.stringify(Array.isArray(withMeta.categories) ? withMeta.categories : []),
                    languages: JSON.stringify([...langSet]),
                    icon_path: withIcon.icon || '',
                    screenshots: JSON.stringify(Array.isArray(withMeta.screenshots) ? withMeta.screenshots : []),
                    base_size: Number(baseFile.fileSize) || 0,
                    total_size: totalSize
                });

                for (const f of files) {
                    insertFile.run({
                        db_key: f.dbKey,
                        base_title_id: baseId,
                        title_id: (f.titleId || baseId).toLowerCase(),
                        file_name: f.fileName || path.basename(f.filePath || ''),
                        file_path: f.filePath || '',
                        file_size: Number(f.fileSize) || 0,
                        file_type: f.type || 'Base',
                        version: String(f.version || '0'),
                        nested_path: f.nestedPath || ''
                    });
                }
            }

            // Remove games that no longer have any files on disk
            if (activeBaseIds.length === 0) {
                db.prepare('DELETE FROM games').run();
            } else {
                const placeholders = activeBaseIds.map(() => '?').join(',');
                db.prepare(`DELETE FROM games WHERE base_title_id NOT IN (${placeholders})`).run(...activeBaseIds);
            }
        });

        tx();
    };

    const formatGameRow = (row) => ({
        titleId: row.base_title_id,
        title: row.title,
        publisher: row.publisher,
        developer: row.developer,
        releaseDate: row.release_date,
        descriptionEn: row.description_en,
        descriptionDe: row.description_de,
        categories: parseJsonSafe(row.categories, []),
        languages: parseJsonSafe(row.languages, []),
        players: row.players,
        icon: row.icon_path,
        screenshots: parseJsonSafe(row.screenshots, []),
        baseSize: row.base_size,
        totalSize: row.total_size,
        ratingAvg: Number(row.rating_avg || 0),
        ratingCount: Number(row.rating_count || 0),
        updatedAt: row.updated_at
    });

    const queryCatalog = ({
        page = 1,
        limit = 45,
        search = '',
        categories = [],
        languages = [],
        sortBy = 'release_date',
        sortOrder = 'desc'
    } = {}) => {
        const rows = db.prepare(`
            SELECT g.*,
                   (SELECT COUNT(*) FROM game_files gf WHERE gf.base_title_id = g.base_title_id AND gf.file_type = 'Update') AS updates_count,
                   (SELECT COUNT(*) FROM game_files gf WHERE gf.base_title_id = g.base_title_id AND gf.file_type = 'DLC') AS dlcs_count
            FROM games g
        `).all();

        const allCatSet = new Set();
        const allLangSet = new Set();
        let librarySizeBytes = 0;

        const mapped = rows.map(r => {
            const game = formatGameRow(r);
            game.updatesCount = r.updates_count;
            game.dlcsCount = r.dlcs_count;
            game.categories.forEach(c => allCatSet.add(c));
            game.languages.forEach(l => allLangSet.add(l));
            librarySizeBytes += Number(game.totalSize || 0);
            return game;
        });

        const searchLower = search.trim().toLowerCase();
        const catFilter = categories.map(c => c.toLowerCase()).filter(Boolean);
        const langFilter = languages.map(l => l.toLowerCase()).filter(Boolean);

        const filtered = mapped.filter(game => {
            if (searchLower) {
                const hay = `${game.title} ${game.publisher} ${game.titleId}`.toLowerCase();
                if (!hay.includes(searchLower)) return false;
            }
            if (catFilter.length > 0) {
                const gameCats = game.categories.map(c => c.toLowerCase());
                if (!catFilter.some(c => gameCats.includes(c))) return false;
            }
            if (langFilter.length > 0) {
                const gameLangs = game.languages.map(l => l.toLowerCase());
                if (!langFilter.some(l => gameLangs.includes(l))) return false;
            }
            return true;
        });

        const dir = sortOrder === 'asc' ? 1 : -1;
        filtered.sort((a, b) => {
            if (sortBy === 'title') {
                return a.title.localeCompare(b.title) * dir;
            }
            if (sortBy === 'size') {
                return ((a.totalSize || 0) - (b.totalSize || 0)) * dir;
            }
            if (sortBy === 'rating') {
                return ((a.ratingAvg || 0) - (b.ratingAvg || 0)) * dir;
            }
            // release_date fallback to title
            const da = a.releaseDate || '';
            const dbDate = b.releaseDate || '';
            if (da === dbDate) return a.title.localeCompare(b.title);
            return da.localeCompare(dbDate) * dir;
        });

        const safeLimit = Math.max(1, Math.min(100, Number(limit) || 45));
        const total = filtered.length;
        const totalPages = Math.max(1, Math.ceil(total / safeLimit));
        const safePage = Math.max(1, Math.min(totalPages, Number(page) || 1));
        const offset = (safePage - 1) * safeLimit;

        return {
            items: filtered.slice(offset, offset + safeLimit),
            total,
            totalGamesInLibrary: mapped.length,
            totalLibrarySizeBytes: librarySizeBytes,
            page: safePage,
            limit: safeLimit,
            totalPages,
            availableCategories: [...allCatSet].sort(),
            availableLanguages: [...allLangSet].sort()
        };
    };

    const getGameDetails = (baseTitleId, currentUserId = null) => {
        const id = (baseTitleId || '').toLowerCase();
        const row = db.prepare('SELECT * FROM games WHERE base_title_id = ?').get(id);
        if (!row) return null;

        const game = formatGameRow(row);
        game.files = db.prepare(`
            SELECT db_key AS dbKey, title_id AS titleId, file_name AS fileName,
                   file_path AS filePath, file_size AS fileSize, file_type AS type,
                   version, nested_path AS nestedPath
            FROM game_files
            WHERE base_title_id = ?
            ORDER BY CASE file_type WHEN 'Base' THEN 1 WHEN 'Base Game' THEN 1 WHEN 'Update' THEN 2 ELSE 3 END, file_name ASC
        `).all(id);

        if (currentUserId) {
            const userRating = db.prepare('SELECT score FROM ratings WHERE base_title_id = ? AND user_id = ?').get(id, currentUserId);
            game.userRating = userRating ? userRating.score : 0;
        } else {
            game.userRating = 0;
        }

        const rawComments = db.prepare(`
            SELECT c.id, c.base_title_id AS baseTitleId, c.user_id AS userId,
                   c.parent_id AS parentId, c.content, c.created_at AS createdAt,
                   c.updated_at AS updatedAt, u.username, u.avatar_color AS avatarColor, u.role
            FROM comments c
            JOIN users u ON u.id = c.user_id
            WHERE c.base_title_id = ?
            ORDER BY c.created_at ASC
        `).all(id);

        const byId = new Map();
        const roots = [];
        for (const c of rawComments) {
            c.replies = [];
            byId.set(c.id, c);
        }
        for (const c of rawComments) {
            if (c.parentId && byId.has(c.parentId)) {
                byId.get(c.parentId).replies.push(c);
            } else {
                roots.push(c);
            }
        }
        game.comments = roots.reverse();
        return game;
    };

    const updateGameOnlineMetadata = (baseTitleId, { description, categories, languages, releaseDate, screenshots, players, iconPath, publisher, lang }) => {
        const id = (baseTitleId || '').toLowerCase();
        const row = db.prepare('SELECT * FROM games WHERE base_title_id = ?').get(id);
        if (!row) return;

        const cleanCategories = normalizeStringList(categories);
        const cleanLanguages = normalizeStringList(languages, normalizeLanguageName);
        const descField = lang === 'de' ? 'description_de' : 'description_en';
        db.prepare(`
            UPDATE games
            SET ${descField} = CASE WHEN ? != '' THEN ? ELSE ${descField} END,
                categories = CASE WHEN categories = '[]' AND ? != '[]' THEN ? ELSE categories END,
                languages = CASE WHEN languages = '[]' AND ? != '[]' THEN ? ELSE languages END,
                release_date = CASE WHEN ? != '' THEN ? ELSE release_date END,
                screenshots = CASE WHEN ? != '[]' THEN ? ELSE screenshots END,
                players = CASE WHEN ? != '' THEN ? ELSE players END,
                icon_path = CASE WHEN icon_path = '' AND ? != '' THEN ? ELSE icon_path END,
                publisher = CASE WHEN (publisher = '' OR publisher = 'Unknown Publisher') AND ? != '' THEN ? ELSE publisher END,
                updated_at = datetime('now')
            WHERE base_title_id = ?
        `).run(
            description || '', description || '',
            JSON.stringify(cleanCategories), JSON.stringify(cleanCategories),
            JSON.stringify(cleanLanguages), JSON.stringify(cleanLanguages),
            releaseDate || '', releaseDate || '',
            JSON.stringify(screenshots || []), JSON.stringify(screenshots || []),
            players || '', players || '',
            iconPath || '', iconPath || '',
            publisher || '', publisher || '',
            id
        );
    };

    const updateGameTaxonomy = (baseTitleId, { categories, languages }) => {
        const id = (baseTitleId || '').toLowerCase();
        const row = db.prepare('SELECT * FROM games WHERE base_title_id = ?').get(id);
        if (!row) return null;

        const cleanCategories = normalizeStringList(categories);
        const cleanLanguages = normalizeStringList(languages, normalizeLanguageName);
        db.prepare(`
            UPDATE games
            SET categories = ?,
                languages = ?,
                updated_at = datetime('now')
            WHERE base_title_id = ?
        `).run(JSON.stringify(cleanCategories), JSON.stringify(cleanLanguages), id);

        const insTax = db.prepare('INSERT OR IGNORE INTO taxonomy_items (kind, name) VALUES (?, ?)');
        for (const c of cleanCategories) insTax.run('category', c);
        for (const l of cleanLanguages) insTax.run('language', l);

        return getGameDetails(id);
    };

    const getTaxonomyOptions = () => {
        const taxRows = db.prepare('SELECT kind, name FROM taxonomy_items').all();
        const catSet = new Set();
        const langSet = new Set();
        for (const r of taxRows) {
            if (r.kind === 'category' && r.name) catSet.add(r.name);
            if (r.kind === 'language' && r.name) langSet.add(r.name);
        }
        const rows = db.prepare('SELECT categories, languages FROM games').all();
        for (const r of rows) {
            parseJsonSafe(r.categories, []).forEach(c => { if (c) catSet.add(c); });
            parseJsonSafe(r.languages, []).forEach(l => {
                const norm = normalizeLanguageName(l);
                if (norm) langSet.add(norm);
            });
        }
        return {
            categories: [...catSet].sort((a, b) => a.localeCompare(b)),
            languages: [...langSet].sort((a, b) => a.localeCompare(b))
        };
    };

    const addTaxonomyItem = (kind, name) => {
        if (kind !== 'category' && kind !== 'language') {
            throw new Error('Invalid taxonomy kind.');
        }
        const clean = kind === 'language' ? normalizeLanguageName(name) : String(name || '').trim();
        if (!clean) throw new Error('Name cannot be empty.');
        const existing = db.prepare('SELECT id FROM taxonomy_items WHERE kind = ? AND name = ?').get(kind, clean);
        if (existing) throw new Error('Item already exists.');
        db.prepare('INSERT INTO taxonomy_items (kind, name) VALUES (?, ?)').run(kind, clean);
        return getTaxonomyOptions();
    };

    const renameTaxonomyItem = (kind, oldName, newName) => {
        if (kind !== 'category' && kind !== 'language') {
            throw new Error('Invalid taxonomy kind.');
        }
        const cleanOld = String(oldName || '').trim();
        const cleanNew = kind === 'language' ? normalizeLanguageName(newName) : String(newName || '').trim();
        if (!cleanOld || !cleanNew) throw new Error('Both old and new names are required.');

        const col = kind === 'category' ? 'categories' : 'languages';
        const tx = db.transaction(() => {
            const conflict = db.prepare('SELECT id FROM taxonomy_items WHERE kind = ? AND name = ?').get(kind, cleanNew);
            if (conflict && cleanOld.toLowerCase() !== cleanNew.toLowerCase()) {
                db.prepare('DELETE FROM taxonomy_items WHERE kind = ? AND name = ?').run(kind, cleanOld);
            } else {
                const res = db.prepare('UPDATE taxonomy_items SET name = ? WHERE kind = ? AND name = ?').run(cleanNew, kind, cleanOld);
                if (res.changes === 0) {
                    db.prepare('INSERT OR IGNORE INTO taxonomy_items (kind, name) VALUES (?, ?)').run(kind, cleanNew);
                }
            }
            const games = db.prepare(`SELECT base_title_id, ${col} AS arr FROM games`).all();
            const upd = db.prepare(`UPDATE games SET ${col} = ?, updated_at = datetime('now') WHERE base_title_id = ?`);
            for (const g of games) {
                const list = parseJsonSafe(g.arr, []);
                let changed = false;
                const next = [];
                const seen = new Set();
                for (const item of list) {
                    const val = item.toLowerCase() === cleanOld.toLowerCase() ? cleanNew : item;
                    const key = val.toLowerCase();
                    if (!seen.has(key)) {
                        seen.add(key);
                        next.push(val);
                    }
                    if (val !== item) changed = true;
                }
                if (changed || next.length !== list.length) {
                    upd.run(JSON.stringify(next), g.base_title_id);
                }
            }
        });
        tx();
        return getTaxonomyOptions();
    };

    const deleteTaxonomyItem = (kind, name) => {
        if (kind !== 'category' && kind !== 'language') {
            throw new Error('Invalid taxonomy kind.');
        }
        const clean = String(name || '').trim();
        if (!clean) throw new Error('Name is required.');

        const col = kind === 'category' ? 'categories' : 'languages';
        const tx = db.transaction(() => {
            db.prepare('DELETE FROM taxonomy_items WHERE kind = ? AND name = ?').run(kind, clean);
            const games = db.prepare(`SELECT base_title_id, ${col} AS arr FROM games`).all();
            const upd = db.prepare(`UPDATE games SET ${col} = ?, updated_at = datetime('now') WHERE base_title_id = ?`);
            for (const g of games) {
                const list = parseJsonSafe(g.arr, []);
                const next = list.filter(item => item.toLowerCase() !== clean.toLowerCase());
                if (next.length !== list.length) {
                    upd.run(JSON.stringify(next), g.base_title_id);
                }
            }
        });
        tx();
        return getTaxonomyOptions();
    };

    const hashPassword = (password, existingSalt = null) => {
        const salt = existingSalt || crypto.randomBytes(16).toString('hex');
        const derived = crypto.scryptSync(password, salt, 64).toString('hex');
        return `${salt}:${derived}`;
    };

    const verifyPassword = (password, storedHash) => {
        const [salt, key] = (storedHash || '').split(':');
        if (!salt || !key) return false;
        const derived = crypto.scryptSync(password, salt, 64).toString('hex');
        return crypto.timingSafeEqual(Buffer.from(key, 'hex'), Buffer.from(derived, 'hex'));
    };

    const registerUser = (username, password) => {
        const cleanName = (username || '').trim();
        if (!/^[a-zA-Z0-9_-]{3,24}$/.test(cleanName)) {
            throw new Error('Username must be 3-24 characters (letters, numbers, _, -).');
        }
        if (!password || password.length < 6) {
            throw new Error('Password must be at least 6 characters long.');
        }

        const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(cleanName);
        if (existing) {
            throw new Error('Username is already taken.');
        }

        const countRow = db.prepare('SELECT COUNT(*) AS cnt FROM users').get();
        const role = countRow.cnt === 0 ? 'admin' : 'user';
        const color = AVATAR_COLORS[countRow.cnt % AVATAR_COLORS.length];
        const passHash = hashPassword(password);

        const info = db.prepare(`
            INSERT INTO users (username, password_hash, role, avatar_color)
            VALUES (?, ?, ?, ?)
        `).run(cleanName, passHash, role, color);

        return { id: info.lastInsertRowid, username: cleanName, role, avatarColor: color };
    };

    const createSession = (userId) => {
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expiresAt);
        return token;
    };

    const loginUser = (username, password) => {
        const user = db.prepare('SELECT * FROM users WHERE username = ?').get((username || '').trim());
        if (!user || !verifyPassword(password, user.password_hash)) {
            throw new Error('Invalid username or password.');
        }
        const token = createSession(user.id);
        return {
            token,
            user: { id: user.id, username: user.username, role: user.role, avatarColor: user.avatar_color }
        };
    };

    const getSessionUser = (token) => {
        if (!token) return null;
        const row = db.prepare(`
            SELECT u.id, u.username, u.role, u.avatar_color AS avatarColor, s.expires_at AS expiresAt
            FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.token = ?
        `).get(token);

        if (!row) return null;
        if (new Date(row.expiresAt) < new Date()) {
            db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
            return null;
        }
        return { id: row.id, username: row.username, role: row.role, avatarColor: row.avatarColor };
    };

    const logoutSession = (token) => {
        if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    };

    const getPublicUserProfile = (username) => {
        const user = db.prepare(`
            SELECT id, username, role, avatar_color AS avatarColor, created_at AS createdAt
            FROM users WHERE username = ?
        `).get(username);
        if (!user) return null;

        const comments = db.prepare(`
            SELECT c.id, c.content, c.created_at AS createdAt, c.base_title_id AS baseTitleId,
                   g.title AS gameTitle, g.icon_path AS gameIcon
            FROM comments c
            JOIN games g ON g.base_title_id = c.base_title_id
            WHERE c.user_id = ?
            ORDER BY c.created_at DESC
            LIMIT 25
        `).all(user.id);

        const ratings = db.prepare(`
            SELECT r.score, r.created_at AS createdAt, r.base_title_id AS baseTitleId,
                   g.title AS gameTitle, g.icon_path AS gameIcon
            FROM ratings r
            JOIN games g ON g.base_title_id = r.base_title_id
            WHERE r.user_id = ?
            ORDER BY r.created_at DESC
            LIMIT 25
        `).all(user.id);

        return { ...user, comments, ratings };
    };

    const addComment = (baseTitleId, userId, content, parentId = null) => {
        const clean = (content || '').trim();
        if (!clean) throw new Error('Comment cannot be empty.');
        if (clean.length > 2000) throw new Error('Comment is too long (max 2000 chars).');

        const info = db.prepare(`
            INSERT INTO comments (base_title_id, user_id, parent_id, content)
            VALUES (?, ?, ?, ?)
        `).run(baseTitleId.toLowerCase(), userId, parentId || null, clean);

        return db.prepare(`
            SELECT c.id, c.base_title_id AS baseTitleId, c.user_id AS userId,
                   c.parent_id AS parentId, c.content, c.created_at AS createdAt,
                   c.updated_at AS updatedAt, u.username, u.avatar_color AS avatarColor, u.role
            FROM comments c JOIN users u ON u.id = c.user_id
            WHERE c.id = ?
        `).get(info.lastInsertRowid);
    };

    const editComment = (commentId, userId, isAdmin, content) => {
        const clean = (content || '').trim();
        if (!clean) throw new Error('Comment cannot be empty.');
        const existing = db.prepare('SELECT * FROM comments WHERE id = ?').get(commentId);
        if (!existing) throw new Error('Comment not found.');
        if (existing.user_id !== userId && !isAdmin) throw new Error('Forbidden.');

        db.prepare(`UPDATE comments SET content = ?, updated_at = datetime('now') WHERE id = ?`).run(clean, commentId);
        return true;
    };

    const deleteComment = (commentId, userId, isAdmin) => {
        const existing = db.prepare('SELECT * FROM comments WHERE id = ?').get(commentId);
        if (!existing) throw new Error('Comment not found.');
        if (existing.user_id !== userId && !isAdmin) throw new Error('Forbidden.');

        db.prepare('DELETE FROM comments WHERE id = ?').run(commentId);
        return true;
    };

    const getLatestComments = (limit = 15, offset = 0) => {
        return db.prepare(`
            SELECT c.id, c.base_title_id AS baseTitleId, c.content, c.created_at AS createdAt,
                   u.username, u.avatar_color AS avatarColor,
                   g.title AS gameTitle, g.icon_path AS gameIcon
            FROM comments c
            JOIN users u ON u.id = c.user_id
            JOIN games g ON g.base_title_id = c.base_title_id
            ORDER BY c.created_at DESC
            LIMIT ? OFFSET ?
        `).all(limit, offset);
    };

    const setRating = (baseTitleId, userId, score) => {
        const num = Number(score);
        if (!Number.isInteger(num) || num < 1 || num > 5) {
            throw new Error('Rating must be between 1 and 5.');
        }
        const id = baseTitleId.toLowerCase();
        db.prepare(`
            INSERT INTO ratings (base_title_id, user_id, score)
            VALUES (?, ?, ?)
            ON CONFLICT(base_title_id, user_id) DO UPDATE SET score = excluded.score, created_at = datetime('now')
        `).run(id, userId, num);

        const agg = db.prepare(`
            SELECT AVG(score) AS avgScore, COUNT(*) AS cnt
            FROM ratings WHERE base_title_id = ?
        `).get(id);

        const avg = Math.round((agg.avgScore || 0) * 10) / 10;
        const cnt = agg.cnt || 0;
        db.prepare('UPDATE games SET rating_avg = ?, rating_count = ? WHERE base_title_id = ?').run(avg, cnt, id);
        return { ratingAvg: avg, ratingCount: cnt, userRating: num };
    };

    const listUsers = () => {
        return db.prepare(`
            SELECT id, username, role, avatar_color AS avatarColor, created_at AS createdAt
            FROM users
            ORDER BY
                CASE role
                    WHEN 'admin' THEN 1
                    WHEN 'coadmin' THEN 2
                    WHEN 'moderator' THEN 3
                    ELSE 4
                END ASC,
                username ASC
        `).all();
    };

    const adminCreateUser = ({ username, password, role = 'user' }) => {
        const cleanName = (username || '').trim();
        if (!/^[a-zA-Z0-9_-]{3,24}$/.test(cleanName)) {
            throw new Error('Username must be 3-24 characters (letters, numbers, _, -).');
        }
        if (!password || password.length < 6) {
            throw new Error('Password must be at least 6 characters long.');
        }
        const cleanRole = VALID_ROLES.includes(role) ? role : 'user';
        const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(cleanName);
        if (existing) {
            throw new Error('Username is already taken.');
        }
        const countRow = db.prepare('SELECT COUNT(*) AS cnt FROM users').get();
        const color = AVATAR_COLORS[countRow.cnt % AVATAR_COLORS.length];
        const passHash = hashPassword(password);
        const info = db.prepare(`
            INSERT INTO users (username, password_hash, role, avatar_color)
            VALUES (?, ?, ?, ?)
        `).run(cleanName, passHash, cleanRole, color);
        return { id: info.lastInsertRowid, username: cleanName, role: cleanRole, avatarColor: color };
    };

    const adminUpdateUser = (targetUserId, { role, password }, actingUserId) => {
        const uid = Number(targetUserId);
        const target = db.prepare('SELECT * FROM users WHERE id = ?').get(uid);
        if (!target) throw new Error('User not found.');

        let nextRole = target.role;
        if (role !== undefined) {
            if (!VALID_ROLES.includes(role)) {
                throw new Error('Invalid role.');
            }
            if (target.role === 'admin' && role !== 'admin') {
                const adminCount = db.prepare("SELECT COUNT(*) AS cnt FROM users WHERE role = 'admin'").get().cnt;
                if (adminCount <= 1) {
                    throw new Error('Cannot demote the last remaining Admin.');
                }
            }
            if (uid === Number(actingUserId) && role !== 'admin') {
                throw new Error('You cannot demote your own Admin account.');
            }
            nextRole = role;
        }

        if (password && String(password).length > 0) {
            if (String(password).length < 6) {
                throw new Error('Password must be at least 6 characters long.');
            }
            const passHash = hashPassword(String(password));
            db.prepare('UPDATE users SET role = ?, password_hash = ? WHERE id = ?').run(nextRole, passHash, uid);
        } else {
            db.prepare('UPDATE users SET role = ? WHERE id = ?').run(nextRole, uid);
        }

        return db.prepare('SELECT id, username, role, avatar_color AS avatarColor, created_at AS createdAt FROM users WHERE id = ?').get(uid);
    };

    const adminDeleteUser = (targetUserId, actingUserId) => {
        const uid = Number(targetUserId);
        if (uid === Number(actingUserId)) {
            throw new Error('You cannot delete your own account.');
        }
        const target = db.prepare('SELECT * FROM users WHERE id = ?').get(uid);
        if (!target) throw new Error('User not found.');
        if (target.role === 'admin') {
            const adminCount = db.prepare("SELECT COUNT(*) AS cnt FROM users WHERE role = 'admin'").get().cnt;
            if (adminCount <= 1) {
                throw new Error('Cannot delete the last remaining Admin.');
            }
        }
        db.prepare('DELETE FROM users WHERE id = ?').run(uid);
        return { deleted: true, id: uid };
    };

    return {
        dbPath,
        syncFromGamesJson,
        queryCatalog,
        getGameDetails,
        updateGameOnlineMetadata,
        updateGameTaxonomy,
        getTaxonomyOptions,
        addTaxonomyItem,
        renameTaxonomyItem,
        deleteTaxonomyItem,
        registerUser,
        createSession,
        loginUser,
        getSessionUser,
        logoutSession,
        getPublicUserProfile,
        listUsers,
        adminCreateUser,
        adminUpdateUser,
        adminDeleteUser,
        addComment,
        editComment,
        deleteComment,
        getLatestComments,
        setRating
    };
}

module.exports = { createCatalogDb };
