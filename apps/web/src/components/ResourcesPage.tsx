export function ResourcesPage() {
  const resources = [
    {
      name: "PlayRC — Track Builder",
      url: "https://playrc.app/",
      description: "Create and edit RC track layouts online. Design your track, share it with others, and print it out.",
      icon: "🏁",
    },
  ];

  return (
    <div className="px-4 py-4 space-y-4">
      <h2 className="text-base font-semibold text-neutral-200">Resources</h2>

      <div className="space-y-3">
        {resources.map((r) => (
          <a
            key={r.url}
            href={r.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-lg bg-neutral-900 border border-neutral-800 p-4 hover:border-neutral-700 transition-colors"
          >
            <div className="flex items-start gap-3">
              <span className="text-2xl">{r.icon}</span>
              <div>
                <p className="text-sm font-medium text-blue-400">{r.name}</p>
                <p className="text-xs text-neutral-400 mt-1">{r.description}</p>
                <p className="text-xs text-neutral-600 mt-1">{r.url}</p>
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
