import { AppMode } from "../models/AppMode.js";

export default function ModeSwitch({ mode, onSwitchMode }) {
  return (
    <div className="mode-switch" role="tablist" aria-label="Tryb aplikacji">
      <button
        type="button"
        role="tab"
        aria-selected={mode === AppMode.BUILD}
        className={`mode-switch__btn ${mode === AppMode.BUILD ? "is-active" : ""}`}
        onClick={() => onSwitchMode(AppMode.BUILD)}
      >
        Buduj
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === AppMode.SIMULATE}
        className={`mode-switch__btn ${mode === AppMode.SIMULATE ? "is-active" : ""}`}
        onClick={() => onSwitchMode(AppMode.SIMULATE)}
      >
        Symuluj
      </button>
    </div>
  );
}
