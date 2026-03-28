import { useAuth } from "../hooks/use-auth.js";
import { getGoogleLoginUrl, getMicrosoftLoginUrl, logout } from "../api/client.js";

export function UserMenu() {
  const { user, loading, refresh } = useAuth();

  if (loading) {
    return <span className="text-xs text-neutral-500">…</span>;
  }

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <a
          href={getGoogleLoginUrl()}
          className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
        >
          Google
        </a>
        <span className="text-neutral-600">|</span>
        <a
          href={getMicrosoftLoginUrl()}
          className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
        >
          Microsoft
        </a>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-neutral-300">{user.displayName}</span>
      <button
        onClick={async () => {
          await logout();
          refresh();
        }}
        className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
      >
        Logout
      </button>
    </div>
  );
}
