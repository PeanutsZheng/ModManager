import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import "./TitleBar.css";

const appWindow = getCurrentWebviewWindow();

interface TitleBarProps {
    leftSidebarCollapsed?: boolean;
    onLeftSidebarToggle?: () => void;
    rightPanelOpen?: boolean;
    onRightPanelToggle?: () => void;
}

const TitleBar = ({
    leftSidebarCollapsed,
    onLeftSidebarToggle,
    rightPanelOpen,
    onRightPanelToggle,
}: TitleBarProps) => {
    const handleMinimize = () => appWindow.minimize();
    const handleClose = () => appWindow.close();

    return (
        <div className="TitleBar" data-tauri-drag-region>
            <div className="TitleBarLeft">
                {onLeftSidebarToggle && (
                    <button
                        className={`TitleBarBtn sidebar-toggle-btn ${leftSidebarCollapsed ? "collapsed" : ""}`}
                        onClick={onLeftSidebarToggle}
                        title={leftSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                    >
                        <span className="ToggleIcon">{leftSidebarCollapsed ? "›" : "‹"}</span>
                    </button>
                )}
                <span className="TitleBarTitle" data-tauri-drag-region>Mod Manager</span>
            </div>
            <div className="TitleBarButtons">
                {onRightPanelToggle && (
                    <button
                        className={`TitleBarBtn panel-toggle-btn ${rightPanelOpen ? "active" : ""}`}
                        onClick={onRightPanelToggle}
                        title={rightPanelOpen ? "Close panel" : "Open panel"}
                    >
                        <span className="ToggleIcon">{rightPanelOpen ? "›" : "‹"}</span>
                    </button>
                )}
                <button className="TitleBarBtn minimize" onClick={handleMinimize} title="Minimize">
                    &#x2014;
                </button>
                <button className="TitleBarBtn close" onClick={handleClose} title="Close">
                    &#x2715;
                </button>
            </div>
        </div>
    );
};

export default TitleBar;
