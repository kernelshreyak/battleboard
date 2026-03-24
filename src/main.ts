import "./style.css";
import { createBattleboardApp } from "./game/app";

const root = document.querySelector<HTMLDivElement>("#app");

if (!root) {
  throw new Error("App root not found.");
}

await createBattleboardApp(root);
