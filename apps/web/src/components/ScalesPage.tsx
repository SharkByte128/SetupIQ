import { useState } from "react";
import { v4 as uuid } from "uuid";
import { useScale, useMeasurements } from "../hooks/use-scale.js";
import { useSetups } from "../hooks/use-setups.js";
import { localDb as db } from "../db/local-db.js";
import { allCars } from "@setupiq/shared";
import type { Measurement } from "@setupiq/shared";

const defaultCar = allCars[0];

export function ScalesPage() {
  const { connectionState, liveReading, connect, disconnect, captureMeasurement } = useScale();
  const { setups } = useSetups(defaultCar.id);
  const { measurements, reload } = useMeasurements();
  const [selectedSetupId, setSelectedSetupId] = useState<string>("");

  const handleCapture = async () => {
    if (!selectedSetupId) return;
    await captureMeasurement(selectedSetupId);
    await reload();
  };

  return (
    <div className="px-4 py-4 space-y-6">
      <h2 className="text-base font-semibold text-neutral-200">Corner Weight Scale</h2>

      {/* Connection controls */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <span className={`inline-block w-2 h-2 rounded-full ${
            connectionState === "connected" ? "bg-green-500" :
            connectionState === "connecting" ? "bg-yellow-500 animate-pulse" :
            connectionState === "error" ? "bg-red-500" :
            "bg-neutral-600"
          }`} />
          <span className="text-xs text-neutral-400 capitalize">{connectionState}</span>
          {connectionState === "disconnected" || connectionState === "error" ? (
            <button onClick={connect} className="rounded bg-blue-600 text-white px-3 py-1 text-xs font-medium hover:bg-blue-500">
              Connect Scale
            </button>
          ) : connectionState === "connected" ? (
            <button onClick={disconnect} className="rounded bg-neutral-800 text-neutral-300 px-3 py-1 text-xs hover:bg-neutral-700">
              Disconnect
            </button>
          ) : null}
        </div>
        {!navigator.bluetooth && (
          <p className="text-xs text-yellow-500">Web Bluetooth is not supported. Use Chrome or Edge on a device with Bluetooth.</p>
        )}
      </div>

      {/* Live reading */}
      {liveReading && (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-neutral-400 uppercase">Live Reading</h3>
          <div className="grid grid-cols-2 gap-2">
            <WeightCell label="Front Left" value={liveReading.frontLeft} />
            <WeightCell label="Front Right" value={liveReading.frontRight} />
            <WeightCell label="Rear Left" value={liveReading.rearLeft} />
            <WeightCell label="Rear Right" value={liveReading.rearRight} />
          </div>
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="rounded bg-neutral-900 border border-neutral-800 p-2">
              <p className="text-sm font-bold text-neutral-200">
                {(liveReading.frontLeft + liveReading.frontRight + liveReading.rearLeft + liveReading.rearRight).toFixed(1)}g
              </p>
              <p className="text-xs text-neutral-500">Total</p>
            </div>
            <div className="rounded bg-neutral-900 border border-neutral-800 p-2">
              <p className="text-sm font-bold text-neutral-200">
                {calcBias(liveReading.frontLeft + liveReading.frontRight, liveReading.rearLeft + liveReading.rearRight)}
              </p>
              <p className="text-xs text-neutral-500">F/R Bias</p>
            </div>
            <div className="rounded bg-neutral-900 border border-neutral-800 p-2">
              <p className="text-sm font-bold text-neutral-200">
                {calcBias(liveReading.frontLeft + liveReading.rearLeft, liveReading.frontRight + liveReading.rearRight)}
              </p>
              <p className="text-xs text-neutral-500">L/R Bias</p>
            </div>
            <div className="rounded bg-neutral-900 border border-neutral-800 p-2">
              <p className="text-sm font-bold text-neutral-200">
                {calcCross(liveReading)}
              </p>
              <p className="text-xs text-neutral-500">Cross Weight</p>
            </div>
          </div>

          {/* Capture */}
          <div className="space-y-2">
            <select
              value={selectedSetupId}
              onChange={(e) => setSelectedSetupId(e.target.value)}
              className="w-full rounded bg-neutral-900 border border-neutral-700 px-2 py-1.5 text-xs text-neutral-200"
            >
              <option value="">— link to setup —</option>
              {setups.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <button
              onClick={handleCapture}
              disabled={!selectedSetupId}
              className="w-full rounded-md bg-green-600 text-white py-2.5 text-sm font-medium hover:bg-green-500 disabled:opacity-40"
            >
              Capture Measurement
            </button>
          </div>
        </div>
      )}

      {/* Manual entry when no BLE */}
      {connectionState !== "connected" && <ManualWeightEntry setups={setups} onSaved={reload} />}

      {/* History */}
      {measurements.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-neutral-400 uppercase">Recent Measurements</h3>
          {measurements.slice(0, 10).map((m) => (
            <MeasurementCard key={m.id} measurement={m} />
          ))}
        </div>
      )}
    </div>
  );
}

function WeightCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-neutral-900 border border-neutral-800 p-3 text-center">
      <p className="text-xl font-bold text-neutral-100">{value.toFixed(1)}<span className="text-xs text-neutral-500 ml-0.5">g</span></p>
      <p className="text-xs text-neutral-500">{label}</p>
    </div>
  );
}

function MeasurementCard({ measurement: m }: { measurement: Measurement }) {
  if (!m.cornerWeights) return null;
  const { frontLeft, frontRight, rearLeft, rearRight } = m.cornerWeights;
  return (
    <div className="rounded-lg bg-neutral-900 border border-neutral-800 p-2.5">
      <div className="flex justify-between text-xs text-neutral-400">
        <span>{new Date(m.measuredAt).toLocaleString()}</span>
        <span>{m.source}</span>
      </div>
      <div className="grid grid-cols-4 gap-1 mt-1 text-xs text-center text-neutral-300">
        <span>FL {frontLeft}g</span>
        <span>FR {frontRight}g</span>
        <span>RL {rearLeft}g</span>
        <span>RR {rearRight}g</span>
      </div>
      <div className="flex gap-3 mt-1 text-xs text-neutral-500">
        <span>Total: {m.totalWeight?.toFixed(1)}g</span>
        <span>F/R: {m.frontBiasPercent?.toFixed(1)}%</span>
        <span>Cross: {m.crossWeightPercent?.toFixed(1)}%</span>
      </div>
    </div>
  );
}

function ManualWeightEntry({ setups, onSaved }: { setups: import("@setupiq/shared").SetupSnapshot[]; onSaved: () => void }) {
  const [fl, setFl] = useState("");
  const [fr, setFr] = useState("");
  const [rl, setRl] = useState("");
  const [rr, setRr] = useState("");
  const [setupId, setSetupId] = useState("");

  const handleSave = async () => {
    const vals = [fl, fr, rl, rr].map(Number);
    if (vals.some(isNaN) || !setupId) return;

    const total = vals[0] + vals[1] + vals[2] + vals[3];

    await db.measurements.add({
      id: uuid(),
      setupId,
      cornerWeights: {
        frontLeft: vals[0], frontRight: vals[1],
        rearLeft: vals[2], rearRight: vals[3],
        unit: "g",
      },
      totalWeight: total,
      frontBiasPercent: total > 0 ? ((vals[0] + vals[1]) / total) * 100 : 0,
      leftBiasPercent: total > 0 ? ((vals[0] + vals[2]) / total) * 100 : 0,
      crossWeightPercent: total > 0 ? ((vals[0] + vals[3]) / total) * 100 : 0,
      measuredAt: new Date().toISOString(),
      source: "manual",
      _dirty: 1,
    });
    setFl(""); setFr(""); setRl(""); setRr("");
    onSaved();
  };

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-neutral-400 uppercase">Manual Entry</h3>
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "FL", value: fl, set: setFl },
          { label: "FR", value: fr, set: setFr },
          { label: "RL", value: rl, set: setRl },
          { label: "RR", value: rr, set: setRr },
        ].map((corner) => (
          <div key={corner.label} className="space-y-0.5">
            <label className="text-xs text-neutral-500">{corner.label} (g)</label>
            <input
              type="number"
              value={corner.value}
              onChange={(e) => corner.set(e.target.value)}
              step="0.1"
              className="w-full rounded bg-neutral-900 border border-neutral-700 px-2 py-1.5 text-sm text-neutral-200 text-center"
            />
          </div>
        ))}
      </div>
      <select
        value={setupId}
        onChange={(e) => setSetupId(e.target.value)}
        className="w-full rounded bg-neutral-900 border border-neutral-700 px-2 py-1.5 text-xs text-neutral-200"
      >
        <option value="">— link to setup —</option>
        {setups.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
      <button
        onClick={handleSave}
        disabled={!setupId || [fl, fr, rl, rr].some((v) => !v)}
        className="w-full rounded-md bg-green-600 text-white py-2 text-sm font-medium hover:bg-green-500 disabled:opacity-40"
      >
        Save Weights
      </button>
    </div>
  );
}

function calcBias(a: number, b: number): string {
  const total = a + b;
  if (total === 0) return "—";
  return `${((a / total) * 100).toFixed(1)}% / ${((b / total) * 100).toFixed(1)}%`;
}

function calcCross(r: { frontLeft: number; frontRight: number; rearLeft: number; rearRight: number }): string {
  const total = r.frontLeft + r.frontRight + r.rearLeft + r.rearRight;
  if (total === 0) return "—";
  const cross = ((r.frontLeft + r.rearRight) / total) * 100;
  return `${cross.toFixed(1)}%`;
}
