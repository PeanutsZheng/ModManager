import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

const appWindow = getCurrentWebviewWindow();

const TitleBar = () => {
    const handleMinimize = () => appWindow.minimize();
    const handleClose = () => appWindow.close();

    return (
        <div className="TitleBar" data-tauri-drag-region>
            <span className="TitleBarTitle" data-tauri-drag-region>Mod Manager</span>
            <div className="TitleBarButtons">
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
