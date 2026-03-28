import { useState, useEffect } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!deferredPrompt || dismissed) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 bg-neutral-900 border border-neutral-700 rounded-lg p-4 flex items-center gap-3 shadow-xl z-50">
      <div className="flex-1">
        <p className="text-sm font-medium text-neutral-200">Install SetupIQ</p>
        <p className="text-xs text-neutral-500">
          Add to home screen for quick access
        </p>
      </div>
      <button
        onClick={async () => {
          await deferredPrompt.prompt();
          setDeferredPrompt(null);
        }}
        className="text-xs px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-500"
      >
        Install
      </button>
      <button
        onClick={() => setDismissed(true)}
        className="text-xs text-neutral-500 hover:text-neutral-300"
      >
        ✕
      </button>
    </div>
  );
}
