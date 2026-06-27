import { useState, useEffect, useMemo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ModDescriptions, ManifestFile, Manifest, ModEntry, BepInExArtifact, BepInExDownloadProgress, ResourceDownloadProgress } from "../types";
import { saveInstalledVersion, loadInstalledVersion, formatDate } from "../utils/utils";
import ModTooltip from "./ModTooltip";
import "./DownloadPage.css";

/* ===== Tab Definition (page-local) ===== */

type TabKey = "bepinex" | "plugins" | "v1" | "v2";

interface TabDef {
    key: TabKey;
    label: string;
    category: string;
    defaultScanPath: string;
}

const TABS: TabDef[] = [
    { key: "bepinex", label: "BepInEx", category: "", defaultScanPath: "" },
    { key: "plugins", label: "Plugins", category: "plugins", defaultScanPath: "./BepInEx/plugins" },
    { key: "v1", label: "CM V1", category: "CustomMissions", defaultScanPath: "./CustomMissions" },
    { key: "v2", label: "CM V2", category: "CustomMissions2", defaultScanPath: "./CustomMissions2" },
];

/* ===== Component ===== */

const DownloadPage = ({ visible }: { visible: boolean }) => {
    const [activeTab, setActiveTab] = useState<TabKey>("bepinex");
    const currentTab = TABS.find(t => t.key === activeTab)!;

    /* --- BepInEx state --- */
    const [bepinexInstalledVersion, setBepinexInstalledVersion] = useState<string | null>(null);
    const [bepinexBuilds, setBepinexBuilds] = useState<BepInExArtifact[]>([]);
    const [bepinexBuildsLoaded, setBepinexBuildsLoaded] = useState(false);
    const [bepinexDownloading, setBepinexDownloading] = useState(false);
    const [bepinexRemoving, setBepinexRemoving] = useState(false);
    const [bepinexProgress, setBepinexProgress] = useState<BepInExDownloadProgress | null>(null);
    const [bepinexDownloadingUrl, setBepinexDownloadingUrl] = useState<string | null>(null);
    const [bepinexError, setBepinexError] = useState<string | null>(null);

    /* --- Resource state --- */
    const [manifest, setManifest] = useState<Manifest | null>(null);
    const [manifestLoading, setManifestLoading] = useState(false);
    const [manifestError, setManifestError] = useState<string | null>(null);
    const [manifestLoaded, setManifestLoaded] = useState(false);
    const [localFiles, setLocalFiles] = useState<Record<string, string[]>>({});
    const [localFilesLoading, setLocalFilesLoading] = useState(false);
    const [downloadingFiles, setDownloadingFiles] = useState<Record<string, ResourceDownloadProgress>>({});
    const [descriptions, setDescriptions] = useState<ModDescriptions>({});
    const [tooltip, setTooltip] = useState<{ name: string; x: number; y: number } | null>(null);

    /* --- Load BepInEx data when tab is active --- */
    useEffect(() => {
        if (activeTab !== "bepinex") return;

        invoke<string | null>("get_installed_bepinex_version").then(v => {
            setBepinexInstalledVersion(v);
        });

        if (!bepinexBuildsLoaded) {
            invoke<BepInExArtifact[]>("fetch_bepinex_builds").then(result => {
                setBepinexBuilds(result);
                setBepinexBuildsLoaded(true);
            }).catch(() => { });
        }
    }, [activeTab]);

    /* --- Load manifest & local files when resource tab is active or page becomes visible --- */
    useEffect(() => {
        if (activeTab === "bepinex" || !visible) return;
        const tab = TABS.find(t => t.key === activeTab)!;

        // Load manifest if not yet loaded
        if (!manifestLoaded && !manifestLoading) {
            setManifestLoading(true);
            setManifestError(null);
            invoke<Manifest>("fetch_manifest")
                .then(m => { setManifest(m); setManifestLoaded(true); })
                .catch(e => setManifestError(String(e)))
                .finally(() => setManifestLoading(false));
        }

        // Load descriptions
        invoke<ModDescriptions>("load_descriptions").then(setDescriptions);

        // Load local files for this category (always rescan to reflect deletions in ModPage)
        if (!localFilesLoading) {
            setLocalFilesLoading(true);
            invoke<ModEntry[]>("scan_mods", { path: tab.defaultScanPath })
                .then(entries => {
                    const names = entries.filter(e => !e.deleted).map(e => e.name);
                    setLocalFiles(prev => ({ ...prev, [tab.category]: names }));
                })
                .catch(() => {
                    setLocalFiles(prev => ({ ...prev, [tab.category]: [] }));
                })
                .finally(() => setLocalFilesLoading(false));
        }
    }, [activeTab, visible]);

    /* --- BepInEx download progress listener --- */
    useEffect(() => {
        const unlisten = listen<BepInExDownloadProgress>("bepinex-download-progress", (event) => {
            const p = event.payload;
            setBepinexProgress(p);
            if (p.stage === "done") {
                setBepinexDownloading(false);
                setBepinexDownloadingUrl(null);
                setBepinexProgress(null);
                const installedBuild = bepinexBuilds.find(b => b.url === bepinexDownloadingUrl);
                if (installedBuild) {
                    saveInstalledVersion(installedBuild.version);
                }
                invoke<string | null>("get_installed_bepinex_version").then(v => {
                    setBepinexInstalledVersion(v);
                });
            } else if (p.stage === "cancelled") {
                setBepinexDownloading(false);
                setBepinexDownloadingUrl(null);
                setBepinexProgress(null);
            }
        });
        return () => { unlisten.then(fn => fn()); };
    }, [bepinexBuilds, bepinexDownloadingUrl]);

    /* --- Resource download progress listener --- */
    useEffect(() => {
        const unlisten = listen<ResourceDownloadProgress>("resource-download-progress", (event) => {
            const { file, stage, percent } = event.payload;
            setDownloadingFiles(prev => ({ ...prev, [file]: { stage, percent, file } }));
            if (stage === "done") {
                setTimeout(() => {
                    setDownloadingFiles(prev => {
                        const next = { ...prev };
                        delete next[file];
                        return next;
                    });
                    // Refresh local files for all resource categories
                    TABS.filter(t => t.key !== "bepinex").forEach(tab => {
                        invoke<ModEntry[]>("scan_mods", { path: tab.defaultScanPath })
                            .then(entries => {
                                const names = entries.filter(e => !e.deleted).map(e => e.name);
                                setLocalFiles(prev => ({ ...prev, [tab.category]: names }));
                            })
                            .catch(() => { });
                    });
                }, 500);
            }
        });
        return () => { unlisten.then(fn => fn()); };
    }, []);

    /* --- BepInEx handlers --- */
    const handleBepInExInstall = async (url: string) => {
        if (bepinexDownloading || bepinexRemoving) return;
        const currentVersion = bepinexInstalledVersion || loadInstalledVersion();

        if (currentVersion) {
            try {
                setBepinexProgress({ stage: "extracting", percent: 0 });
                await invoke("remove_bepinex");
                saveInstalledVersion(null);
                setBepinexInstalledVersion(null);
                setBepinexProgress(null);
            } catch (e) {
                setBepinexError(`Failed to remove existing BepInEx: ${String(e)}`);
                setBepinexProgress(null);
                return;
            }
        }

        setBepinexDownloading(true);
        setBepinexDownloadingUrl(url);
        setBepinexProgress({ stage: "downloading", percent: 0 });
        setBepinexError(null);
        try {
            // Reset cancellation token before starting a new download
            await invoke("reset_bepinex_cancel_token");
            await invoke("download_bepinex", { url });
        } catch (e) {
            const msg = String(e);
            setBepinexDownloading(false);
            setBepinexDownloadingUrl(null);
            setBepinexProgress(null);
            if (msg === "Download cancelled") {
                setBepinexError("Download cancelled");
            } else {
                setBepinexError(`Installation failed: ${msg}`);
            }
        }
    };

    const handleBepInExCancel = async () => {
        try {
            await invoke("cancel_bepinex_download");
        } catch (e) {
            console.error("Cancel failed:", e);
        }
    };

    const handleBepInExRemove = async () => {
        if (bepinexDownloading || bepinexRemoving) return;
        setBepinexRemoving(true);
        setBepinexError(null);
        try {
            await invoke("remove_bepinex");
            saveInstalledVersion(null);
            setBepinexInstalledVersion(null);
        } catch (e) {
            setBepinexError(`Failed to remove BepInEx: ${String(e)}`);
        } finally {
            setBepinexRemoving(false);
        }
    };

    /* --- Resource handlers --- */
    const handleResourceDownload = async (file: ManifestFile) => {
        const tab = currentTab;
        try {
            setDownloadingFiles(prev => ({
                ...prev,
                [file.name]: { stage: "downloading", percent: 0, file: file.name },
            }));
            await invoke("download_resource", {
                category: tab.category,
                fileName: file.name,
                targetPath: tab.defaultScanPath,
            });
        } catch (e) {
            setDownloadingFiles(prev => {
                const next = { ...prev };
                delete next[file.name];
                return next;
            });
            console.error("Download failed:", e);
        }
    };

    const handleReloadManifest = () => {
        setManifestLoading(true);
        setManifestError(null);
        invoke<Manifest>("fetch_manifest")
            .then(m => { setManifest(m); setManifestLoaded(true); })
            .catch(e => setManifestError(String(e)))
            .finally(() => setManifestLoading(false));
    };

    /* --- Computed: unavailable files for current resource tab --- */
    const unavailableFiles = useMemo(() => {
        if (activeTab === "bepinex") return [];
        const tab = currentTab;
        if (!manifest || !manifest.categories[tab.category]) return [];
        const catFiles = manifest.categories[tab.category].files;
        const local = localFiles[tab.category] || [];
        const localSet = new Set(local.map(f => f.toLowerCase()));

        return catFiles.filter(file => {
            if (file.ext.toLowerCase() === ".dll") {
                return !localSet.has(file.name.toLowerCase());
            } else {
                const baseName = file.name.replace(/\.zip$/i, "");
                return !localSet.has(file.name.toLowerCase()) &&
                    !localSet.has(baseName.toLowerCase()) &&
                    !localSet.has(baseName.toLowerCase() + ".dll");
            }
        });
    }, [activeTab, manifest, localFiles]);

    const totalFiles = activeTab !== "bepinex" && manifest?.categories[currentTab.category]
        ? manifest.categories[currentTab.category].count
        : 0;
    const installedCount = totalFiles - unavailableFiles.length;

    const currentBeVersion = bepinexInstalledVersion || loadInstalledVersion();

    const beProgressLabel = bepinexProgress
        ? bepinexProgress.stage === "downloading"
            ? "Downloading"
            : bepinexProgress.stage === "extracting"
                ? currentBeVersion && !bepinexDownloading
                    ? "Removing old version"
                    : "Extracting"
                : "Done"
        : "";

    const handleMouseMove = useCallback((e: React.MouseEvent, name: string) => {
        setTooltip({ name, x: e.clientX, y: e.clientY });
    }, []);

    const handleMouseLeave = useCallback(() => {
        setTooltip(null);
    }, []);

    return (
        <div className="download-page">
            {/* Tab bar */}
            <div className="download-tabs">
                {TABS.map(tab => (
                    <button
                        key={tab.key}
                        className={`download-tab ${activeTab === tab.key ? "active" : ""}`}
                        onClick={() => setActiveTab(tab.key)}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab content */}
            <div className="download-content">
                {/* BepInEx tab */}
                {activeTab === "bepinex" && (
                    <div className="bepinex-panel">
                        <div className="bepinex-section">
                            <h4 className="bepinex-section-title">Installed Version</h4>
                            <div className="bepinex-installed-row">
                                {currentBeVersion ? (
                                    <>
                                        <span className="bepinex-version installed">{currentBeVersion}</span>
                                        <button
                                            className="bepinex-remove-btn"
                                            onClick={handleBepInExRemove}
                                            disabled={bepinexRemoving || bepinexDownloading}
                                        >
                                            {bepinexRemoving ? "Removing..." : "Remove"}
                                        </button>
                                    </>
                                ) : (
                                    <span className="bepinex-version not-installed">Not installed</span>
                                )}
                            </div>
                        </div>

                        <div className="bepinex-section">
                            <h4 className="bepinex-section-title">Available Builds (IL2CPP win-x64)</h4>
                            {bepinexBuilds.length === 0 && (
                                <p className="bepinex-empty">Loading builds...</p>
                            )}
                            <ul className="bepinex-build-list">
                                {bepinexBuilds.map((build) => (
                                    <li key={build.url} className="bepinex-build-item">
                                        <div className="bepinex-build-info">
                                            <span className="bepinex-build-version">{build.version}</span>
                                        </div>
                                        <button
                                            className={`bepinex-download-btn ${currentBeVersion === build.version ? "current" : ""}`}
                                            onClick={() => handleBepInExInstall(build.url)}
                                            disabled={bepinexDownloading || bepinexRemoving || currentBeVersion === build.version}
                                        >
                                            {currentBeVersion === build.version
                                                ? "Installed"
                                                : bepinexDownloadingUrl === build.url
                                                    ? "Installing"
                                                    : "Install"}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div className="bepinex-section">
                            <p className="bepinex-hint">
                                Click Install to download and extract BepInEx into the game directory automatically.
                                <br />
                                More BepInEx version, please visit: <u>https://builds.bepinex.dev/projects/bepinex_be</u>.
                            </p>
                            {bepinexError && <p className="bepinex-error">{bepinexError}</p>}
                        </div>

                        <div
                            className="bepinex-progress-section"
                            style={{ visibility: bepinexProgress && bepinexProgress.stage !== "done" ? "visible" : "hidden" }}
                        >
                            <div className="bepinex-progress-row">
                                <div className="bepinex-progress-bar-track">
                                    <div
                                        className="bepinex-progress-bar-fill"
                                        style={{ width: `${bepinexProgress?.percent ?? 0}%` }}
                                    />
                                </div>
                                <button
                                    className="bepinex-cancel-btn"
                                    onClick={handleBepInExCancel}
                                    disabled={!bepinexDownloading}
                                >
                                    Cancel
                                </button>
                            </div>
                            <div className="bepinex-progress-label">
                                {bepinexProgress && bepinexProgress.stage !== "done" ? `${beProgressLabel} ${bepinexProgress.percent}%` : "\u00A0"}
                            </div>
                        </div>
                    </div>
                )}

                {/* Resource tabs (plugins, v1, v2) */}
                {activeTab !== "bepinex" && (
                    <div className="resource-panel">
                        {manifestLoading || localFilesLoading ? (
                            <div className="resource-section">
                                <h4 className="resource-section-title">Available Resources</h4>
                                <p className="resource-loading">Loading...</p>
                            </div>
                        ) : manifestError ? (
                            <div className="resource-section">
                                <h4 className="resource-section-title">Available Resources</h4>
                                <p className="resource-error">{manifestError}</p>
                                <button className="resource-retry-btn" onClick={handleReloadManifest}>
                                    Retry
                                </button>
                            </div>
                        ) : (
                            <>
                                <div className="resource-section">
                                    <h4 className="resource-section-title">Installed</h4>
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
                                                            onClick={() => handleResourceDownload(file)}
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
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Tooltip */}
            {tooltip && (
                <ModTooltip
                    entry={{ name: tooltip.name, is_dir: false, size: 0, deleted: false, deleted_at: null }}
                    descriptions={descriptions}
                    category={currentTab.category}
                    x={tooltip.x}
                    y={tooltip.y}
                />
            )}
        </div>
    );
};

export default DownloadPage;
