import { useState, useEffect } from "react";
import { localDb } from "../db/local-db.js";

export function SettingsPage({ onClose }: { onClose: () => void }) {
  const [geminiKey, setGeminiKey] = useState("");
  const [saved, setSaved] = useState(false);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    localDb.syncMeta.get("gemini_api_key").then((row) => {
      if (row?.value) setGeminiKey(row.value);
    });
  }, []);

  const handleSave = async () => {
    await localDb.syncMeta.put({
      key: "gemini_api_key",
      value: geminiKey.trim(),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleClear = async () => {
    await localDb.syncMeta.delete("gemini_api_key");
    setGeminiKey("");
  };

  const inputClass =
    "w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-blue-500 font-mono";

  return (
    <div className="px-4 py-4">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">Settings</h2>
        <button
          onClick={onClose}
          className="text-sm text-blue-400 hover:text-blue-300"
        >
          Done
        </button>
      </div>

      {/* Gemini AI Section */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">✨</span>
          <div>
            <h3 className="font-medium text-sm">Gemini AI</h3>
            <p className="text-xs text-neutral-500">
              Autocomplete part details from SKU / part numbers
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs text-neutral-400 mb-1 block">
              API Key
            </label>
            <div className="flex gap-2">
              <input
                type={showKey ? "text" : "password"}
                className={inputClass}
                placeholder="AIza..."
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className="text-xs text-neutral-400 hover:text-neutral-200 whitespace-nowrap px-2"
              >
                {showKey ? "Hide" : "Show"}
              </button>
            </div>
            <p className="text-[11px] text-neutral-600 mt-1">
              Get a key at{" "}
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300"
              >
                aistudio.google.com/apikey
              </a>
              . Stored locally on this device only.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={!geminiKey.trim()}
              className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-700 disabled:text-neutral-500 text-white text-sm font-medium py-2 rounded-lg transition-colors"
            >
              {saved ? "✓ Saved" : "Save Key"}
            </button>
            {geminiKey && (
              <button
                onClick={handleClear}
                className="px-3 py-2 text-sm text-red-400 hover:text-red-300 transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      <p className="text-[11px] text-neutral-600 mt-4 text-center">
        Your API key never leaves this device — all AI calls are made directly from your browser.
      </p>
    </div>
  );
}
