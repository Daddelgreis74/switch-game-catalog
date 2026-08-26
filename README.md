# Nintendo Switch Game Catalog & Server

Ein leichtgewichtiger und schneller selbstgehosteter Web-Server zur Organisation, Verwaltung und Bereitstellung deiner Nintendo Switch Spieldateien. 

Das System katalogisiert vorhandene Spiele (`.nsp`, `.nsz`, `.zip`, `.xci`), liest deren Metadaten und Titelbilder über das offizielle `hactool` aus (unter Verwendung deiner Switch-Konsolenschlüssel `prod.keys`) und bietet ein reaktives Web-Dashboard zum Suchen, Filtern, Herunterladen, Hochladen und Löschen von Spielen.

---

## Features

- 🎮 **Automatische Dateierkennung:** Erkennt Hauptspiele, Updates und DLCs direkt im konfigurierten Spieleverzeichnis (rekursiv).
- 📦 **ZIP-Unterstützung:** Scant und liest direkt aus verschachtelten ZIP-Dateien heraus, ohne das gesamte 15 GB+ Spielearchiv entpacken zu müssen.
- 🔑 **On-the-Fly Entschlüsselung:** Liest die verschlüsselten `control.nca` Metadaten aus und extrahiert offizielle Spielenamen, Publisher, unterstützte Sprachen und das Original-Titelbild.
- ⚡ **Hochperformantes Caching:** Durch Datei- und Modifikationszeitprüfungen laufen nachfolgende Scans in unter 1 Sekunde.
- 📂 **Web-Dashboard:** Modernes Interface im Switch-Neon-Stil (Dark Mode) mit flüssigen CSS-Effekten und modalen Detailansichten.
- 📤 **Drag & Drop Upload:** Lade Spieldateien bis zu 40 GB direkt im Browser hoch (mit Live-Fortschrittsbalken). Die Dateien werden automatisch einsortiert und gescannt.
- 📥 **Direkter Download:** Ermöglicht das Herunterladen der Originaldateien über das Netzwerk.
- 🗑️ **Löschfunktion:** Ermöglicht das dauerhafte Löschen von Spieldateien und deren Cache direkt über die Web-Oberfläche.
- 🐳 **Docker & TrueNAS-Ready:** Beinhaltet ein Multi-Stage Dockerfile, das `hactool` auf Linux-Systemen wie TrueNAS SCALE nativ aus dem Quellcode kompiliert.

---

## 🔑 Voraussetzungen

> [!IMPORTANT]
> **Konsolenschlüssel (`prod.keys`) erforderlich:**
> Um die Spieldateien entschlüsseln und Cover extrahieren zu können, benötigst du die Konsolenschlüssel deiner Switch.
> Die Datei muss den Namen **`prod.keys`** tragen und im System konfiguriert werden (z. B. unter `D:\prod.keys` bzw. gemountet nach `/config/prod.keys`).

---

## 💻 Lokale Installation (Windows)

1. **Repository klonen:**
   ```bash
   git clone https://github.com/Daddelgreis74/switch-game-catalog.git
   cd switch-game-catalog
   ```

2. **Abhängigkeiten installieren:**
   ```bash
   npm install
   ```

3. **Konfiguration anpassen (`.env`):**
   Erstelle eine `.env` Datei im Hauptverzeichnis:
   ```env
   PORT=3000
   GAMES_DIR=D:\NintendoGames
   KEYS_PATH=D:\prod.keys
   ```

4. **Hactool bereitstellen:**
   Platziere die Windows-Version von `hactool.exe` im Ordner `bin/hactool.exe`.

5. **Server starten:**
   ```bash
   npm start
   ```

> [!NOTE]
> Öffne danach **`http://localhost:3000`** in deinem Browser.

---

## 🐳 TrueNAS SCALE & Docker Deployment

> [!TIP]
> **Berechtigungen auf TrueNAS:**  
> Stelle sicher, dass die App Lese- und Schreibrechte auf den Cache- und Spiele-Ordner besitzt (insbesondere falls Uploads oder das Löschen über die Web-Oberfläche genutzt werden sollen).

### Option 1: TrueNAS SCALE Custom App (Web-Oberfläche)

Installiere den Switch Game Catalog direkt über das TrueNAS SCALE Web-Interface:

#### 1️⃣ Vorbereitung (Datasets anlegen):
- **Keys-Ordner:** z. B. `/mnt/tank/apps/switch-catalog/keys/` *(hier deine `prod.keys` ablegen)*
- **Cache-Ordner:** z. B. `/mnt/tank/apps/switch-catalog/cache/`
- **Spiele-Ordner:** z. B. `/mnt/tank/Spiele/Switch/`

#### 2️⃣ App anlegen:
- Navigiere in TrueNAS SCALE zu **Apps** ➜ **Discover Apps** ➜ **Custom App** (oben rechts).
- **Application Name:** `switch-game-catalog`

#### 3️⃣ Container Image:
| Einstellung | Wert (Copy-Paste) |
| :--- | :--- |
| **Image repository** | `ghcr.io/daddelgreis74/switch-game-catalog` |
| **Image tag** | `latest` |
| **Image Pull Policy** | `Always` |

#### 4️⃣ Environment Variables (Umgebungsvariablen):
| Name | Wert (Copy-Paste) | Beschreibung |
| :--- | :--- | :--- |
| `PORT` | `3000` | Interner Web-Port |
| `GAMES_DIR` | `/games` | Pfad zu den Spielen im Container |
| `KEYS_PATH` | `/config/prod.keys` | Pfad zur Schlüsseldatei im Container |

#### 5️⃣ Port Forwarding:
| Port-Typ | Port-Nummer | Protokoll |
| :--- | :--- | :--- |
| **Container Port** | `3000` | `TCP` |
| **Node Port / Web Port** | `3000` | `TCP` |

#### 6️⃣ Storage (Host Path Volumes):
| Host Path (TrueNAS Pfad - anpassen) | Mount Path (Container Pfad) | Read Only |
| :--- | :--- | :---: |
| `/mnt/tank/Spiele/Switch` | `/games` | ❌ *Nein* |
| `/mnt/tank/apps/switch-catalog/keys` | `/config` | ✅ *Ja* |
| `/mnt/tank/apps/switch-catalog/cache` | `/app/public/cache` | ❌ *Nein* |

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
      # Pfad zu deinen Switch-Spielen
      - /mnt/tank/Spiele/Switch:/games
      # Pfad zu deinen prod.keys (schreibgeschützt)
      - /mnt/tank/apps/switch-catalog/keys:/config:ro
      # Persistierung der extrahierten Icons / Cover-Cache
      - /mnt/tank/apps/switch-catalog/cache:/app/public/cache
```

#### Starten via Compose:
```bash
docker-compose up -d
```

> [!NOTE]
> Nach dem Start ist das Dashboard unter `http://<DEINE-SERVER-IP>:3000` erreichbar.

---

## Lizenz

Dieses Projekt ist unter der MIT-Lizenz lizenziert. Dieses Tool dient ausschließlich der Verwaltung deiner rechtmäßig erworbenen und selbst gedumpten Sicherheitskopien. Es enthält keinerlei urheberrechtlich geschützte Nintendo-Dateien oder proprietäre Keys.
