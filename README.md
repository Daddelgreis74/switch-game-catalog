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

## Voraussetzungen

Um die Spieldateien entschlüsseln zu können, benötigst du die Konsolenschlüssel deiner Switch. 
Die Datei muss den Namen **`prod.keys`** tragen und im System konfiguriert werden (z. B. auf `D:\prod.keys`).

---

## Lokale Installation (Windows)

1. **Repository klonen**
2. **Abhängigkeiten installieren:**
   ```bash
   npm install
   ```
3. **Konfiguration anpassen (.env):**
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
   Öffne danach **`http://localhost:3000`** in deinem Browser.

---

## TrueNAS SCALE & Docker Deployment

Die App ist für Docker optimiert. Das Dockerfile baut `hactool` nativ für Linux und installiert Python 3 für den Scanner-Prozess.

### Option 1: TrueNAS SCALE Custom App (Web-Oberfläche)

Du kannst den Switch Game Catalog direkt über die TrueNAS SCALE Oberfläche als **Custom App** installieren:

1. **Vorbereitung:**
   - Erstelle ein Verzeichnis für deine `prod.keys`, z. B. `/mnt/tank/apps/switch-catalog/keys/` und lege die Datei dort ab.
   - Erstelle ein Verzeichnis für den Cover-Cache, z. B. `/mnt/tank/apps/switch-catalog/cache/`.
   - Halte den Pfad zu deinen Switch-Spielen bereit, z. B. `/mnt/tank/Spiele/Switch/`.

2. **App anlegen:**
   - Navigiere in TrueNAS SCALE zu **Apps** ➜ **Discover Apps** ➜ **Custom App** (oben rechts).
   - **Application Name:** `switch-game-catalog`

3. **Container Image:**
   - **Image repository:** `ghcr.io/daddelgreis74/switch-game-catalog`
   - **Image tag:** `latest`
   - **Image Pull Policy:** `Always`

4. **Environment Variables:**
   - `PORT`: `3000`
   - `GAMES_DIR`: `/games`
   - `KEYS_PATH`: `/config/prod.keys`

5. **Port Forwarding:**
   - **Container Port:** `3000`
   - **Node Port / Web Port:** `3000` *(oder ein beliebiger freier Port)*

6. **Storage (Host Path Volumes):**
   - **Spiele:** Host Path `/mnt/tank/Spiele/Switch` ➜ Mount Path `/games`
   - **Keys:** Host Path `/mnt/tank/apps/switch-catalog/keys` ➜ Mount Path `/config` *(Read-Only aktivieren)*
   - **Cache:** Host Path `/mnt/tank/apps/switch-catalog/cache` ➜ Mount Path `/app/public/cache`

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
      # Persistierung der extrahierten Icons / Cache
      - /mnt/tank/apps/switch-catalog/cache:/app/public/cache
```

#### Starten via Compose:
```bash
docker-compose up -d
```

---

## Lizenz

Dieses Projekt ist unter der MIT-Lizenz lizenziert. Dieses Tool dient ausschließlich der Verwaltung deiner rechtmäßig erworbenen und selbst gedumpten Sicherheitskopien. Es enthält keinerlei urheberrechtlich geschützte Nintendo-Dateien oder proprietäre Keys.
