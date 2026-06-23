# ModManager
> A Mod manager for SecretFlaserManaka.
- (Now it's only a LOCAL mod manager)

# Usage
Download the latest zip file from [release](https://github.com/PeanutsZheng/ModManager/releases), unzip it and put the files into the GAME ROOT dir. The file tree might be:

```
Game_Dir
    ├─.trans                        # Recycle bin, create when you use the manager
    ├─SecretFlasherManaka.exe       # Game exe
    ├─modmanager.exe                # Mod manager exe
    └─ModsDescription.json          # Mods description
```

# Install
> For developers.

Tauri + React + Typescript. Need Node.js and Rust. See [Tauri pre-requisites](https://tauri.app/start/prerequisites/)

```powershell
cd ModManager

# Install
npm install

# Debug
npm run tauri dev

# Release
npm run tauri build
```

The ModsDescription.json in the source code is just a sample file, you can modify it to fit your setup.

# Future
- Add resource download.
- More mod description.
- Add dir management and config file edit
- Maybe more.