# NSW Game Catalog & Server
[![Language: English](https://img.shields.io/badge/Language-English-blue.svg)](README.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Docker Image](https://img.shields.io/badge/Docker-ghcr.io-blue?logo=docker)](https://github.com/Daddelgreis74/switch-game-catalog/pkgs/container/switch-game-catalog)

A lightweight, fast, self-hosted web server to organize, manage, and browse your Nintendo Switch game files.

The system indexes your game files (`.nsp`, `.nsz`, `.zip`, `.xci`), extracts metadata and box art on-the-fly using `hactool` (with your own `prod.keys`), and provides a reactive, modern web dashboard for searching, filtering, downloading, uploading, and managing your library.

---

## ✨ Features

- 🎮 **Automatic File Detection & Grouping:** Recursively detects Base Games, Updates, and DLCs (`nsp`, `nsz`, `xci`, `zip`) and groups them under a single Base Title entry.
- 📦 **Direct ZIP Inspection:** Scans and reads metadata directly from nested ZIP archives without unpacking large 15 GB+ files.
- 🔑 **On-the-Fly Metadata Decryption & Cover Caching:** Reads `control.nca` via `hactool` (`prod.keys`) and automatically enriches missing box art, descriptions, categories, languages, and screenshots via TitleDB (`api.nlib.cc`), including `.nsz` files.
- 🗄️ **SQLite Persistence:** Stores games, files, users, sessions, ratings, comments, and managed categories/languages in `catalog.db` (`better-sqlite3`).
- 🔍 **Modern Catalog UI (`/en`, `/de`):** Paginated 45-card grid, live search, multi-select category & language filter modals, sorting, and game detail pages with screenshot carousel.
- 💬 **Community Features:** User accounts, 5-star game ratings, nested replies, and a floating latest-comments drawer.
- ⚙️ **Admin Settings (`/:lang/settings`):** Create, rename, and delete categories/languages, and manage users & ranks (**Admin**, **Co-Admin**, **Moderator**, **Member**). The first registered account automatically becomes **Admin**.
- 📤 **Streaming Uploads & Downloads:** Upload large game files (40 GB+) directly through your browser with live progress, or download backups directly over your local network.
- 🐳 **Docker & TrueNAS-Ready:** Multi-stage Dockerfile building `hactool` natively from source on Linux (TrueNAS SCALE, Debian, Ubuntu).

---

## 🔑 Prerequisites

> [!IMPORTANT]
> **Console Keys (`prod.keys`) Required:**
> To decrypt game metadata and extract cover images, you must provide your own console keys dumped from your Nintendo Switch console.
> The key file must be named **`prod.keys`** and mounted/configured in the system (e.g. at `D:\prod.keys` or mounted to `/config/prod.keys`).
> **No keys, firmware, or copyright-protected files are included with this software.**

---

## 💻 Local Installation (Windows)

### Option A: Windows Installer (`Setup.exe`)
Download **`SwitchGameCatalog-Setup-<version>.exe`** from the [GitHub Releases](https://github.com/Daddelgreis74/switch-game-catalog/releases) page.
- Includes portable Node.js & Python runtimes (no manual Node/Python install required).
- Lets you choose your **Games folder (`GAMES_DIR`)**, **`prod.keys`**, and **Web Port (`PORT`)** during setup and writes `.env` automatically.

### Option B: Manual Installation

1. **Clone repository:**
   ```bash
   git clone https://github.com/Daddelgreis74/switch-game-catalog.git
   cd switch-game-catalog
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment (`.env`):**
   Create a `.env` file in the root directory (adjust the drive letter and paths to match your system, e.g. `C:\...`, `D:\...`, or `./games`):
   ```env
   PORT=3000
   GAMES_DIR=C:\SwitchGames
   KEYS_PATH=C:\SwitchGames\prod.keys
   ```
   *(If omitted, `GAMES_DIR` defaults to `./games` and `KEYS_PATH` to `./config/prod.keys` inside the project folder.)*

4. **Provide Hactool:**
   Place the Windows binary of `hactool.exe` into the `bin/hactool.exe` directory.

5. **Start server:**
   ```bash
   npm start
   ```

> [!NOTE]
> Open **`http://localhost:3000`** in your browser.

---

## 🐳 TrueNAS SCALE & Docker Deployment

> [!TIP]
> **TrueNAS Permissions:**  
> Ensure the application container has read & write permissions on your games and cache datasets (especially if uploading or deleting files via the web interface).

### Option 1: TrueNAS SCALE Custom App (Web GUI)

Install NSW Game Catalog directly through the TrueNAS SCALE web interface:

#### 1️⃣ Preparation (Create Datasets / Directories):
- **Config directory:** e.g. `/mnt/tank/apps/switch-catalog/config/` *(stores `catalog.db`, `games_db.json`, and `prod.keys`)*
- **Cache directory:** e.g. `/mnt/tank/apps/switch-catalog/cache/`
- **Games directory:** e.g. `/mnt/tank/Spiele/Switch/`

#### 2️⃣ Create App:
- Navigate to **Apps** ➜ **Discover Apps** ➜ **Custom App** (top right).
- **Application Name:** `switch-game-catalog`

#### 3️⃣ Container Image:
| Setting | Value (Copy-Paste) |
| :--- | :--- |
| **Image repository** | `ghcr.io/daddelgreis74/switch-game-catalog` |
| **Image tag** | `latest` |
| **Image Pull Policy** | `Always` |

#### 4️⃣ Environment Variables:
| Name | Value (Copy-Paste) | Description |
| :--- | :--- | :--- |
| `PORT` | `3000` | Internal web port |
| `GAMES_DIR` | `/games` | Path to games inside container |
| `KEYS_PATH` | `/config/prod.keys` | Path to keys file inside container |
| `DB_PATH` | `/config/games_db.json` | Path to scanner JSON database |
| `SQLITE_PATH` | `/config/catalog.db` | Path to SQLite catalog & community database |

#### 5️⃣ Port Forwarding & Web Portal:
| Port Type | Port Number | Protocol |
| :--- | :--- | :--- |
| **Container Port** | `3000` | `TCP` |
| **Node Port / Web Port** | `3000` | `TCP` |

- **Portal Configuration (optional for Web UI button):** Name `Web UI`, Protocol `HTTP`, Use Node IP `true`, Port `3000`, Path `/`

#### 6️⃣ Storage (Host Path Volumes):
| Host Path (TrueNAS Path - adjust) | Mount Path (Container Path) | Read Only |
| :--- | :--- | :---: |
| `/mnt/tank/Spiele/Switch` | `/games` | ❌ *No* |
| `/mnt/tank/apps/switch-catalog/config` | `/config` | ❌ *No* |
| `/mnt/tank/apps/switch-catalog/cache` | `/app/public/cache` | ❌ *No* |

#### 7️⃣ Security & Access Permissions (Run As User / Group):
| Setting | Value (Copy-Paste) | Description |
| :--- | :--- | :--- |
| **User ID (UID)** | `0` *(or `568`)* | Use `0` (root) for automatic full access, or `568` if dataset permissions are set to `apps` |
| **Group ID (GID)** | `0` *(or `568`)* | Use `0` (root) or `568` (`apps`) |

---

### Option 2: Docker Compose (TrueNAS SCALE 24.10+ / Linux)

```yaml
version: '3.8'

services:
  switch-game-catalog:
    image: ghcr.io/daddelgreis74/switch-game-catalog:latest
    container_name: switch-game-catalog
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - PORT=3000
      - GAMES_DIR=/games
      - KEYS_PATH=/config/prod.keys
      - DB_PATH=/config/games_db.json
      - SQLITE_PATH=/config/catalog.db
    volumes:
      # Path to your Switch game files
      - /mnt/tank/Spiele/Switch:/games
      # Persistent config, SQLite DB, and prod.keys (read-write)
      - /mnt/tank/apps/switch-catalog/config:/config
      # Cache persistence for extracted/downloaded covers
      - /mnt/tank/apps/switch-catalog/cache:/app/public/cache
```

#### Start with Docker Compose:
```bash
docker-compose up -d
```

> [!NOTE]
> Once started, access the web dashboard at `http://<YOUR-SERVER-IP>:3000`.

---

## ⚖️ Legal & Trademark Disclaimer

> [!NOTE]
> - **Trademarks:** Nintendo and Nintendo Switch are registered trademarks of Nintendo Co., Ltd. NSW Game Catalog is an independent, community-driven open-source project and is **not affiliated with, endorsed by, sponsored by, or associated with Nintendo Co., Ltd.**
> - **No Copyrighted Material:** This software does not distribute or host any copyrighted ROMs, game dumps, encryption keys (`prod.keys`), or proprietary Nintendo firmware. Users are solely responsible for legally dumping their own games and keys from consoles they physically own.

---

## 📄 License

Distributed under the **MIT License**. See [LICENSE](LICENSE) for more information.
