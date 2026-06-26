import { invoke } from "@tauri-apps/api/core";

/// Category-keyed mod descriptions: { "plugins": { "ModA": "desc..." }, ... }
export type ModDescriptions = Record<string, Record<string, string>>;

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
