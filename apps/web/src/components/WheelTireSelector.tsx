import type { WheelTireSetup, TireComponent, WheelComponent, TireMount, WheelPosition } from "@setupiq/shared";
import { frontTires, rearTires, frontWheels, rearWheels } from "@setupiq/shared";

interface Props {
  position: WheelPosition;
  side: "left" | "right";
  setup: WheelTireSetup | undefined;
  onChange: (setup: WheelTireSetup) => void;
  /** Extra tires from the parts bin inventory (merged with library tires) */
  extraTires?: TireComponent[];
  /** Extra wheels from the parts bin inventory (merged with library wheels) */
  extraWheels?: WheelComponent[];
}

const MOUNT_METHODS: TireMount["method"][] = ["glued", "taped"];
const EDGE_GLUE: TireMount["edgeGlue"][] = ["outside", "inside", "both", "none"];

export function WheelTireSelector({ position, side, setup, onChange, extraTires = [], extraWheels = [] }: Props) {
  const libraryTires: TireComponent[] = position === "front" ? frontTires : rearTires;
  const libraryWheels: WheelComponent[] = position === "front" ? frontWheels : rearWheels;

  const base: WheelTireSetup = setup ?? { position, side };

  return (
    <div className="rounded-lg bg-neutral-900 border border-neutral-800 p-3 space-y-3">
      <h4 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
        {position} {side}
      </h4>

      {/* Wheel selector */}
      <div className="space-y-1">
        <label className="text-xs text-neutral-500">Wheel</label>
        <select
          value={base.wheelId ?? ""}
          onChange={(e) => onChange({ ...base, wheelId: e.target.value || undefined })}
          className="w-full rounded bg-neutral-950 border border-neutral-700 px-2 py-1.5 text-xs text-neutral-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">— select —</option>
          {extraWheels.length > 0
            ? extraWheels.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} (offset {w.offset >= 0 ? "+" : ""}{w.offset})
                </option>
              ))
            : libraryWheels.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} (offset {w.offset >= 0 ? "+" : ""}{w.offset})
                </option>
              ))
          }
        </select>
      </div>

      {/* Tire selector */}
      <div className="space-y-1">
        <label className="text-xs text-neutral-500">Tire</label>
        <select
          value={base.tireId ?? ""}
          onChange={(e) => onChange({ ...base, tireId: e.target.value || undefined })}
          className="w-full rounded bg-neutral-950 border border-neutral-700 px-2 py-1.5 text-xs text-neutral-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">— select —</option>
          {extraTires.length > 0
            ? extraTires.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.compound}){t.widthMm ? ` ${t.widthMm}mm` : ""}{t.color ? ` [${t.color}]` : ""}
                </option>
              ))
            : libraryTires.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.compound}){t.widthMm ? ` ${t.widthMm}mm` : ""}{t.color ? ` [${t.color}]` : ""}
                </option>
              ))
          }
        </select>
      </div>

      {/* Mount method */}
      <div className="space-y-1">
        <label className="text-xs text-neutral-500">Mount</label>
        <div className="flex gap-1.5">
          {MOUNT_METHODS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onChange({ ...base, mount: { ...base.mount!, method: m, edgeGlue: base.mount?.edgeGlue ?? "none" } })}
              className={`rounded px-2 py-1 text-xs transition-colors ${
                base.mount?.method === m
                  ? "bg-blue-600 text-white"
                  : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Edge glue (only if glued) */}
      {base.mount?.method === "glued" && (
        <div className="space-y-1">
          <label className="text-xs text-neutral-500">Edge Glue</label>
          <div className="flex gap-1.5 flex-wrap">
            {EDGE_GLUE.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => onChange({ ...base, mount: { ...base.mount!, edgeGlue: g } })}
                className={`rounded px-2 py-1 text-xs transition-colors ${
                  base.mount?.edgeGlue === g
                    ? "bg-blue-600 text-white"
                    : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
