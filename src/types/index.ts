/* ===== Shared type definitions ===== */

/** A mod file/directory entry returned by scan_mods */
export interface ModEntry {
    name: string;
    is_dir: boolean;
    size: number;
    deleted: boolean;
    deleted_at: number | null;
}

/** A single file entry from the remote manifest */
export interface ManifestFile {
    name: string;
    path: string;
    type: string;
    ext: string;
    size: number;
    lastModified: string;
    sizeFormatted: string;
}

/** A category from the remote manifest */
export interface ManifestCategory {
    name: string;
    count: number;
    files: ManifestFile[];
}

/** The full manifest structure */
export interface Manifest {
    generatedAt: string;
    categories: Record<string, ManifestCategory>;
    totalCount: number;
}

/** A BepInEx build artifact from the builds page */
export interface BepInExArtifact {
    name: string;
    url: string;
    version: string;
    build_number: number;
}

/** BepInEx download/install progress event */
export interface BepInExDownloadProgress {
    stage: "downloading" | "extracting" | "done" | "cancelled";
    percent: number;
}

/** Resource download progress event */
export interface ResourceDownloadProgress {
    stage: "downloading" | "extracting" | "done";
    percent: number;
    file: string;
}

/** BepInEx framework check result */
export interface BepInExCheckResult {
    missing: string[];
    ok: boolean;
}

/** A config file entry found by scan_configs */
export interface ConfigEntry {
    name: string;
    rel_path: string;
    size: number;
}

/** A popup notification message */
export interface PopupMessage {
    id: number;
    message: string;
    visible: boolean;
}

/** Category-keyed mod descriptions: { "plugins": { "ModA": "desc..." }, ... } */
export type ModDescriptions = Record<string, Record<string, string>>;
