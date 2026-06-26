import { useState, useEffect, useMemo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { type ModDescriptions } from "../utils/utils";
import ModTooltip from "./ModTooltip";
import "./ResourcePanel.css";

interface ManifestFile {
    name: string;
    path: string;
    type: string;
    ext: string;
    size: number;
    lastModified: string;
    sizeFormatted: string;
}

interface ModEntry {
    name: string;
    is_dir: boolean;
    size: number;
    deleted: boolean;
    deleted_at: number | null;
}

interface ManifestCategory {
    name: string;
    count: number;
    files: ManifestFile[];
}

interface Manifest {
    generatedAt: string;
    categories: Record<string, ManifestCategory>;
    totalCount: number;
}

interface DownloadProgress {
    stage: "downloading" | "extracting" | "done";
    percent: number;
    file: string;
}

interface ResourcePanelProps {
    /** Category key from manifest (e.g. "plugins", "CustomMissions", "CustomMissions2") */
    category: string;
    /** Default scan path (e.g. "./BepInEx/plugins") — always scans this path once, never re-scans on sub-dir navigation */
    defaultScanPath: string;
    /** Cached manifest data from Layout */
    manifest: Manifest | null;
    /** Whether manifest is currently loading */
    manifestLoading: boolean;
    /** Manifest fetch error */
    manifestError: string | null;
    /** Trigger a manifest reload */
    onReloadManifest: () => void;
    /** Trigger ModPage rescan after a download completes */
    onRescan?: () => void;
}

const ResourcePanel = ({
    category,
    defaultScanPath,
    manifest,
    manifestLoading,
    manifestError,
    onReloadManifest,
    onRescan,
}: ResourcePanelProps) => {
    const [localFiles, setLocalFiles] = useState<string[]>([]);
    const [localFilesLoading, setLocalFilesLoading] = useState(true);

    // Track downloading state per file name
    const [downloadingFiles, setDownloadingFiles] = useState<Record<string, DownloadProgress>>({});

    // Tooltip state
    const [tooltip, setTooltip] = useState<{
        name: string;
        x: number;
        y: number;
    } | null>(null);

    // Descriptions for tooltip
    const [descriptions, setDescriptions] = useState<ModDescriptions>({});

    // Always scan the default path (not sub-directory paths) — one scan for comparison,
    // no re-scan when user navigates into sub-directories.
    const loadLocalFiles = useCallback(() => {
        if (!defaultScanPath) return;
        setLocalFilesLoading(true);
        invoke<ModEntry[]>("scan_mods", { path: defaultScanPath })
            .then(entries => {
                const names = entries
                    .filter(e => !e.deleted)
                    .map(e => e.name);
                setLocalFiles(names);
                setLocalFilesLoading(false);
            })
            .catch(() => {
                setLocalFiles([]);
                setLocalFilesLoading(false);
            });
    }, [defaultScanPath]);

    useEffect(() => {
        loadLocalFiles();
        invoke<ModDescriptions>("load_descriptions").then(setDescriptions);
    }, [loadLocalFiles]);

    // Listen for download progress events
    useEffect(() => {
        const unlisten = listen<DownloadProgress>("resource-download-progress", (event) => {
            const { file, stage, percent } = event.payload;
            setDownloadingFiles(prev => ({
                ...prev,
                [file]: { stage, percent, file },
            }));
            // When done, remove from downloading after a short delay and refresh local files
            if (stage === "done") {
                setTimeout(() => {
                    setDownloadingFiles(prev => {
                        const next = { ...prev };
                        delete next[file];
                        return next;
                    });
                    loadLocalFiles();
                    onRescan?.();
                }, 500);
            }
        });
        return () => { unlisten.then(fn => fn()); };
    }, [loadLocalFiles]);

    // Compute remote files for this category that are NOT locally present
    const unavailableFiles = useMemo(() => {
        if (!manifest || !manifest.categories[category]) return [];
        const catFiles = manifest.categories[category].files;
        const localSet = new Set(localFiles.map(f => f.toLowerCase()));

        return catFiles.filter(file => {
            if (file.ext.toLowerCase() === ".dll") {
                return !localSet.has(file.name.toLowerCase());
            } else {
                // ZIP: check if the zip itself, its extracted folder, or its extracted dll exists
                const baseName = file.name.replace(/\.zip$/i, "");
                return !localSet.has(file.name.toLowerCase()) &&
                    !localSet.has(baseName.toLowerCase()) &&
                    !localSet.has(baseName.toLowerCase() + ".dll");
            }
        });
    }, [manifest, category, localFiles]);

    // Count total files in this category
    const totalFiles = manifest?.categories[category]?.count ?? 0;
    const installedCount = totalFiles - unavailableFiles.length;

    const handleDownload = async (file: ManifestFile) => {
        try {
            // Mark as downloading immediately (frontend optimistic state)
            setDownloadingFiles(prev => ({
                ...prev,
                [file.name]: { stage: "downloading", percent: 0, file: file.name },
            }));
            await invoke("download_resource", {
                category,
                fileName: file.name,
                targetPath: defaultScanPath,
            });
        } catch (e) {
            // Remove from downloading on error
            setDownloadingFiles(prev => {
                const next = { ...prev };
                delete next[file.name];
                return next;
            });
            console.error("Download failed:", e);
        }
    };

    const handleMouseMove = useCallback((e: React.MouseEvent, name: string) => {
        setTooltip({ name, x: e.clientX, y: e.clientY });
    }, []);

    const handleMouseLeave = useCallback(() => {
        setTooltip(null);
    }, []);

    const formatDate = (isoStr: string) => {
        try {
            const d = new Date(isoStr);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        } catch {
            return isoStr;
        }
    };

    if (manifestLoading || localFilesLoading) {
        return (
            <div className="resource-panel">
                <div className="resource-section">
                    <h4 className="resource-section-title">Available Resources</h4>
                    <p className="resource-loading">Loading...</p>
                </div>
            </div>
        );
    }

    if (manifestError) {
        return (
            <div className="resource-panel">
                <div className="resource-section">
                    <h4 className="resource-section-title">Available Resources</h4>
                    <p className="resource-error">{manifestError}</p>
                    <button className="resource-retry-btn" onClick={onReloadManifest}>
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="resource-panel">
            <div className="resource-section">
                <h4 className="resource-section-title">
                    Installed
                </h4>
                <div className="resource-stats">
                    <span className="resource-stats-count">{installedCount}</span>
                    <span className="resource-stats-total"> / {totalFiles}</span>
                </div>
            </div>

            <div className="resource-section">
                <h4 className="resource-section-title">
                    Not Installed ({unavailableFiles.length})
                </h4>
                {unavailableFiles.length === 0 ? (
                    <p className="resource-all-installed">All resources installed ✓</p>
                ) : (
                    <ul className="resource-file-list">
                        {unavailableFiles.map(file => {
                            const progress = downloadingFiles[file.name];
                            const isDownloading = !!progress;
                            const isDone = progress?.stage === "done";
                            const displayName = file.ext.toLowerCase() === ".zip" ? file.name.replace(/\.zip$/i, "") : file.name;

                            return (
                                <li
                                    key={file.path}
                                    className={`resource-file-item ${isDownloading ? "downloading" : ""}`}
                                    onMouseMove={(e) => handleMouseMove(e, displayName)}
                                    onMouseLeave={handleMouseLeave}
                                >
                                    <div className="resource-file-info">
                                        <span className="resource-file-name" title={file.name}>
                                            {displayName}
                                        </span>
                                        <span className="resource-file-meta">
                                            {file.sizeFormatted} · {formatDate(file.lastModified)}
                                        </span>
                                        {isDownloading && !isDone && (
                                            <div className="resource-progress-bar">
                                                <div
                                                    className="resource-progress-fill"
                                                    style={{ width: `${progress.percent}%` }}
                                                />
                                                <span className="resource-progress-text">
                                                    {progress.stage === "downloading" ? "↓" : "📦"} {progress.percent}%
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        className="resource-download-btn"
                                        onClick={() => handleDownload(file)}
                                        disabled={isDownloading}
                                    >
                                        {isDownloading ? "Downloading" : "Download"}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            {tooltip && (
                <ModTooltip
                    entry={{ name: tooltip.name, is_dir: false, size: 0, deleted: false, deleted_at: null }}
                    descriptions={descriptions}
                    category={category}
                    x={tooltip.x}
                    y={tooltip.y}
                />
            )}
        </div>
    );
};

export default ResourcePanel;

// Export types for Layout to use
export type { Manifest, ManifestFile, ManifestCategory };
