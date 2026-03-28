function App() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col">
      <header className="border-b border-neutral-800 px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight">SetupIQ</h1>
        <span className="text-xs text-neutral-500">v0.1.0</span>
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="text-center space-y-4">
          <p className="text-3xl font-bold">Tune with intent.</p>
          <p className="text-neutral-400 text-sm max-w-md">
            RC car setup intelligence for 1:28 scale racing.
            Track setups, log runs, capture measurements, and get AI-powered recommendations.
          </p>
          <div className="pt-4">
            <span className="inline-block rounded-full bg-neutral-800 px-3 py-1 text-xs text-neutral-400">
              Phase 0 — Foundation
            </span>
          </div>
        </div>
      </main>

      <nav className="border-t border-neutral-800 px-4 py-3 flex justify-around text-xs text-neutral-500">
        <span>Setups</span>
        <span>Runs</span>
        <span>Scales</span>
        <span>Timing</span>
      </nav>
    </div>
  );
}

export default App;
