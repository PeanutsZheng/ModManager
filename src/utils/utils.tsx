import { invoke } from "@tauri-apps/api/core";

export interface ModDescription {
    description: string;
    In: string;
}

const loadDescriptions = async (): Promise<Record<string, ModDescription>> => {
    try {
        const map = await invoke<Record<string, ModDescription>>("load_descriptions");
        return map;
    } catch (e) {
        console.error("[ModManager] Failed to load descriptions:", e);
        return {};
    }
};

const getModDescription = (descriptions: Record<string, ModDescription>, name: string): string => {
    return descriptions[name]?.description || "";
};

const remainingTime = (deletedAt: number | null): string => {
    if (!deletedAt) return "";
    const elapsed = Math.floor(Date.now() / 1000) - deletedAt;
    const remaining = 3600 - elapsed;
    if (remaining <= 0) return "expired";
    const min = Math.floor(remaining / 60);
    const sec = remaining % 60;
    return `${min}m ${sec}s`;
};

export { loadDescriptions, getModDescription, remainingTime };
