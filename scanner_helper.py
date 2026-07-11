import os
import sys
import json
import struct
import zipfile
import subprocess
import shutil
import xml.etree.ElementTree as ET

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
    return metadata

def parse_pfs0_header(stream):
    # Read PFS0 header (16 bytes)
    header_data = stream.read(16)
    if len(header_data) < 16:
        return None
        
    magic, num_files, string_table_size, reserved = struct.unpack('<4sIII', header_data)
    magic_str = magic.decode('ascii', errors='ignore')
    if magic_str != "PFS0":
        return None
        
    # Read File Entry Table (num_files * 24 bytes)
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
        
    # Read String Table
    string_table = stream.read(string_table_size)
    if len(string_table) < string_table_size:
        return None
        
    # Resolve filenames and absolute file offsets
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

def extract_and_parse_control(stream, pfs0_files, hactool_path, keys_path, cache_dir, temp_dir):
    # 1. We need to find the control NCA.
    # We can search for a file ending in .cnmt.xml or just look at NCAs that are around 1-2MB.
    # Ideally, we read the cnmt.xml file to find the exact Control NCA ID.
    true_title_id = None
    # Method 1: Extract Title ID from .tik or .cert file names (first 16 chars)
    for name in pfs0_files.keys():
        if name.endswith('.tik') or name.endswith('.cert'):
            base_name = os.path.basename(name)
            if len(base_name) >= 16:
                potential_id = base_name[:16].lower()
                try:
                    int(potential_id, 16)
                    true_title_id = potential_id
                    break
                except ValueError:
                    pass

    # Method 2: Fallback to cnmt.xml
    cnmt_xml_name = None
    for name in pfs0_files.keys():
        if name.endswith('.cnmt.xml'):
            cnmt_xml_name = name
            break
            
    control_nca_id = None
    if cnmt_xml_name:
        xml_entry = pfs0_files[cnmt_xml_name]
        stream.seek(xml_entry['offset'])
        xml_data = stream.read(xml_entry['size'])
        try:
            root = ET.fromstring(xml_data)
            # Read the ContentMeta Id tag which is the true Title ID of this package (Base / Update / DLC)
            if not true_title_id:
                id_node = root.find("Id")
                if id_node is not None:
                    true_title_id = id_node.text.replace("0x", "").lower().strip()
                
            for content in root.findall(".//Content"):
                type_node = content.find("Type")
                id_node = content.find("Id")
                if type_node is not None and type_node.text == "Control" and id_node is not None:
                    control_nca_id = id_node.text
                    break
        except Exception as e:
            print(f"Error parsing cnmt.xml: {e}", file=sys.stderr)
            
    # Fallback: if cnmt.xml is not found or failed, look for an NCA around 1-2MB (usually control.nca)
    control_nca_name = None
    if control_nca_id:
        # Check both .nca and .ncz (if compressed, though control is rarely compressed)
        for name in pfs0_files.keys():
            if name.startswith(control_nca_id):
                control_nca_name = name
                break
    
    if not control_nca_name:
        for name, entry in pfs0_files.items():
            if name.endswith('.nca') and 500000 < entry['size'] < 5000000:
                control_nca_name = name
                break
                
    if not control_nca_name:
        return None
        
    # Extract the control NCA to temp directory
    nca_entry = pfs0_files[control_nca_name]
    temp_nca_path = os.path.join(temp_dir, "temp_control.nca")
    
    stream.seek(nca_entry['offset'])
    # Read in chunks to prevent memory issues for larger files
    with open(temp_nca_path, 'wb') as out_f:
        bytes_to_read = nca_entry['size']
        chunk_size = 256 * 1024
        while bytes_to_read > 0:
            chunk = stream.read(min(bytes_to_read, chunk_size))
            if not chunk:
                break
            out_f.write(chunk)
            bytes_to_read -= len(chunk)
            
    # Run hactool on the extracted NCA
    romfs_temp_dir = os.path.join(temp_dir, "romfs")
    if os.path.exists(romfs_temp_dir):
        shutil.rmtree(romfs_temp_dir)
    os.makedirs(romfs_temp_dir)
    
    cmd = [
        hactool_path,
        "-k", keys_path,
        f"--romfsdir={romfs_temp_dir}",
        temp_nca_path
    ]
    
    try:
        # Run hactool silently
        result = subprocess.run(cmd, capture_output=True, text=True, errors='ignore')
        if result.returncode != 0:
            print(f"hactool failed: {result.stderr}", file=sys.stderr)
            return None
            
        # Parse control.nacp
        nacp_path = os.path.join(romfs_temp_dir, "control.nacp")
        if not os.path.exists(nacp_path):
            print("control.nacp not found in RomFS.", file=sys.stderr)
            return None
            
        metadata = parse_nacp(nacp_path)
        
        # Get Title ID and Title name from NACP
        # We use German as first choice, then AmericanEnglish, then whatever is available
        title_id = None
        game_title = "Unknown Game"
        publisher = "Unknown Publisher"
        
        # Try to find a good representative title
        preferred_langs = ["German", "AmericanEnglish", "BritishEnglish"]
        chosen_lang = None
        
        for lang in preferred_langs:
            if lang in metadata:
                game_title = metadata[lang]["name"]
                publisher = metadata[lang]["publisher"]
                chosen_lang = lang
                break
        
        if not chosen_lang and metadata:
            # Take the first available language
            first_lang = list(metadata.keys())[0]
            game_title = metadata[first_lang]["name"]
            publisher = metadata[first_lang]["publisher"]
            
        # Use true_title_id from cnmt.xml first, then fall back to hactool output
        title_id = true_title_id
        if not title_id:
            for line in result.stdout.splitlines():
                if "Title ID:" in line:
                    title_id = line.split("Title ID:")[1].strip().lower()
                    break
                
        if not title_id:
            title_id = "unknown"
            
        # Copy the icon
        # Find German icon, or first available icon_*.dat
        icon_src_path = None
        if os.path.exists(os.path.join(romfs_temp_dir, "icon_German.dat")):
            icon_src_path = os.path.join(romfs_temp_dir, "icon_German.dat")
        else:
            for file in os.listdir(romfs_temp_dir):
                if file.startswith("icon_") and file.endswith(".dat"):
                    icon_src_path = os.path.join(romfs_temp_dir, file)
                    break
                    
        if icon_src_path and title_id != "unknown":
            icon_dest_path = os.path.join(cache_dir, f"{title_id}.jpg")
            shutil.copy(icon_src_path, icon_dest_path)
            
        return {
            "titleId": title_id,
            "title": game_title,
            "publisher": publisher,
            "languages": list(metadata.keys()),
            "icon": f"/cache/{title_id}.jpg" if title_id != "unknown" else None
        }
        
    except Exception as e:
        print(f"Error executing/parsing hactool: {e}", file=sys.stderr)
        return None
    finally:
        # Cleanup temp control file and romfs directory
        if os.path.exists(temp_nca_path):
            os.remove(temp_nca_path)
        if os.path.exists(romfs_temp_dir):
            shutil.rmtree(romfs_temp_dir)

def scan_file(file_path, hactool_path, keys_path, cache_dir, temp_dir):
    ext = os.path.splitext(file_path)[1].lower()
    
    if ext == '.zip':
        # Open Zip and scan nested NSP/NSZ files
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
                                    stream, pfs0_files, hactool_path, keys_path, cache_dir, temp_dir
                                )
                                if meta:
                                    # Add file details
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
        # Scan standalone NSP/NSZ
        try:
            with open(file_path, 'rb') as stream:
                pfs0_files = parse_pfs0_header(stream)
                if pfs0_files:
                    meta = extract_and_parse_control(
                        stream, pfs0_files, hactool_path, keys_path, cache_dir, temp_dir
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
    
    # Load existing database if it exists
    database = {}
    if os.path.exists(db_path):
        try:
            with open(db_path, 'r', encoding='utf-8') as f:
                database = json.load(f)
        except Exception as e:
            print(f"Error loading database: {e}", file=sys.stderr)
            
    # Create temp directory
    temp_dir = os.path.join(cache_dir, "temp_scanner")
    if os.path.exists(temp_dir):
        shutil.rmtree(temp_dir)
    os.makedirs(temp_dir)
    
    if not os.path.exists(cache_dir):
        os.makedirs(cache_dir)
        
    # Scan files in directory
    scanned_games = []
    
    # Simple recursive directory walk
    for root, dirs, files in os.walk(games_dir):
        for file in files:
            file_path = os.path.join(root, file)
            ext = os.path.splitext(file)[1].lower()
            if ext not in ['.nsp', '.nsz', '.zip']:
                continue
                
            file_size = os.path.getsize(file_path)
            mod_time = os.path.getmtime(file_path)
            
            # Check cache
            cached_entries = [entry for entry in database.values() if entry.get("filePath") == file_path]
            if cached_entries and cached_entries[0].get("fileSize") == file_size and cached_entries[0].get("modifiedTime") == mod_time:
                # Cache hit!
                print(f"Cache hit for: {file}", file=sys.stderr)
                # Keep all cached entries for this file path
                for entry in database.values():
                    if entry.get("filePath") == file_path:
                        scanned_games.append(entry)
                continue
                
            # Cache miss - scan file
            print(f"Scanning file: {file} ...", file=sys.stderr)
            meta_list = scan_file(file_path, hactool_path, keys_path, cache_dir, temp_dir)
            if meta_list:
                for meta in meta_list:
                    print(f"  Extracted game: {meta['title']} ({meta['titleId']})", file=sys.stderr)
                    scanned_games.append(meta)
                    
    # Rebuild database dictionary keyed by Title ID or unique key (filepath + nestedPath)
    new_database = {}
    for game in scanned_games:
        key = game["titleId"]
        if not key or key == "unknown":
            key = f"{os.path.basename(game['filePath'])}_{game['nestedPath']}"
            
        # In case of duplicate title ID (e.g. base game and update), we store both or distinguish them
        # Let's check if the game is an update or DLC based on Title ID (usually title IDs ending in 800 are updates, odd ones are DLC, base ends in 000)
        suffix = game["titleId"][-3:] if len(game["titleId"]) > 3 else ""
        if suffix == "800":
            game["type"] = "Update"
        elif suffix == "000":
            game["type"] = "Base Game"
        elif suffix != "":
            game["type"] = "DLC"
        else:
            game["type"] = "Unknown"
            
        # Store using a compound key to prevent overwriting updates/DLCs
        db_key = f"{game['titleId']}_{game['type']}"
        new_database[db_key] = game
        
    # Save database
    try:
        with open(db_path, 'w', encoding='utf-8') as f:
            json.dump(new_database, f, indent=2, ensure_ascii=False)
        print("Database saved successfully.", file=sys.stderr)
    except Exception as e:
        print(f"Error saving database: {e}", file=sys.stderr)
        
    # Cleanup temp directory
    if os.path.exists(temp_dir):
        shutil.rmtree(temp_dir)
        
    # Print the games list as JSON to stdout for Node.js
    print(json.dumps(new_database, ensure_ascii=False))

if __name__ == "__main__":
    main()
