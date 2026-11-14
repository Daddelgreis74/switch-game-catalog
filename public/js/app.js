(() => {
    const state = {
        lang: 'en',
        user: null,
        catalog: {
            p: 1,
            s: '',
            sb: 'release_date',
            so: 'desc',
            c: [],
            l: []
        },
        availableCategories: [],
        availableLanguages: [],
        drawerOffset: 0,
        drawerOpen: false,
        uploadQueue: [],
        isUploading: false
    };

    const appMain = document.getElementById('app-main');
    const searchInput = document.getElementById('search-input');
    const searchForm = document.getElementById('header-search-form');
    const headerUsername = document.getElementById('header-username');

    function t(key, vars = {}) {
        const parts = key.split('.');
        let cur = (window.CATALOG_I18N && window.CATALOG_I18N[state.lang]) || window.CATALOG_I18N.en;
        for (const p of parts) {
            if (cur && cur[p] !== undefined) cur = cur[p];
            else return key;
        }
        if (typeof cur === 'string') {
            Object.entries(vars).forEach(([k, v]) => {
                cur = cur.replace(`{${k}}`, String(v));
            });
        }
        return cur;
    }

    function escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatSize(bytes) {
        const b = Number(bytes) || 0;
        if (b >= 1024 * 1024 * 1024) {
            return (b / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
        }
        return Math.max(1, Math.round(b / (1024 * 1024))) + ' MB';
    }

    function formatDate(raw) {
        if (!raw) return t('catalog.no_date');
        const str = String(raw).trim();
        if (/^\d{8}$/.test(str)) {
            return `${str.slice(6, 8)}.${str.slice(4, 6)}.${str.slice(0, 4)}`;
        }
        const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) return `${m[3]}.${m[2]}.${m[1]}`;
        return str;
    }

    function applyStaticI18n() {
        document.documentElement.lang = state.lang;
        document.title = t('app_title');
        searchInput.placeholder = t('nav.search_placeholder');

        document.querySelectorAll('.lang-pill-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.lang === state.lang);
        });

        document.getElementById('nav-home').href = `/${state.lang}`;
        document.getElementById('nav-settings').href = `/${state.lang}/settings`;
        document.getElementById('nav-profile').href = `/${state.lang}/profile`;
        document.getElementById('footer-profile').href = `/${state.lang}/profile`;

        document.querySelectorAll('[data-i18n]').forEach(el => {
            el.textContent = t(el.dataset.i18n);
        });
    }

    function navigate(path) {
        if (window.location.pathname + window.location.search !== path) {
            history.pushState({}, '', path);
        }
        route();
    }

    function parseUrl() {
        const path = window.location.pathname;
        const segments = path.split('/').filter(Boolean);
        if (segments[0] === 'de' || segments[0] === 'en') {
            state.lang = segments[0];
        } else {
            state.lang = localStorage.getItem('nsw_lang') || 'en';
        }
        localStorage.setItem('nsw_lang', state.lang);

        const params = new URLSearchParams(window.location.search);
        state.catalog.p = Math.max(1, Number(params.get('p')) || 1);
        state.catalog.s = params.get('s') || '';
        state.catalog.sb = params.get('sb') || 'release_date';
        state.catalog.so = params.get('so') === 'asc' ? 'asc' : 'desc';
        state.catalog.c = params.get('c') ? params.get('c').split(',').filter(Boolean) : [];
        state.catalog.l = params.get('l') ? params.get('l').split(',').filter(Boolean) : [];
        searchInput.value = state.catalog.s;

        return segments;
    }

    function buildCatalogUrl(overrides = {}) {
        const next = { ...state.catalog, ...overrides };
        const params = new URLSearchParams();
        if (next.p > 1) params.set('p', String(next.p));
        if (next.s) params.set('s', next.s);
        if (next.sb && next.sb !== 'release_date') params.set('sb', next.sb);
        if (next.so && next.so !== 'desc') params.set('so', next.so);
        if (next.c && next.c.length > 0) params.set('c', next.c.join(','));
        if (next.l && next.l.length > 0) params.set('l', next.l.join(','));
        const qs = params.toString();
        return `/${state.lang}${qs ? '?' + qs : ''}`;
    }

    async function fetchAuthMe() {
        try {
            const res = await fetch('/api/auth/me');
            const data = await res.json();
            state.user = data.user || null;
        } catch {
            state.user = null;
        }
        const navSettings = document.getElementById('nav-settings');
        if (state.user) {
            headerUsername.textContent = state.user.username;
            headerUsername.classList.remove('hidden');
            if (['admin', 'coadmin'].includes(state.user.role)) {
                navSettings?.classList.remove('hidden');
            } else {
                navSettings?.classList.add('hidden');
            }
        } else {
            headerUsername.classList.add('hidden');
            navSettings?.classList.add('hidden');
        }
    }

    async function route() {
        const segments = parseUrl();
        applyStaticI18n();
        window.scrollTo({ top: 0, behavior: 'instant' });

        const sub = segments[1] || '';
        if (sub === 'game' && segments[2]) {
            await renderGameDetail(segments[2]);
        } else if (sub === 'settings') {
            await renderSettingsPage();
        } else if (sub === 'profile') {
            await renderProfilePage();
        } else if (sub === 'user' && segments[2]) {
            await renderPublicUserPage(decodeURIComponent(segments[2]));
        } else {
            await renderCatalog();
        }
    }

    // --- Catalog View ---
    async function renderCatalog() {
        appMain.innerHTML = `<div class="state-box"><span class="material-symbols-outlined">hourglass_top</span><p>${escapeHtml(t('catalog.loading'))}</p></div>`;

        const params = new URLSearchParams({
            p: String(state.catalog.p),
            limit: '45',
            s: state.catalog.s,
            sb: state.catalog.sb,
            so: state.catalog.so,
            c: state.catalog.c.join(','),
            l: state.catalog.l.join(',')
        });

        const res = await fetch(`/api/catalog?${params.toString()}`);
        const data = await res.json();

        const keysOverlay = document.getElementById('keys-overlay');
        if (data.keysMissing) {
            keysOverlay.classList.remove('hidden');
        } else {
            keysOverlay.classList.add('hidden');
        }

        state.availableCategories = data.availableCategories || [];
        state.availableLanguages = data.availableLanguages || [];

        const totalGB = ((data.totalLibrarySizeBytes || 0) / (1024 * 1024 * 1024)).toFixed(1);
        const catCountBadge = state.catalog.c.length > 0 ? `<span class="filter-count-badge">${state.catalog.c.length}</span>` : '';
        const langCountBadge = state.catalog.l.length > 0 ? `<span class="filter-count-badge">${state.catalog.l.length}</span>` : '';

        let html = `
            <div class="filter-bar">
                <div class="filter-pills-group">
                    <button type="button" class="filter-pill-btn ${state.catalog.c.length ? 'has-selection' : ''}" id="btn-filter-categories">
                        <span class="material-symbols-outlined">category</span>
                        <span>${escapeHtml(t('filter.all_categories'))}</span>
                        ${catCountBadge}
                    </button>
                    <button type="button" class="filter-pill-btn ${state.catalog.l.length ? 'has-selection' : ''}" id="btn-filter-languages">
                        <span class="material-symbols-outlined">translate</span>
                        <span>${escapeHtml(t('filter.all_languages'))}</span>
                        ${langCountBadge}
                    </button>
                    <select class="filter-select" id="select-sort-by">
                        <option value="release_date" ${state.catalog.sb === 'release_date' ? 'selected' : ''}>${escapeHtml(t('filter.sort_release'))}</option>
                        <option value="title" ${state.catalog.sb === 'title' ? 'selected' : ''}>${escapeHtml(t('filter.sort_title'))}</option>
                        <option value="size" ${state.catalog.sb === 'size' ? 'selected' : ''}>${escapeHtml(t('filter.sort_size'))}</option>
                        <option value="rating" ${state.catalog.sb === 'rating' ? 'selected' : ''}>${escapeHtml(t('filter.sort_rating'))}</option>
                    </select>
                    <button type="button" class="filter-pill-btn" id="btn-sort-order">
                        <span class="material-symbols-outlined">${state.catalog.so === 'asc' ? 'arrow_upward' : 'arrow_downward'}</span>
                        <span>${escapeHtml(state.catalog.so === 'asc' ? t('filter.order_asc') : t('filter.order_desc'))}</span>
                    </button>
                </div>
                <div class="catalog-stats-pill">
                    ${escapeHtml(t('filter.stats_summary', { games: data.totalGamesInLibrary || 0, size: totalGB }))}
                </div>
            </div>
        `;

        if (!data.items || data.items.length === 0) {
            html += `
                <div class="state-box">
                    <span class="material-symbols-outlined">sports_esports</span>
                    <h3>${escapeHtml(t('catalog.empty_title'))}</h3>
                    <p>${escapeHtml(t('catalog.empty_desc'))}</p>
                </div>
            `;
        } else {
            html += `<div class="games-grid">`;
            for (const g of data.items) {
                const iconSrc = g.icon ? `/${g.icon.replace(/^\/+/, '')}` : '/favicon.svg';
                const extraBadges = [];
                if (g.updatesCount > 0) extraBadges.push(`<span class="mini-badge">UPD ${g.updatesCount}</span>`);
                if (g.dlcsCount > 0) extraBadges.push(`<span class="mini-badge purple">DLC ${g.dlcsCount}</span>`);
                const ratingHtml = g.ratingCount > 0
                    ? `<span class="game-card-rating">★ ${g.ratingAvg.toFixed(1)}</span>`
                    : `<span>${escapeHtml(formatDate(g.releaseDate))}</span>`;

                html += `
                    <a href="/${state.lang}/game/${encodeURIComponent(g.titleId)}" class="game-card" data-game-link="${escapeHtml(g.titleId)}">
                        <div class="game-card-thumb">
                            <img src="${escapeHtml(iconSrc)}" alt="${escapeHtml(g.title)}" loading="lazy" onerror="this.src='/favicon.svg'">
                            <div class="game-card-badges">${extraBadges.join('')}</div>
                        </div>
                        <div class="game-card-body">
                            <div class="game-card-title">${escapeHtml(g.title)}</div>
                            <div class="game-card-meta">
                                ${ratingHtml}
                                <span>${escapeHtml(formatSize(g.totalSize))}</span>
                            </div>
                        </div>
                    </a>
                `;
            }
            html += `</div>`;
            html += renderPagination(data.page, data.totalPages);
        }

        appMain.innerHTML = html;

        document.getElementById('btn-filter-categories')?.addEventListener('click', () => {
            openFilterModal('categories');
        });
        document.getElementById('btn-filter-languages')?.addEventListener('click', () => {
            openFilterModal('languages');
        });
        document.getElementById('select-sort-by')?.addEventListener('change', (e) => {
            navigate(buildCatalogUrl({ sb: e.target.value, p: 1 }));
        });
        document.getElementById('btn-sort-order')?.addEventListener('click', () => {
            const nextSo = state.catalog.so === 'desc' ? 'asc' : 'desc';
            navigate(buildCatalogUrl({ so: nextSo, p: 1 }));
        });

        appMain.querySelectorAll('[data-game-link]').forEach(el => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                navigate(`/${state.lang}/game/${encodeURIComponent(el.dataset.gameLink)}`);
            });
        });

        appMain.querySelectorAll('[data-page]').forEach(btn => {
            btn.addEventListener('click', () => {
                const targetPage = Number(btn.dataset.page);
                if (targetPage >= 1) navigate(buildCatalogUrl({ p: targetPage }));
            });
        });
    }

    function renderPagination(current, totalPages) {
        if (totalPages <= 1) return '';
        const items = [];
        items.push(`<button class="page-btn" data-page="1" ${current <= 1 ? 'disabled' : ''}>&laquo;</button>`);
        items.push(`<button class="page-btn" data-page="${current - 1}" ${current <= 1 ? 'disabled' : ''}>&lsaquo;</button>`);

        const pages = new Set([1, totalPages]);
        for (let i = Math.max(1, current - 2); i <= Math.min(totalPages, current + 2); i++) {
            pages.add(i);
        }
        const sorted = [...pages].sort((a, b) => a - b);
        let prev = 0;
        for (const p of sorted) {
            if (prev && p - prev > 1) items.push(`<span class="page-ellipsis">...</span>`);
            items.push(`<button class="page-btn ${p === current ? 'active' : ''}" data-page="${p}">${p}</button>`);
            prev = p;
        }

        items.push(`<button class="page-btn" data-page="${current + 1}" ${current >= totalPages ? 'disabled' : ''}>&rsaquo;</button>`);
        items.push(`<button class="page-btn" data-page="${totalPages}" ${current >= totalPages ? 'disabled' : ''}>&raquo;</button>`);
        return `<div class="pagination-bar">${items.join('')}</div>`;
    }

    // --- Multi-Select Filter Modal ---
    let activeFilterMode = null;
    function openFilterModal(mode) {
        activeFilterMode = mode;
        const modal = document.getElementById('filter-modal');
        const titleEl = document.getElementById('filter-modal-title');
        const gridEl = document.getElementById('filter-modal-options');

        const options = mode === 'categories' ? state.availableCategories : state.availableLanguages;
        const selected = mode === 'categories' ? state.catalog.c : state.catalog.l;
        titleEl.textContent = mode === 'categories' ? t('filter.categories_modal_title') : t('filter.languages_modal_title');

        if (options.length === 0) {
            gridEl.innerHTML = `<p class="muted-text">-</p>`;
        } else {
            gridEl.innerHTML = options.map(opt => `
                <label class="checkbox-pill-label">
                    <input type="checkbox" value="${escapeHtml(opt)}" ${selected.includes(opt) ? 'checked' : ''}>
                    <span>${escapeHtml(opt)}</span>
                </label>
            `).join('');
        }
        modal.classList.remove('hidden');
    }

    document.getElementById('filter-modal-close').addEventListener('click', () => {
        document.getElementById('filter-modal').classList.add('hidden');
    });
    document.getElementById('filter-modal-backdrop').addEventListener('click', () => {
        document.getElementById('filter-modal').classList.add('hidden');
    });
    document.getElementById('filter-modal-clear').addEventListener('click', () => {
        document.getElementById('filter-modal').classList.add('hidden');
        if (activeFilterMode === 'categories') navigate(buildCatalogUrl({ c: [], p: 1 }));
        if (activeFilterMode === 'languages') navigate(buildCatalogUrl({ l: [], p: 1 }));
    });
    document.getElementById('filter-modal-apply').addEventListener('click', () => {
        const checked = [...document.querySelectorAll('#filter-modal-options input:checked')].map(i => i.value);
        document.getElementById('filter-modal').classList.add('hidden');
        if (activeFilterMode === 'categories') navigate(buildCatalogUrl({ c: checked, p: 1 }));
        if (activeFilterMode === 'languages') navigate(buildCatalogUrl({ l: checked, p: 1 }));
    });

    async function openTaxonomyEditorModal(game) {
        let options = { categories: [], languages: [] };
        try {
            const res = await fetch('/api/taxonomy');
            if (res.ok) options = await res.json();
        } catch { /* ignore */ }

        const catSet = new Set([...(options.categories || []), ...(game.categories || [])]);
        const langSet = new Set([...(options.languages || []), ...(game.languages || [])]);
        const selectedCats = new Set((game.categories || []).map(c => c.toLowerCase()));
        const selectedLangs = new Set((game.languages || []).map(l => l.toLowerCase()));

        let overlay = document.getElementById('taxonomy-editor-modal');
        if (overlay) overlay.remove();

        overlay = document.createElement('div');
        overlay.id = 'taxonomy-editor-modal';
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal-backdrop" id="tax-modal-backdrop"></div>
            <div class="modal-card modal-card-lg" style="max-width:680px;max-height:85vh;display:flex;flex-direction:column;">
                <div class="modal-header">
                    <h3>${escapeHtml(t('detail.edit_taxonomy'))}</h3>
                    <button type="button" class="icon-btn" id="tax-modal-close">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>
                <div class="modal-body" style="overflow-y:auto;padding:16px 20px;display:flex;flex-direction:column;gap:18px;">
                    <div>
                        <h4 style="margin:0 0 10px 0;font-size:0.95rem;">${escapeHtml(t('detail.categories'))}</h4>
                        <div class="filter-options-grid" id="tax-cats-grid">
                            ${[...catSet].sort((a, b) => a.localeCompare(b)).map(c => `
                                <label class="checkbox-pill-label">
                                    <input type="checkbox" value="${escapeHtml(c)}" ${selectedCats.has(c.toLowerCase()) ? 'checked' : ''}>
                                    <span>${escapeHtml(c)}</span>
                                </label>
                            `).join('')}
                        </div>
                        <div style="display:flex;gap:8px;margin-top:10px;">
                            <input type="text" id="tax-custom-cat" class="text-input" placeholder="${escapeHtml(t('detail.add_custom_category'))}" style="flex:1;height:36px;">
                            <button type="button" class="btn-pill btn-secondary" id="tax-add-cat-btn" style="height:36px;padding:0 14px;">${escapeHtml(t('detail.add_btn'))}</button>
                        </div>
                    </div>
                    <div>
                        <h4 style="margin:0 0 10px 0;font-size:0.95rem;">${escapeHtml(t('detail.languages'))}</h4>
                        <div class="filter-options-grid" id="tax-langs-grid">
                            ${[...langSet].sort((a, b) => a.localeCompare(b)).map(l => `
                                <label class="checkbox-pill-label">
                                    <input type="checkbox" value="${escapeHtml(l)}" ${selectedLangs.has(l.toLowerCase()) ? 'checked' : ''}>
                                    <span>${escapeHtml(l)}</span>
                                </label>
                            `).join('')}
                        </div>
                        <div style="display:flex;gap:8px;margin-top:10px;">
                            <input type="text" id="tax-custom-lang" class="text-input" placeholder="${escapeHtml(t('detail.add_custom_language'))}" style="flex:1;height:36px;">
                            <button type="button" class="btn-pill btn-secondary" id="tax-add-lang-btn" style="height:36px;padding:0 14px;">${escapeHtml(t('detail.add_btn'))}</button>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn-pill btn-ghost" id="tax-modal-cancel">${escapeHtml(t('detail.cancel'))}</button>
                    <button type="button" class="btn-pill btn-primary" id="tax-modal-save">${escapeHtml(t('detail.save'))}</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const closeModal = () => overlay.remove();
        document.getElementById('tax-modal-backdrop').addEventListener('click', closeModal);
        document.getElementById('tax-modal-close').addEventListener('click', closeModal);
        document.getElementById('tax-modal-cancel').addEventListener('click', closeModal);

        const appendCustomOption = (gridId, inputId) => {
            const input = document.getElementById(inputId);
            const val = (input.value || '').trim();
            if (!val) return;
            const grid = document.getElementById(gridId);
            const existing = [...grid.querySelectorAll('input')].find(i => i.value.toLowerCase() === val.toLowerCase());
            if (existing) {
                existing.checked = true;
            } else {
                const label = document.createElement('label');
                label.className = 'checkbox-pill-label';
                label.innerHTML = `<input type="checkbox" value="${escapeHtml(val)}" checked><span>${escapeHtml(val)}</span>`;
                grid.appendChild(label);
            }
            input.value = '';
        };

        document.getElementById('tax-add-cat-btn').addEventListener('click', () => appendCustomOption('tax-cats-grid', 'tax-custom-cat'));
        document.getElementById('tax-add-lang-btn').addEventListener('click', () => appendCustomOption('tax-langs-grid', 'tax-custom-lang'));

        document.getElementById('tax-modal-save').addEventListener('click', async () => {
            const categories = [...document.querySelectorAll('#tax-cats-grid input:checked')].map(i => i.value);
            const languages = [...document.querySelectorAll('#tax-langs-grid input:checked')].map(i => i.value);
            const saveBtn = document.getElementById('tax-modal-save');
            saveBtn.disabled = true;
            const res = await fetch(`/api/games/${encodeURIComponent(game.titleId)}/taxonomy`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ categories, languages })
            });
            if (res.ok) {
                closeModal();
                renderGameDetail(game.titleId);
            } else {
                saveBtn.disabled = false;
            }
        });
    }

    // --- Game Detail View ---
    async function renderGameDetail(titleId) {
        appMain.innerHTML = `<div class="state-box"><span class="material-symbols-outlined">hourglass_top</span><p>${escapeHtml(t('catalog.loading'))}</p></div>`;
        const res = await fetch(`/api/games/${encodeURIComponent(titleId)}?lang=${state.lang}`);
        if (!res.ok) {
            appMain.innerHTML = `<div class="state-box"><h3>Game not found</h3><a href="/${state.lang}" class="btn-pill btn-primary" id="back-home-err">${escapeHtml(t('detail.back'))}</a></div>`;
            document.getElementById('back-home-err')?.addEventListener('click', (e) => {
                e.preventDefault();
                navigate(`/${state.lang}`);
            });
            return;
        }

        const g = await res.json();
        const iconSrc = g.icon ? `/${g.icon.replace(/^\/+/, '')}` : '/favicon.svg';
        const description = (state.lang === 'de' && g.descriptionDe) ? g.descriptionDe : g.descriptionEn;

        const starsHtml = [1, 2, 3, 4, 5].map(n => `
            <button type="button" class="star-btn ${n <= Math.round(g.userRating || g.ratingAvg) ? 'filled' : ''}" data-star="${n}" title="${n}/5">
                <span class="material-symbols-outlined">star</span>
            </button>
        `).join('');

        const catsHtml = (g.categories || []).map(c =>
            `<button type="button" class="cat-badge" data-cat-jump="${escapeHtml(c)}">${escapeHtml(c)}</button>`
        ).join('');

        const langsHtml = (g.languages || []).map(l =>
            `<span class="lang-chip">${escapeHtml(l)}</span>`
        ).join('');

        let carouselHtml = '';
        if (g.screenshots && g.screenshots.length > 0) {
            const thumbs = g.screenshots.map((src, idx) => `
                <button type="button" class="carousel-thumb-btn ${idx === 0 ? 'active' : ''}" data-slide="${idx}">
                    <img src="${escapeHtml(src)}" alt="Screenshot ${idx + 1}" loading="lazy">
                </button>
            `).join('');
            carouselHtml = `
                <section class="detail-section-card">
                    <h2 class="detail-section-title"><span class="material-symbols-outlined">photo_library</span> ${escapeHtml(t('detail.screenshots'))}</h2>
                    <div class="carousel-main-wrap">
                        <img src="${escapeHtml(g.screenshots[0])}" alt="Screenshot" class="carousel-main-img" id="carousel-main-img">
                        <button type="button" class="carousel-nav-btn prev" id="carousel-prev"><span class="material-symbols-outlined">chevron_left</span></button>
                        <button type="button" class="carousel-nav-btn next" id="carousel-next"><span class="material-symbols-outlined">chevron_right</span></button>
                    </div>
                    <div class="carousel-thumbs">${thumbs}</div>
                </section>
            `;
        }

        const descHtml = description ? `
            <section class="detail-section-card">
                <h2 class="detail-section-title"><span class="material-symbols-outlined">description</span> ${escapeHtml(t('detail.description'))}</h2>
                <p class="description-text clamped" id="detail-desc-text">${escapeHtml(description)}</p>
                <button type="button" class="read-more-btn" id="detail-read-more">${escapeHtml(t('detail.read_more'))}</button>
            </section>
        ` : '';

        const filesRows = (g.files || []).map(f => {
            const typeLower = (f.type || 'base').toLowerCase();
            const tagCls = typeLower.includes('update') ? 'update' : (typeLower.includes('dlc') ? 'dlc' : 'base');
            return `
                <div class="file-item-row">
                    <div class="file-item-left">
                        <span class="file-type-tag ${tagCls}">${escapeHtml(f.type || 'Base')}</span>
                        <span class="file-item-name" title="${escapeHtml(f.fileName)}">${escapeHtml(f.fileName)}</span>
                    </div>
                    <div class="file-item-right">
                        <span class="file-item-size">${escapeHtml(formatSize(f.fileSize))}</span>
                        <a href="/api/download/${encodeURIComponent(f.dbKey)}" class="btn-pill btn-secondary" style="height:32px;padding:0 12px;font-size:0.8rem;">
                            <span class="material-symbols-outlined" style="font-size:16px;">download</span>
                            <span>${escapeHtml(t('detail.download'))}</span>
                        </a>
                        <button type="button" class="btn-pill btn-ghost file-del-btn" data-del-key="${escapeHtml(f.dbKey)}" data-del-name="${escapeHtml(f.fileName)}" style="height:32px;padding:0 10px;">
                            <span class="material-symbols-outlined" style="font-size:16px;color:var(--danger);">delete</span>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        appMain.innerHTML = `
            <a href="/${state.lang}" class="detail-back-link" id="detail-back-btn">
                <span class="material-symbols-outlined">arrow_back</span>
                <span>${escapeHtml(t('detail.back'))}</span>
            </a>

            <section class="detail-hero-card">
                <div class="detail-icon-wrap">
                    <img src="${escapeHtml(iconSrc)}" alt="${escapeHtml(g.title)}" onerror="this.src='/favicon.svg'">
                </div>
                <div class="detail-header-info">
                    <h1>${escapeHtml(g.title)}</h1>
                    <div class="detail-publisher">${escapeHtml(g.publisher || '-')}</div>

                    <div class="star-rating-widget">
                        <div class="stars-row" id="detail-stars">${starsHtml}</div>
                        <span class="rating-summary-text" id="detail-rating-summary">
                            ${g.ratingAvg ? g.ratingAvg.toFixed(1) : '0.0'} ${escapeHtml(t('detail.rating_count', { count: g.ratingCount || 0 }))}
                        </span>
                    </div>

                    <div class="detail-meta-grid">
                        <div class="meta-box">
                            <span class="meta-label">${escapeHtml(t('detail.title_id'))}</span>
                            <span class="meta-value">${escapeHtml(g.titleId.toUpperCase())}</span>
                        </div>
                        <div class="meta-box">
                            <span class="meta-label">${escapeHtml(t('detail.release_date'))}</span>
                            <span class="meta-value">${escapeHtml(formatDate(g.releaseDate))}</span>
                        </div>
                        <div class="meta-box">
                            <span class="meta-label">${escapeHtml(t('detail.base_size'))}</span>
                            <span class="meta-value">${escapeHtml(formatSize(g.baseSize || g.totalSize))}</span>
                        </div>
                        <div class="meta-box">
                            <span class="meta-label">${escapeHtml(t('detail.players'))}</span>
                            <span class="meta-value">${escapeHtml(g.players || '1+')}</span>
                        </div>
                    </div>

                    ${catsHtml ? `<div class="badge-group">${catsHtml}</div>` : ''}
                    ${langsHtml ? `<div class="badge-group">${langsHtml}</div>` : ''}
                    <div class="badge-group" style="margin-top:8px;">
                        <button type="button" class="btn-pill btn-secondary" id="btn-edit-taxonomy" style="height:32px;padding:0 14px;font-size:0.82rem;">
                            <span class="material-symbols-outlined" style="font-size:16px;">tune</span>
                            <span>${escapeHtml(t('detail.edit_taxonomy'))}</span>
                        </button>
                    </div>
                </div>
            </section>

            ${carouselHtml}
            ${descHtml}

            <section class="detail-section-card">
                <h2 class="detail-section-title"><span class="material-symbols-outlined">folder_zip</span> ${escapeHtml(t('detail.files_title'))}</h2>
                <div class="files-list">${filesRows}</div>
            </section>

            <section class="detail-section-card">
                <h2 class="detail-section-title"><span class="material-symbols-outlined">forum</span> ${escapeHtml(t('detail.comments_title'))}</h2>
                <div id="detail-comment-form-wrap"></div>
                <div class="comment-thread" id="detail-comments-thread"></div>
            </section>
        `;

        document.getElementById('detail-back-btn').addEventListener('click', (e) => {
            e.preventDefault();
            navigate(`/${state.lang}`);
        });

        appMain.querySelectorAll('[data-cat-jump]').forEach(btn => {
            btn.addEventListener('click', () => {
                navigate(buildCatalogUrl({ c: [btn.dataset.catJump], p: 1 }));
            });
        });

        document.getElementById('btn-edit-taxonomy')?.addEventListener('click', () => {
            openTaxonomyEditorModal(g);
        });

        // Rating handler
        appMain.querySelectorAll('#detail-stars .star-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!state.user) {
                    alert(t('detail.login_to_comment'));
                    navigate(`/${state.lang}/profile`);
                    return;
                }
                const score = Number(btn.dataset.star);
                const r = await fetch(`/api/games/${encodeURIComponent(g.titleId)}/rating`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ score })
                });
                if (r.ok) {
                    const updated = await r.json();
                    document.getElementById('detail-rating-summary').textContent =
                        `${updated.ratingAvg.toFixed(1)} ${t('detail.rating_count', { count: updated.ratingCount })}`;
                    appMain.querySelectorAll('#detail-stars .star-btn').forEach(s => {
                        s.classList.toggle('filled', Number(s.dataset.star) <= updated.userRating);
                    });
                }
            });
        });

        // Carousel logic
        if (g.screenshots && g.screenshots.length > 0) {
            let slideIdx = 0;
            const mainImg = document.getElementById('carousel-main-img');
            const setSlide = (idx) => {
                slideIdx = (idx + g.screenshots.length) % g.screenshots.length;
                mainImg.src = g.screenshots[slideIdx];
                appMain.querySelectorAll('.carousel-thumb-btn').forEach((b, i) => b.classList.toggle('active', i === slideIdx));
            };
            document.getElementById('carousel-prev').addEventListener('click', () => setSlide(slideIdx - 1));
            document.getElementById('carousel-next').addEventListener('click', () => setSlide(slideIdx + 1));
            appMain.querySelectorAll('.carousel-thumb-btn').forEach(b => {
                b.addEventListener('click', () => setSlide(Number(b.dataset.slide)));
            });
            mainImg.addEventListener('click', () => {
                document.getElementById('lightbox-img').src = mainImg.src;
                document.getElementById('lightbox-modal').classList.remove('hidden');
            });
        }

        // Read more toggle
        document.getElementById('detail-read-more')?.addEventListener('click', (e) => {
            const p = document.getElementById('detail-desc-text');
            const isClamped = p.classList.toggle('clamped');
            e.target.textContent = isClamped ? t('detail.read_more') : t('detail.read_less');
        });

        // Delete file handler
        appMain.querySelectorAll('.file-del-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm(t('detail.delete_confirm', { filename: btn.dataset.delName }))) return;
                const delRes = await fetch(`/api/games/${encodeURIComponent(btn.dataset.delKey)}`, { method: 'DELETE' });
                if (delRes.ok) renderGameDetail(g.titleId);
            });
        });

        renderDetailComments(g.titleId, g.comments || []);
    }

    function renderDetailComments(titleId, comments) {
        const formWrap = document.getElementById('detail-comment-form-wrap');
        const threadEl = document.getElementById('detail-comments-thread');

        if (state.user) {
            formWrap.innerHTML = `
                <form class="comment-form" id="root-comment-form">
                    <textarea class="comment-textarea" id="root-comment-input" placeholder="${escapeHtml(t('detail.comment_placeholder'))}" required></textarea>
                    <div><button type="submit" class="btn-pill btn-primary">${escapeHtml(t('detail.post_comment'))}</button></div>
                </form>
            `;
            document.getElementById('root-comment-form').addEventListener('submit', async (e) => {
                e.preventDefault();
                const content = document.getElementById('root-comment-input').value.trim();
                if (!content) return;
                const res = await fetch(`/api/games/${encodeURIComponent(titleId)}/comments`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content })
                });
                if (res.ok) renderGameDetail(titleId);
            });
        } else {
            formWrap.innerHTML = `<p class="muted-text" style="margin-bottom:16px;"><a href="/${state.lang}/profile" id="comment-login-link" style="color:var(--accent-purple);">${escapeHtml(t('detail.login_to_comment'))}</a></p>`;
            document.getElementById('comment-login-link')?.addEventListener('click', (e) => {
                e.preventDefault();
                navigate(`/${state.lang}/profile`);
            });
        }

        if (!comments.length) {
            threadEl.innerHTML = `<p class="muted-text">${escapeHtml(t('detail.no_comments'))}</p>`;
            return;
        }

        const renderItem = (c) => {
            const initial = (c.username || '?')[0].toUpperCase();
            const canModify = state.user && (state.user.id === c.userId || state.user.role === 'admin');
            const repliesHtml = (c.replies || []).length
                ? `<div class="comment-replies">${c.replies.map(renderItem).join('')}</div>`
                : '';

            return `
                <div class="comment-card" data-comment-id="${c.id}">
                    <div class="comment-header">
                        <div class="comment-author-wrap">
                            <span class="avatar-circle" style="background:${escapeHtml(c.avatarColor || '#8b5cf6')}">${escapeHtml(initial)}</span>
                            <a href="/${state.lang}/user/${encodeURIComponent(c.username)}" class="comment-username" data-user-link="${escapeHtml(c.username)}">${escapeHtml(c.username)}</a>
                        </div>
                        <span class="comment-time">${escapeHtml(c.createdAt)}</span>
                    </div>
                    <div class="comment-body">${escapeHtml(c.content)}</div>
                    <div class="comment-actions">
                        ${state.user ? `<button type="button" class="text-action-btn reply-btn" data-reply-to="${c.id}"><span class="material-symbols-outlined" style="font-size:15px;">reply</span> ${escapeHtml(t('detail.reply'))}</button>` : ''}
                        ${canModify ? `<button type="button" class="text-action-btn danger del-comment-btn" data-del-comment="${c.id}"><span class="material-symbols-outlined" style="font-size:15px;">delete</span> ${escapeHtml(t('detail.delete'))}</button>` : ''}
                    </div>
                    <div class="reply-box-slot" id="reply-slot-${c.id}"></div>
                    ${repliesHtml}
                </div>
            `;
        };

        threadEl.innerHTML = comments.map(renderItem).join('');

        threadEl.querySelectorAll('[data-user-link]').forEach(el => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                navigate(`/${state.lang}/user/${encodeURIComponent(el.dataset.userLink)}`);
            });
        });

        threadEl.querySelectorAll('.reply-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const cid = btn.dataset.replyTo;
                const slot = document.getElementById(`reply-slot-${cid}`);
                slot.innerHTML = `
                    <form class="comment-form" style="margin-top:10px;margin-bottom:0;">
                        <textarea class="comment-textarea" style="min-height:60px;" placeholder="${escapeHtml(t('detail.reply_placeholder'))}" required></textarea>
                        <div style="display:flex;gap:8px;">
                            <button type="submit" class="btn-pill btn-primary" style="height:32px;font-size:0.8rem;">${escapeHtml(t('detail.post_comment'))}</button>
                            <button type="button" class="btn-pill btn-ghost cancel-reply" style="height:32px;font-size:0.8rem;">${escapeHtml(t('detail.cancel'))}</button>
                        </div>
                    </form>
                `;
                slot.querySelector('.cancel-reply').addEventListener('click', () => { slot.innerHTML = ''; });
                slot.querySelector('form').addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const text = slot.querySelector('textarea').value.trim();
                    if (!text) return;
                    const r = await fetch(`/api/games/${encodeURIComponent(titleId)}/comments`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ content: text, parentId: Number(cid) })
                    });
                    if (r.ok) renderGameDetail(titleId);
                });
            });
        });

        threadEl.querySelectorAll('.del-comment-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const r = await fetch(`/api/comments/${btn.dataset.delComment}`, { method: 'DELETE' });
                if (r.ok) renderGameDetail(titleId);
            });
        });
    }

    // --- Profile & Auth Page ---
    async function renderProfilePage() {
        if (!state.user) {
            appMain.innerHTML = `
                <div class="auth-card">
                    <div class="auth-tabs">
                        <button type="button" class="btn-pill btn-primary" id="tab-login" style="flex:1;">${escapeHtml(t('profile.login_tab'))}</button>
                        <button type="button" class="btn-pill btn-secondary" id="tab-register" style="flex:1;">${escapeHtml(t('profile.register_tab'))}</button>
                    </div>
                    <form id="auth-form">
                        <div class="form-group">
                            <label>${escapeHtml(t('profile.username'))}</label>
                            <input type="text" class="form-input" id="auth-username" required minlength="3">
                        </div>
                        <div class="form-group">
                            <label>${escapeHtml(t('profile.password'))}</label>
                            <input type="password" class="form-input" id="auth-password" required minlength="6">
                        </div>
                        <p class="muted-text" id="auth-hint" style="margin-bottom:12px;">${escapeHtml(t('profile.first_user_hint'))}</p>
                        <p id="auth-error" style="color:var(--danger);font-size:0.85rem;margin-bottom:10px;"></p>
                        <button type="submit" class="btn-pill btn-primary" id="auth-submit-btn" style="width:100%;">${escapeHtml(t('profile.login_btn'))}</button>
                    </form>
                </div>
            `;

            let mode = 'login';
            const tabLogin = document.getElementById('tab-login');
            const tabReg = document.getElementById('tab-register');
            const submitBtn = document.getElementById('auth-submit-btn');

            tabLogin.addEventListener('click', () => {
                mode = 'login';
                tabLogin.className = 'btn-pill btn-primary';
                tabReg.className = 'btn-pill btn-secondary';
                submitBtn.textContent = t('profile.login_btn');
            });
            tabReg.addEventListener('click', () => {
                mode = 'register';
                tabReg.className = 'btn-pill btn-primary';
                tabLogin.className = 'btn-pill btn-secondary';
                submitBtn.textContent = t('profile.register_btn');
            });

            document.getElementById('auth-form').addEventListener('submit', async (e) => {
                e.preventDefault();
                const errEl = document.getElementById('auth-error');
                errEl.textContent = '';
                const username = document.getElementById('auth-username').value;
                const password = document.getElementById('auth-password').value;
                const res = await fetch(`/api/auth/${mode}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                const data = await res.json();
                if (!res.ok) {
                    errEl.textContent = data.error || 'Authentication failed';
                    return;
                }
                await fetchAuthMe();
                renderProfilePage();
            });
            return;
        }

        await renderPublicUserPage(state.user.username, true);
    }

    async function renderPublicUserPage(username, isOwnProfile = false) {
        const res = await fetch(`/api/users/${encodeURIComponent(username)}`);
        if (!res.ok) {
            appMain.innerHTML = `<div class="state-box"><h3>User not found</h3></div>`;
            return;
        }
        const profile = await res.json();
        const formatRoleLabel = (role) => {
            if (role === 'admin') return t('profile.role_admin');
            if (role === 'coadmin') return t('profile.role_coadmin');
            if (role === 'moderator') return t('profile.role_moderator');
            return t('profile.role_user');
        };
        const roleLabel = formatRoleLabel(profile.role);
        const initial = (profile.username || '?')[0].toUpperCase();

        const commentsHtml = (profile.comments || []).length
            ? profile.comments.map(c => `
                <div class="drawer-comment-item" data-jump-game="${escapeHtml(c.baseTitleId)}">
                    <div class="drawer-game-ref">
                        <span class="material-symbols-outlined" style="font-size:16px;">videogame_asset</span>
                        <span>${escapeHtml(c.gameTitle)}</span>
                    </div>
                    <div class="comment-body">${escapeHtml(c.content)}</div>
                </div>
            `).join('')
            : `<p class="muted-text">${escapeHtml(t('profile.no_activity'))}</p>`;

        const isStaff = state.user && ['admin', 'coadmin'].includes(state.user.role);
        const adminTools = (isOwnProfile && state.user) ? `
            <section class="detail-section-card">
                <h2 class="detail-section-title"><span class="material-symbols-outlined">build</span> ${escapeHtml(t('profile.admin_tools'))}</h2>
                <div style="display:flex;flex-wrap:wrap;gap:12px;">
                    ${isStaff ? `<button type="button" class="btn-pill btn-primary" id="profile-open-settings"><span class="material-symbols-outlined" style="font-size:18px;">settings</span><span>${escapeHtml(t('settings.title'))}</span></button>` : ''}
                    <button type="button" class="btn-pill btn-secondary" id="profile-open-upload">${escapeHtml(t('nav.upload'))}</button>
                    <button type="button" class="btn-pill btn-secondary" id="profile-open-keys">prod.keys</button>
                    <button type="button" class="btn-pill btn-ghost" id="profile-logout-btn">${escapeHtml(t('profile.logout_btn'))}</button>
                </div>
            </section>
        ` : '';

        appMain.innerHTML = `
            <section class="detail-section-card" style="display:flex;align-items:center;gap:18px;">
                <span class="avatar-circle" style="width:58px;height:58px;font-size:1.5rem;background:${escapeHtml(profile.avatarColor)}">${escapeHtml(initial)}</span>
                <div>
                    <h1 style="font-size:1.4rem;">${escapeHtml(profile.username)}</h1>
                    <span class="cat-badge">${escapeHtml(roleLabel)}</span>
                </div>
            </section>
            ${adminTools}
            <section class="detail-section-card">
                <h2 class="detail-section-title">${escapeHtml(t('profile.recent_comments'))}</h2>
                <div style="display:flex;flex-direction:column;gap:10px;">${commentsHtml}</div>
            </section>
        `;

        appMain.querySelectorAll('[data-jump-game]').forEach(el => {
            el.addEventListener('click', () => navigate(`/${state.lang}/game/${encodeURIComponent(el.dataset.jumpGame)}`));
        });

        document.getElementById('profile-open-settings')?.addEventListener('click', () => {
            navigate(`/${state.lang}/settings`);
        });
        document.getElementById('profile-open-upload')?.addEventListener('click', () => {
            document.getElementById('upload-modal').classList.remove('hidden');
        });
        document.getElementById('profile-open-keys')?.addEventListener('click', () => {
            document.getElementById('keys-overlay').classList.remove('hidden');
        });
        document.getElementById('profile-logout-btn')?.addEventListener('click', async () => {
            await fetch('/api/auth/logout', { method: 'POST' });
            await fetchAuthMe();
            renderProfilePage();
        });
    }

    // --- Admin Settings Page ---
    async function renderSettingsPage() {
        if (!state.user || !['admin', 'coadmin'].includes(state.user.role)) {
            appMain.innerHTML = `
                <div class="state-box">
                    <span class="material-symbols-outlined">lock</span>
                    <h3>${escapeHtml(t('settings.no_access'))}</h3>
                    <a href="/${state.lang}" class="btn-pill btn-primary" id="settings-back-err">${escapeHtml(t('settings.back'))}</a>
                </div>
            `;
            document.getElementById('settings-back-err')?.addEventListener('click', (e) => {
                e.preventDefault();
                navigate(`/${state.lang}`);
            });
            return;
        }

        const isAdmin = state.user.role === 'admin';
        const [taxRes, usersRes] = await Promise.all([
            fetch('/api/taxonomy'),
            isAdmin ? fetch('/api/admin/users') : Promise.resolve(null)
        ]);
        const taxonomy = taxRes.ok ? await taxRes.json() : { categories: [], languages: [] };
        const usersData = (usersRes && usersRes.ok) ? await usersRes.json() : { users: [] };
        const users = usersData.users || [];

        const renderTaxList = (kind, items) => (items || []).map(item => `
            <div class="file-item-row" style="padding:8px 12px;">
                <span style="font-weight:500;">${escapeHtml(item)}</span>
                <div style="display:flex;gap:6px;">
                    <button type="button" class="btn-pill btn-secondary tax-rename-btn" data-kind="${kind}" data-name="${escapeHtml(item)}" style="height:28px;padding:0 10px;font-size:0.78rem;">
                        <span class="material-symbols-outlined" style="font-size:15px;">edit</span>
                    </button>
                    <button type="button" class="btn-pill btn-ghost tax-del-btn" data-kind="${kind}" data-name="${escapeHtml(item)}" style="height:28px;padding:0 8px;">
                        <span class="material-symbols-outlined" style="font-size:16px;color:var(--danger);">delete</span>
                    </button>
                </div>
            </div>
        `).join('');

        const roleOptionsHtml = (currentRole) => [
            ['admin', t('profile.role_admin')],
            ['coadmin', t('profile.role_coadmin')],
            ['moderator', t('profile.role_moderator')],
            ['user', t('profile.role_user')]
        ].map(([val, label]) => `<option value="${val}" ${currentRole === val ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('');

        const usersSectionHtml = isAdmin ? `
            <section class="detail-section-card">
                <h2 class="detail-section-title"><span class="material-symbols-outlined">manage_accounts</span> ${escapeHtml(t('settings.users_title'))}</h2>

                <form id="admin-create-user-form" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;align-items:end;margin-bottom:20px;padding:14px;border-radius:14px;background:rgba(255,255,255,0.03);border:1px solid var(--border);">
                    <div>
                        <label style="display:block;font-size:0.8rem;margin-bottom:4px;color:var(--text-muted);">${escapeHtml(t('profile.username'))}</label>
                        <input type="text" class="form-input" id="admin-new-username" required minlength="3" maxlength="24">
                    </div>
                    <div>
                        <label style="display:block;font-size:0.8rem;margin-bottom:4px;color:var(--text-muted);">${escapeHtml(t('profile.password'))}</label>
                        <input type="password" class="form-input" id="admin-new-password" required minlength="6">
                    </div>
                    <div>
                        <label style="display:block;font-size:0.8rem;margin-bottom:4px;color:var(--text-muted);">${escapeHtml(t('settings.role_label'))}</label>
                        <select class="form-input" id="admin-new-role">${roleOptionsHtml('user')}</select>
                    </div>
                    <button type="submit" class="btn-pill btn-primary" style="height:40px;">${escapeHtml(t('settings.create_user_btn'))}</button>
                </form>
                <p id="admin-user-msg" style="font-size:0.85rem;margin-bottom:12px;"></p>

                <div class="files-list">
                    ${users.map(u => {
                        const isSelf = Number(u.id) === Number(state.user.id);
                        return `
                            <div class="file-item-row" style="flex-wrap:wrap;gap:10px;">
                                <div class="file-item-left" style="gap:10px;">
                                    <span class="avatar-circle" style="width:32px;height:32px;font-size:0.85rem;background:${escapeHtml(u.avatarColor || '#8b5cf6')}">${escapeHtml((u.username || '?')[0].toUpperCase())}</span>
                                    <div>
                                        <div style="font-weight:600;">${escapeHtml(u.username)} ${isSelf ? '(You)' : ''}</div>
                                        <div class="muted-text" style="font-size:0.75rem;">${escapeHtml(formatDate(u.createdAt))}</div>
                                    </div>
                                </div>
                                <div class="file-item-right" style="gap:8px;flex-wrap:wrap;">
                                    <select class="form-input admin-role-select" data-uid="${u.id}" style="height:34px;width:auto;min-width:140px;padding:0 10px;" ${isSelf ? 'disabled' : ''}>
                                        ${roleOptionsHtml(u.role)}
                                    </select>
                                    <button type="button" class="btn-pill btn-secondary admin-pw-btn" data-uid="${u.id}" data-name="${escapeHtml(u.username)}" style="height:34px;padding:0 12px;font-size:0.8rem;">
                                        ${escapeHtml(t('settings.reset_pw_btn'))}
                                    </button>
                                    <button type="button" class="btn-pill btn-ghost admin-del-user-btn" data-uid="${u.id}" data-name="${escapeHtml(u.username)}" style="height:34px;padding:0 10px;" ${isSelf ? 'disabled' : ''}>
                                        <span class="material-symbols-outlined" style="font-size:18px;color:${isSelf ? 'var(--text-muted)' : 'var(--danger)'};">delete</span>
                                    </button>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </section>
        ` : '';

        appMain.innerHTML = `
            <a href="/${state.lang}" class="detail-back-link" id="settings-back-btn">
                <span class="material-symbols-outlined">arrow_back</span>
                <span>${escapeHtml(t('settings.back'))}</span>
            </a>

            <h1 style="font-size:1.6rem;margin-bottom:18px;display:flex;align-items:center;gap:10px;">
                <span class="material-symbols-outlined" style="color:var(--accent-purple);">settings</span>
                <span>${escapeHtml(t('settings.title'))}</span>
            </h1>

            <section class="detail-section-card">
                <h2 class="detail-section-title"><span class="material-symbols-outlined">category</span> ${escapeHtml(t('settings.taxonomy_title'))}</h2>
                <p id="admin-tax-msg" style="font-size:0.85rem;margin-bottom:10px;"></p>
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px;">
                    <div>
                        <h3 style="font-size:0.95rem;margin-bottom:10px;">${escapeHtml(t('settings.categories_label'))}</h3>
                        <form id="tax-add-cat-form" style="display:flex;gap:8px;margin-bottom:12px;">
                            <input type="text" class="form-input" id="admin-new-cat" placeholder="${escapeHtml(t('settings.new_category_placeholder'))}" required style="flex:1;height:38px;">
                            <button type="submit" class="btn-pill btn-primary" style="height:38px;padding:0 16px;">${escapeHtml(t('settings.add_btn'))}</button>
                        </form>
                        <div class="files-list" style="max-height:360px;overflow-y:auto;">${renderTaxList('category', taxonomy.categories)}</div>
                    </div>
                    <div>
                        <h3 style="font-size:0.95rem;margin-bottom:10px;">${escapeHtml(t('settings.languages_label'))}</h3>
                        <form id="tax-add-lang-form" style="display:flex;gap:8px;margin-bottom:12px;">
                            <input type="text" class="form-input" id="admin-new-lang" placeholder="${escapeHtml(t('settings.new_language_placeholder'))}" required style="flex:1;height:38px;">
                            <button type="submit" class="btn-pill btn-primary" style="height:38px;padding:0 16px;">${escapeHtml(t('settings.add_btn'))}</button>
                        </form>
                        <div class="files-list" style="max-height:360px;overflow-y:auto;">${renderTaxList('language', taxonomy.languages)}</div>
                    </div>
                </div>
            </section>

            ${usersSectionHtml}
        `;

        document.getElementById('settings-back-btn').addEventListener('click', (e) => {
            e.preventDefault();
            navigate(`/${state.lang}`);
        });

        const taxMsg = document.getElementById('admin-tax-msg');
        const handleAddTax = async (kind, inputId) => {
            const name = document.getElementById(inputId).value.trim();
            if (!name) return;
            const r = await fetch('/api/admin/taxonomy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ kind, name })
            });
            const data = await r.json();
            if (!r.ok) {
                taxMsg.style.color = 'var(--danger)';
                taxMsg.textContent = data.error || 'Error';
                return;
            }
            renderSettingsPage();
        };

        document.getElementById('tax-add-cat-form').addEventListener('submit', (e) => {
            e.preventDefault();
            handleAddTax('category', 'admin-new-cat');
        });
        document.getElementById('tax-add-lang-form').addEventListener('submit', (e) => {
            e.preventDefault();
            handleAddTax('language', 'admin-new-lang');
        });

        appMain.querySelectorAll('.tax-rename-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const oldName = btn.dataset.name;
                const newName = prompt(t('settings.rename_prompt'), oldName);
                if (!newName || newName.trim() === oldName) return;
                const r = await fetch('/api/admin/taxonomy', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ kind: btn.dataset.kind, oldName, newName: newName.trim() })
                });
                const data = await r.json();
                if (!r.ok) {
                    taxMsg.style.color = 'var(--danger)';
                    taxMsg.textContent = data.error || 'Error';
                    return;
                }
                renderSettingsPage();
            });
        });

        appMain.querySelectorAll('.tax-del-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const name = btn.dataset.name;
                if (!confirm(t('settings.delete_confirm', { name }))) return;
                const r = await fetch('/api/admin/taxonomy', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ kind: btn.dataset.kind, name })
                });
                if (r.ok) renderSettingsPage();
            });
        });

        if (isAdmin) {
            const userMsg = document.getElementById('admin-user-msg');
            document.getElementById('admin-create-user-form').addEventListener('submit', async (e) => {
                e.preventDefault();
                userMsg.textContent = '';
                const username = document.getElementById('admin-new-username').value;
                const password = document.getElementById('admin-new-password').value;
                const role = document.getElementById('admin-new-role').value;
                const r = await fetch('/api/admin/users', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password, role })
                });
                const data = await r.json();
                if (!r.ok) {
                    userMsg.style.color = 'var(--danger)';
                    userMsg.textContent = data.error || 'Error';
                    return;
                }
                renderSettingsPage();
            });

            appMain.querySelectorAll('.admin-role-select').forEach(sel => {
                sel.addEventListener('change', async () => {
                    const r = await fetch(`/api/admin/users/${sel.dataset.uid}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ role: sel.value })
                    });
                    const data = await r.json();
                    if (!r.ok) {
                        userMsg.style.color = 'var(--danger)';
                        userMsg.textContent = data.error || 'Error';
                        renderSettingsPage();
                        return;
                    }
                    userMsg.style.color = 'var(--success, #10b981)';
                    userMsg.textContent = t('settings.saved');
                });
            });

            appMain.querySelectorAll('.admin-pw-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const pw = prompt(t('settings.reset_pw_prompt'));
                    if (!pw) return;
                    const r = await fetch(`/api/admin/users/${btn.dataset.uid}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ password: pw })
                    });
                    const data = await r.json();
                    if (!r.ok) {
                        userMsg.style.color = 'var(--danger)';
                        userMsg.textContent = data.error || 'Error';
                        return;
                    }
                    userMsg.style.color = 'var(--success, #10b981)';
                    userMsg.textContent = t('settings.saved');
                });
            });

            appMain.querySelectorAll('.admin-del-user-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    if (!confirm(t('settings.delete_user_confirm', { name: btn.dataset.name }))) return;
                    const r = await fetch(`/api/admin/users/${btn.dataset.uid}`, { method: 'DELETE' });
                    const data = await r.json();
                    if (!r.ok) {
                        userMsg.style.color = 'var(--danger)';
                        userMsg.textContent = data.error || 'Error';
                        return;
                    }
                    renderSettingsPage();
                });
            });
        }
    }

    // --- Floating Comments Drawer ---
    const drawer = document.getElementById('comments-drawer');
    const drawerBackdrop = document.getElementById('drawer-backdrop');
    const drawerList = document.getElementById('drawer-comments-list');
    const drawerLoadMore = document.getElementById('drawer-load-more');

    async function loadDrawerComments(reset = false) {
        if (reset) {
            state.drawerOffset = 0;
            drawerList.innerHTML = '';
        }
        const res = await fetch(`/api/comments/latest?limit=15&offset=${state.drawerOffset}`);
        const data = await res.json();
        const items = data.comments || [];

        if (reset && items.length === 0) {
            drawerList.innerHTML = `<p class="muted-text">${escapeHtml(t('drawer.empty'))}</p>`;
            drawerLoadMore.classList.add('hidden');
            return;
        }

        items.forEach(c => {
            const el = document.createElement('div');
            el.className = 'drawer-comment-item';
            el.innerHTML = `
                <div class="drawer-game-ref">
                    <span class="material-symbols-outlined" style="font-size:16px;">videogame_asset</span>
                    <span>${escapeHtml(c.gameTitle)}</span>
                </div>
                <div class="comment-header" style="margin-bottom:4px;">
                    <strong style="font-size:0.84rem;">${escapeHtml(c.username)}</strong>
                    <span class="comment-time">${escapeHtml(c.createdAt)}</span>
                </div>
                <div class="comment-body" style="font-size:0.85rem;">${escapeHtml(c.content)}</div>
            `;
            el.addEventListener('click', () => {
                toggleDrawer(false);
                navigate(`/${state.lang}/game/${encodeURIComponent(c.baseTitleId)}`);
            });
            drawerList.appendChild(el);
        });

        state.drawerOffset += items.length;
        drawerLoadMore.classList.toggle('hidden', items.length < 15);
    }

    function toggleDrawer(open) {
        state.drawerOpen = open;
        drawer.classList.toggle('open', open);
        drawerBackdrop.classList.toggle('hidden', !open);
        if (open) loadDrawerComments(true);
    }

    document.getElementById('comments-drawer-toggle').addEventListener('click', () => toggleDrawer(true));
    document.getElementById('comments-drawer-close').addEventListener('click', () => toggleDrawer(false));
    drawerBackdrop.addEventListener('click', () => toggleDrawer(false));
    drawerLoadMore.addEventListener('click', () => loadDrawerComments(false));

    // --- Header Events ---
    document.querySelectorAll('.lang-pill-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const newLang = btn.dataset.lang;
            if (newLang === state.lang) return;
            state.lang = newLang;
            localStorage.setItem('nsw_lang', newLang);
            const parts = window.location.pathname.split('/').filter(Boolean);
            parts[0] = newLang;
            navigate('/' + parts.join('/') + window.location.search);
        });
    });

    searchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        navigate(buildCatalogUrl({ s: searchInput.value.trim(), p: 1 }));
    });

    document.getElementById('nav-home').addEventListener('click', (e) => {
        e.preventDefault();
        navigate(`/${state.lang}`);
    });
    document.getElementById('nav-settings')?.addEventListener('click', (e) => {
        e.preventDefault();
        navigate(`/${state.lang}/settings`);
    });
    document.getElementById('nav-profile').addEventListener('click', (e) => {
        e.preventDefault();
        navigate(`/${state.lang}/profile`);
    });
    document.getElementById('footer-profile').addEventListener('click', (e) => {
        e.preventDefault();
        navigate(`/${state.lang}/profile`);
    });

    // --- Lightbox ---
    document.getElementById('lightbox-close').addEventListener('click', () => {
        document.getElementById('lightbox-modal').classList.add('hidden');
    });
    document.getElementById('lightbox-modal').addEventListener('click', (e) => {
        if (e.target.id === 'lightbox-modal') {
            document.getElementById('lightbox-modal').classList.add('hidden');
        }
    });

    // --- Upload & Scan Modal ---
    const uploadModal = document.getElementById('upload-modal');
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');

    document.getElementById('nav-upload-btn').addEventListener('click', () => uploadModal.classList.remove('hidden'));
    document.getElementById('upload-modal-close').addEventListener('click', () => uploadModal.classList.add('hidden'));
    document.getElementById('upload-modal-backdrop').addEventListener('click', () => uploadModal.classList.add('hidden'));

    document.getElementById('modal-scan-btn').addEventListener('click', async () => {
        const statusEl = document.getElementById('modal-scan-status');
        statusEl.textContent = t('upload.scanning');
        const res = await fetch('/api/scan', { method: 'POST' });
        if (res.ok) {
            statusEl.textContent = t('upload.scan_done');
            route();
        } else {
            statusEl.textContent = 'Scan failed';
        }
    });

    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) queueUploads(e.dataTransfer.files);
    });
    fileInput.addEventListener('change', () => {
        if (fileInput.files.length) queueUploads(fileInput.files);
    });

    function queueUploads(files) {
        for (const f of files) state.uploadQueue.push(f);
        processUploadQueue();
    }

    function processUploadQueue() {
        if (state.isUploading || state.uploadQueue.length === 0) return;
        const file = state.uploadQueue.shift();
        state.isUploading = true;

        const box = document.getElementById('upload-progress-container');
        const fname = document.getElementById('upload-filename');
        const pct = document.getElementById('upload-percent');
        const fill = document.getElementById('progress-bar-fill');
        const st = document.getElementById('upload-status');

        box.classList.remove('hidden');
        fname.textContent = file.name;
        pct.textContent = '0%';
        fill.style.width = '0%';
        st.textContent = t('upload.preparing');

        const xhr = new XMLHttpRequest();
        xhr.timeout = 0;
        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const p = Math.round((e.loaded / e.total) * 100);
                pct.textContent = p + '%';
                fill.style.width = p + '%';
                st.textContent = t('upload.progress', {
                    uploaded: (e.loaded / (1024 * 1024)).toFixed(1),
                    total: (e.total / (1024 * 1024)).toFixed(1)
                });
            }
        });
        xhr.addEventListener('load', () => {
            st.textContent = xhr.status === 200 ? t('upload.success') : 'Upload failed';
            state.isUploading = false;
            route();
            processUploadQueue();
        });
        xhr.addEventListener('error', () => {
            st.textContent = 'Network error';
            state.isUploading = false;
            processUploadQueue();
        });
        xhr.open('POST', `/api/upload?name=${encodeURIComponent(file.name)}`);
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
        xhr.send(file);
    }

    // --- Keys Upload ---
    const keysDrop = document.getElementById('keys-drop-zone');
    const keysInput = document.getElementById('keys-file-input');
    const keysStatus = document.getElementById('keys-upload-status');

    keysDrop.addEventListener('click', () => keysInput.click());
    keysDrop.addEventListener('dragover', (e) => { e.preventDefault(); keysDrop.classList.add('dragover'); });
    keysDrop.addEventListener('dragleave', () => keysDrop.classList.remove('dragover'));
    keysDrop.addEventListener('drop', (e) => {
        e.preventDefault();
        keysDrop.classList.remove('dragover');
        if (e.dataTransfer.files.length) uploadKeysFile(e.dataTransfer.files[0]);
    });
    keysInput.addEventListener('change', () => {
        if (keysInput.files.length) uploadKeysFile(keysInput.files[0]);
    });

    async function uploadKeysFile(file) {
        if (file.name !== 'prod.keys' && file.name !== 'keys.txt') {
            keysStatus.textContent = t('keys.wrong_file');
            return;
        }
        keysStatus.textContent = t('keys.uploading');
        const text = await file.text();
        const res = await fetch('/api/upload-keys', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keysContent: text })
        });
        if (res.ok) {
            keysStatus.textContent = t('keys.success');
            document.getElementById('keys-overlay').classList.add('hidden');
            route();
        } else {
            keysStatus.textContent = 'Upload failed';
        }
    }

    window.addEventListener('popstate', route);

    document.addEventListener('DOMContentLoaded', async () => {
        await fetchAuthMe();
        await route();
    });
})();
