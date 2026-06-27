import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ModEntry, ModDescriptions } from "../types";
import { loadDescriptions, loadSavedPath, savePath, formatSize } from "../utils/utils";
import ModTooltip from "./ModTooltip.tsx";
import "./ModPage.css";

interface ModPageProps {
	title: string;
	defaultPath: string;
	category?: string;
	onSubDirChange?: (sub: string) => void;
	rescanVersion?: number;
}

const ModPage = ({ title, defaultPath, category, onSubDirChange, rescanVersion }: ModPageProps) => {
	const savedPath = loadSavedPath(title, defaultPath);

	// baseDir: the user's chosen root path (can be changed via "Change" button).
	// Starts from savedPath or defaultPath, updates when user confirms a new path.
	const [baseDir, setBaseDir] = useState(savedPath);
	const [subDirs, setSubDirs] = useState<string[]>([]);
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(savedPath);
	const [entries, setEntries] = useState<ModEntry[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [descriptions, setDescriptions] = useState<ModDescriptions>({});

	// Tooltip state
	const [tooltip, setTooltip] = useState<{
		entry: ModEntry;
		x: number;
		y: number;
	} | null>(null);

	// Current full scan path — always computed from baseDir + subDirs
	const currentPath = subDirs.length > 0
		? `${baseDir}/${subDirs.join("/")}`
		: baseDir;

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

	// Notify parent of sub-directory change (and clear on unmount)
	useEffect(() => {
		if (onSubDirChange) {
			onSubDirChange(subDirs.length > 0 ? subDirs[subDirs.length - 1] : "");
		}
		return () => {
			if (onSubDirChange) {
				onSubDirChange("");
			}
		};
	}, [subDirs]);

	useEffect(() => {
		loadDescriptions().then(setDescriptions);
		if (savedPath) scan(savedPath);
	}, []);

	// Re-scan when a resource download completes (rescanVersion increments)
	useEffect(() => {
		if (rescanVersion && rescanVersion > 0) {
			scan(currentPath);
		}
	}, [rescanVersion]);

	// Navigate into a sub-directory
	const navigateInto = (folderName: string) => {
		const newSubDirs = [...subDirs, folderName];
		setSubDirs(newSubDirs);
		const newPath = `${baseDir}/${newSubDirs.join("/")}`;
		scan(newPath);
	};

	// Navigate up one level
	const navigateUp = () => {
		const newSubDirs = subDirs.slice(0, -1);
		setSubDirs(newSubDirs);
		const newPath = newSubDirs.length > 0
			? `${baseDir}/${newSubDirs.join("/")}`
			: baseDir;
		scan(newPath);
	};

	const handleChange = () => {
		setDraft(currentPath);
		setEditing(true);
	};

	const handleConfirm = () => {
		const trimmed = draft.trim();
		if (trimmed && trimmed !== currentPath) {
			// When user manually changes path, it becomes the new baseDir
			setBaseDir(trimmed);
			setSubDirs([]);
			savePath(title, trimmed);
			scan(trimmed);
		}
		setEditing(false);
	};

	const handleCancel = () => {
		setDraft(currentPath);
		setEditing(false);
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter") handleConfirm();
		if (e.key === "Escape") handleCancel();
	};

	const handleDelete = async (name: string) => {
		try {
			await invoke("delete_mod", { basePath: currentPath, name });
			await scan(currentPath);
		} catch (e) {
			setError(String(e));
		}
	};

	const handleRestore = async (name: string) => {
		try {
			await invoke("restore_mod", { basePath: currentPath, name });
			await scan(currentPath);
		} catch (e) {
			setError(String(e));
		}
	};

	const handlePurge = async (name: string) => {
		try {
			await invoke("purge_mod", { basePath: currentPath, name });
			await scan(currentPath);
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


	const truncatePath = (parts: string[], maxLen: number = 28): string => {
		const full = parts.join(" / ");
		if (full.length <= maxLen) return full;
		if (parts.length <= 2) return full.length > maxLen ? full.slice(0, maxLen - 3) + "..." : full;
		// Keep first and last, truncate middle
		const first = parts[0];
		const last = parts[parts.length - 1];
		const sep = " / ... / ";
		const budget = maxLen - sep.length;
		const half = Math.max(1, Math.floor(budget / 2));
		const firstPart = first.length > half ? first.slice(0, half) : first;
		const lastPart = last.length > (budget - firstPart.length) ? last.slice(-(budget - firstPart.length)) : last;
		return firstPart + sep + lastPart;
	};

	return (
		<div className="ModPageContent">
			<div className="ModPageHeader">
				<h2 className="ModPageTitle" title={subDirs.length > 0 ? `${title} / ${subDirs.join(" / ")}` : title}>{truncatePath(subDirs.length > 0 ? [title, ...subDirs] : [title])}</h2>
				{subDirs.length > 0 && (
					<button className="NavigateUpButton" onClick={navigateUp}>
						↑ Back
					</button>
				)}
			</div>

			<div className="ScanBar">
				<input
					type="text"
					value={editing ? draft : currentPath}
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
								key={entry.name}
								className={`${entry.deleted ? "deleted-row" : ""} ${entry.is_dir && !entry.deleted ? "folder-row" : ""}`}
								onMouseMove={(e) => handleMouseMove(e, entry)}
								onMouseLeave={handleMouseLeave}
								onClick={entry.is_dir && !entry.deleted ? () => navigateInto(entry.name) : undefined}
							>
								<td>
									<span className="EntryIcon">{entry.is_dir ? "📁" : "📄"}</span>
									{entry.deleted ? (
										<span className="DeletedName">
											<s>{entry.name}</s>
										</span>
									) : entry.is_dir ? (
										<span className="FolderName">{entry.name}</span>
									) : (
										entry.name
									)}
								</td>
								<td>{entry.is_dir ? "Folder" : "File"}</td>
								<td>{entry.is_dir ? "\u2014" : formatSize(entry.size)}</td>
								<td className="ActionsCell">
									{entry.deleted ? (
										<span className="ActionButtonGroup">
											<button
												className="ActionButton restore"
												onClick={(e) => { e.stopPropagation(); handleRestore(entry.name); }}
											>
												<span className="ActionShort">R</span>
												<span className="ActionFull">Restore</span>
											</button>
											<button
												className="ActionButton purge"
												onClick={(e) => { e.stopPropagation(); handlePurge(entry.name); }}
											>
												<span className="ActionShort">P</span>
												<span className="ActionFull">Purge</span>
											</button>
										</span>
									) : (
										<button
											className="ActionButton delete"
											onClick={(e) => { e.stopPropagation(); handleDelete(entry.name); }}
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

			{!error && entries.length === 0 && !loading && baseDir && (
				<p className="ScanEmpty">No entries found.</p>
			)}

			{tooltip && (
				<ModTooltip
					entry={tooltip.entry}
					descriptions={descriptions}
					category={category}
					x={tooltip.x}
					y={tooltip.y}
				/>
			)}
		</div>
	);
};

export default ModPage;
