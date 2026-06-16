import os

def rebrand_dir(root_dir):
    # Pass 1: rename files and directories
    # We do this bottom-up (topdown=False) so renaming a parent directory doesn't break paths to its children
    for dirpath, dirnames, filenames in os.walk(root_dir, topdown=False):
        # Skip node_modules, dist, target, .git
        if any(skip in dirpath for skip in ['/node_modules', '/dist', '/release', '/target', '/.git']):
            continue

        # Rename files
        for filename in filenames:
            old_path = os.path.join(dirpath, filename)
            new_filename = filename.replace('NearDrop', 'AirSpace').replace('neardrop', 'airspace')
            if filename != new_filename:
                new_path = os.path.join(dirpath, new_filename)
                os.rename(old_path, new_path)
                print(f"Renamed file: {old_path} -> {new_path}")

        # Rename directories
        for dirname in dirnames:
            if dirname in ['node_modules', 'dist', 'release', 'target', '.git']:
                continue
            old_path = os.path.join(dirpath, dirname)
            new_dirname = dirname.replace('NearDrop', 'AirSpace').replace('neardrop', 'airspace')
            if dirname != new_dirname:
                new_path = os.path.join(dirpath, new_dirname)
                os.rename(old_path, new_path)
                print(f"Renamed dir: {old_path} -> {new_path}")

    # Pass 2: content replacement
    text_extensions = {'.ts', '.tsx', '.js', '.jsx', '.json', '.html', '.css', '.md', '.cjs'}
    for dirpath, dirnames, filenames in os.walk(root_dir):
        # Skip directories
        dirnames[:] = [d for d in dirnames if d not in ['node_modules', 'dist', 'release', 'target', '.git', '.DS_Store']]
        
        for filename in filenames:
            ext = os.path.splitext(filename)[1].lower()
            if ext not in text_extensions and filename not in ['package.json']:
                continue
            
            filepath = os.path.join(dirpath, filename)
            
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    content = f.read()
            except UnicodeDecodeError:
                continue # Skip binary files
            
            # Perform replacements
            new_content = content.replace('NearDrop', 'AirSpace').replace('neardrop', 'airspace')
            
            if new_content != content:
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(new_content)
                print(f"Updated content in: {filepath}")

if __name__ == '__main__':
    project_root = '/Users/suyesh/Desktop/Airspace'
    # Important: Rebrand only src, server, src-tauri, root configs, electron
    rebrand_dir(os.path.join(project_root, 'src'))
    rebrand_dir(os.path.join(project_root, 'electron'))
    rebrand_dir(os.path.join(project_root, 'server'))
    rebrand_dir(os.path.join(project_root, 'src-tauri'))
    
    # Do package.json, index.html, vite.config.ts at root
    for f in ['package.json', 'index.html', 'vite.config.ts', 'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json']:
        filepath = os.path.join(project_root, f)
        if os.path.exists(filepath):
            with open(filepath, 'r', encoding='utf-8') as file:
                content = file.read()
            new_content = content.replace('NearDrop', 'AirSpace').replace('neardrop', 'airspace')
            if new_content != content:
                with open(filepath, 'w', encoding='utf-8') as file:
                    file.write(new_content)
                print(f"Updated content in root file: {filepath}")
