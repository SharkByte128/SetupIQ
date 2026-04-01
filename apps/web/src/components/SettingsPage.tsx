import { useState, useEffect } from "react";
import { localDb } from "../db/local-db.js";
import { useShowHiddenRuns } from "../hooks/use-demo-filter.js";
import { RacersManager } from "./RacersManager.js";
import { loadSyncConfig, markAllDirty, performSync, startAutoSync, clearSyncConfig, stopAutoSync, wipeAndResync } from "../sync/engine.js";

export function SettingsPage({ onClose }: { onClose: () => void }) {
  const [geminiKey, setGeminiKey] = useState("");
  const [saved, setSaved] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [hideDemoData, setHideDemoData] = useState(false);
  const [showHidden, setShowHidden] = useShowHiddenRuns();

  // Server sync state
  const [serverUrl, setServerUrl] = useState("");
  const [syncUsername, setSyncUsername] = useState("");
  const [syncApiToken, setSyncApiToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"idle" | "connecting" | "connected" | "registering" | "error">("idle");
  const [syncMessage, setSyncMessage] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [generatedToken, setGeneratedToken] = useState("");

  useEffect(() => {
    localDb.syncMeta.get("gemini_api_key").then((row) => {
      if (row?.value) setGeminiKey(row.value);
    });

    localDb.syncMeta.get("hide_demo_data").then((row) => {
      if (row?.value === "true") setHideDemoData(true);
    });

    // Load existing sync config
    Promise.all([
      localDb.syncMeta.get("sync_server_url"),
      localDb.syncMeta.get("sync_username"),
      localDb.syncMeta.get("sync_api_token"),
      localDb.syncMeta.get("sync_jwt"),
    ]).then(([url, user, token, jwt]) => {
      if (url?.value) setServerUrl(url.value);
      if (user?.value) setSyncUsername(user.value);
      if (token?.value) setSyncApiToken(token.value);
      if (url?.value && jwt?.value) {
        setIsConnected(true);
        setSyncStatus("connected");
      }
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

  const handleToggleDemoData = async () => {
    const next = !hideDemoData;
    setHideDemoData(next);
    await localDb.syncMeta.put({ key: "hide_demo_data", value: next ? "true" : "false" });
  };

  const handleRegister = async () => {
    if (!serverUrl.trim() || !syncUsername.trim()) return;
    setSyncStatus("registering");
    setSyncMessage("");
    setGeneratedToken("");

    try {
      const res = await fetch(`${serverUrl.trim().replace(/\/$/, "")}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: syncUsername.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSyncStatus("error");
        setSyncMessage(data.error || "Registration failed");
        return;
      }
      // Show the generated token for the user to save
      setGeneratedToken(data.apiToken);
      setSyncApiToken(data.apiToken);
      setSyncMessage("Account created! Save your API token, then tap Connect.");
      setSyncStatus("idle");
    } catch (err) {
      setSyncStatus("error");
      setSyncMessage("Could not reach server");
    }
  };

  const handleConnect = async () => {
    if (!serverUrl.trim() || !syncUsername.trim() || !syncApiToken.trim()) return;
    setSyncStatus("connecting");
    setSyncMessage("");

    const cleanUrl = serverUrl.trim().replace(/\/$/, "");

    try {
      const res = await fetch(`${cleanUrl}/auth/token-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: syncUsername.trim(), apiToken: syncApiToken.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSyncStatus("error");
        setSyncMessage(data.error || "Login failed");
        return;
      }

      // Store sync config
      await localDb.syncMeta.put({ key: "sync_server_url", value: cleanUrl });
      await localDb.syncMeta.put({ key: "sync_username", value: syncUsername.trim().toLowerCase() });
      await localDb.syncMeta.put({ key: "sync_api_token", value: syncApiToken.trim() });
      await localDb.syncMeta.put({ key: "sync_jwt", value: data.token });

      // Load config into sync engine
      await loadSyncConfig();

      // Mark all local records dirty for initial full push
      await markAllDirty();
      await localDb.syncMeta.delete("lastSyncTime");

      // Start sync
      startAutoSync();
      await performSync();

      setIsConnected(true);
      setSyncStatus("connected");
      setSyncMessage("Connected and syncing!");
      setGeneratedToken("");
    } catch (err) {
      setSyncStatus("error");
      setSyncMessage("Could not reach server");
    }
  };

  const handleDisconnect = async () => {
    stopAutoSync();
    clearSyncConfig();
    await localDb.syncMeta.delete("sync_server_url");
    await localDb.syncMeta.delete("sync_username");
    await localDb.syncMeta.delete("sync_api_token");
    await localDb.syncMeta.delete("sync_jwt");
    await localDb.syncMeta.delete("lastSyncTime");

    setIsConnected(false);
    setSyncStatus("idle");
    setSyncMessage("");
    setGeneratedToken("");
  };

  const inputClass =
    "w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-blue-500 font-mono";

  return (
    <div className="px-4 py-4 space-y-4">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">Settings</h2>
        <button
          onClick={onClose}
          className="text-sm text-blue-400 hover:text-blue-300"
        >
          Done
        </button>
      </div>

      {/* Racers Section */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
        <RacersManager />
      </div>

      {/* Demo Data Toggle */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">🏗️</span>
            <div>
              <h3 className="font-medium text-sm">Hide Demo Data</h3>
              <p className="text-xs text-neutral-500">
                Hide built-in cars, sample setups, tracks &amp; sessions
              </p>
            </div>
          </div>
          <button
            onClick={handleToggleDemoData}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              hideDemoData ? "bg-blue-600" : "bg-neutral-700"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                hideDemoData ? "translate-x-5" : ""
              }`}
            />
          </button>
        </div>
      </div>

      {/* Show Hidden Runs Toggle */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">👁️</span>
            <div>
              <h3 className="font-medium text-sm">Show Hidden Runs</h3>
              <p className="text-xs text-neutral-500">
                Show NLT race results that were marked as ignored
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowHidden(!showHidden)}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              showHidden ? "bg-blue-600" : "bg-neutral-700"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                showHidden ? "translate-x-5" : ""
              }`}
            />
          </button>
        </div>
      </div>

      {/* Server Sync Section */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">☁️</span>
          <div>
            <h3 className="font-medium text-sm">Server Sync</h3>
            <p className="text-xs text-neutral-500">
              Sync data across devices with username + API token
            </p>
          </div>
          {isConnected && (
            <span className="ml-auto inline-flex items-center gap-1 text-xs text-green-400">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              Connected
            </span>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs text-neutral-400 mb-1 block">Server URL</label>
            <input
              type="url"
              className={inputClass}
              placeholder="https://dev.setupiq.app"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              disabled={isConnected}
            />
          </div>

          <div>
            <label className="text-xs text-neutral-400 mb-1 block">Username</label>
            <input
              type="text"
              className={inputClass}
              placeholder="your-username"
              value={syncUsername}
              onChange={(e) => setSyncUsername(e.target.value)}
              disabled={isConnected}
            />
          </div>

          <div>
            <label className="text-xs text-neutral-400 mb-1 block">API Token</label>
            <div className="flex gap-2">
              <input
                type={showToken ? "text" : "password"}
                className={inputClass}
                placeholder="Paste your API token..."
                value={syncApiToken}
                onChange={(e) => setSyncApiToken(e.target.value)}
                disabled={isConnected}
              />
              <button
                onClick={() => setShowToken(!showToken)}
                className="text-xs text-neutral-400 hover:text-neutral-200 whitespace-nowrap px-2"
              >
                {showToken ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {generatedToken && (
            <div className="bg-neutral-800 border border-green-800 rounded-lg p-3">
              <p className="text-xs text-green-400 mb-1 font-medium">Your API Token (save this!):</p>
              <p className="text-xs text-neutral-200 font-mono break-all select-all">{generatedToken}</p>
              <button
                onClick={() => navigator.clipboard.writeText(generatedToken)}
                className="mt-2 text-xs text-blue-400 hover:text-blue-300"
              >
                Copy to clipboard
              </button>
            </div>
          )}

          {syncMessage && (
            <p className={`text-xs ${syncStatus === "error" ? "text-red-400" : "text-green-400"}`}>
              {syncMessage}
            </p>
          )}

          {!isConnected ? (
            <div className="flex gap-2">
              <button
                onClick={handleConnect}
                disabled={!serverUrl.trim() || !syncUsername.trim() || !syncApiToken.trim() || syncStatus === "connecting"}
                className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-700 disabled:text-neutral-500 text-white text-sm font-medium py-2 rounded-lg transition-colors"
              >
                {syncStatus === "connecting" ? "Connecting…" : "Connect"}
              </button>
              <button
                onClick={handleRegister}
                disabled={!serverUrl.trim() || !syncUsername.trim() || syncStatus === "registering"}
                className="px-4 py-2 bg-neutral-700 hover:bg-neutral-600 disabled:bg-neutral-800 disabled:text-neutral-500 text-neutral-200 text-sm font-medium rounded-lg transition-colors"
              >
                {syncStatus === "registering" ? "Creating…" : "Register"}
              </button>
            </div>
          ) : (
            <button
              onClick={handleDisconnect}
              className="w-full py-2 text-sm text-red-400 hover:text-red-300 border border-neutral-700 rounded-lg transition-colors"
            >
              Disconnect
            </button>
          )}
        </div>
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

        {isConnected && (
          <p className="text-xs text-green-400 mb-3">
            Using server's Gemini API key. Local key below is optional (used as fallback).
          </p>
        )}

        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs text-neutral-400 mb-1 block">
              API Key {isConnected ? "(optional fallback)" : ""}
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
              {isConnected
                ? "Optional — the server provides its own key. This is only used if the server key is missing."
                : <>Get a key at{" "}
                  <a
                    href="https://aistudio.google.com/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300"
                  >
                    aistudio.google.com/apikey
                  </a>
                  . Stored locally on this device only.</>
              }
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

      {/* Force Refresh */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">🔄</span>
          <div>
            <h3 className="font-medium text-sm">App Update</h3>
            <p className="text-xs text-neutral-500">
              Force the app to check for new code and reload
            </p>
          </div>
        </div>
        <button
          onClick={async () => {
            if ("serviceWorker" in navigator) {
              const registrations = await navigator.serviceWorker.getRegistrations();
              await Promise.all(registrations.map((r) => r.unregister()));
            }
            if ("caches" in window) {
              const names = await caches.keys();
              await Promise.all(names.map((n) => caches.delete(n)));
            }
            window.location.reload();
          }}
          className="w-full py-2 text-sm font-medium text-white bg-neutral-700 hover:bg-neutral-600 rounded-lg transition-colors"
        >
          Force Refresh
        </button>
      </div>

      {/* Wipe & Re-sync */}
      {isConnected && (
        <div className="bg-neutral-900 border border-red-900/50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">⚠️</span>
            <div>
              <h3 className="font-medium text-sm text-red-400">Wipe &amp; Re-sync from Server</h3>
              <p className="text-xs text-neutral-500">
                Delete all local data on this device and re-download from the server. Use when this device is out of sync.
              </p>
            </div>
          </div>
          <button
            onClick={async () => {
              if (!confirm("This will delete ALL local data on this device and replace it with the server copy. Continue?")) return;
              try {
                await wipeAndResync();
                alert("Re-sync complete! All data refreshed from server.");
              } catch (err) {
                alert("Re-sync failed: " + (err instanceof Error ? err.message : "Unknown error"));
              }
            }}
            className="w-full py-2 text-sm font-medium text-white bg-red-700 hover:bg-red-600 rounded-lg transition-colors"
          >
            Wipe &amp; Re-sync
          </button>
        </div>
      )}

      <p className="text-[11px] text-neutral-600 mt-4 text-center">
        {isConnected
          ? "AI calls are proxied through the server. No local API key needed."
          : "Your API key never leaves this device — all AI calls are made directly from your browser."
        }
      </p>
    </div>
  );
}
