# NSW Game Catalog & Server
[![Language: English](https://img.shields.io/badge/Language-English-blue.svg)](README.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Docker Image](https://img.shields.io/badge/Docker-ghcr.io-blue?logo=docker)](https://github.com/Daddelgreis74/switch-game-catalog/pkgs/container/switch-game-catalog)

A lightweight, fast, self-hosted web server to organize, manage, and browse your Nintendo Switch game files.

The system indexes your game files (`.nsp`, `.nsz`, `.zip`, `.xci`), extracts metadata and box art on-the-fly using `hactool` (with your own `prod.keys`), and provides a reactive, modern web dashboard for searching, filtering, downloading, uploading, and managing your library.

---

## ✨ Features

- 🎮 **Automatic File Detection:** Detects base games, updates, and DLCs recursively within your configured games directory.
- 📦 **Direct ZIP Inspection:** Scans and reads metadata directly from nested ZIP archives without unpacking large 15 GB+ files.
- 🔑 **On-the-Fly Metadata Decryption:** Reads encrypted `control.nca` metadata to extract official game titles, publishers, supported languages, and original box art icons.
- ⚡ **High-Performance Caching:** Subsequent scans complete in under 1 second thanks to file signature and modification time caching.
- 📂 **Modern Web Dashboard:** Sleek Joy-Con neon-themed interface with dark mode, interactive modal detail views, and multilingual support (English & German).
- 📤 **Drag & Drop Uploads:** Upload game files up to 40 GB directly through your browser with a live progress indicator.
- 📥 **Direct Downloads:** Download original game backups directly over your local network.
- 🗑️ **Library Management:** Permanently delete game files and clean up cache directly from the web UI.
- 🐳 **Docker & TrueNAS-Ready:** Includes a multi-stage Dockerfile that builds `hactool` natively from source on Linux systems (TrueNAS SCALE, Debian, Ubuntu).

---

## 🔑 Prerequisites

> [!IMPORTANT]
> **Console Keys (`prod.keys`) Required:**
> To decrypt game metadata and extract cover images, you must provide your own console keys dumped from your Nintendo Switch console.
> The key file must be named **`prod.keys`** and mounted/configured in the system (e.g. at `D:\prod.keys` or mounted to `/config/prod.keys`).
> **No keys, firmware, or copyright-protected files are included with this software.**

---

## 💻 Local Installation (Windows)

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
   Create a `.env` file in the root directory:
   ```env
   PORT=3000
   GAMES_DIR=D:\NintendoGames
   KEYS_PATH=D:\prod.keys
   ```

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
- **Keys directory:** e.g. `/mnt/tank/apps/switch-catalog/keys/` *(place your `prod.keys` here)*
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

#### 5️⃣ Port Forwarding:
| Port Type | Port Number | Protocol |
| :--- | :--- | :--- |
| **Container Port** | `3000` | `TCP` |
| **Node Port / Web Port** | `3000` | `TCP` |

#### 6️⃣ Storage (Host Path Volumes):
| Host Path (TrueNAS Path - adjust) | Mount Path (Container Path) | Read Only |
| :--- | :--- | :---: |
| `/mnt/tank/Spiele/Switch` | `/games` | ❌ *No* |
| `/mnt/tank/apps/switch-catalog/keys` | `/config` | ✅ *Yes* |
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
    volumes:
      # Path to your Switch game files
      - /mnt/tank/Spiele/Switch:/games
      # Path to your prod.keys (read-only)
      - /mnt/tank/apps/switch-catalog/keys:/config:ro
      # Cache persistence for extracted covers/icons
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
