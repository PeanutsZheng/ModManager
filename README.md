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

And there is an other mod manager project build by `达妮娅的猫`, see: [ManakaManaer](https://github.com/softsuccubus/ManakaManagerFX)

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
- Add clothes mods management.
- Add package management integration.
- Maybe more.

# Updata

<details>

06.23: Add dir management and config file edit.
06.24: Thanks to `Useruser9527` for their resource organization efforts. The mod description files are now quite comprehensive.
06.24: Add the BepInEx frame download and version management.
06.25: Add resource download. Thanks to `达妮娅的猫`'s work, now we can download mods from his [Network Resource Center](https://softsuccubus.github.io/ManakaStaticWeb/).

</details>

# Special thanks

Thanks for:

<img src="./public/useruser9527.png" width="75" > Useruser9527, <img src="./public/四重sympony.png" width="75" >四重sympony, <img src="./public/达妮娅的猫.png" width="75" > 达妮娅的猫, <img src="./public/夜航星.png" width="75" > 夜航星, <img src="./public/一り丫.png" width="75" > 一り丫.

The ranking is in no particular order.