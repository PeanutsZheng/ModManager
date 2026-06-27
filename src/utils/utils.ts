import { invoke } from "@tauri-apps/api/core";
import type { ModDescriptions } from "../types";

/* ===== Description helpers ===== */

const loadDescriptions = async (): Promise<ModDescriptions> => {
    try {
        const map = await invoke<ModDescriptions>("load_descriptions");
        return map;
    } catch (e) {
        console.error("[ModManager] Failed to load descriptions:", e);
        return {};
    }
};

/**
 * Get a mod's description from the category-keyed descriptions map.
 * If `category` is provided, looks up descriptions[category][name] first.
 * Falls back to searching all categories for a match.
 */
const getModDescription = (descriptions: ModDescriptions, name: string, category?: string): string => {
    // Try exact category match first
    if (category && descriptions[category]) {
        const desc = descriptions[category][name];
        if (desc) return desc;
    }
    // Fallback: search all categories
    for (const cat of Object.values(descriptions)) {
        if (cat[name]) return cat[name];
    }
    return "";
};

export { loadDescriptions, getModDescription };

/* ===== Formatting helpers ===== */

/** Format a byte count into a human-readable string (e.g. "1.5 MB") */
const formatSize = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(1) + " " + units[i];
};

/** Format an ISO date string to "YYYY-MM-DD" */
const formatDate = (isoStr: string): string => {
    try {
        const d = new Date(isoStr);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    } catch {
        return isoStr;
    }
};

export { formatSize, formatDate };

/* ===== BepInEx version persistence ===== */

const BE_VERSION_KEY = "bepinex-installed-version";

const saveInstalledVersion = (version: string | null) => {
    if (version) {
        localStorage.setItem(BE_VERSION_KEY, version);
    } else {
        localStorage.removeItem(BE_VERSION_KEY);
    }
};

const loadInstalledVersion = (): string | null => {
    return localStorage.getItem(BE_VERSION_KEY);
};

export { saveInstalledVersion, loadInstalledVersion };

/* ===== ModPage path persistence ===== */

const modPathStorageKey = (title: string) => `modPath:${title}`;

const loadSavedPath = (title: string, defaultPath: string): string => {
    try {
        const saved = localStorage.getItem(modPathStorageKey(title));
        return saved || defaultPath;
    } catch {
        return defaultPath;
    }
};

const savePath = (title: string, path: string) => {
    try {
        localStorage.setItem(modPathStorageKey(title), path);
    } catch {
        // ignore
    }
};

export { loadSavedPath, savePath };
