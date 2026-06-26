import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "./BepInExPanel.css";

interface BepInExArtifact {
    name: string;
    url: string;
    version: string;
    build_number: number;
}

interface DownloadProgress {
    stage: "downloading" | "extracting" | "done";
    percent: number;
}

interface BepInExPanelProps {
    installedVersion?: string | null;
    builds: BepInExArtifact[];
    onInstallComplete?: () => void;
    onRemoveComplete?: () => void;
    onDownloadingChange?: (downloading: boolean) => void;
}

// Persistent storage helpers
const STORAGE_KEY = "bepinex-installed-version";

function saveInstalledVersion(version: string | null) {
    if (version) {
        localStorage.setItem(STORAGE_KEY, version);
    } else {
        localStorage.removeItem(STORAGE_KEY);
    }
}

function loadInstalledVersion(): string | null {
    return localStorage.getItem(STORAGE_KEY);
}

const BepInExPanel = ({ installedVersion, builds, onInstallComplete, onRemoveComplete, onDownloadingChange }: BepInExPanelProps) => {
    const [downloading, setDownloading] = useState(false);
    const [downloadingUrl, setDownloadingUrl] = useState<string | null>(null);
    const [removing, setRemoving] = useState(false);
    const [progress, setProgress] = useState<DownloadProgress | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Merge prop version with persisted version
    const currentVersion = installedVersion || loadInstalledVersion();

    useEffect(() => {
        const unlisten = listen<DownloadProgress>("bepinex-download-progress", (event) => {
            const p = event.payload;
            setProgress(p);
            if (p.stage === "done") {
                setDownloading(false);
                setDownloadingUrl(null);
                setProgress(null);
                if (onDownloadingChange) onDownloadingChange(false);
                const installedBuild = builds.find(b => b.url === downloadingUrl);
                if (installedBuild) {
                    saveInstalledVersion(installedBuild.version);
                }
                if (onInstallComplete) onInstallComplete();
            }
        });

        return () => {
            unlisten.then(fn => fn());
        };
    }, [builds, downloadingUrl, onInstallComplete]);

    const handleInstall = async (url: string) => {
        if (downloading || removing) return;

        // If a version is already installed, remove it first
        if (currentVersion) {
            try {
                setProgress({ stage: "extracting", percent: 0 });
                await invoke("remove_bepinex");
                saveInstalledVersion(null);
                if (onRemoveComplete) onRemoveComplete();
                setProgress(null);
            } catch (e) {
                setError(`Failed to remove existing BepInEx: ${String(e)}`);
                setProgress(null);
                return;
            }
        }

        setDownloading(true);
        setDownloadingUrl(url);
        setProgress({ stage: "downloading", percent: 0 });
        setError(null);
        if (onDownloadingChange) onDownloadingChange(true);
        try {
            await invoke("download_bepinex", { url });
        } catch (e) {
            setDownloading(false);
            setDownloadingUrl(null);
            setProgress(null);
            if (onDownloadingChange) onDownloadingChange(false);
            setError(`Installation failed: ${String(e)}`);
        }
    };

    const handleRemove = async () => {
        if (downloading || removing || !currentVersion) return;
        setRemoving(true);
        setError(null);
        try {
            await invoke("remove_bepinex");
            saveInstalledVersion(null);
            if (onRemoveComplete) onRemoveComplete();
        } catch (e) {
            setError(`Failed to remove BepInEx: ${String(e)}`);
        } finally {
            setRemoving(false);
        }
    };

    const progressLabel = progress
        ? progress.stage === "downloading"
            ? "Downloading"
            : progress.stage === "extracting"
                ? currentVersion && !downloading
                    ? "Removing old version"
                    : "Extracting"
                : "Done"
        : "";

    return (
        <div className="bepinex-panel">
            <div className="bepinex-section">
                <h4 className="bepinex-section-title">Installed Version</h4>
                <div className="bepinex-installed-row">
                    {currentVersion ? (
                        <>
                            <span className="bepinex-version installed">{currentVersion}</span>
                            <button
                                className="bepinex-remove-btn"
                                onClick={handleRemove}
                                disabled={removing || downloading}
                            >
                                {removing ? "Removing..." : "Remove"}
                            </button>
                        </>
                    ) : (
                        <span className="bepinex-version not-installed">Not installed</span>
                    )}
                </div>
            </div>

            <div className="bepinex-section">
                <h4 className="bepinex-section-title">Available Builds (IL2CPP win-x64)</h4>
                {error && <p className="bepinex-error">{error}</p>}
                {builds.length === 0 && (
                    <p className="bepinex-empty">Loading builds...</p>
                )}
                <ul className="bepinex-build-list">
                    {builds.map((build) => (
                        <li key={build.url} className="bepinex-build-item">
                            <div className="bepinex-build-info">
                                <span className="bepinex-build-version">{build.version}</span>
                            </div>
                            <button
                                className={`bepinex-download-btn ${currentVersion === build.version ? "current" : ""}`}
                                onClick={() => handleInstall(build.url)}
                                disabled={downloading || removing || currentVersion === build.version}
                            >
                                {currentVersion === build.version
                                    ? "Installed"
                                    : downloadingUrl === build.url
                                        ? "Installing"
                                        : "Install"}
                            </button>
                        </li>
                    ))}
                </ul>
            </div>

            {/* Progress bar */}
            {progress && progress.stage !== "done" && (
                <div className="bepinex-progress-section">
                    <div className="bepinex-progress-label">
                        {progressLabel} {progress.percent}%
                    </div>
                    <div className="bepinex-progress-bar-track">
                        <div
                            className="bepinex-progress-bar-fill"
                            style={{ width: `${progress.percent}%` }}
                        />
                    </div>
                </div>
            )}

            <div className="bepinex-section">
                <p className="bepinex-hint">
                    Click Install to download and extract BepInEx into the game directory automatically.
                    <br />
                    More BepInEx version, please visit: <u>https://builds.bepinex.dev/projects/bepinex_be</u>.
                </p>
            </div>
        </div>
    );
};

export default BepInExPanel;
