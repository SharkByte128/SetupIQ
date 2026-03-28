import type { SetupSnapshot } from "@setupiq/shared";

interface Props {
  setups: SetupSnapshot[];
  loading: boolean;
  onSelect: (setup: SetupSnapshot) => void;
  onNew: () => void;
}

export function SetupList({ setups, loading, onSelect, onNew }: Props) {
  if (loading) {
    return <p className="text-center text-neutral-500 text-sm py-8">Loading setups…</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-neutral-200">Setups</h2>
        <button
          onClick={onNew}
          className="rounded-md bg-blue-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-blue-500 transition-colors"
        >
          + New Setup
        </button>
      </div>

      {setups.length === 0 ? (
        <div className="text-center py-12 space-y-2">
          <p className="text-neutral-500 text-sm">No setups yet.</p>
          <p className="text-neutral-600 text-xs">Create your first setup to start tuning.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {setups.map((s) => (
            <li key={s.id}>
              <button
                onClick={() => onSelect(s)}
                className="w-full text-left rounded-lg bg-neutral-900 border border-neutral-800 p-3 hover:border-neutral-700 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-neutral-200">{s.name}</span>
                  <span className="text-xs text-neutral-600">
                    {new Date(s.updatedAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="mt-1 flex gap-2 text-xs text-neutral-500">
                  <span>{s.entries.length} settings</span>
                  <span>·</span>
                  <span>{s.wheelTireSetups.length} wheel/tire</span>
                </div>
                {s.notes && (
                  <p className="mt-1 text-xs text-neutral-500 truncate">{s.notes}</p>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
