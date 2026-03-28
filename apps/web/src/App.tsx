import { useState } from "react";
import { SyncIndicator } from "./components/SyncIndicator.js";
import { UserMenu } from "./components/UserMenu.js";
import { GaragePage } from "./components/GaragePage.js";
import { RunsPage } from "./components/RunsPage.js";
import { ScalesPage } from "./components/ScalesPage.js";
import { TimingPage } from "./components/TimingPage.js";
import { TracksPage } from "./components/TracksPage.js";
import { InstallPrompt } from "./components/InstallPrompt.js";

type Tab = "garage" | "runs" | "scales" | "timing" | "tracks";

const iconProps = { width: 18, height: 18, fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

function TabIcon({ name }: { name: Tab }) {
  switch (name) {
    case "garage":
      return (<svg {...iconProps} viewBox="0 0 24 24"><path d="M3 21V9l9-6 9 6v12H3z" /><rect x="9" y="13" width="6" height="8" rx="1" /></svg>);
    case "runs":
      return (<svg {...iconProps} viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>);
    case "tracks":
      return (<svg {...iconProps} viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" /></svg>);
    case "scales":
      return (<svg {...iconProps} viewBox="0 0 24 24"><path d="M12 3v18" /><path d="M4 7l8-4 8 4" /><path d="M4 7l-1 7h6L8 7" /><path d="M20 7l-1 7h-6l-1-7" /></svg>);
    case "timing":
      return (<svg {...iconProps} viewBox="0 0 24 24"><circle cx="12" cy="13" r="9" /><polyline points="12 9 12 13 15 16" /><path d="M12 4V2" /><path d="M16.2 4.8l1-1.4" /></svg>);
  }
}

function App() {
  const [tab, setTab] = useState<Tab>("garage");

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col">
      <header className="border-b border-neutral-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold tracking-tight">SetupIQ</h1>
          <SyncIndicator />
        </div>
        <UserMenu />
      </header>

      <main className="flex-1 overflow-y-auto">
        {tab === "garage" && <GaragePage />}
        {tab === "runs" && <RunsPage />}
        {tab === "scales" && <ScalesPage />}
        {tab === "timing" && <TimingPage />}
        {tab === "tracks" && <TracksPage />}
      </main>

      <nav className="border-t border-neutral-800 px-2 py-2 flex justify-around text-xs">
        {(["garage", "runs", "tracks", "scales", "timing"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
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
