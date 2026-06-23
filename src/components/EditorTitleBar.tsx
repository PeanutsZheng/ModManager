import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

const EditorTitleBar = () => {
    const appWindow = getCurrentWebviewWindow();
    const handleClose = () => appWindow.close();

    return (
        <div className="TitleBar" data-tauri-drag-region>
            <span className="TitleBarTitle" data-tauri-drag-region>Edit Config</span>
            <div className="TitleBarButtons">
                <button className="TitleBarBtn close" onClick={handleClose} title="Close">
                    &#x2715;
                </button>
            </div>
        </div>
    );
};

export default EditorTitleBar;
