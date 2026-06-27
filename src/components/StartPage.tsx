import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import logo from "/manaka-logo.png";
import { PopUp, usePopUp } from "./PopUp";
import "./StartPage.css";

// Relative to the exe's directory
const GAME_EXE = "SecretFlasherManaka.exe";

import type { BepInExCheckResult } from "../types";

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

    const handleCheck = async () => {
        try {
            const result = await invoke<BepInExCheckResult>("check_bepinex");
            if (result.ok) {
                // All files present — try to get installed version from log
                const installedVersion = await invoke<string | null>("get_installed_bepinex_version");

                if (installedVersion) {
                    showPopUp(`BepInEx ${installedVersion} detected. Mod runtime environment is ready.`, 3000);
                } else {
                    // Version not detected from log — launch game silently to generate it
                    showPopUp("BepInEx files detected. Launching game to verify version...", 4000);

                    try {
                        await invoke("launch_game", { exeName: GAME_EXE });

                        // Wait a few seconds for BepInEx to write its log
                        await new Promise(resolve => setTimeout(resolve, 8000));

                        // Try reading version from log
                        const version = await invoke<string | null>("get_installed_bepinex_version");

                        if (version) {
                            showPopUp(`BepInEx ${version} confirmed. Mod runtime environment is ready.`, 3000);
                        } else {
                            showPopUp("BepInEx files found, but version could not be detected. The framework may need a first run.", 5000);
                        }

                        // Kill the game after version check
                        try {
                            await invoke("kill_game");
                        } catch {
                            // Ignore kill errors
                        }
                    } catch (e) {
                        showPopUp(`Failed to launch game for version check: ${String(e)}`);
                    }
                }
            } else {
                const missingList = result.missing.join(", ");
                showPopUp(
                    `Mod runtime environment abnormal! Missing: ${missingList}. Please go to Download page to install BepInEx.`,
                    5000
                );
            }
        } catch (e) {
            showPopUp(`Check failed: ${String(e)}`);
        }
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
