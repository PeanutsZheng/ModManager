import React from "react";
import "./RightPanel.css";

interface RightPanelProps {
    /** Whether the panel is open */
    open: boolean;
    /** Panel title */
    title: string;
    /** Panel content */
    children: React.ReactNode;
}

const RightPanel = ({ open, title, children }: RightPanelProps) => {
    return (
        <aside className={`right-panel ${open ? "open" : ""}`}>
            <div className="right-panel-inner">
                <div className="right-panel-header">
                    <h3 className="right-panel-title">{title}</h3>
                </div>
                <div className="right-panel-content">
                    {children}
                </div>
            </div>
        </aside>
    );
};

export default RightPanel;
