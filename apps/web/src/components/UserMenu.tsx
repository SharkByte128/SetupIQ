import { useRacers } from "../hooks/use-racers.js";

export function UserMenu() {
  const { activeRacer } = useRacers();

  if (!activeRacer) {
    return <span className="text-xs text-neutral-500">No racer</span>;
  }

  return (
    <span className="text-xs text-neutral-300">{activeRacer.name}</span>
  );
}
