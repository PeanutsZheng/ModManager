import { BrowserRouter, Routes, Route, NavLink, Outlet } from "react-router-dom";
import { useState } from "react";
import "./App.css";
import logo from "/manaka-logo.png";
import StartPage from "./components/StartPage.tsx";
import ModPage from "./components/ModPage.tsx";
import ThemeToggle from "./components/ThemeToggle.tsx";

const Layout = () => {
	const [collapsed, setCollapsed] = useState(false);

	return (
		<div className="AppContainer">
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
							Plugins
						</NavLink>
						<NavLink to="/v1" className={({ isActive }) => `SidebarButton ${isActive ? 'active' : ''}`}>
							CM V1
						</NavLink>
						<NavLink to="/v2" className={({ isActive }) => `SidebarButton ${isActive ? 'active' : ''}`}>
							CM V2
						</NavLink>
					</nav>
				</div>
			</aside>

			<button
				className={`SidebarToggle ${collapsed ? "collapsed" : ""}`}
				onClick={() => setCollapsed(!collapsed)}
				title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
			>
				<span className="ToggleIcon">{collapsed ? "›" : "‹"}</span>
			</button>

			<main className="MainContent">
				<Outlet />
			</main>
		</div>
	);
};

const PluginsPage = () => <ModPage title="Plugins" defaultPath="./BepInEx/plugins" />;
const V1Page = () => <ModPage title="CM V1" defaultPath="./CustomMissions" />;
const V2Page = () => <ModPage title="CM V2" defaultPath="./CustomMissions2" />;

function App() {
	return (
		<BrowserRouter>
			<Routes>
				<Route path="/" element={<Layout />}>
					<Route index element={<StartPage />} />
					<Route path="plugins" element={<PluginsPage />} />
					<Route path="v1" element={<V1Page />} />
					<Route path="v2" element={<V2Page />} />
				</Route>
			</Routes>
		</BrowserRouter>
	);
}

export default App;
