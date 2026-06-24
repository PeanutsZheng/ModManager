import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import logo from "/manaka-logo.png";
import { PopUp, usePopUp } from "./PopUp";

// Relative to the exe's directory
const GAME_EXE = "SecretFlasherManaka.exe";

const StartPage = () => {
    const [launching, setLaunching] = useState(false);
    const { messages, showPopUp, removeMessage } = usePopUp();

    const handleStart = async () => {
        setLaunching(true);
        try {
            await invoke("launch_game", { exeName: GAME_EXE });
        } catch (e) {
            showPopUp(String(e));
        } finally {
            setLaunching(false);
        }
    };

    // TODO: Implement environment check (e.g. game files, dependencies)
    const handleCheck = async () => {
        showPopUp("Checking the game's runtime environment...");
        return "Unimplemented"
    };

    return (
        <div className="StartPage">
            <img src={logo} alt="Manaka Logo" width="200" height="200" />
            <div className="StartPageButtonGroup">
                <button onClick={handleCheck}>Check</button>
                <button onClick={handleStart} disabled={launching}>
                    {launching ? "Launching..." : "Start"}
                </button>
            </div>
            <PopUp messages={messages} onRemove={removeMessage} />
        </div>
    );
};

export default StartPage;
