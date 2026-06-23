import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import EditorTitleBar from "./EditorTitleBar.tsx";


const ConfigEditor = () => {
    const [content, setContent] = useState("");
    const [originalContent, setOriginalContent] = useState("");
    const [fileName, setFileName] = useState("");
    const [relPath, setRelPath] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Sync dark/light theme from localStorage
    useEffect(() => {
        const saved = localStorage.getItem("theme");
        if (saved === "dark") {
            document.documentElement.classList.add("dark");
        } else {
            document.documentElement.classList.remove("dark");
        }
    }, []);

    useEffect(() => {
        const params = new URLSearchParams(window.location.hash.split("?")[1] || "");
        const file = params.get("file") || "";
        const name = params.get("name") || "Unknown";

        setRelPath(file);
        setFileName(name);

        if (!file) {
            setError("No file specified");
            setLoading(false);
            return;
        }

        const load = async () => {
            try {
                const text = await invoke<string>("read_config", { relPath: file });
                setContent(text);
                setOriginalContent(text);
            } catch (e) {
                setError(String(e));
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        try {
            await invoke("write_config", { relPath: relPath, content });
            setOriginalContent(content);
        } catch (e) {
            setError(String(e));
        } finally {
            setSaving(false);
        }
    };


    const isModified = content !== originalContent;

    // Ctrl+S save shortcut
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "s") {
                e.preventDefault();
                if (isModified && !saving) {
                    handleSave();
                }
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [isModified, saving, content, relPath]);

    if (loading) {
        return <div className="ConfigEditorStandalone"><div className="ConfigEditorLoading">Loading...</div></div>;
    }

    if (error && !content) {
        return <div className="ConfigEditorStandalone"><div className="ConfigEditorError">{error}</div></div>;
    }

    return (
        <div className="ConfigEditorStandalone">
            <EditorTitleBar />
            <div className="ConfigEditorHeader">
                <h3>{fileName}</h3>
                <span className="ConfigEditorPath">{relPath}</span>
            </div>

            <textarea
                className="ConfigEditorTextarea"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                spellCheck={false}
            />

            {error && <p className="ScanError" style={{ margin: "4px 20px" }}>{error}</p>}

            <div className="ConfigEditorFooter">
                <button
                    className="ConfigEditorBtn save"
                    onClick={handleSave}
                    disabled={!isModified || saving}
                >
                    {saving ? "Saving..." : "Save"}
                </button>
            </div>
        </div>
    );
};

export default ConfigEditor;
