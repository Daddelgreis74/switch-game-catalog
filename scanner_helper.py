import os
import sys
import json
import struct
import zipfile
import subprocess
import shutil
import tempfile
import xml.etree.ElementTree as ET
import re

sys.stdout.reconfigure(encoding='utf-8')

# Language lookup list for NACP parsing
LANGUAGES = [
    "Japanese", "AmericanEnglish", "French", "German",
    "Italian", "Spanish", "ChineseSimplified", "Korean",
    "Dutch", "Portuguese", "Russian", "TraditionalChinese",
    "BritishEnglish", "CanadianFrench", "LatinAmericanSpanish",
    "SimplifiedChinese"
]

def parse_nacp(nacp_path):
    if not os.path.exists(nacp_path):
        return {}
    
    metadata = {}
    try:
        with open(nacp_path, 'rb') as f:
            data = f.read(0x3000)
            
            for i in range(16):
                if i >= len(LANGUAGES):
                    break
                entry = data[i*0x300 : (i+1)*0x300]
                if len(entry) < 0x300:
                    break
                    
                name_bytes = entry[:0x200].split(b'\x00')[0]
                publisher_bytes = entry[0x200:0x300].split(b'\x00')[0]
                
                name = name_bytes.decode('utf-8', errors='ignore').strip()
                publisher = publisher_bytes.decode('utf-8', errors='ignore').strip()
                
                if name or publisher:
                    metadata[LANGUAGES[i]] = {
                        "name": name,
                        "publisher": publisher
                    }
    except Exception as e:
        print(f"Error parsing nacp: {e}", file=sys.stderr)
    return metadata

def parse_pfs0_header(stream):
    try:
        header_data = stream.read(16)
        if len(header_data) < 16:
            return None
            
        magic, num_files, string_table_size, reserved = struct.unpack('<4sIII', header_data)
        magic_str = magic.decode('ascii', errors='ignore')
        if magic_str != "PFS0":
            return None
            
        entry_size = 24
        table_data = stream.read(num_files * entry_size)
        if len(table_data) < num_files * entry_size:
            return None
            
        entries = []
        for i in range(num_files):
            offset, size, name_offset, res = struct.unpack('<QQII', table_data[i*entry_size:(i+1)*entry_size])
            entries.append({
                'offset': offset,
                'size': size,
                'name_offset': name_offset
            })
            
        string_table = stream.read(string_table_size)
        if len(string_table) < string_table_size:
            return None
            
        data_start_offset = 16 + num_files * entry_size + string_table_size
        resolved_entries = {}
        
        for entry in entries:
            name_bytes = bytearray()
            idx = entry['name_offset']
            while idx < len(string_table) and string_table[idx] != 0:
                name_bytes.append(string_table[idx])
                idx += 1
            name = name_bytes.decode('utf-8', errors='ignore')
            
            resolved_entries[name] = {
                'offset': data_start_offset + entry['offset'],
                'size': entry['size']
            }
            
        return resolved_entries
    except Exception as e:
        print(f"Error parsing PFS0 header: {e}", file=sys.stderr)
        return None

def clean_title_from_filename(filename):
    base = os.path.splitext(os.path.basename(filename))[0]
    cleaned = re.sub(r'\[.*?\]|\(.*?\)', '', base).replace('_', ' ').strip()
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    return cleaned if cleaned else base

def extract_and_parse_control(stream, pfs0_files, hactool_path, keys_path, cache_dir, temp_dir, file_path=None):
    true_title_id = None
    # Check for XML / CNMT first
    for name, entry in pfs0_files.items():
        if name.endswith(".cnmt.xml"):
            try:
                stream.seek(entry["offset"])
                xml_data = stream.read(entry["size"])
                root = ET.fromstring(xml_data)
                for elem in root.iter():
                    if elem.tag.endswith("Id") and elem.text and len(elem.text.strip()) == 16:
                        true_title_id = elem.text.strip().lower()
                        break
            except Exception:
                pass
                
    if not true_title_id:
        for name in pfs0_files.keys():
            if name.endswith(".tik") or name.endswith(".cert"):
                potential_id = name.split(".")[0][:16]
                if len(potential_id) == 16:
                    true_title_id = potential_id.lower()
                    break

    for name, entry in pfs0_files.items():
        if name.endswith(".nca"):
            if "control" in name.lower() or entry["size"] < 10 * 1024 * 1024:
                control_entry = (name, entry)
                break
                
    if not control_entry:
        for name, entry in pfs0_files.items():
            if name.endswith(".nca"):
                control_entry = (name, entry)
                break
                
    if not control_entry:
        return None
        
    control_name, entry = control_entry
    temp_nca_path = os.path.join(temp_dir, f"temp_control_{os.getpid()}_{control_name}")
    try:
        stream.seek(entry["offset"])
        with open(temp_nca_path, "wb") as f:
            bytes_left = entry["size"]
            while bytes_left > 0:
                chunk = stream.read(min(bytes_left, 1024 * 1024))
                if not chunk:
                    break
                f.write(chunk)
                bytes_left -= len(chunk)
    except Exception as e:
        print(f"Error extracting control NCA: {e}", file=sys.stderr)
        return None
            
    romfs_temp_dir = os.path.join(temp_dir, f"romfs_{os.getpid()}")
    if os.path.exists(romfs_temp_dir):
        try: shutil.rmtree(romfs_temp_dir)
        except Exception: pass
    os.makedirs(romfs_temp_dir, exist_ok=True)
    
    cmd = [
        hactool_path,
        "-k", keys_path,
        f"--romfsdir={romfs_temp_dir}",
        temp_nca_path
    ]
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, errors='ignore', timeout=60)
        if result.returncode != 0:
            print(f"hactool stderr: {result.stderr}", file=sys.stderr)
    except subprocess.TimeoutExpired:
        print(f"hactool timed out on {temp_nca_path}", file=sys.stderr)
        result = None
    except Exception as e:
        print(f"Error running hactool: {e}", file=sys.stderr)
        result = None

    metadata = {}
    nacp_path = os.path.join(romfs_temp_dir, "control.nacp")
    if os.path.exists(nacp_path):
        metadata = parse_nacp(nacp_path)
    
    title_id = true_title_id
    game_title = "Unknown Game"
    publisher = "Unknown Publisher"
    
    preferred_langs = ["German", "AmericanEnglish", "BritishEnglish"]
    chosen_lang = None
    
    for lang in preferred_langs:
        if lang in metadata:
            game_title = metadata[lang]["name"]
            publisher = metadata[lang]["publisher"]
            chosen_lang = lang
            break
    
    if not chosen_lang and metadata:
        first_lang = list(metadata.keys())[0]
        game_title = metadata[first_lang]["name"]
        publisher = metadata[first_lang]["publisher"]
        
    if not title_id and result and result.stdout:
        for line in result.stdout.splitlines():
            if "Title ID:" in line:
                title_id = line.split("Title ID:")[1].strip().lower()
                break
            
    if not title_id:
        title_id = "unknown"
        
    # Fallback to filename if title is unknown
    if (not game_title or game_title == "Unknown Game") and file_path:
        game_title = clean_title_from_filename(file_path)
        if publisher == "Unknown Publisher":
            publisher = ""
        
    icon_src_path = None
    if os.path.exists(os.path.join(romfs_temp_dir, "icon_German.dat")):
        icon_src_path = os.path.join(romfs_temp_dir, "icon_German.dat")
    elif os.path.exists(romfs_temp_dir):
        for file in os.listdir(romfs_temp_dir):
            if file.startswith("icon_") and file.endswith(".dat"):
                icon_src_path = os.path.join(romfs_temp_dir, file)
                break
                
    if icon_src_path and title_id != "unknown" and os.path.exists(cache_dir):
        icon_dest_path = os.path.join(cache_dir, f"{title_id}.jpg")
        try:
            shutil.copy(icon_src_path, icon_dest_path)
        except Exception as e:
            print(f"Warning: could not copy icon: {e}", file=sys.stderr)
        
    try:
        return {
            "titleId": title_id,
            "title": game_title,
            "publisher": publisher,
            "languages": list(metadata.keys()) if metadata else [],
            "icon": f"/cache/{title_id}.jpg" if icon_src_path else None
        }
    finally:
        if os.path.exists(temp_nca_path):
            try: os.remove(temp_nca_path)
            except Exception: pass
        if os.path.exists(romfs_temp_dir):
            try: shutil.rmtree(romfs_temp_dir)
            except Exception: pass

def scan_file(file_path, hactool_path, keys_path, cache_dir, temp_dir):
    ext = os.path.splitext(file_path)[1].lower()
    
    if ext == '.zip':
        games_found = []
        try:
            with zipfile.ZipFile(file_path, 'r') as z:
                for member in z.namelist():
                    if member.endswith('.nsz') or member.endswith('.nsp'):
                        print(f"  Found nested file: {member}", file=sys.stderr)
                        with z.open(member) as stream:
                            pfs0_files = parse_pfs0_header(stream)
                            if pfs0_files:
                                meta = extract_and_parse_control(
                                    stream, pfs0_files, hactool_path, keys_path, cache_dir, temp_dir, file_path=member
                                )
                                if meta:
                                    meta["fileName"] = os.path.basename(file_path)
                                    meta["nestedPath"] = member
                                    meta["filePath"] = file_path
                                    meta["fileSize"] = os.path.getsize(file_path)
                                    meta["modifiedTime"] = os.path.getmtime(file_path)
                                    games_found.append(meta)
        except Exception as e:
            print(f"Error scanning ZIP {file_path}: {e}", file=sys.stderr)
        return games_found
        
    elif ext in ['.nsp', '.nsz']:
        try:
            with open(file_path, 'rb') as stream:
                pfs0_files = parse_pfs0_header(stream)
                if pfs0_files:
                    meta = extract_and_parse_control(
                        stream, pfs0_files, hactool_path, keys_path, cache_dir, temp_dir, file_path=file_path
                    )
                    if meta:
                        meta["fileName"] = os.path.basename(file_path)
                        meta["nestedPath"] = None
                        meta["filePath"] = file_path
                        meta["fileSize"] = os.path.getsize(file_path)
                        meta["modifiedTime"] = os.path.getmtime(file_path)
                        return [meta]
        except Exception as e:
            print(f"Error scanning NSP/NSZ {file_path}: {e}", file=sys.stderr)
            
    return []

def main():
    if len(sys.argv) < 6:
        print("Usage: python scanner_helper.py <games_dir> <hactool_path> <keys_path> <cache_dir> <db_path>", file=sys.stderr)
        sys.exit(1)
        
    games_dir = sys.argv[1]
    hactool_path = sys.argv[2]
    keys_path = sys.argv[3]
    cache_dir = sys.argv[4]
    db_path = sys.argv[5]
    
    print(f"Scanning directory: {games_dir}", file=sys.stderr)
    print(f"Hactool path: {hactool_path}", file=sys.stderr)
    print(f"Keys path: {keys_path}", file=sys.stderr)
    print(f"Cache dir: {cache_dir}", file=sys.stderr)
    print(f"Database path: {db_path}", file=sys.stderr)
    
    # Ensure cache dir exists
    try:
        os.makedirs(cache_dir, exist_ok=True)
    except Exception as e:
        print(f"Warning: could not create cache dir {cache_dir}: {e}", file=sys.stderr)

    # Ensure hactool is executable
    if os.path.exists(hactool_path):
        try:
            os.chmod(hactool_path, 0o755)
        except Exception:
            pass

    # Load existing database if it exists
    database = {}
    if os.path.exists(db_path):
        try:
            with open(db_path, 'r', encoding='utf-8') as f:
                database = json.load(f)
        except Exception as e:
            print(f"Error loading database: {e}", file=sys.stderr)
            
    # Create temp directory in system tmp
    temp_dir = os.path.join(tempfile.gettempdir(), f"switch_scanner_{os.getpid()}")
    if os.path.exists(temp_dir):
        try: shutil.rmtree(temp_dir)
        except Exception: pass
    os.makedirs(temp_dir, exist_ok=True)
    
    scanned_games = []
    
    if os.path.exists(games_dir):
        for root, dirs, files in os.walk(games_dir):
            dirs[:] = [d for d in dirs if not d.startswith('.') and not d.startswith('temp_') and not d.startswith('switch_uploads')]
            for file in files:
                file_path = os.path.join(root, file)
                ext = os.path.splitext(file)[1].lower()
                if ext not in ['.nsp', '.nsz', '.xci', '.zip']:
                    continue
                    
                try:
                    file_size = os.path.getsize(file_path)
                    mod_time = os.path.getmtime(file_path)
                except Exception:
                    continue
                
                # Check cache
                cached_entries = [entry for entry in database.values() if entry.get("filePath") == file_path]
                if cached_entries and cached_entries[0].get("fileSize") == file_size and cached_entries[0].get("modifiedTime") == mod_time:
                    for entry in database.values():
                        if entry.get("filePath") == file_path:
                            scanned_games.append(entry)
                    continue
                    
                print(f"Scanning file: {file} ...", file=sys.stderr)
                meta_list = scan_file(file_path, hactool_path, keys_path, cache_dir, temp_dir)
                if meta_list:
                    for meta in meta_list:
                        print(f"  Extracted game: {meta['title']} ({meta['titleId']})", file=sys.stderr)
                        scanned_games.append(meta)
    else:
        print(f"Games directory does not exist: {games_dir}", file=sys.stderr)
                    
    new_database = {}
    for game in scanned_games:
        raw_id = game.get("titleId", "unknown")
        suffix = raw_id[-3:] if len(raw_id) > 3 else ""
        if suffix == "800":
            game["type"] = "Update"
        elif suffix == "000":
            game["type"] = "Base Game"
        elif suffix != "":
            game["type"] = "DLC"
        else:
            game["type"] = "Unknown"
            
        file_base = os.path.basename(game.get("filePath", ""))
        nested = game.get("nestedPath") or ""
        
        if not raw_id or raw_id == "unknown":
            key_id = f"unknown_{file_base}_{nested}".strip('_')
        else:
            key_id = raw_id
            
        db_key = f"{key_id}_{game['type']}_{file_base}_{nested}".strip('_')
        new_database[db_key] = game
        
    # Save database
    saved = False
    try:
        db_dir = os.path.dirname(db_path)
        if db_dir:
            os.makedirs(db_dir, exist_ok=True)
        with open(db_path, 'w', encoding='utf-8') as f:
            json.dump(new_database, f, indent=2, ensure_ascii=False)
        saved = True
        print("Database saved successfully.", file=sys.stderr)
    except Exception as e:
        print(f"Error saving database to {db_path}: {e}", file=sys.stderr)
        
    if not saved:
        for fallback_path in [os.path.join(cache_dir, "games_db.json"), os.path.join(tempfile.gettempdir(), "games_db.json")]:
            try:
                with open(fallback_path, 'w', encoding='utf-8') as f:
                    json.dump(new_database, f, indent=2, ensure_ascii=False)
                break
            except Exception:
                pass
        
    # Cleanup temp directory
    if os.path.exists(temp_dir):
        try: shutil.rmtree(temp_dir)
        except Exception: pass
        
    # Print the games list as JSON to stdout for Node.js
    print(json.dumps(new_database, ensure_ascii=False))

if __name__ == "__main__":
    main()
