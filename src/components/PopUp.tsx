import { useState, useCallback } from "react";

interface PopupMessage {
    id: number;
    message: string;
    visible: boolean;
}

interface PopUpProps {
    messages: PopupMessage[];
    onRemove: (id: number) => void;
}

const PopUp = ({ messages, onRemove }: PopUpProps) => {
    if (messages.length === 0) return null;

    return (
        <div className="popup-container">
            {messages.map((item) => (
                <div
                    key={item.id}
                    className={`popup-message-item${item.visible ? " show" : ""}`}
                >
                    <span className="popup-close" onClick={() => onRemove(item.id)}>
                        &times;
                    </span>
                    <div className="popup-message-text">{item.message}</div>
                </div>
            ))}
        </div>
    );
};

const usePopUp = () => {
    const [messages, setMessages] = useState<PopupMessage[]>([]);

    const removeMessage = useCallback((id: number) => {
        setMessages((prev) => {
            const msg = prev.find((m) => m.id === id);
            if (!msg) return prev;

            // 先触发 fade-out
            const updated = prev.map((m) =>
                m.id === id ? { ...m, visible: false } : m
            );

            // 300ms 后真正移除
            setTimeout(() => {
                setMessages((curr) => curr.filter((m) => m.id !== id));
            }, 300);

            return updated;
        });
    }, []);

    const showPopUp = useCallback(
        (message: string, duration: number = 2500) => {
            const id = Date.now() + Math.random();

            setMessages((prev) => {
                // 最多 3 条，超出则移除最早的
                let next = [...prev];
                if (next.length >= 3) {
                    const oldest = next[0];
                    removeMessage(oldest.id);
                    next = next.slice(1);
                }
                return [...next, { id, message, visible: false }];
            });

            // 下一帧触发入场动画
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    setMessages((prev) =>
                        prev.map((m) =>
                            m.id === id ? { ...m, visible: true } : m
                        )
                    );
                });
            });

            // 自动消失
            if (duration > 0) {
                setTimeout(() => removeMessage(id), duration);
            }
        },
        [removeMessage]
    );

    return { messages, showPopUp, removeMessage };
};

export { PopUp, usePopUp };
export type { PopupMessage };
