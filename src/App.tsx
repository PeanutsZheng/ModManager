import { HashRouter, Routes, Route, NavLink, Outlet, useOutletContext, useLocation } from "react-router-dom";
import { useState } from "react";
import "./App.css";
import "./components/Sidebar.css";
import logo from "/manaka-logo.png";
import StartPage from "./components/StartPage.tsx";
import ModPage from "./components/ModPage.tsx";
import ConfigPage from "./components/ConfigPage.tsx";
import ConfigEditor from "./components/ConfigEditor.tsx";
import ThemeToggle from "./components/ThemeToggle.tsx";
import TitleBar from "./components/TitleBar.tsx";
import DownloadPage from "./components/DownloadPage.tsx";

type SubDirUpdater = (key: string) => (sub: string) => void;

const Layout = () => {
	const [collapsed, setCollapsed] = useState(false);
	const [subDirMap, setSubDirMap] = useState<Record<string, string>>({});

	// Rescan counter: incremented when a resource is downloaded, so ModPage can re-scan
	const [rescanVersion, setRescanVersion] = useState(0);
	const triggerRescan = () => setRescanVersion(v => v + 1);

	const location = useLocation();
	const isDownloadPage = location.pathname === "/download";

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
			/>
			<div className="AppBody">
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
							<NavLink to="/download" className={({ isActive }) => `SidebarButton ${isActive ? 'active' : ''}`}>
								Download
							</NavLink>
							<NavLink to="/config" className={({ isActive }) => `SidebarButton ${isActive ? 'active' : ''}`}>
								Config
							</NavLink>
						</nav>
					</div>
				</aside>

				<main className="MainContent">
					<div className={`MainContentPage ${isDownloadPage ? "" : "hidden-page"}`}>
						<DownloadPage />
					</div>
					{!isDownloadPage && (
						<Outlet context={{ updateSubDir, rescanVersion, triggerRescan }} />
					)}
				</main>
			</div>
		</div>
	);
};

const PluginsPage = () => {
	const { updateSubDir, rescanVersion } = useOutletContext<{ updateSubDir: SubDirUpdater; rescanVersion: number }>();
	return <ModPage title="Plugins" defaultPath="./BepInEx/plugins" category="plugins" onSubDirChange={updateSubDir("plugins")} rescanVersion={rescanVersion} />;
};
const V1Page = () => {
	const { updateSubDir, rescanVersion } = useOutletContext<{ updateSubDir: SubDirUpdater; rescanVersion: number }>();
	return <ModPage title="CM V1" defaultPath="./CustomMissions" category="CustomMissions" onSubDirChange={updateSubDir("v1")} rescanVersion={rescanVersion} />;
};
const V2Page = () => {
	const { updateSubDir, rescanVersion } = useOutletContext<{ updateSubDir: SubDirUpdater; rescanVersion: number }>();
	return <ModPage title="CM V2" defaultPath="./CustomMissions2" category="CustomMissions2" onSubDirChange={updateSubDir("v2")} rescanVersion={rescanVersion} />;
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
					<Route path="download" element={<div />} />
					<Route path="config" element={<ConfigPage />} />
				</Route>
				{/* Editor window: no sidebar, standalone layout */}
				<Route path="/config-editor" element={<ConfigEditor />} />
			</Routes>
		</HashRouter>
	);
}

export default App;
