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

export { loadDescriptions, getModDescription };
