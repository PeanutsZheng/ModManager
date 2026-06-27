import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { ConfigEntry } from "../types";
import { formatSize } from "../utils/utils";
import "./ConfigPage.css";

const ConfigPage = () => {
    const [entries, setEntries] = useState<ConfigEntry[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const scan = async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await invoke<ConfigEntry[]>("scan_configs");
            setEntries(result);
        } catch (e) {
            setError(String(e));
            setEntries([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        scan();

        // Rescan when window regains focus (editor window closed)
        const onFocus = () => scan();
        window.addEventListener("focus", onFocus);
        return () => window.removeEventListener("focus", onFocus);
    }, []);

    const handleEdit = async (entry: ConfigEntry) => {
        // Label must be alphanumeric + -/_
        const label = `config-editor-${entry.name.replace(/[^a-zA-Z0-9]/g, "_")}`;
        try {
            const editorWin = new WebviewWindow(label, {
                url: `/#/config-editor?file=${encodeURIComponent(entry.rel_path)}&name=${encodeURIComponent(entry.name)}`,
                title: `Edit - ${entry.name}`,
                width: 700,
                height: 550,
                resizable: true,
                center: true,
                decorations: false,
            });

            editorWin.once("tauri://error", (e: unknown) => {
                console.error("Failed to create editor window:", e);
                const msg = e != null && typeof e === "object" && "payload" in e ? String((e as { payload: unknown }).payload) : String(e);
                setError(msg);
            });
        } catch (e) {
            setError(String(e));
        }
    };

    return (
        <div className="ModPageContent">
            <div className="ModPageHeader">
                <h2>Config</h2>
                <button className="NavigateUpButton" onClick={scan}>
                    ↻ Refresh
                </button>
            </div>

            {loading && <p className="ScanLoading">Scanning...</p>}
            {error && <p className="ScanError">{error}</p>}

            {entries.length > 0 && (
                <table className="ModTable">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Path</th>
                            <th>Size</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {entries.map((entry) => (
                            <tr key={entry.rel_path}>
                                <td>
                                    <span className="EntryIcon">⚙️</span>
                                    {entry.name}
                                </td>
                                <td className="ConfigPath">{entry.rel_path}</td>
                                <td>{formatSize(entry.size)}</td>
                                <td className="ActionsCell">
                                    <button
                                        className="ActionButton edit"
                                        onClick={() => handleEdit(entry)}
                                    >
                                        Edit
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            {!error && entries.length === 0 && !loading && (
                <p className="ScanEmpty">No config files found.</p>
            )}
        </div>
    );
};

export default ConfigPage;
