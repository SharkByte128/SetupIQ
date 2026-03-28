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

      <nav className="border-t border-neutral-800 px-4 py-3 flex justify-around text-xs">
        {(["garage", "runs", "tracks", "scales", "timing"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`capitalize transition-colors ${
              tab === t ? "text-blue-400 font-medium" : "text-neutral-500 hover:text-neutral-300"
            }`}
          >
            {t}
          </button>
        ))}
      </nav>
      <InstallPrompt />
    </div>
  );
}

export default App;
