import { useState } from "react";
import { SyncIndicator } from "./components/SyncIndicator.js";
import { UserMenu } from "./components/UserMenu.js";
import { SettingsPage } from "./components/SettingsPage.js";
import { GaragePage } from "./components/GaragePage.js";
import { RunsPage } from "./components/RunsPage.js";
import { TimingPage } from "./components/TimingPage.js";
import { TracksPage } from "./components/TracksPage.js";
import { ResourcesPage } from "./components/ResourcesPage.js";
import { InstallPrompt } from "./components/InstallPrompt.js";

type Tab = "garage" | "runs" | "timing" | "tracks" | "resources";

const iconProps = { width: 18, height: 18, fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

function TabIcon({ name }: { name: Tab }) {
  switch (name) {
    case "garage":
      return (<svg {...iconProps} viewBox="0 0 24 24"><path d="M3 21V9l9-6 9 6v12H3z" /><rect x="9" y="13" width="6" height="8" rx="1" /></svg>);
    case "runs":
      return (<svg {...iconProps} viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>);
    case "tracks":
      return (<svg {...iconProps} viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" /></svg>);
    case "timing":
      return (<svg {...iconProps} viewBox="0 0 24 24"><circle cx="12" cy="13" r="9" /><polyline points="12 9 12 13 15 16" /><path d="M12 4V2" /><path d="M16.2 4.8l1-1.4" /></svg>);
    case "resources":
      return (<svg {...iconProps} viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /><line x1="12" y1="6" x2="12" y2="14" /><line x1="8" y1="10" x2="16" y2="10" /></svg>);
  }
}

function App() {
  const [tab, setTab] = useState<Tab>("garage");
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div className="h-dvh bg-neutral-950 text-neutral-100 flex flex-col overflow-hidden">
      <header className="shrink-0 border-b border-neutral-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => { setTab("garage"); setShowSettings(false); }} className="text-lg font-semibold tracking-tight hover:text-blue-400 transition-colors">SetupIQ</button>
          <SyncIndicator />
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowSettings(true)}
            className="text-neutral-500 hover:text-neutral-300 transition-colors"
            aria-label="Settings"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          <UserMenu />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto scrollbar-hide">
        {showSettings ? (
          <SettingsPage onClose={() => setShowSettings(false)} />
        ) : (
          <>
            {tab === "garage" && <GaragePage />}
            {tab === "runs" && <RunsPage />}
            {tab === "timing" && <TimingPage />}
            {tab === "tracks" && <TracksPage />}
            {tab === "resources" && <ResourcesPage />}
          </>
        )}
      </main>

      <nav className="shrink-0 border-t border-neutral-800 px-2 py-2 flex justify-around text-xs">
        {(["garage", "runs", "tracks", "timing", "resources"] as const).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setShowSettings(false); }}
            className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg capitalize transition-colors ${
              tab === t ? "text-blue-400 font-medium" : "text-neutral-500 hover:text-neutral-300"
            }`}
          >
            <TabIcon name={t} />
            {t}
          </button>
        ))}
      </nav>
      <InstallPrompt />
    </div>
  );
}

export default App;
