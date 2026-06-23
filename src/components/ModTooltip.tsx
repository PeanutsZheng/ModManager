import { useRef, useLayoutEffect, useState } from "react";
import { getModDescription, type ModDescription } from "../utils/utils";

interface ModEntry {
    name: string;
    is_dir: boolean;
    size: number;
    deleted: boolean;
    deleted_at: number | null;
}

interface ModTooltipProps {
    entry: ModEntry;
    descriptions: Record<string, ModDescription>;
    x: number;
    y: number;
}

const ModTooltip = ({ entry, descriptions, x, y }: ModTooltipProps) => {
    const ref = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

    useLayoutEffect(() => {
        if (!ref.current) return;
        const rect = ref.current.getBoundingClientRect();
        const pad = 12;
        const vh = window.innerHeight;
        const vw = window.innerWidth;

        let left = x + pad;
        let top = y + pad;

        // If right side overflows, flip to left
        if (left + rect.width > vw - pad) {
            left = x - rect.width - pad;
        }
        // If bottom overflows, flip to top
        if (top + rect.height > vh - pad) {
            top = y - rect.height - pad;
        }

        // Ensure it doesn't go beyond the left/top boundaries
        if (left < pad) left = pad;
        if (top < pad) top = pad;

        setPos({ left, top });
    }, [x, y]);

    const desc = getModDescription(descriptions, entry.name);

    return (
        <div
            ref={ref}
            className="ModTooltip"
            style={
                pos
                    ? { left: pos.left, top: pos.top }
                    : { left: x + 12, top: y + 12, visibility: "hidden" }
            }
        >
            <div className="ModTooltipName">{entry.name}</div>
            <div className="ModTooltipStatus">
                {entry.deleted ? (
                    <span className="ModTooltipDeleted">deleted</span>
                ) : (
                    "active"
                )}
            </div>
            <div className="ModTooltipDesc">
                {desc || "No description available."}
            </div>
        </div>
    );
};

export default ModTooltip;
