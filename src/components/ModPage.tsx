import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import ModTooltip from "./ModTooltip.tsx";
import { loadDescriptions, type ModDescription } from "../utils/utils.tsx";

interface ModEntry {
	name: string;
	is_dir: boolean;
	size: number;
	deleted: boolean;
	deleted_at: number | null;
}

interface ModPageProps {
	title: string;
	defaultPath: string;
}

const STORAGE_KEY = (title: string) => `modPath:${title}`;

const loadSavedPath = (title: string, defaultPath: string): string => {
	try {
		const saved = localStorage.getItem(STORAGE_KEY(title));
		return saved || defaultPath;
	} catch {
		return defaultPath;
	}
};

const savePath = (title: string, path: string) => {
	try {
		localStorage.setItem(STORAGE_KEY(title), path);
	} catch {
		// ignore
	}
};

const ModPage = ({ title, defaultPath }: ModPageProps) => {
	const initialPath = loadSavedPath(title, defaultPath);
	const [path, setPath] = useState(initialPath);
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(initialPath);
	const [entries, setEntries] = useState<ModEntry[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [descriptions, setDescriptions] = useState<Record<string, ModDescription>>({});

	// Tooltip state
	const [tooltip, setTooltip] = useState<{
		entry: ModEntry;
		x: number;
		y: number;
	} | null>(null);

	const scan = async (target: string) => {
		if (!target.trim()) return;
		setLoading(true);
		setError(null);
		try {
			const result = await invoke<ModEntry[]>("scan_mods", { path: target });
			setEntries(result);
		} catch (e) {
			setError(String(e));
			setEntries([]);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		loadDescriptions().then(setDescriptions);
		if (initialPath) scan(initialPath);
	}, []);

	const handleChange = () => {
		setDraft(path);
		setEditing(true);
	};

	const handleConfirm = () => {
		const trimmed = draft.trim();
		if (trimmed && trimmed !== path) {
			setPath(trimmed);
			savePath(title, trimmed);
			scan(trimmed);
		}
		setEditing(false);
	};

	const handleCancel = () => {
		setDraft(path);
		setEditing(false);
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter") handleConfirm();
		if (e.key === "Escape") handleCancel();
	};

	const handleDelete = async (name: string) => {
		try {
			await invoke("delete_mod", { basePath: path, name });
			await scan(path);
		} catch (e) {
			setError(String(e));
		}
	};

	const handleRestore = async (name: string) => {
		try {
			await invoke("restore_mod", { basePath: path, name });
			await scan(path);
		} catch (e) {
			setError(String(e));
		}
	};

	const handlePurge = async (name: string) => {
		try {
			await invoke("purge_mod", { basePath: path, name });
			await scan(path);
		} catch (e) {
			setError(String(e));
		}
	};

	const handleMouseMove = useCallback((e: React.MouseEvent, entry: ModEntry) => {
		setTooltip({ entry, x: e.clientX, y: e.clientY });
	}, []);

	const handleMouseLeave = useCallback(() => {
		setTooltip(null);
	}, []);

	const formatSize = (bytes: number) => {
		if (bytes === 0) return "0 B";
		const units = ["B", "KB", "MB", "GB"];
		const i = Math.floor(Math.log(bytes) / Math.log(1024));
		return (bytes / Math.pow(1024, i)).toFixed(1) + " " + units[i];
	};

	return (
		<div className="ModPageContent">
			<h2>{title}</h2>

			<div className="ScanBar">
				<input
					type="text"
					value={editing ? draft : path}
					onChange={(e) => setDraft(e.target.value)}
					onKeyDown={handleKeyDown}
					readOnly={!editing}
					placeholder="Directory path..."
					className={`ScanInput ${editing ? "editable" : ""}`}
				/>
				{editing ? (
					<>
						<button onClick={handleConfirm} disabled={loading} className="ChangeButton confirm">
							✓
						</button>
						<button onClick={handleCancel} className="ChangeButton cancel">
							✕
						</button>
					</>
				) : (
					<button onClick={handleChange} className="ChangeButton">
						Change
					</button>
				)}
			</div>

			{loading && <p className="ScanLoading">Scanning...</p>}
			{error && <p className="ScanError">{error}</p>}

			{entries.length > 0 && (
				<table className="ModTable">
					<thead>
						<tr>
							<th>Name</th>
							<th>Type</th>
							<th>Size</th>
							<th>Actions</th>
						</tr>
					</thead>
					<tbody>
						{entries.map((entry) => (
							<tr
								key={`${entry.name}-${entry.deleted}`}
								className={entry.deleted ? "deleted-row" : ""}
								onMouseMove={(e) => handleMouseMove(e, entry)}
								onMouseLeave={handleMouseLeave}
							>
								<td>
									<span className="EntryIcon">{entry.is_dir ? "📁" : "📄"}</span>
									{entry.deleted ? (
										<span className="DeletedName">
											<s>{entry.name}</s>
										</span>
									) : (
										entry.name
									)}
								</td>
								<td>{entry.is_dir ? "Folder" : "File"}</td>
								<td>{entry.is_dir ? "—" : formatSize(entry.size)}</td>
								<td className="ActionsCell">
									{entry.deleted ? (
										<span className="ActionButtonGroup">
											<button
												className="ActionButton restore"
												onClick={() => handleRestore(entry.name)}
											>
												<span className="ActionShort">R</span>
												<span className="ActionFull">Restore</span>
											</button>
											<button
												className="ActionButton purge"
												onClick={() => handlePurge(entry.name)}
											>
												<span className="ActionShort">P</span>
												<span className="ActionFull">Purge</span>
											</button>
										</span>
									) : (
										<button
											className="ActionButton delete"
											onClick={() => handleDelete(entry.name)}
										>
											Delete
										</button>
									)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			)}

			{!error && entries.length === 0 && !loading && path && (
				<p className="ScanEmpty">No entries found.</p>
			)}

			{tooltip && (
				<ModTooltip
					entry={tooltip.entry}
					descriptions={descriptions}
					x={tooltip.x}
					y={tooltip.y}
				/>
			)}
		</div>
	);
};

export default ModPage;
