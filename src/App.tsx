import { HashRouter, Routes, Route, NavLink, Outlet, useOutletContext, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";
import "./components/Sidebar.css";
import logo from "/manaka-logo.png";
import StartPage from "./components/StartPage.tsx";
import ModPage from "./components/ModPage.tsx";
import ConfigPage from "./components/ConfigPage.tsx";
import ConfigEditor from "./components/ConfigEditor.tsx";
import ThemeToggle from "./components/ThemeToggle.tsx";
import TitleBar from "./components/TitleBar.tsx";
import RightPanel from "./components/RightPanel.tsx";
import BepInExPanel from "./components/BepInExPanel.tsx";

type SubDirUpdater = (key: string) => (sub: string) => void;
type RightPanelControl = {
	open: boolean;
	onToggle: () => void;
	openPanel: () => void;
	closePanel: () => void;
};

const Layout = () => {
	const [collapsed, setCollapsed] = useState(false);
	const [subDirMap, setSubDirMap] = useState<Record<string, string>>({});
	const [rightPanelOpen, setRightPanelOpen] = useState(false);
	const [bepinexInstalledVersion, setBepinexInstalledVersion] = useState<string | null>(null);
	const [bepinexBuilds, setBepinexBuilds] = useState<{ name: string; url: string; version: string; build_number: number }[]>([]);
	const [bepinexBuildsLoaded, setBepinexBuildsLoaded] = useState(false);
	const location = useLocation();

	// Auto-detect panel content based on current route
	const panelContent: "bepinex" | "none" = location.pathname === "/" ? "bepinex" : "none";

	// Fetch installed BepInEx version when panel opens with bepinex content
	useEffect(() => {
		if (rightPanelOpen && panelContent === "bepinex") {
			invoke<string | null>("get_installed_bepinex_version").then(v => {
				setBepinexInstalledVersion(v);
			});
		}
	}, [rightPanelOpen, panelContent]);

	// Fetch BepInEx builds once when panel first opens
	useEffect(() => {
		if (rightPanelOpen && panelContent === "bepinex" && !bepinexBuildsLoaded) {
			invoke<{ name: string; url: string; version: string; build_number: number }[]>("fetch_bepinex_builds").then(result => {
				setBepinexBuilds(result);
				setBepinexBuildsLoaded(true);
			}).catch(() => { });
		}
	}, [rightPanelOpen, panelContent, bepinexBuildsLoaded]);

	const rightPanelControl: RightPanelControl = {
		open: rightPanelOpen,
		onToggle: () => setRightPanelOpen(prev => !prev),
		openPanel: () => setRightPanelOpen(true),
		closePanel: () => setRightPanelOpen(false),
	};

	const updateSubDir = (key: string) => (sub: string) => {
		setSubDirMap(prev => ({ ...prev, [key]: sub }));
	};

	const truncateLabel = (base: string, sub: string, maxLen: number = 14): string => {
		if (!sub) return base;
		const full = `${base}(${sub})`;
		if (full.length <= maxLen) return full;
		const over = full.length - maxLen + 1;
		const truncatedSub = sub.length > over ? sub.slice(0, sub.length - over) + "\u2026" : sub;
		return `${base}(${truncatedSub})`;
	};

	return (
		<div className="AppContainer">
			<TitleBar
				leftSidebarCollapsed={collapsed}
				onLeftSidebarToggle={() => setCollapsed(!collapsed)}
				rightPanelOpen={rightPanelOpen}
				onRightPanelToggle={rightPanelControl.onToggle}
			/>
			<div className={`AppBody ${rightPanelOpen ? "right-panel-open" : ""}`}>
				<aside className={`Sidebar ${collapsed ? "collapsed" : ""}`}>
					<div className="SidebarInner">
						<div className="SidebarHeader">
							<img src={logo} alt="Logo" width="50" height="50" style={{ borderRadius: '50%' }} />
							<div className="SidebarTitleRow">
								<h3 className="SidebarTitle">Menu</h3>
								<ThemeToggle />
							</div>
						</div>

						<nav className="SidebarNav">
							<NavLink to="/" end className={({ isActive }) => `SidebarButton ${isActive ? 'active' : ''}`}>
								Start
							</NavLink>
							<NavLink to="/plugins" className={({ isActive }) => `SidebarButton ${isActive ? 'active' : ''}`}>
								{truncateLabel("Plugins", subDirMap["plugins"] || "")}
							</NavLink>
							<NavLink to="/v1" className={({ isActive }) => `SidebarButton ${isActive ? 'active' : ''}`}>
								{truncateLabel("CM V1", subDirMap["v1"] || "")}
							</NavLink>
							<NavLink to="/v2" className={({ isActive }) => `SidebarButton ${isActive ? 'active' : ''}`}>
								{truncateLabel("CM V2", subDirMap["v2"] || "")}
							</NavLink>
							<NavLink to="/config" className={({ isActive }) => `SidebarButton ${isActive ? 'active' : ''}`}>
								Config
							</NavLink>
						</nav>
					</div>
				</aside>

				<main className="MainContent">
					<Outlet context={{ updateSubDir, rightPanelControl }} />
				</main>

				<RightPanel open={rightPanelOpen} title={panelContent === "bepinex" ? "BepInEx" : "In development"}>
					{panelContent === "bepinex" && (
						<BepInExPanel
							installedVersion={bepinexInstalledVersion}
							builds={bepinexBuilds}
							onInstallComplete={() => {
								invoke<string | null>("get_installed_bepinex_version").then(v => {
									setBepinexInstalledVersion(v);
								});
							}}
							onRemoveComplete={() => {
								setBepinexInstalledVersion(null);
							}}
						/>
					)}
				</RightPanel>
			</div>
		</div>
	);
};

const PluginsPage = () => {
	const { updateSubDir } = useOutletContext<{ updateSubDir: SubDirUpdater }>();
	return <ModPage title="Plugins" defaultPath="./BepInEx/plugins" onSubDirChange={updateSubDir("plugins")} />;
};
const V1Page = () => {
	const { updateSubDir } = useOutletContext<{ updateSubDir: SubDirUpdater }>();
	return <ModPage title="CM V1" defaultPath="./CustomMissions" onSubDirChange={updateSubDir("v1")} />;
};
const V2Page = () => {
	const { updateSubDir } = useOutletContext<{ updateSubDir: SubDirUpdater }>();
	return <ModPage title="CM V2" defaultPath="./CustomMissions2" onSubDirChange={updateSubDir("v2")} />;
};

function App() {
	return (
		<HashRouter>
			<Routes>
				<Route path="/" element={<Layout />}>
					<Route index element={<StartPage />} />
					<Route path="plugins" element={<PluginsPage />} />
					<Route path="v1" element={<V1Page />} />
					<Route path="v2" element={<V2Page />} />
					<Route path="config" element={<ConfigPage />} />
				</Route>
				{/* Editor window: no sidebar, standalone layout */}
				<Route path="/config-editor" element={<ConfigEditor />} />
			</Routes>
		</HashRouter>
	);
}

export default App;
