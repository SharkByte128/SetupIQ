import { useState, useEffect, useCallback, useRef, useMemo, Fragment } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getCarById, getChassisPlatformById, chassisPlatforms, allTires, allWheels } from "@setupiq/shared";
import { localDb, recordDeletion, recordDeletions, type LocalRunSession, type LocalRunSegment, type LocalRaceResult, type LocalSetupSnapshot } from "../db/local-db.js";
import { useShowHiddenRuns } from "../hooks/use-demo-filter.js";
import { SetupsPage } from "./SetupsPage.js";
import { resizeImage } from "../lib/resize-image.js";
import { v4 as uuid } from "uuid";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

type Tab = "setup" | "runs" | "issues" | "details";

interface CarDetailPageProps {
  carId: string;
  onBack: () => void;
}

/** Count total laps for a car across run segments and race results. */
async function countTotalLaps(carId: string): Promise<number> {
  // Laps from run sessions → segments
  const sessions = await localDb.runSessions.where("carId").equals(carId).toArray();
  let laps = 0;
  for (const session of sessions) {
    const segments = await localDb.runSegments.where("sessionId").equals(session.id).toArray();
    for (const seg of segments) {
      laps += seg.lapTimes?.length ?? 0;
    }
  }
  // Laps from race results
  const races = await localDb.raceResults.where("carId").equals(carId).toArray();
  for (const race of races) {
    laps += race.totalLaps ?? 0;
  }
  return laps;
}

export function CarDetailPage({ carId, onBack }: CarDetailPageProps) {
  const [tab, setTab] = useState<Tab>("setup");
  const [totalLaps, setTotalLaps] = useState(0);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Resolve car definition — predefined or custom
  const predefined = getCarById(carId);
  const customCar = useLiveQuery(() =>
    predefined ? undefined : localDb.customCars.get(carId),
    [carId],
  );

  const carName = predefined?.name ?? customCar?.name ?? "Unknown Car";
  const manufacturer = predefined?.manufacturer ?? customCar?.manufacturer ?? "";
  const chassisModel = customCar?.chassisId ? getChassisPlatformById(customCar.chassisId) : undefined;
  const bannerSubtitle = chassisModel
    ? `${chassisModel.name} · ${predefined?.scale ?? customCar?.scale ?? ""} ${predefined?.driveType ?? customCar?.driveType ?? ""}`
    : `${manufacturer} · ${predefined?.scale ?? customCar?.scale ?? ""} ${predefined?.driveType ?? customCar?.driveType ?? ""}`;
  const scale = predefined?.scale ?? customCar?.scale ?? "";
  const driveType = predefined?.driveType ?? customCar?.driveType ?? "";
  const isCustom = !predefined;

  // Load car image
  useEffect(() => {
    let cancelled = false;
    localDb.carImages.where("carId").equals(carId).first().then((img) => {
      if (cancelled) return;
      setImageUrl(img ? URL.createObjectURL(img.blob) : null);
    });
    return () => {
      cancelled = true;
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carId]);

  // Count laps
  useEffect(() => {
    countTotalLaps(carId).then(setTotalLaps);
  }, [carId]);

  // ─── Details tab state ──────────────────────────────
  const [editName, setEditName] = useState("");
  const [editChassisId, setEditChassisId] = useState("");
  const [editScale, setEditScale] = useState("");
  const [editDriveType, setEditDriveType] = useState<"RWD" | "AWD" | "FWD">("RWD");
  const [editNotes, setEditNotes] = useState("");
  const [editSetupTemplateId, setEditSetupTemplateId] = useState("");
  const [detailsDirty, setDetailsDirty] = useState(false);

  // Setup templates for the selector
  const allTemplates = useLiveQuery(() => localDb.setupTemplates.toArray()) ?? [];

  // Notes for predefined cars (stored in carNotes table)
  const predefinedCarNote = useLiveQuery(
    () => predefined ? localDb.carNotes.get(carId) : undefined,
    [carId],
  );
  const [predefinedNotes, setPredefinedNotes] = useState("");
  const [predefinedNotesDirty, setPredefinedNotesDirty] = useState(false);

  // Sync predefined notes when loaded
  useEffect(() => {
    if (predefined) {
      setPredefinedNotes(predefinedCarNote?.notes ?? "");
      setPredefinedNotesDirty(false);
    }
  }, [predefined, predefinedCarNote]);

  // Sync edit fields when customCar loads
  useEffect(() => {
    if (customCar) {
      setEditName(customCar.name);
      setEditChassisId(customCar.chassisId ?? "chassis-other");
      setEditScale(customCar.scale);
      setEditDriveType(customCar.driveType);
      setEditNotes(customCar.notes ?? "");
      setEditSetupTemplateId(customCar.setupTemplateId ?? "");
    }
  }, [customCar]);

  const handlePhotoUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const resized = await resizeImage(file, 400);
      const existing = await localDb.carImages.where("carId").equals(carId).first();
      if (existing) { await localDb.carImages.delete(existing.id); await recordDeletion("carImages", existing.id); }
      await localDb.carImages.put({
        id: uuid(),
        carId,
        blob: resized,
        name: file.name,
        mimeType: resized.type || file.type,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        _dirty: 1,
      });
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      setImageUrl(URL.createObjectURL(resized));
      e.target.value = "";
    },
    [carId, imageUrl],
  );

  const handleSaveDetails = useCallback(async () => {
    if (!customCar) return;
    const chassis = getChassisPlatformById(editChassisId);
    await localDb.customCars.update(carId, {
      name: editName.trim() || customCar.name,
      chassisId: editChassisId,
      manufacturer: chassis?.manufacturer ?? "Other",
      scale: editScale.trim() || "1:28",
      driveType: editDriveType,
      notes: editNotes.trim() || undefined,
      setupTemplateId: editSetupTemplateId || undefined,
      updatedAt: new Date().toISOString(),
      _dirty: 1 as const,
    });
    setDetailsDirty(false);
  }, [carId, customCar, editName, editChassisId, editScale, editDriveType, editNotes, editSetupTemplateId]);

  const handleSavePredefinedNotes = useCallback(async () => {
    await localDb.carNotes.put({
      carId,
      notes: predefinedNotes.trim(),
      updatedAt: new Date().toISOString(),
    });
    setPredefinedNotesDirty(false);
  }, [carId, predefinedNotes]);

  const handleDeleteCar = useCallback(async () => {
    if (!confirm("Delete this car and all its setups?")) return;
    // Remove setups
    const setups = await localDb.setupSnapshots.where("carId").equals(carId).toArray();
    await localDb.setupSnapshots.bulkDelete(setups.map((s) => s.id));
    await recordDeletions("setupSnapshots", setups.map((s) => s.id));
    // Remove image
    const img = await localDb.carImages.where("carId").equals(carId).first();
    if (img) { await localDb.carImages.delete(img.id); await recordDeletion("carImages", img.id); }
    // Remove custom car record
    await localDb.customCars.delete(carId);
    await recordDeletion("customCars", carId);
    onBack();
  }, [carId, onBack]);

  const inputClass =
    "w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-blue-500";

  return (
    <div className="flex flex-col h-full">
      {/* Header bar */}
      <div className="px-4 pt-3 pb-2">
        <button onClick={onBack} className="text-sm text-blue-400 hover:text-blue-300">
          ← Back to Garage
        </button>
      </div>

      {/* Car banner: image + name + laps */}
      <div className="px-4 pb-3 flex items-center gap-3">
        <div className="w-14 h-14 rounded-lg bg-neutral-800 overflow-hidden flex-shrink-0 flex items-center justify-center">
          {imageUrl ? (
            <img src={imageUrl} alt={carName} className="w-full h-full object-cover" />
          ) : (
            <span className="text-2xl text-neutral-600">🏎️</span>
          )}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-sm leading-tight truncate">{carName}</p>
          <p className="text-xs text-neutral-500">{bannerSubtitle}</p>
          <p className="text-xs text-neutral-400 mt-0.5">{totalLaps.toLocaleString()} total laps</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="px-4 flex gap-1 border-b border-neutral-800">
        {(["setup", "runs", "issues", "details"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${
              tab === t
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-neutral-500 hover:text-neutral-300"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {tab === "setup" && <SetupsPage forcedCarId={carId} />}

        {tab === "runs" && <CarRunsTab carId={carId} />}

        {tab === "issues" && (
          <CarIssuesTab
            carId={carId}
            carName={carName}
            manufacturer={manufacturer}
            scale={scale}
            driveType={driveType}
            chassisModel={chassisModel?.name}
          />
        )}

        {tab === "details" && (
          <div className="px-4 py-4 flex flex-col gap-4">
            {/* Photo */}
            <div>
              <label className="text-xs text-neutral-400 mb-1 block">Photo</label>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                {imageUrl ? "Change photo" : "Add photo"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoUpload}
              />
            </div>

            {isCustom && customCar ? (
              <>
                {/* Editable fields for custom cars */}
                <div>
                  <label className="text-xs text-neutral-400 mb-1 block">Car Name</label>
                  <input
                    className={inputClass}
                    value={editName}
                    onChange={(e) => { setEditName(e.target.value); setDetailsDirty(true); }}
                  />
                </div>
                <div>
                  <label className="text-xs text-neutral-400 mb-1 block">Chassis Model</label>
                  <select
                    className={inputClass}
                    value={editChassisId}
                    onChange={(e) => {
                      setEditChassisId(e.target.value);
                      const cp = getChassisPlatformById(e.target.value);
                      if (cp) { setEditScale(cp.scale); setEditDriveType(cp.driveType); }
                      setDetailsDirty(true);
                    }}
                  >
                    <option value="">Select…</option>
                    {Object.entries(
                      chassisPlatforms.reduce<Record<string, typeof chassisPlatforms>>((acc, cp) => {
                        (acc[cp.manufacturer] ??= []).push(cp);
                        return acc;
                      }, {})
                    ).map(([mfr, models]) => (
                      <optgroup key={mfr} label={mfr}>
                        {models.map((cp) => (
                          <option key={cp.id} value={cp.id}>
                            {cp.name} — {cp.scale} {cp.driveType}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-neutral-400 mb-1 block">Scale</label>
                  <input
                    className={inputClass}
                    value={editScale}
                    onChange={(e) => { setEditScale(e.target.value); setDetailsDirty(true); }}
                  />
                </div>
                <div>
                  <label className="text-xs text-neutral-400 mb-1 block">Drive Type</label>
                  <div className="flex gap-2">
                    {(["RWD", "AWD", "FWD"] as const).map((dt) => (
                      <button
                        key={dt}
                        onClick={() => { setEditDriveType(dt); setDetailsDirty(true); }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          editDriveType === dt
                            ? "bg-blue-600 text-white"
                            : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
                        }`}
                      >
                        {dt}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-neutral-400 mb-1 block">Notes</label>
                  <textarea
                    className={inputClass + " min-h-[80px]"}
                    value={editNotes}
                    onChange={(e) => { setEditNotes(e.target.value); setDetailsDirty(true); }}
                  />
                </div>

                {/* Setup Template */}
                <div>
                  <label className="text-xs text-neutral-400 mb-1 block">Setup Template</label>
                  <select
                    className={inputClass}
                    value={editSetupTemplateId}
                    onChange={(e) => { setEditSetupTemplateId(e.target.value); setDetailsDirty(true); }}
                  >
                    <option value="">None</option>
                    {(() => {
                      // Show compatible templates first, then others
                      const compatible = allTemplates.filter(
                        (t) => t.compatibleChassisIds.length === 0 || t.compatibleChassisIds.includes(editChassisId),
                      );
                      const other = allTemplates.filter(
                        (t) => t.compatibleChassisIds.length > 0 && !t.compatibleChassisIds.includes(editChassisId),
                      );
                      return (
                        <>
                          {compatible.length > 0 && (
                            <optgroup label="Compatible">
                              {compatible.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.name} ({t.capabilities.length} fields)
                                </option>
                              ))}
                            </optgroup>
                          )}
                          {other.length > 0 && (
                            <optgroup label="Other Templates">
                              {other.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.name} ({t.capabilities.length} fields)
                                </option>
                              ))}
                            </optgroup>
                          )}
                        </>
                      );
                    })()}
                  </select>
                  <p className="text-[10px] text-neutral-600 mt-1">
                    Defines which fields appear on this car's setup sheet.
                  </p>
                </div>

                {/* Save */}
                {detailsDirty && (
                  <button
                    onClick={handleSaveDetails}
                    className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors"
                  >
                    Save Changes
                  </button>
                )}

                {/* Danger zone */}
                <div className="mt-6 border-t border-neutral-800 pt-4">
                  <p className="text-xs text-neutral-500 mb-2">Danger Zone</p>
                  <button
                    onClick={handleDeleteCar}
                    className="text-sm text-red-400 hover:text-red-300"
                  >
                    Delete Car
                  </button>
                </div>
              </>
            ) : (
              /* Predefined car: show specs + editable notes */
              <div className="flex flex-col gap-3">
                <div>
                  <p className="text-xs text-neutral-500">Name</p>
                  <p className="text-sm">{carName}</p>
                </div>
                <div>
                  <p className="text-xs text-neutral-500">Manufacturer</p>
                  <p className="text-sm">{manufacturer}</p>
                </div>
                <div>
                  <p className="text-xs text-neutral-500">Scale</p>
                  <p className="text-sm">{scale}</p>
                </div>
                <div>
                  <p className="text-xs text-neutral-500">Drive Type</p>
                  <p className="text-sm">{driveType}</p>
                </div>
                <div>
                  <label className="text-xs text-neutral-400 mb-1 block">Notes</label>
                  <textarea
                    className={inputClass + " min-h-[80px]"}
                    placeholder="Add personal notes for this car…"
                    value={predefinedNotes}
                    onChange={(e) => { setPredefinedNotes(e.target.value); setPredefinedNotesDirty(true); }}
                  />
                </div>
                {predefinedNotesDirty && (
                  <button
                    onClick={handleSavePredefinedNotes}
                    className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors"
                  >
                    Save Notes
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Issues Tab (Gemini AI chat) ──────────────────────────────

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

async function callGeminiForIssue(body: Record<string, unknown>): Promise<{ text?: string; error?: string }> {
  // Try server proxy first
  const serverUrl = (await localDb.syncMeta.get("sync_server_url"))?.value;
  if (serverUrl) {
    try {
      const resp = await fetch(`${serverUrl}/api/gemini/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (resp.ok) {
        const data = await resp.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        return { text: text || "No response from AI." };
      }
      if (resp.status !== 503) {
        return { error: `Gemini API error (${resp.status})` };
      }
    } catch { /* fall through */ }
  }

  // Fall back to local API key
  const keyRow = await localDb.syncMeta.get("gemini_api_key");
  const apiKey = keyRow?.value?.trim();
  if (!apiKey) {
    return { error: "No Gemini API key configured. Add one in Settings or configure GEMINI_API_KEY on the server." };
  }

  try {
    const resp = await fetch(
      `${GEMINI_API_BASE}/gemini-2.5-flash:generateContent?key=${apiKey}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    );
    if (!resp.ok) return { error: `Gemini API error (${resp.status})` };
    const data = await resp.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return { text: text || "No response from AI." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/** Build a text summary of the car + its current setups for Gemini context. */
async function buildCarContext(carId: string, carName: string, manufacturer: string, scale: string, driveType: string, chassisModel?: string): Promise<string> {
  const lines: string[] = [];
  lines.push(`Car: ${carName}`);
  lines.push(`Manufacturer: ${manufacturer}`);
  if (chassisModel) lines.push(`Chassis: ${chassisModel}`);
  lines.push(`Scale: ${scale}, Drive: ${driveType}`);

  // Include current setup snapshots
  const setups = await localDb.setupSnapshots.where("carId").equals(carId).toArray();
  if (setups.length > 0) {
    lines.push("");
    lines.push("=== Current Setup(s) ===");
    for (const setup of setups) {
      lines.push(`\nSetup: ${setup.name}`);
      if (setup.entries?.length) {
        for (const entry of setup.entries) {
          lines.push(`  ${entry.capabilityId}: ${entry.value}`);
        }
      }
      if (setup.wheelTireSetups?.length) {
        lines.push("  Wheel/Tire:");
        for (const wt of setup.wheelTireSetups) {
          const parts = [`${wt.position} ${wt.side}`];
          if (wt.wheelId) parts.push(`wheel=${wt.wheelId}`);
          if (wt.tireId) parts.push(`tire=${wt.tireId}`);
          if (wt.mount) parts.push(`mount=${wt.mount.method}`);
          lines.push(`    ${parts.join(", ")}`);
        }
      }
      if (setup.notes) lines.push(`  Notes: ${setup.notes}`);
    }
  }

  // Include components on this car
  const components = await localDb.components.toArray();
  if (components.length > 0) {
    lines.push("");
    lines.push("=== Components ===");
    for (const c of components) {
      lines.push(`  ${c.type}: ${c.brand} ${c.name}${c.sku ? ` (${c.sku})` : ""}${c.notes ? ` — ${c.notes}` : ""}`);
    }
  }

  return lines.join("\n");
}

interface CarIssuesTabProps {
  carId: string;
  carName: string;
  manufacturer: string;
  scale: string;
  driveType: string;
  chassisModel?: string;
}

type IssuesView =
  | { kind: "list" }
  | { kind: "new" }
  | { kind: "detail"; issueId: string };

function CarIssuesTab({ carId, carName, manufacturer, scale, driveType, chassisModel }: CarIssuesTabProps) {
  const [view, setView] = useState<IssuesView>({ kind: "list" });

  const issues = useLiveQuery(
    () => localDb.carIssues.where("carId").equals(carId).reverse().sortBy("createdAt"),
    [carId],
  );

  if (view.kind === "new") {
    return (
      <NewIssueForm
        carId={carId}
        carName={carName}
        manufacturer={manufacturer}
        scale={scale}
        driveType={driveType}
        chassisModel={chassisModel}
        onBack={() => setView({ kind: "list" })}
        onCreated={(issueId) => setView({ kind: "detail", issueId })}
      />
    );
  }

  if (view.kind === "detail") {
    return (
      <IssueDetail
        issueId={view.issueId}
        carId={carId}
        carName={carName}
        manufacturer={manufacturer}
        scale={scale}
        driveType={driveType}
        chassisModel={chassisModel}
        onBack={() => setView({ kind: "list" })}
      />
    );
  }

  return (
    <div className="px-4 py-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-400">Issues</h2>
        <button
          onClick={() => setView({ kind: "new" })}
          className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors"
        >
          + New Issue
        </button>
      </div>

      {(!issues || issues.length === 0) && (
        <p className="text-sm text-neutral-500">No issues yet. Ask Gemini AI about your car, setup, or configuration.</p>
      )}

      {issues?.map((issue) => (
        <button
          key={issue.id}
          onClick={() => setView({ kind: "detail", issueId: issue.id })}
          className="w-full text-left rounded-lg border border-neutral-800 bg-neutral-900/50 p-3 hover:border-neutral-700 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${issue.status === "open" ? "bg-green-500" : "bg-neutral-600"}`} />
            <p className="text-sm font-medium text-neutral-200 truncate">{issue.title}</p>
          </div>
          <p className="text-xs text-neutral-500 mt-1 line-clamp-2">{issue.description}</p>
          <p className="text-[10px] text-neutral-600 mt-1">{new Date(issue.createdAt).toLocaleDateString()}</p>
        </button>
      ))}
    </div>
  );
}

function NewIssueForm({
  carId, carName, manufacturer, scale, driveType, chassisModel, onBack, onCreated,
}: CarIssuesTabProps & { onBack: () => void; onCreated: (id: string) => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const inputClass =
    "w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-blue-500";

  const handleSubmit = useCallback(async () => {
    if (!title.trim() || !description.trim()) return;
    setSending(true);
    setError("");

    const issueId = uuid();
    const now = new Date().toISOString();

    // Create the issue
    await localDb.carIssues.put({
      id: issueId,
      carId,
      title: title.trim(),
      description: description.trim(),
      status: "open",
      createdAt: now,
      updatedAt: now,
      _dirty: 1,
    });

    // Save the user message
    const userMsgId = uuid();
    await localDb.carIssueMessages.put({
      id: userMsgId,
      issueId,
      role: "user",
      content: description.trim(),
      createdAt: now,
      _dirty: 1,
    });

    // Build context and call Gemini
    try {
      const context = await buildCarContext(carId, carName, manufacturer, scale, driveType, chassisModel);

      const result = await callGeminiForIssue({
        systemInstruction: {
          parts: [{
            text: `You are an expert RC car setup advisor for Mini-Z and other 1:28-scale RC cars. The user is asking about an issue with their car. Here is the car's current configuration:\n\n${context}\n\nProvide helpful, specific advice based on the car's actual setup. Be concise but thorough. Use markdown formatting for readability.`,
          }],
        },
        contents: [{ parts: [{ text: `Issue: ${title.trim()}\n\n${description.trim()}` }] }],
      });

      if (result.error) {
        setError(result.error);
      } else if (result.text) {
        await localDb.carIssueMessages.put({
          id: uuid(),
          issueId,
          role: "assistant",
          content: result.text,
          createdAt: new Date().toISOString(),
          _dirty: 1,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }

    setSending(false);
    onCreated(issueId);
  }, [title, description, carId, carName, manufacturer, scale, driveType, chassisModel, onCreated]);

  return (
    <div className="px-4 py-4 space-y-4">
      <button onClick={onBack} className="text-xs text-blue-400 hover:text-blue-300">← Back to Issues</button>
      <h2 className="text-sm font-semibold text-neutral-300">New Issue</h2>

      <div>
        <label className="text-xs text-neutral-400 mb-1 block">Title</label>
        <input
          className={inputClass}
          placeholder="e.g. Car understeers in tight corners"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div>
        <label className="text-xs text-neutral-400 mb-1 block">Description</label>
        <textarea
          className={inputClass + " min-h-[100px]"}
          placeholder="Describe the issue in detail. Your car's setup and configuration will be automatically included."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <p className="text-[10px] text-neutral-600 mt-1">
          Your car details, setup entries, and components will be sent to Gemini AI for context.
        </p>
      </div>

      {error && <p className="text-xs text-red-400 bg-red-400/10 rounded px-3 py-2">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={sending || !title.trim() || !description.trim()}
        className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-2.5 transition-colors"
      >
        {sending ? "Sending to Gemini AI…" : "Submit Issue"}
      </button>
    </div>
  );
}

function IssueDetail({
  issueId, carId, carName, manufacturer, scale, driveType, chassisModel, onBack,
}: { issueId: string; carId: string; carName: string; manufacturer: string; scale: string; driveType: string; chassisModel?: string; onBack: () => void }) {
  const [followUp, setFollowUp] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const issue = useLiveQuery(() => localDb.carIssues.get(issueId), [issueId]);
  const messages = useLiveQuery(
    () => localDb.carIssueMessages.where("issueId").equals(issueId).sortBy("createdAt"),
    [issueId],
  );

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages?.length]);

  const handleFollowUp = useCallback(async () => {
    if (!followUp.trim() || sending) return;
    setSending(true);
    setError("");

    const now = new Date().toISOString();
    await localDb.carIssueMessages.put({
      id: uuid(),
      issueId,
      role: "user",
      content: followUp.trim(),
      createdAt: now,
      _dirty: 1,
    });

    setFollowUp("");

    try {
      const context = await buildCarContext(carId, carName, manufacturer, scale, driveType, chassisModel);

      // Build full conversation history for Gemini
      const allMessages = await localDb.carIssueMessages.where("issueId").equals(issueId).sortBy("createdAt");
      const contents = allMessages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

      const result = await callGeminiForIssue({
        systemInstruction: {
          parts: [{
            text: `You are an expert RC car setup advisor for Mini-Z and other 1:28-scale RC cars. The user is discussing an issue with their car titled "${issue?.title}". Here is the car's current configuration:\n\n${context}\n\nProvide helpful, specific advice based on the car's actual setup. Be concise but thorough. Use markdown formatting for readability.`,
          }],
        },
        contents,
      });

      if (result.error) {
        setError(result.error);
      } else if (result.text) {
        await localDb.carIssueMessages.put({
          id: uuid(),
          issueId,
          role: "assistant",
          content: result.text,
          createdAt: new Date().toISOString(),
          _dirty: 1,
        });
        await localDb.carIssues.update(issueId, { updatedAt: new Date().toISOString(), _dirty: 1 });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setSending(false);
  }, [followUp, issueId, carId, carName, manufacturer, scale, driveType, chassisModel, issue?.title, sending]);

  const handleToggleStatus = useCallback(async () => {
    if (!issue) return;
    await localDb.carIssues.update(issueId, {
      status: issue.status === "open" ? "closed" : "open",
      updatedAt: new Date().toISOString(),
      _dirty: 1,
    });
  }, [issueId, issue]);

  const handleDelete = useCallback(async () => {
    if (!confirm("Delete this issue and all messages?")) return;
    const msgs = await localDb.carIssueMessages.where("issueId").equals(issueId).toArray();
    await localDb.carIssueMessages.bulkDelete(msgs.map(m => m.id));
    await recordDeletions("carIssueMessages", msgs.map(m => m.id));
    await localDb.carIssues.delete(issueId);
    await recordDeletion("carIssues", issueId);
    onBack();
  }, [issueId, onBack]);

  if (!issue) return null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-3 pb-2 border-b border-neutral-800 flex-shrink-0">
        <button onClick={onBack} className="text-xs text-blue-400 hover:text-blue-300">← Back to Issues</button>
        <div className="flex items-center justify-between mt-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${issue.status === "open" ? "bg-green-500" : "bg-neutral-600"}`} />
              <h2 className="text-sm font-semibold text-neutral-200 truncate">{issue.title}</h2>
            </div>
            <p className="text-xs text-neutral-500 mt-0.5 line-clamp-1">{issue.description}</p>
          </div>
          <div className="flex gap-2 flex-shrink-0 ml-2">
            <button
              onClick={handleToggleStatus}
              className={`text-[10px] px-2 py-1 rounded ${
                issue.status === "open"
                  ? "bg-neutral-800 text-neutral-400 hover:text-neutral-300"
                  : "bg-green-900/30 text-green-400 hover:text-green-300"
              }`}
            >
              {issue.status === "open" ? "Close" : "Reopen"}
            </button>
            <button
              onClick={handleDelete}
              className="text-[10px] px-2 py-1 rounded bg-neutral-800 text-red-400 hover:text-red-300"
            >
              Delete
            </button>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages?.map((msg) => (
          <div
            key={msg.id}
            className={`rounded-lg p-3 text-sm ${
              msg.role === "user"
                ? "bg-blue-900/20 border border-blue-800/30 ml-8"
                : "bg-neutral-800/50 border border-neutral-700/50 mr-4"
            }`}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`text-[10px] font-medium uppercase tracking-wider ${
                msg.role === "user" ? "text-blue-400" : "text-amber-400"
              }`}>
                {msg.role === "user" ? "You" : "Gemini AI"}
              </span>
              <span className="text-[10px] text-neutral-600">
                {new Date(msg.createdAt).toLocaleString()}
              </span>
            </div>
            <div className="text-neutral-300 text-xs leading-relaxed whitespace-pre-wrap">
              {msg.content}
            </div>
          </div>
        ))}
        {sending && (
          <div className="bg-neutral-800/50 border border-neutral-700/50 rounded-lg p-3 mr-4">
            <p className="text-[10px] font-medium uppercase tracking-wider text-amber-400 mb-1.5">Gemini AI</p>
            <p className="text-xs text-neutral-500 animate-pulse">Thinking…</p>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Follow-up input */}
      {issue.status === "open" && (
        <div className="px-4 py-3 border-t border-neutral-800 flex-shrink-0">
          {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
          <div className="flex gap-2">
            <input
              className="flex-1 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-blue-500"
              placeholder="Ask a follow-up question…"
              value={followUp}
              onChange={(e) => setFollowUp(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleFollowUp(); } }}
            />
            <button
              onClick={handleFollowUp}
              disabled={sending || !followUp.trim()}
              className="px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm rounded-lg transition-colors flex-shrink-0"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Runs Tab ─────────────────────────────────────────────────

type RunsView =
  | { kind: "list" }
  | { kind: "addRace" }
  | { kind: "race-detail"; raceId: string }
  | { kind: "live-dashboard"; raceId: string };

function computeLapStats(laps: { timeMs: number }[]) {
  if (laps.length === 0) return null;
  const times = laps.map((l) => l.timeMs);
  const best = Math.min(...times);
  const worst = Math.max(...times);
  const total = times.reduce((a, b) => a + b, 0);
  const avg = total / times.length;
  const variance = times.reduce((sum, t) => sum + (t - avg) ** 2, 0) / times.length;
  const stdDev = Math.sqrt(variance);
  const consistency = avg > 0 ? (1 - stdDev / avg) * 100 : 0;
  // Median
  const sorted = [...times].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

  return { best, worst, avg, median, total, stdDev, consistency, count: times.length };
}

function fmt(ms: number): string {
  return (ms / 1000).toFixed(3) + "s";
}

function fmtTotal(ms: number): string {
  const totalSec = ms / 1000;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return min > 0 ? `${min}:${sec.toFixed(2).padStart(5, "0")}` : `${sec.toFixed(2)}s`;
}

function StatBox({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-lg bg-neutral-800 border border-neutral-700 p-2 text-center">
      <p className={`text-sm font-semibold ${highlight ? "text-green-400" : "text-neutral-200"}`}>{value}</p>
      <p className="text-[10px] text-neutral-500 uppercase">{label}</p>
    </div>
  );
}


function CarRunsTab({ carId }: { carId: string }) {
  const [view, setView] = useState<RunsView>({ kind: "list" });
  const [showHidden] = useShowHiddenRuns();
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);

  // ─── Car-scoped NLT sync engine ────────────────────────
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastNewLapAtRef = useRef<number>(Date.now());
  const lastLapTotalRef = useRef<number>(0);
  const syncStartedAtRef = useRef<number>(Date.now());

  // Timing match for this car
  const timingNameRecord = useLiveQuery(() => localDb.carTimingNames.get(carId), [carId]);
  const timingName = timingNameRecord?.timingName?.toLowerCase() ?? "";

  // Latest setup snapshot for auto-assignment
  const latestSnapshot = useLiveQuery(
    () => localDb.setupSnapshots.where("carId").equals(carId).reverse().sortBy("updatedAt").then((r) => r[0]),
    [carId],
  );

  // Track + feed URL state for sync
  const tracks = useLiveQuery(() => localDb.tracks.toArray()) ?? [];
  const [selectedTrackId, setSelectedTrackId] = useState(() => localStorage.getItem("nlt_last_track_id") ?? "");
  const selectedTrack = tracks.find((t) => t.id === selectedTrackId);
  const feedUrl = selectedTrack?.timingFeedUrl;
  const nltCommunityId = selectedTrack?.nltCommunityId;

  // Race listing
  interface CarNltRaceSummary { id: number; name: string; status: string; mode: string; startedAt: string | null; }
  const [races, setRaces] = useState<CarNltRaceSummary[]>([]);
  const [racesLoading, setRacesLoading] = useState(false);
  const [raceNumber, setRaceNumber] = useState("");

  // Fetch race list
  useEffect(() => {
    if (!feedUrl && !nltCommunityId) { setRaces([]); return; }
    setRacesLoading(true);
    const body: Record<string, unknown> = {};
    if (nltCommunityId) body.communityId = nltCommunityId;
    else body.feedUrl = feedUrl;
    fetch(`${API_BASE}/api/nlt/races`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed");
        return res.json() as Promise<{ races: CarNltRaceSummary[] }>;
      })
      .then((data) => { setRaces(data.races); setRaceNumber(""); })
      .catch(() => setRaces([]))
      .finally(() => setRacesLoading(false));
  }, [feedUrl, nltCommunityId]);

  const selectedRaceObj = races.find((r) => String(r.id) === raceNumber);
  const isLiveRace = selectedRaceObj?.status === "active";

  // Cleanup
  useEffect(() => {
    return () => { if (syncIntervalRef.current) clearInterval(syncIntervalRef.current); };
  }, []);

  // Build URL for the selected race
  const buildSyncUrl = useCallback((): string | null => {
    const trimmed = raceNumber.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("http")) return trimmed;
    if (feedUrl) {
      const base = feedUrl.endsWith("/") ? feedUrl : feedUrl + "/";
      return base + trimmed;
    }
    if (/^\d+$/.test(trimmed)) return `https://nextleveltiming.com/races/${trimmed}`;
    return null;
  }, [raceNumber, feedUrl]);

  /** Sync tick — upserts results for THIS car only */
  const doCarSyncTick = useCallback(async (): Promise<boolean> => {
    const url = buildSyncUrl();
    if (!url) return false;
    try {
      const res = await fetch(`${API_BASE}/api/nlt/scrape`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) return false;
      const data = await res.json() as { eventName: string; community: string; className: string; roundType: string; date: string; position: number; totalEntries?: number; totalLaps: number; totalTimeMs: number; fastLapMs: number; laps: { lapNumber: number; timeMs: number }[] }[];
      if (!data.length) return false;

      // Find the entry matching this car's timing name
      const match = timingName
        ? data.find((d) => d.className.toLowerCase() === timingName)
        : data[0]; // fallback to first entry if no timing name set
      if (!match) return false;

      let newTotal = match.totalLaps;
      let hasNew = false;

      const existingRows = await localDb.raceResults
        .filter((r) => r.sourceUrl === url && r.carId === carId)
        .toArray();
      const existing = existingRows[0];

      // Auto-assign latest setup to new laps
      const lapsWithSetup = match.laps.map((l) => ({
        ...l,
        setupSnapshotId: latestSnapshot?.id,
      }));

      if (existing) {
        if (existing.totalLaps !== match.totalLaps || existing.fastLapMs !== match.fastLapMs) {
          await localDb.raceResults.update(existing.id, {
            totalLaps: match.totalLaps,
            totalTimeMs: match.totalTimeMs,
            fastLapMs: match.fastLapMs,
            avgLapMs: match.totalLaps > 0 ? Math.round(match.totalTimeMs / match.totalLaps) : undefined,
            laps: lapsWithSetup,
            position: match.position,
            _dirty: 1,
          });
          hasNew = true;
        }
      } else {
        await localDb.raceResults.add({
          id: crypto.randomUUID(),
          userId: "local",
          carId,
          eventName: match.eventName,
          community: match.community || undefined,
          className: match.className,
          roundType: match.roundType,
          date: match.date,
          position: match.position,
          totalEntries: match.totalEntries,
          totalLaps: match.totalLaps,
          totalTimeMs: match.totalTimeMs,
          fastLapMs: match.fastLapMs,
          avgLapMs: match.totalLaps > 0 ? Math.round(match.totalTimeMs / match.totalLaps) : undefined,
          laps: lapsWithSetup,
          sourceUrl: url,
          setupSnapshotId: latestSnapshot?.id,
          hidden: 0,
          createdAt: new Date().toISOString(),
          _dirty: 1,
        });
        hasNew = true;
      }

      if (newTotal > lastLapTotalRef.current) {
        lastLapTotalRef.current = newTotal;
        lastNewLapAtRef.current = Date.now();
      }
      return hasNew;
    } catch {
      return false;
    }
  }, [buildSyncUrl, timingName, carId, latestSnapshot?.id]);

  const stopCarSync = useCallback(() => {
    if (syncIntervalRef.current) { clearInterval(syncIntervalRef.current); syncIntervalRef.current = null; }
    setIsSyncing(false);
    setIsPaused(false);
  }, []);

  const startCarSync = useCallback(async () => {
    const url = buildSyncUrl();
    if (!url) return;
    if (selectedTrackId) localStorage.setItem("nlt_last_track_id", selectedTrackId);
    setIsSyncing(true);
    setIsPaused(false);
    lastNewLapAtRef.current = Date.now();
    lastLapTotalRef.current = 0;
    syncStartedAtRef.current = Date.now();
    setSyncStatus(`Started · ${new Date().toLocaleTimeString()}`);

    await doCarSyncTick();
    setSyncStatus(`Last check: ${new Date().toLocaleTimeString()}`);

    // After first tick, find the created/updated record and navigate to live dashboard
    const foundRows = await localDb.raceResults
      .filter((r) => r.sourceUrl === url && r.carId === carId)
      .toArray();
    if (foundRows[0]) {
      setView({ kind: "live-dashboard", raceId: foundRows[0].id });
    }

    syncIntervalRef.current = setInterval(async () => {
      const now = Date.now();
      const idleMins = (now - lastNewLapAtRef.current) / 60000;
      const totalHrs = (now - syncStartedAtRef.current) / 3600000;

      if (totalHrs >= 1 && idleMins >= 60) {
        stopCarSync();
        setSyncStatus("Auto-stopped · no activity in 1 hour");
        return;
      }

      if (idleMins >= 5) {
        setIsPaused(true);
        setSyncStatus(`Paused · no new laps in ${Math.floor(idleMins)}min`);
        if (idleMins >= 10) {
          setIsPaused(false);
          lastNewLapAtRef.current = now;
          await doCarSyncTick();
          setSyncStatus(`Resumed · ${new Date().toLocaleTimeString()}`);
        }
        return;
      }

      setIsPaused(false);
      await doCarSyncTick();
      setSyncStatus(`Last check: ${new Date().toLocaleTimeString()}`);
    }, 8000);
  }, [buildSyncUrl, selectedTrackId, doCarSyncTick, stopCarSync, carId]);

  // ─── End sync engine ──────────────────────────────────

  const raceResults = useLiveQuery(
    () => localDb.raceResults.where("carId").equals(carId).reverse().sortBy("date")
      .then((rows) => showHidden ? rows : rows.filter((r) => !r.hidden)),
    [carId, showHidden],
  );

  const sessions = useLiveQuery(async () => {
    const rows = await localDb.runSessions.where("carId").equals(carId).reverse().sortBy("startedAt");
    const results: (LocalRunSession & { segments: LocalRunSegment[] })[] = [];
    for (const row of rows) {
      const segs = await localDb.runSegments.where("sessionId").equals(row.id).sortBy("segmentNumber");
      results.push({ ...row, segments: segs });
    }
    return results;
  }, [carId]);

  // Load setup snapshots for this car to resolve names
  const snapshots = useLiveQuery(
    () => localDb.setupSnapshots.where("carId").equals(carId).toArray(),
    [carId],
  );

  // Load min/max lap filter from timing match (timingNameRecord declared above in sync engine)
  const minLapMs = timingNameRecord?.minLapMs;
  const maxLapMs = timingNameRecord?.maxLapMs;

  const loading = raceResults === undefined || sessions === undefined;

  if (loading) {
    return <p className="px-4 py-6 text-sm text-neutral-500">Loading…</p>;
  }

  if (view.kind === "addRace") {
    return (
      <div className="px-4 py-4">
        <CarManualRaceEntry carId={carId} onSave={() => setView({ kind: "list" })} onCancel={() => setView({ kind: "list" })} />
      </div>
    );
  }

  if (view.kind === "race-detail") {
    const race = raceResults.find((r) => r.id === view.raceId);
    if (!race) return <p className="px-4 py-6 text-sm text-neutral-500">Race not found.</p>;
    return <RaceRunDetail race={race} carId={carId} onBack={() => setView({ kind: "list" })} />;
  }

  if (view.kind === "live-dashboard") {
    return (
      <CarLiveDashboard
        resultId={view.raceId}
        carId={carId}
        isSyncing={isSyncing}
        isPaused={isPaused}
        syncStatus={syncStatus}
        onBack={() => { stopCarSync(); setView({ kind: "list" }); }}
        minLapMs={minLapMs}
        maxLapMs={maxLapMs}
      />
    );
  }

  const hasRaces = raceResults.length > 0;
  const hasSessions = sessions.length > 0;
  const snapshotMap = new Map((snapshots ?? []).map((s) => [s.id, s]));

  return (
    <div className="px-4 py-4 space-y-4">
      {/* Header with + Add Run */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-neutral-400 uppercase">Run Results</h3>
        <div className="relative">
          <button
            onClick={() => setAddMenuOpen((o) => !o)}
            className="rounded-md bg-blue-600 text-white px-3 py-1 text-xs font-medium hover:bg-blue-500"
          >
            + Add Run
          </button>
          {addMenuOpen && (
            <div className="absolute right-0 mt-1 w-44 rounded-lg bg-neutral-800 border border-neutral-700 shadow-lg z-20 overflow-hidden">
              <button
                onClick={() => { setAddMenuOpen(false); setView({ kind: "addRace" }); }}
                className="w-full text-left px-3 py-2 text-xs text-neutral-200 hover:bg-neutral-700"
              >
                Add Race Result
              </button>
            </div>
          )}
        </div>
      </div>

      {/* NLT Live Sync */}
      <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3 space-y-2">
        <h4 className="text-[10px] font-semibold text-neutral-500 uppercase">Live Timing Sync</h4>
        <div className="flex flex-col gap-2">
          {/* Track selector */}
          <select
            value={selectedTrackId}
            onChange={(e) => setSelectedTrackId(e.target.value)}
            className="w-full rounded-md bg-neutral-800 border border-neutral-700 text-xs text-neutral-200 px-2 py-1.5"
          >
            <option value="">Select track…</option>
            {tracks.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>

          {/* Race selector */}
          {(feedUrl || nltCommunityId) && (
            racesLoading ? (
              <p className="text-[10px] text-neutral-500">Loading races…</p>
            ) : races.length > 0 ? (
              <select
                value={raceNumber}
                onChange={(e) => setRaceNumber(e.target.value)}
                className="w-full rounded-md bg-neutral-800 border border-neutral-700 text-xs text-neutral-200 px-2 py-1.5"
              >
                <option value="">Select race…</option>
                {races.map((r) => (
                  <option key={r.id} value={String(r.id)}>
                    {r.name} {r.status === "active" ? "🔴" : ""}
                  </option>
                ))}
              </select>
            ) : null
          )}

          {/* Timing name status */}
          {timingName && (
            <p className="text-[10px] text-neutral-500">Auto-filtering to: <span className="text-neutral-300 font-medium">{timingName}</span></p>
          )}

          {/* Start / Stop */}
          <div className="flex gap-2">
            {!isSyncing ? (
              <button
                onClick={startCarSync}
                disabled={!raceNumber}
                className="rounded-md bg-green-700 text-white px-3 py-1 text-xs font-medium hover:bg-green-600 disabled:opacity-40"
              >
                {isLiveRace ? "Start Live Sync" : "Import"}
              </button>
            ) : (
              <button
                onClick={stopCarSync}
                className="rounded-md bg-red-700 text-white px-3 py-1 text-xs font-medium hover:bg-red-600"
              >
                Stop Sync
              </button>
            )}
          </div>

          {/* Sync status */}
          {syncStatus && (
            <p className={`text-[10px] ${isPaused ? "text-yellow-400" : "text-neutral-500"}`}>{syncStatus}</p>
          )}
        </div>
      </div>

      {/* NLT Timing Match Config */}
      <TimingToCarMatch carId={carId} />

      {!hasRaces && !hasSessions && (
        <p className="text-center text-neutral-500 text-sm py-8">No runs or race results for this car yet.</p>
      )}

      {/* Run results */}
      {hasRaces && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-neutral-400 uppercase">Run Results</h3>
          {raceResults.map((r) => {
            const setupSnap = r.setupSnapshotId ? snapshotMap.get(r.setupSnapshotId) : undefined;
            const filteredCardLaps = r.laps.filter((l) => {
              if (l.hidden) return false;
              if (l.timeMs >= GAP_THRESHOLD_MS) return false;
              if (minLapMs != null && l.timeMs < minLapMs) return false;
              if (maxLapMs != null && l.timeMs > maxLapMs) return false;
              return true;
            });
            const cardStats = computeLapStats(filteredCardLaps);
            return (
            <button
              key={r.id}
              onClick={() => setView({ kind: "race-detail", raceId: r.id })}
              className="w-full text-left rounded-lg bg-neutral-900 border border-neutral-800 p-3 hover:border-neutral-700 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium text-neutral-200">{r.eventName}</span>
                  <span className="text-xs text-neutral-500 ml-2">{r.className}</span>
                </div>
                <span className="text-xs text-neutral-500">{new Date(r.date).toLocaleDateString()}</span>
              </div>
              <div className="mt-1 flex gap-4 text-xs text-neutral-400">
                <span>P{r.position}{r.totalEntries ? `/${r.totalEntries}` : ""}</span>
                <span>{filteredCardLaps.length} laps</span>
                {cardStats && <span>Fast: {fmt(cardStats.best)}</span>}
                {cardStats && <span>Avg: {fmt(cardStats.avg)}</span>}
              </div>
              {setupSnap && (
                <p className="text-xs text-blue-300 mt-1">Setup: {setupSnap.name}</p>
              )}
              {!setupSnap && (
                <p className="text-xs text-neutral-600 mt-1 italic">No setup assigned — tap to assign</p>
              )}
              {r.community && (
                <p className="text-xs text-neutral-600 mt-1">{r.community}</p>
              )}
            </button>
            );
          })}
        </div>
      )}

      {/* Sessions — expandable cards */}
      {hasSessions && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-neutral-400 uppercase">Sessions</h3>
          {sessions.map((s) => {
            const allLaps = s.segments.flatMap((seg) => (seg.lapTimes ?? []).filter((l) => !l.hidden));
            const filteredLaps = allLaps.filter((l) => {
              if (minLapMs != null && l.timeMs < minLapMs) return false;
              if (maxLapMs != null && l.timeMs > maxLapMs) return false;
              return true;
            });
            const sessionStats = computeLapStats(filteredLaps);
            const isExpanded = expandedSessionId === s.id;

            return (
              <div key={s.id} className="rounded-lg bg-neutral-900 border border-neutral-800 overflow-hidden">
                {/* Session card header */}
                <button
                  onClick={() => setExpandedSessionId(isExpanded ? null : s.id)}
                  className="w-full text-left p-3 hover:bg-neutral-800/50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-neutral-200">
                      {new Date(s.startedAt).toLocaleDateString()}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-neutral-500">
                        {s.endedAt ? "Completed" : "In Progress"}
                      </span>
                      <span className="text-neutral-600 text-xs">{isExpanded ? "▲" : "▼"}</span>
                    </div>
                  </div>
                  {sessionStats && (
                    <div className="mt-1.5 grid grid-cols-4 gap-2">
                      <MiniStat label="Fast Lap" value={fmt(sessionStats.best)} highlight />
                      <MiniStat label="Avg Lap" value={fmt(sessionStats.avg)} />
                      <MiniStat label="Consistency" value={`${sessionStats.consistency.toFixed(1)}%`} />
                      <MiniStat label="Track Time" value={fmtTotal(sessionStats.total)} />
                    </div>
                  )}
                  {!sessionStats && (
                    <p className="mt-1 text-xs text-neutral-500">No lap data</p>
                  )}
                </button>

                {/* Expanded: setup rows */}
                {isExpanded && (
                  <SessionSetupBreakdown
                    session={s}
                    snapshotMap={snapshotMap}
                    carId={carId}
                    minLapMs={minLapMs}
                    maxLapMs={maxLapMs}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="text-center">
      <p className={`text-xs font-semibold ${highlight ? "text-green-400" : "text-neutral-200"}`}>{value}</p>
      <p className="text-[9px] text-neutral-500 uppercase">{label}</p>
    </div>
  );
}

// ─── Session → Setup Breakdown (expandable within session card) ──

interface SetupGroup {
  setupSnapshotId: string;
  setupName: string;
  laps: { lap: { lapNumber: number; timeMs: number; isOutlier?: boolean; hidden?: boolean; setupSnapshotId?: string }; segmentId: string; indexInSegment: number }[];
}

function groupLapsBySetup(
  session: LocalRunSession & { segments: LocalRunSegment[] },
  snapshotMap: Map<string, LocalSetupSnapshot>,
  defaultSetupId?: string,
): SetupGroup[] {
  const groupMap = new Map<string, SetupGroup>();

  for (const seg of session.segments) {
    const segLaps = seg.lapTimes ?? [];
    for (let i = 0; i < segLaps.length; i++) {
      const lap = segLaps[i];
      let effectiveSetupId = lap.setupSnapshotId ?? seg.setupSnapshotId;
      // Fall back to car's last modified setup if snapshot is unknown
      if (!snapshotMap.has(effectiveSetupId) && defaultSetupId) {
        effectiveSetupId = defaultSetupId;
      }
      let group = groupMap.get(effectiveSetupId);
      if (!group) {
        const snap = snapshotMap.get(effectiveSetupId);
        group = { setupSnapshotId: effectiveSetupId, setupName: snap?.name ?? "Unknown Setup", laps: [] };
        groupMap.set(effectiveSetupId, group);
      }
      group.laps.push({ lap, segmentId: seg.id, indexInSegment: i });
    }
  }

  return Array.from(groupMap.values());
}

function SessionSetupBreakdown({
  session,
  snapshotMap,
  carId,
  minLapMs,
  maxLapMs,
}: {
  session: LocalRunSession & { segments: LocalRunSegment[] };
  snapshotMap: Map<string, LocalSetupSnapshot>;
  carId: string;
  minLapMs?: number;
  maxLapMs?: number;
}) {
  const [expandedSetupId, setExpandedSetupId] = useState<string | null>(null);

  // Default setup = car's last modified snapshot
  const latestSnapshot = useLiveQuery(
    () => localDb.setupSnapshots.where("carId").equals(carId).reverse().sortBy("updatedAt").then((s) => s[0]),
    [carId],
  );
  const defaultSetupId = latestSnapshot?.id;

  const setupGroups = useMemo(
    () => groupLapsBySetup(session, snapshotMap, defaultSetupId),
    [session, snapshotMap, defaultSetupId],
  );

  // All snapshots for reassign dropdown
  const allSnapshots = useLiveQuery(
    () => localDb.setupSnapshots.where("carId").equals(carId).reverse().sortBy("updatedAt"),
    [carId],
  );

  const reassignGroup = useCallback(async (group: SetupGroup, newSetupId: string) => {
    // Batch-update all laps in this group to the new setup
    const bySegment = new Map<string, { indexInSegment: number }[]>();
    for (const entry of group.laps) {
      let arr = bySegment.get(entry.segmentId);
      if (!arr) { arr = []; bySegment.set(entry.segmentId, arr); }
      arr.push(entry);
    }
    for (const [segId, entries] of bySegment) {
      const seg = await localDb.runSegments.get(segId);
      if (!seg?.lapTimes) continue;
      const updated = [...seg.lapTimes];
      for (const e of entries) {
        if (e.indexInSegment < updated.length) {
          updated[e.indexInSegment] = { ...updated[e.indexInSegment], setupSnapshotId: newSetupId };
        }
      }
      // If ALL laps in segment now point to newSetupId, also update segment-level
      const allSame = updated.every((l) => l.setupSnapshotId === newSetupId);
      await localDb.runSegments.update(segId, {
        lapTimes: updated,
        ...(allSame ? { setupSnapshotId: newSetupId } : {}),
        _dirty: 1 as const,
      });
    }
  }, []);

  return (
    <div className="border-t border-neutral-800">
      {setupGroups.length === 0 && (
        <p className="px-3 py-3 text-xs text-neutral-500">No lap data in this session.</p>
      )}
      {setupGroups.map((group) => {
        const visibleLaps = group.laps.filter((l) => {
          if (l.lap.hidden) return false;
          if (minLapMs != null && l.lap.timeMs < minLapMs) return false;
          if (maxLapMs != null && l.lap.timeMs > maxLapMs) return false;
          return true;
        });
        const stats = computeLapStats(visibleLaps.map((l) => l.lap));
        const isExpanded = expandedSetupId === group.setupSnapshotId;

        return (
          <div key={group.setupSnapshotId}>
            {/* Setup row */}
            <button
              onClick={() => setExpandedSetupId(isExpanded ? null : group.setupSnapshotId)}
              className="w-full text-left px-3 py-2.5 hover:bg-neutral-800/50 transition-colors border-t border-neutral-800/50 first:border-t-0"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-blue-300 truncate max-w-[45%]">{group.setupName}</span>
                <span className="text-neutral-600 text-xs">{isExpanded ? "▲" : "▼"}</span>
              </div>
              {stats && (
                <div className="mt-1 grid grid-cols-5 gap-1.5">
                  <MiniStat label="Laps" value={String(stats.count)} />
                  <MiniStat label="Best" value={fmt(stats.best)} highlight />
                  <MiniStat label="Avg" value={fmt(stats.avg)} />
                  <MiniStat label="Consistency" value={`${stats.consistency.toFixed(1)}%`} />
                  <MiniStat label="Std Dev" value={fmt(stats.stdDev)} />
                </div>
              )}
            </button>

            {/* Expanded: reassign setup + individual laps */}
            {isExpanded && (
              <div>
                {/* Group-level setup reassign */}
                <div className="px-3 py-2 border-t border-neutral-800/50 bg-neutral-800/30">
                  <label className="text-[10px] text-neutral-500 block mb-0.5">Car Setup for these laps</label>
                  <select
                    value={group.setupSnapshotId}
                    onChange={(e) => { if (e.target.value) reassignGroup(group, e.target.value); }}
                    className="w-full rounded bg-neutral-950 border border-neutral-700 px-2 py-1.5 text-xs text-neutral-200"
                  >
                    {!snapshotMap.has(group.setupSnapshotId) && (
                      <option value={group.setupSnapshotId}>— {group.setupName} —</option>
                    )}
                    {(allSnapshots ?? []).map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <SetupLapsList
                  group={group}
                  snapshotMap={snapshotMap}
                  carId={carId}
                  minLapMs={minLapMs}
                  maxLapMs={maxLapMs}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Laps list within a setup group ───────────────────────────

function SetupLapsList({
  group,
  snapshotMap,
  carId,
  minLapMs,
  maxLapMs,
}: {
  group: SetupGroup;
  snapshotMap: Map<string, LocalSetupSnapshot>;
  carId: string;
  minLapMs?: number;
  maxLapMs?: number;
}) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const countedLaps = group.laps.filter((l) => {
    if (l.lap.hidden) return false;
    if (minLapMs != null && l.lap.timeMs < minLapMs) return false;
    if (maxLapMs != null && l.lap.timeMs > maxLapMs) return false;
    return true;
  });
  const bestMs = countedLaps.length > 0 ? Math.min(...countedLaps.map((l) => l.lap.timeMs)) : 0;

  return (
    <div className="px-3 pb-2 space-y-0.5">
      {group.laps.map((entry, idx) => {
        const { lap } = entry;
        const isOutOfRange = (minLapMs != null && lap.timeMs < minLapMs) || (maxLapMs != null && lap.timeMs > maxLapMs);
        const isBest = lap.timeMs === bestMs && !lap.hidden && !isOutOfRange;
        const isEditing = editingIdx === idx;

        return (
          <div key={`${entry.segmentId}-${entry.indexInSegment}`}>
            <button
              onClick={() => setEditingIdx(isEditing ? null : idx)}
              className={`w-full flex items-center justify-between rounded px-2 py-1.5 text-xs transition-colors ${
                lap.hidden || isOutOfRange
                  ? "bg-neutral-900/30 text-neutral-600 line-through"
                  : isBest
                    ? "bg-green-950/40 border border-green-800/50 text-green-300"
                    : "bg-neutral-900/50 text-neutral-300 hover:bg-neutral-800/50"
              }`}
            >
              <span className="text-neutral-500 w-8">#{lap.lapNumber}</span>
              <span className="font-mono">{fmt(lap.timeMs)}</span>
              <span className="text-neutral-600 text-[10px]">{isEditing ? "▲" : "✎"}</span>
            </button>

            {isEditing && (
              <LapEditForm
                entry={entry}
                snapshotMap={snapshotMap}
                carId={carId}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Lap Edit Form (autosave on blur) ─────────────────────────

function LapEditForm({
  entry,
  snapshotMap: _snapshotMap,
  carId,
}: {
  entry: { lap: { lapNumber: number; timeMs: number; isOutlier?: boolean; hidden?: boolean; setupSnapshotId?: string }; segmentId: string; indexInSegment: number };
  snapshotMap: Map<string, LocalSetupSnapshot>;
  carId: string;
}) {
  const [hidden, setHidden] = useState(!!entry.lap.hidden);
  const [setupId, setSetupId] = useState(entry.lap.setupSnapshotId ?? "");

  // All snapshots for this car (for the dropdown)
  const allSnapshots = useLiveQuery(
    () => localDb.setupSnapshots.where("carId").equals(carId).reverse().sortBy("updatedAt"),
    [carId],
  );

  const save = useCallback(async (newHidden: boolean, newSetupId: string) => {
    const seg = await localDb.runSegments.get(entry.segmentId);
    if (!seg || !seg.lapTimes) return;
    const updated = [...seg.lapTimes];
    if (entry.indexInSegment < updated.length) {
      updated[entry.indexInSegment] = {
        ...updated[entry.indexInSegment],
        hidden: newHidden || undefined,
        setupSnapshotId: newSetupId || undefined,
      };
      await localDb.runSegments.update(entry.segmentId, { lapTimes: updated, _dirty: 1 as const });
    }
  }, [entry.segmentId, entry.indexInSegment]);

  const handleHiddenChange = (checked: boolean) => {
    setHidden(checked);
    save(checked, setupId);
  };

  const handleSetupChange = (id: string) => {
    setSetupId(id);
    save(hidden, id);
  };

  return (
    <div className="ml-3 mr-1 my-1 p-2 rounded bg-neutral-800 border border-neutral-700 space-y-2">
      {/* Setup selector */}
      <div>
        <label className="text-[10px] text-neutral-500 block mb-0.5">Car Setup</label>
        <select
          value={setupId}
          onChange={(e) => handleSetupChange(e.target.value)}
          onBlur={() => save(hidden, setupId)}
          className="w-full rounded bg-neutral-950 border border-neutral-700 px-2 py-1.5 text-xs text-neutral-200"
        >
          <option value="">— segment default —</option>
          {(allSnapshots ?? []).map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>
      {/* Hide toggle */}
      <label className="flex items-center gap-2 cursor-pointer">
        <div
          role="switch"
          aria-checked={hidden}
          onClick={() => handleHiddenChange(!hidden)}
          className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors ${hidden ? "bg-red-600" : "bg-neutral-700"}`}
        >
          <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${hidden ? "translate-x-4" : "translate-x-0"}`} />
        </div>
        <span className="text-xs text-neutral-400">Hide / exclude from KPIs</span>
      </label>
    </div>
  );
}

// ─── Timing to Car Match ──────────────────────────────────────

function TimingToCarMatch({ carId }: { carId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [selectedTrackId, setSelectedTrackId] = useState(() => localStorage.getItem("nlt_last_track_id") ?? "");
  const [raceNumber, setRaceNumber] = useState("");
  const [saved, setSaved] = useState(false);
  const [minLapSec, setMinLapSec] = useState("");
  const [maxLapSec, setMaxLapSec] = useState("");

  // Race listing
  interface NltRaceSummary { id: number; name: string; status: string; mode: string; startedAt: string | null; }
  const [races, setRaces] = useState<NltRaceSummary[]>([]);
  const [racesLoading, setRacesLoading] = useState(false);
  const [racesError, setRacesError] = useState<string | null>(null);

  // Participants from selected race
  const [participants, setParticipants] = useState<string[]>([]);
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [participantsError, setParticipantsError] = useState<string | null>(null);

  // Current saved timing→car match
  const timingNameRecord = useLiveQuery(() => localDb.carTimingNames.get(carId), [carId]);
  const [selectedTimingName, setSelectedTimingName] = useState("");

  useEffect(() => {
    setSelectedTimingName(timingNameRecord?.timingName ?? "");
    if (timingNameRecord?.minLapMs != null) setMinLapSec(String(timingNameRecord.minLapMs / 1000));
    if (timingNameRecord?.maxLapMs != null) setMaxLapSec(String(timingNameRecord.maxLapMs / 1000));
  }, [timingNameRecord]);

  const car = getCarById(carId);
  const carName = car?.name ?? "";

  const tracks = useLiveQuery(() => localDb.tracks.toArray()) ?? [];
  const selectedTrack = tracks.find((t) => t.id === selectedTrackId);
  const feedUrl = selectedTrack?.timingFeedUrl;
  const nltCommunityId = selectedTrack?.nltCommunityId;

  // Is the selected race still active/live?
  const selectedRace = races.find((r) => String(r.id) === raceNumber);
  const isRaceLive = selectedRace?.status === "active";

  // Fetch race list when track changes
  useEffect(() => {
    if (!feedUrl && !nltCommunityId) { setRaces([]); return; }
    setRacesLoading(true);
    setRacesError(null);
    const body: Record<string, unknown> = {};
    if (nltCommunityId) body.communityId = nltCommunityId;
    else body.feedUrl = feedUrl;
    fetch(`${API_BASE}/api/nlt/races`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(async (res) => {
        if (!res.ok) {
          const b = await res.json().catch(() => ({ error: "Failed" }));
          throw new Error(b.error ?? `HTTP ${res.status}`);
        }
        return res.json() as Promise<{ races: NltRaceSummary[] }>;
      })
      .then((data) => { setRaces(data.races); setRaceNumber(""); setParticipants([]); })
      .catch((err) => {
        setRacesError(err instanceof Error ? err.message : "Failed to load races");
        setRaces([]);
      })
      .finally(() => setRacesLoading(false));
  }, [feedUrl, nltCommunityId]);

  // Fetch participants when race changes
  useEffect(() => {
    if (!raceNumber) { setParticipants([]); return; }
    setParticipantsLoading(true);
    setParticipantsError(null);
    fetch(`${API_BASE}/api/nlt/participants/${raceNumber}`)
      .then(async (res) => {
        if (!res.ok) {
          const b = await res.json().catch(() => ({ error: "Failed" }));
          throw new Error(b.error ?? `HTTP ${res.status}`);
        }
        return res.json() as Promise<{ participants: string[] }>;
      })
      .then((data) => { setParticipants(data.participants); })
      .catch((err) => {
        setParticipantsError(err instanceof Error ? err.message : "Failed to load racers");
        setParticipants([]);
      })
      .finally(() => setParticipantsLoading(false));
  }, [raceNumber]);

  const handleSave = async () => {
    if (!selectedTimingName) return;
    const minMs = minLapSec ? parseFloat(minLapSec) * 1000 : undefined;
    const maxMs = maxLapSec ? parseFloat(maxLapSec) * 1000 : undefined;
    await localDb.carTimingNames.put({ carId, timingName: selectedTimingName, minLapMs: minMs, maxLapMs: maxMs });
    if (selectedTrackId) localStorage.setItem("nlt_last_track_id", selectedTrackId);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleClear = async () => {
    await localDb.carTimingNames.delete(carId);
    setSelectedTimingName("");
    setMinLapSec("");
    setMaxLapSec("");
  };

  const buttonLabel = saved ? "Saved ✓" : isRaceLive ? "Sync" : "Import";

  return (
    <div className="rounded-lg bg-neutral-900 border border-neutral-800 overflow-hidden">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-neutral-300 hover:bg-neutral-800"
      >
        <span>Timing to Car Match</span>
        <span className="text-neutral-600">{expanded ? "▲" : "▼"}</span>
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-neutral-800 pt-2">
          {/* Current saved match */}
          {timingNameRecord?.timingName && (
            <div className="flex items-center justify-between rounded bg-green-950/40 border border-green-800/40 px-2 py-1.5">
              <span className="text-[10px] text-green-400">✓ Matched as <strong>{timingNameRecord.timingName}</strong> on import/sync</span>
              <button onClick={handleClear} className="text-[10px] text-neutral-500 hover:text-red-400 ml-2">Clear</button>
            </div>
          )}
          {/* Track selector */}
          <select
            value={selectedTrackId}
            onChange={(e) => { setSelectedTrackId(e.target.value); setRaceNumber(""); setParticipants([]); }}
            className="w-full rounded bg-neutral-950 border border-neutral-700 px-2 py-1.5 text-xs text-neutral-200"
          >
            <option value="">— select track —</option>
            {tracks.map((t) => (
              <option key={t.id} value={t.id}>{t.name}{t.timingFeedUrl ? " ✓" : ""}</option>
            ))}
          </select>
          {racesError && <p className="text-[10px] text-amber-500">{racesError}</p>}
          {/* Race selector */}
          {selectedTrackId && (racesLoading || races.length > 0) && (
            <select
              value={raceNumber}
              onChange={(e) => { setRaceNumber(e.target.value); setParticipants([]); }}
              disabled={racesLoading}
              className="w-full rounded bg-neutral-950 border border-neutral-700 px-2 py-1.5 text-xs text-neutral-200 disabled:opacity-50"
            >
              <option value="">{racesLoading ? "Loading races…" : "— select race —"}</option>
              {races.map((r) => (
                <option key={r.id} value={String(r.id)}>
                  {r.name}{r.startedAt ? ` (${new Date(r.startedAt).toLocaleDateString()})` : ""}{r.status === "active" ? " 🔴" : ""}
                </option>
              ))}
            </select>
          )}
          {/* Min/Max lap filter */}
          {selectedTrackId && (
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-[10px] text-neutral-500 block mb-0.5">Min Lap (sec)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={minLapSec}
                  onChange={(e) => setMinLapSec(e.target.value)}
                  placeholder="e.g. 5.0"
                  className="w-full rounded bg-neutral-950 border border-neutral-700 px-2 py-1.5 text-xs text-neutral-200 placeholder:text-neutral-600"
                />
              </div>
              <div className="flex-1">
                <label className="text-[10px] text-neutral-500 block mb-0.5">Max Lap (sec)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={maxLapSec}
                  onChange={(e) => setMaxLapSec(e.target.value)}
                  placeholder="e.g. 15.0"
                  className="w-full rounded bg-neutral-950 border border-neutral-700 px-2 py-1.5 text-xs text-neutral-200 placeholder:text-neutral-600"
                />
              </div>
            </div>
          )}
          {/* Racer name selector */}
          {raceNumber && (
            <div className="flex gap-2">
              <select
                value={selectedTimingName}
                onChange={(e) => setSelectedTimingName(e.target.value)}
                disabled={participantsLoading}
                className="flex-1 rounded bg-neutral-950 border border-neutral-700 px-2 py-1.5 text-xs text-neutral-200 disabled:opacity-50"
              >
                <option value="">{participantsLoading ? "Loading racers…" : "— select your name —"}</option>
                {participants.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
              <button
                onClick={handleSave}
                disabled={!selectedTimingName || saved}
                className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${saved ? "bg-green-700 text-white" : "bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50"}`}
              >
                {buttonLabel}
              </button>
            </div>
          )}
          {participantsError && <p className="text-[10px] text-amber-500">{participantsError}</p>}
          {!selectedTrackId && !timingNameRecord?.timingName && (
            <p className="text-[10px] text-neutral-600">
              Select a track and race, then pick your racer name to auto-match on import/sync.{carName ? ` Car: ${carName}.` : ""}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Manual Race Entry (for car) ──────────────────────────────

function CarManualRaceEntry({ carId, onSave, onCancel }: { carId: string; onSave: () => void; onCancel: () => void }) {
  const car = getCarById(carId);
  const [form, setForm] = useState({
    eventName: "",
    community: "",
    className: "",
    roundType: "main" as string,
    roundNumber: 1,
    date: new Date().toISOString().slice(0, 10),
    position: 1,
    totalEntries: undefined as number | undefined,
    fastLapMs: 0,
    lapsText: "",
    notes: "",
  });

  const handleSubmit = async () => {
    const laps = parseLapTimesText(form.lapsText);
    const fastLapMs = laps.length > 0 ? Math.min(...laps.map((l) => l.timeMs)) : form.fastLapMs;
    const totalTimeMs = laps.length > 0 ? laps.reduce((s, l) => s + l.timeMs, 0) : 0;
    const totalLaps = laps.length > 0 ? laps.length : 0;
    const avgLapMs = totalLaps > 0 ? Math.round(totalTimeMs / totalLaps) : undefined;

    const result: LocalRaceResult = {
      id: crypto.randomUUID(),
      userId: "local",
      carId,
      eventName: form.eventName || "Race",
      community: form.community || undefined,
      className: form.className || "Open",
      roundType: form.roundType,
      roundNumber: form.roundNumber,
      date: new Date(form.date).toISOString(),
      position: form.position,
      totalEntries: form.totalEntries,
      totalLaps,
      totalTimeMs,
      fastLapMs,
      avgLapMs,
      laps,
      notes: form.notes || undefined,
      createdAt: new Date().toISOString(),
      _dirty: 1,
    };
    await localDb.raceResults.add(result);
    onSave();
  };

  const set = (key: string, value: unknown) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-neutral-200">Add Race Result</h2>
        <button onClick={onCancel} className="text-xs text-neutral-500 hover:text-neutral-300">Cancel</button>
      </div>
      {car && <p className="text-xs text-neutral-500">Car: {car.name}</p>}
      <div className="space-y-3">
        <CarField label="Event Name" value={form.eventName} onChange={(v) => set("eventName", v)} placeholder="e.g. Saturday Night Race" />
        <CarField label="Community / Club" value={form.community} onChange={(v) => set("community", v)} placeholder="e.g. Piedmont Micro RC" />
        <CarField label="Class Name" value={form.className} onChange={(v) => set("className", v)} placeholder="e.g. Evo2 5600kv" />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-neutral-400 block mb-1">Round Type</label>
            <select value={form.roundType} onChange={(e) => set("roundType", e.target.value)}
              className="w-full rounded bg-neutral-900 border border-neutral-700 px-2 py-1.5 text-sm text-neutral-200">
              <option value="practice">Practice</option>
              <option value="qualifying">Qualifying</option>
              <option value="main">Main</option>
              <option value="custom">Custom</option>
            </select>
          </div>
          <CarField label="Round #" value={String(form.roundNumber)} onChange={(v) => set("roundNumber", Number(v) || 1)} type="number" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <CarField label="Date" value={form.date} onChange={(v) => set("date", v)} type="date" />
          <CarField label="Position" value={String(form.position)} onChange={(v) => set("position", Number(v) || 1)} type="number" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <CarField label="Entries" value={form.totalEntries != null ? String(form.totalEntries) : ""} onChange={(v) => set("totalEntries", v ? Number(v) : undefined)} type="number" placeholder="#" />
          <CarField label="Fast Lap (s)" value={form.fastLapMs ? String(form.fastLapMs / 1000) : ""} onChange={(v) => set("fastLapMs", Number(v) * 1000 || 0)} type="number" placeholder="6.861" />
        </div>
        <div>
          <label className="text-xs font-medium text-neutral-400 block mb-1">Lap Times (one per line, in seconds)</label>
          <textarea value={form.lapsText} onChange={(e) => set("lapsText", e.target.value)} rows={4}
            placeholder={"7.236\n7.352\n6.861\n7.419"}
            className="w-full rounded bg-neutral-900 border border-neutral-700 px-2 py-1.5 text-sm text-neutral-200 font-mono" />
        </div>
        <CarField label="Notes" value={form.notes} onChange={(v) => set("notes", v)} placeholder="Optional notes" />
        <button onClick={handleSubmit} className="w-full rounded bg-blue-600 text-white py-2 text-sm font-medium hover:bg-blue-500">
          Save Result
        </button>
      </div>
    </div>
  );
}

function CarField({ label, value, onChange, type = "text", placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-neutral-400 block mb-1">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full rounded bg-neutral-900 border border-neutral-700 px-2 py-1.5 text-sm text-neutral-200" />
    </div>
  );
}

function parseLapTimesText(text: string): { lapNumber: number; timeMs: number }[] {
  return text
    .split(/\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line, i) => {
      const colonMatch = line.match(/^(\d+):(\d+\.?\d*)$/);
      if (colonMatch) {
        const min = Number(colonMatch[1]);
        const sec = Number(colonMatch[2]);
        return { lapNumber: i + 1, timeMs: Math.round((min * 60 + sec) * 1000) };
      }
      const num = Number(line);
      if (isNaN(num)) return null;
      const timeMs = num > 100 ? Math.round(num) : Math.round(num * 1000);
      return { lapNumber: i + 1, timeMs };
    })
    .filter((l): l is { lapNumber: number; timeMs: number } => l !== null);
}

// ─── Race Detail View ─────────────────────────────────────────

// ─── Run Detection (gap-based) ────────────────────────────────

const GAP_THRESHOLD_MS = 60000; // 1 minute — laps >= this are breaks between runs

type RaceLap = { lapNumber: number; timeMs: number; setupSnapshotId?: string; hidden?: boolean };

interface DetectedRaceRun {
  runNumber: number;
  laps: (RaceLap & { idx: number })[];
  gapAfterMs?: number; // the break-lap time following this run
}

function detectRaceRuns(laps: RaceLap[]): DetectedRaceRun[] {
  const runs: DetectedRaceRun[] = [];
  let current: DetectedRaceRun["laps"] = [];
  let runNum = 1;

  for (let i = 0; i < laps.length; i++) {
    const lap = laps[i];
    if (lap.timeMs >= GAP_THRESHOLD_MS) {
      // This is a break — finalize the current run
      if (current.length > 0) {
        runs.push({ runNumber: runNum++, laps: current, gapAfterMs: lap.timeMs });
        current = [];
      }
      continue; // skip gap lap entirely
    }
    current.push({ ...lap, idx: i });
  }
  if (current.length > 0) {
    runs.push({ runNumber: runNum++, laps: current });
  }
  return runs;
}

// ─── Race Run Detail (with setup-grouped runs + AI chat) ─────

/** Format lap ranges for display, e.g. "Laps 2-22, 24-31, 33-35" */
function formatLapRanges(runs: DetectedRaceRun[]): string {
  return runs.map((r) => {
    const first = r.laps[0]?.lapNumber;
    const last = r.laps[r.laps.length - 1]?.lapNumber;
    return first === last ? `${first}` : `${first}–${last}`;
  }).join(", ");
}

/** Group detected runs by setupSnapshotId. Runs with the same setup are merged. */
interface SetupRunGroup {
  setupId: string;
  setupName: string;
  runs: DetectedRaceRun[];
  allLaps: (RaceLap & { idx: number })[];
}

function groupRunsBySetup(
  runs: DetectedRaceRun[],
  snapshotMap: Map<string, { name: string }>,
): SetupRunGroup[] {
  const groups = new Map<string, { runs: DetectedRaceRun[]; laps: (RaceLap & { idx: number })[] }>();
  for (const run of runs) {
    const setupId = run.laps[0]?.setupSnapshotId ?? "";
    const allSame = run.laps.every((l) => (l.setupSnapshotId ?? "") === setupId);
    const key = allSame ? setupId : "";
    let g = groups.get(key);
    if (!g) { g = { runs: [], laps: [] }; groups.set(key, g); }
    g.runs.push(run);
    g.laps.push(...run.laps);
  }
  return Array.from(groups.entries()).map(([id, g]) => ({
    setupId: id,
    setupName: id ? (snapshotMap.get(id)?.name ?? "Unknown Setup") : "Unassigned",
    runs: g.runs,
    allLaps: g.laps,
  }));
}

function RaceRunDetail({
  race,
  carId,
  onBack,
}: {
  race: LocalRaceResult;
  carId: string;
  onBack: () => void;
}) {
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [expandedRun, setExpandedRun] = useState<number | null>(null);
  const [dragRunNumber, setDragRunNumber] = useState<number | null>(null);

  // Min/max lap filter from Timing to Car Match
  const timingNameRecord = useLiveQuery(() => localDb.carTimingNames.get(carId), [carId]);
  const minLapMs = timingNameRecord?.minLapMs;
  const maxLapMs = timingNameRecord?.maxLapMs;

  // Setup snapshots for this car
  const allSnapshots = useLiveQuery(
    () => localDb.setupSnapshots.where("carId").equals(carId).reverse().sortBy("updatedAt"),
    [carId],
  );
  const snapshotMap = useMemo(() => new Map((allSnapshots ?? []).map((s) => [s.id, s])), [allSnapshots]);

  // Detect runs by gap (laps >= 60s)
  const runs = useMemo(() => detectRaceRuns(race.laps), [race.laps]);

  // Group runs by setup
  const setupGroups = useMemo(() => groupRunsBySetup(runs, snapshotMap), [runs, snapshotMap]);

  // Auto-assign unassigned laps to the car's last modified setup
  const latestSetupId = allSnapshots?.[0]?.id;
  useEffect(() => {
    if (!latestSetupId || !race.laps.length) return;
    const hasUnassigned = race.laps.some((l) => !l.setupSnapshotId && l.timeMs < GAP_THRESHOLD_MS);
    if (!hasUnassigned) return;
    const updated = race.laps.map((l) =>
      !l.setupSnapshotId && l.timeMs < GAP_THRESHOLD_MS
        ? { ...l, setupSnapshotId: latestSetupId }
        : l,
    );
    localDb.raceResults.update(race.id, { laps: updated, _dirty: 1 as const });
  }, [race.id, race.laps, latestSetupId]);

  // Helper: is a lap counted for KPIs?
  const isLapCounted = useCallback((lap: RaceLap) => {
    if (lap.hidden) return false;
    if (lap.timeMs >= GAP_THRESHOLD_MS) return false;
    if (minLapMs != null && lap.timeMs < minLapMs) return false;
    if (maxLapMs != null && lap.timeMs > maxLapMs) return false;
    return true;
  }, [minLapMs, maxLapMs]);

  // Overall KPIs (all counted laps)
  const overallStats = useMemo(() => {
    const counted = race.laps.filter(isLapCounted);
    return computeLapStats(counted);
  }, [race.laps, isLapCounted]);

  // Assign setup to a run (batch-updates all laps in the run)
  const assignSetupToRun = useCallback(async (run: DetectedRaceRun, setupId: string) => {
    const updated = [...race.laps];
    for (const lap of run.laps) {
      updated[lap.idx] = { ...updated[lap.idx], setupSnapshotId: setupId || undefined };
    }
    await localDb.raceResults.update(race.id, { laps: updated, _dirty: 1 as const });
  }, [race.id, race.laps]);

  // Drag handlers (desktop)
  const handleDragStart = (e: React.DragEvent, runNumber: number) => {
    e.dataTransfer.setData("text/plain", String(runNumber));
    e.dataTransfer.effectAllowed = "move";
    setDragRunNumber(runNumber);
  };
  const handleDragEnd = () => setDragRunNumber(null);
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; };
  const handleDrop = (e: React.DragEvent, setupId: string) => {
    e.preventDefault();
    const runNum = parseInt(e.dataTransfer.getData("text/plain"), 10);
    const run = runs.find((r) => r.runNumber === runNum);
    if (run) assignSetupToRun(run, setupId);
    setDragRunNumber(null);
  };

  return (
    <div className="px-4 py-4 space-y-4">
      <button onClick={onBack} className="text-xs text-blue-400 hover:text-blue-300">← Back to Runs</button>

      {/* Header */}
      <div>
        <h2 className="text-base font-semibold text-neutral-200">{race.eventName}</h2>
        <div className="flex gap-3 text-xs text-neutral-400 mt-1">
          <span>{race.className}</span>
          <span>{race.roundType}{race.roundNumber ? ` #${race.roundNumber}` : ""}</span>
          <span>{new Date(race.date).toLocaleDateString()}</span>
        </div>
        {race.community && <p className="text-xs text-neutral-500 mt-0.5">{race.community}</p>}
      </div>

      {/* Overall KPIs */}
      <div className="grid grid-cols-3 gap-2">
        <StatBox label="Position" value={`P${race.position}${race.totalEntries ? `/${race.totalEntries}` : ""}`} />
        {overallStats && (
          <>
            <StatBox label="Counted Laps" value={String(overallStats.count)} />
            <StatBox label="Track Time" value={fmtTotal(overallStats.total)} />
            <StatBox label="Fast Lap" value={fmt(overallStats.best)} highlight />
            <StatBox label="Avg Lap" value={fmt(overallStats.avg)} />
            <StatBox label="Consistency" value={`${overallStats.consistency.toFixed(1)}%`} />
          </>
        )}
      </div>

      {/* Setup shelf — drag targets */}
      {(allSnapshots ?? []).length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] text-neutral-500 uppercase">Drag a run to a setup, or use the dropdown inside each run</p>
          <div className="flex flex-wrap gap-1.5">
            {(allSnapshots ?? []).map((s) => (
              <div
                key={s.id}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, s.id)}
                className={`rounded-full px-3 py-1 text-[10px] font-medium border transition-colors cursor-default ${
                  dragRunNumber
                    ? "border-blue-500 bg-blue-950/40 text-blue-300 ring-1 ring-blue-500/30"
                    : "border-neutral-700 bg-neutral-800 text-neutral-400"
                }`}
              >
                {s.name}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Setup-Grouped Runs */}
      {setupGroups.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-neutral-400 uppercase">Runs by Setup</h3>
          {setupGroups.map((group) => {
            const counted = group.allLaps.filter(isLapCounted);
            const groupStats = computeLapStats(counted);
            const isOpen = expandedGroup === group.setupId;

            return (
              <div key={group.setupId || "__unassigned"} className="rounded-lg border border-neutral-800 bg-neutral-900 overflow-hidden">
                {/* Group header */}
                <button
                  onClick={() => setExpandedGroup(isOpen ? null : group.setupId)}
                  className="w-full text-left p-3 hover:bg-neutral-800/50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-medium text-blue-300">{group.setupName}</span>
                      <span className="text-[10px] text-neutral-500 ml-2">
                        ({group.runs.length} run{group.runs.length > 1 ? "s" : ""})
                      </span>
                    </div>
                    <span className="text-neutral-600 text-xs">{isOpen ? "▲" : "▼"}</span>
                  </div>
                  <p className="text-[10px] text-neutral-500 mt-0.5">
                    Laps {formatLapRanges(group.runs)}
                  </p>
                  {groupStats && (
                    <div className="mt-1.5 grid grid-cols-4 gap-2">
                      <MiniStat label="Laps" value={String(groupStats.count)} />
                      <MiniStat label="Fast" value={fmt(groupStats.best)} highlight />
                      <MiniStat label="Avg" value={fmt(groupStats.avg)} />
                      <MiniStat label="Consistency" value={`${groupStats.consistency.toFixed(1)}%`} />
                    </div>
                  )}
                </button>

                {/* Expanded: individual runs + setup selector + AI chat */}
                {isOpen && (
                  <div className="border-t border-neutral-800">
                    {/* Individual runs within this group */}
                    <div className="px-3 py-2 space-y-1">
                      {group.runs.map((run) => {
                        const runCounted = run.laps.filter(isLapCounted);
                        const runStats = computeLapStats(runCounted);
                        const runSetupId = run.laps[0]?.setupSnapshotId ?? "";
                        const isRunExpanded = expandedRun === run.runNumber;
                        const bestInRun = runCounted.length > 0 ? Math.min(...runCounted.map((l) => l.timeMs)) : 0;

                        return (
                          <div key={run.runNumber} className="rounded-md bg-neutral-950 border border-neutral-800 overflow-hidden">
                            <div className="flex items-center">
                              <div
                                draggable
                                onDragStart={(e) => handleDragStart(e, run.runNumber)}
                                onDragEnd={handleDragEnd}
                                className="px-2 py-3 cursor-grab active:cursor-grabbing text-neutral-600 hover:text-neutral-400"
                                title="Drag to a setup"
                              >
                                ⠿
                              </div>
                              <button
                                onClick={() => setExpandedRun(isRunExpanded ? null : run.runNumber)}
                                className="flex-1 text-left p-2 hover:bg-neutral-900/50 transition-colors"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-[11px] font-medium text-neutral-300">
                                    Run {run.runNumber} · Laps {run.laps[0]?.lapNumber}–{run.laps[run.laps.length - 1]?.lapNumber}
                                  </span>
                                  <span className="text-neutral-600 text-xs">{isRunExpanded ? "▲" : "▼"}</span>
                                </div>
                                {runStats && (
                                  <div className="mt-1 grid grid-cols-4 gap-1.5">
                                    <MiniStat label="Laps" value={String(runStats.count)} />
                                    <MiniStat label="Fast" value={fmt(runStats.best)} highlight />
                                    <MiniStat label="Avg" value={fmt(runStats.avg)} />
                                    <MiniStat label="Consistency" value={`${runStats.consistency.toFixed(1)}%`} />
                                  </div>
                                )}
                              </button>
                            </div>

                            {isRunExpanded && (
                              <div className="border-t border-neutral-800">
                                {/* Setup selector for this run */}
                                <div className="px-3 py-2 bg-neutral-800/30">
                                  <label className="text-[10px] text-neutral-500 block mb-0.5">Car Setup for this run</label>
                                  <select
                                    value={runSetupId}
                                    onChange={(e) => { if (e.target.value !== runSetupId) assignSetupToRun(run, e.target.value); }}
                                    className="w-full rounded bg-neutral-950 border border-neutral-700 px-2 py-1.5 text-xs text-neutral-200"
                                  >
                                    <option value="">— assign setup —</option>
                                    {(allSnapshots ?? []).map((s) => (
                                      <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                  </select>
                                </div>

                                {/* Lap list */}
                                <div className="px-3 pb-2 space-y-0.5 mt-2">
                                  {run.laps.map((lap) => {
                                    const filtered = !isLapCounted(lap);
                                    const isBest = lap.timeMs === bestInRun && !filtered;
                                    return (
                                      <div
                                        key={`${lap.lapNumber}-${lap.idx}`}
                                        className={`flex items-center justify-between rounded px-2 py-1.5 text-xs transition-colors ${
                                          filtered
                                            ? "bg-neutral-900/30 text-neutral-600 line-through"
                                            : isBest
                                              ? "bg-green-950/40 border border-green-800/50 text-green-300"
                                              : "bg-neutral-900/50 text-neutral-300"
                                        }`}
                                      >
                                        <span className="text-neutral-500 w-8">#{lap.lapNumber}</span>
                                        <span className="font-mono">{fmt(lap.timeMs)}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Break indicator */}
                            {run.gapAfterMs && (
                              <div className="text-center py-0.5 border-t border-neutral-800/50">
                                <span className="text-[10px] text-neutral-600">·· break ({fmtTotal(run.gapAfterMs)}) ··</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Aggregate KPIs for the group */}
                    {groupStats && (
                      <div className="px-3 pb-2 grid grid-cols-3 gap-1.5">
                        <MiniStat label="Total Time" value={fmtTotal(groupStats.total)} />
                        <MiniStat label="Median" value={fmt(groupStats.median)} />
                        <MiniStat label="Std Dev" value={fmt(groupStats.stdDev)} />
                      </div>
                    )}

                    {/* AI Setup Coach Chat */}
                    {group.setupId && (
                      <SetupCoachChat
                        raceResultId={race.id}
                        setupSnapshotId={group.setupId}
                        carId={carId}
                        runStats={groupStats}
                        lapRanges={formatLapRanges(group.runs)}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {race.sourceUrl && (
        <a
          href={race.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-400 hover:text-blue-300 underline"
        >
          View on Next Level Timing →
        </a>
      )}

      {race.notes && <p className="text-xs text-neutral-400">{race.notes}</p>}
    </div>
  );
}

// ─── AI Setup Coach Chat ─────────────────────────────────────

function buildSystemPrompt(
  car: ReturnType<typeof getCarById>,
  snapshot: LocalSetupSnapshot,
  runStats: ReturnType<typeof computeLapStats>,
  lapRanges: string,
): string {
  const carInfo = car
    ? `Car: ${car.name} (${car.manufacturer}, ${car.scale} scale, ${car.driveType})`
    : "Car: Unknown";

  // Build human-readable setup entries WITH available options
  const entryLines = (car?.capabilities ?? []).map((cap) => {
    const entry = snapshot.entries.find((e) => e.capabilityId === cap.id);
    const currentVal = entry ? String(entry.value) : "(not set)";
    let valDisplay = currentVal;
    if (cap.options) {
      const opt = cap.options.find((o) => String(o.value) === currentVal);
      if (opt) valDisplay = opt.label;
    }
    if (cap.unit && entry) valDisplay += ` ${cap.unit}`;

    // Show available options for pick fields
    let optionsStr = "";
    if (cap.valueType === "pick" && cap.options) {
      optionsStr = `  [options: ${cap.options.map((o) => o.label).join(", ")}]`;
    } else if (cap.valueType === "numeric") {
      const parts: string[] = [];
      if (cap.min != null) parts.push(`min=${cap.min}`);
      if (cap.max != null) parts.push(`max=${cap.max}`);
      if (cap.step != null) parts.push(`step=${cap.step}`);
      if (parts.length) optionsStr = `  [range: ${parts.join(", ")}${cap.unit ? ` ${cap.unit}` : ""}]`;
    }
    return `  ${cap.name} (${cap.id}): ${valDisplay}${optionsStr}`;
  });

  // Build wheel/tire setup section
  const wtLines: string[] = [];
  for (const wt of snapshot.wheelTireSetups ?? []) {
    const pos = `${wt.side} ${wt.position}`;
    const tire = wt.tireId ? allTires.find((t) => t.id === wt.tireId) : undefined;
    const wheel = wt.wheelId ? allWheels.find((w) => w.id === wt.wheelId) : undefined;
    const tireName = tire ? `${tire.name} (${tire.color ?? tire.compound}, ${tire.widthMm}mm)` : wt.tireId ?? "none";
    const wheelName = wheel ? `${wheel.name} (offset ${wheel.offset >= 0 ? "+" : ""}${wheel.offset})` : wt.wheelId ?? "none";
    const mountStr = wt.mount ? `, mount: ${wt.mount.method}${wt.mount.edgeGlue !== "none" ? ` / edge-glue: ${wt.mount.edgeGlue}` : ""}` : "";
    wtLines.push(`  ${pos}: tire=${tireName}, wheel=${wheelName}${mountStr}`);
  }

  // Available tire/wheel inventory
  const tireInventory = allTires.map((t) => `  ${t.name} — ${t.position}, ${t.compound}, ${t.widthMm}mm, color: ${t.color ?? "N/A"}`).join("\n");
  const wheelInventory = allWheels.map((w) => `  ${w.name} — ${w.position}, ${w.widthMm}mm, offset ${w.offset >= 0 ? "+" : ""}${w.offset}`).join("\n");

  const statsText = runStats
    ? `Run Stats (Laps ${lapRanges}):
  Best Lap: ${(runStats.best / 1000).toFixed(3)}s
  Average: ${(runStats.avg / 1000).toFixed(3)}s
  Worst: ${(runStats.worst / 1000).toFixed(3)}s
  Consistency: ${runStats.consistency.toFixed(1)}%
  Std Dev: ${(runStats.stdDev / 1000).toFixed(3)}s
  Total Laps: ${runStats.count}`
    : "No run statistics available.";

  return `You are an expert RC car setup coach for Mini-Z cars. You help the driver improve their car setup based on their driving feedback and lap data.

${carInfo}

Current Setup: "${snapshot.name}"
${entryLines.join("\n")}

Wheel & Tire Setup:
${wtLines.length ? wtLines.join("\n") : "  (none configured)"}

Available Tires:
${tireInventory}

Available Wheels:
${wheelInventory}

${statsText}

GUIDELINES:
- Focus on ONE change at a time when possible. The driver's goal is to make one change per run.
- Ask clarifying questions about how the car feels (understeer, oversteer, traction, etc.) when needed.
- Explain WHY you recommend a change — what effect it will have.
- When you have enough information to suggest a setup change, include a JSON block that specifies the changes.
- Format setup changes as: \`\`\`setup-change\n{"changes": [{"capabilityId": "...", "value": "..."}], "name": "new setup name"}\n\`\`\`
- The driver can then apply these changes to create a new setup.
- Be concise and practical. This is track-side coaching, not a textbook.
- Consider the relationship between settings — e.g. stiffer springs may require damper adjustment.
- Tires are color-coded. The driver may refer to tires by color (e.g. "purple wheels" or "purple tires" mean the same thing). Match color references to the tire/wheel inventory above.
- When suggesting capability changes, use the exact capabilityId and a value from the available options shown above.`;
}

function SetupCoachChat({
  raceResultId,
  setupSnapshotId,
  carId,
  runStats,
  lapRanges,
}: {
  raceResultId: string;
  setupSnapshotId: string;
  carId: string;
  runStats: ReturnType<typeof computeLapStats>;
  lapRanges: string;
}) {
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [creatingSetup, setCreatingSetup] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Load the setup snapshot
  const snapshot = useLiveQuery(() => localDb.setupSnapshots.get(setupSnapshotId), [setupSnapshotId]);
  const car = getCarById(carId);

  // Load or create the chat record for this (race + setup) combo
  const chatRecord = useLiveQuery(
    () => localDb.setupChats
      .where("raceResultId").equals(raceResultId)
      .and((c) => c.setupSnapshotId === setupSnapshotId)
      .first(),
    [raceResultId, setupSnapshotId],
  );

  const messages = chatRecord?.messages ?? [];

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || !snapshot || sending) return;
    setSending(true);
    setInput("");

    const now = new Date().toISOString();
    const userMsg = { role: "user" as const, text, createdAt: now };
    const updatedMessages = [...messages, userMsg];

    // Upsert chat record with user message
    if (chatRecord) {
      await localDb.setupChats.update(chatRecord.id, { messages: updatedMessages, updatedAt: now });
    } else {
      const chatId = crypto.randomUUID();
      await localDb.setupChats.add({
        id: chatId,
        raceResultId,
        setupSnapshotId,
        carId,
        messages: updatedMessages,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Build Gemini request
    const systemPrompt = buildSystemPrompt(car, snapshot, runStats, lapRanges);
    const contents = updatedMessages.map((m) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.text }],
    }));

    try {
      const res = await fetch(`${API_BASE}/api/gemini/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gemini-2.5-flash",
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents,
        }),
      });

      if (!res.ok) throw new Error("Gemini API error");
      const data = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "Sorry, I couldn't generate a response.";

      const aiMsg = { role: "model" as const, text: aiText, createdAt: new Date().toISOString() };
      const withReply = [...updatedMessages, aiMsg];

      // Get the latest chat record (it may have been created above)
      const latest = await localDb.setupChats
        .where("raceResultId").equals(raceResultId)
        .and((c) => c.setupSnapshotId === setupSnapshotId)
        .first();
      if (latest) {
        await localDb.setupChats.update(latest.id, { messages: withReply, updatedAt: aiMsg.createdAt });
      }
    } catch {
      const errMsg = { role: "model" as const, text: "Failed to reach the AI. Check your connection and try again.", createdAt: new Date().toISOString() };
      const latest = await localDb.setupChats
        .where("raceResultId").equals(raceResultId)
        .and((c) => c.setupSnapshotId === setupSnapshotId)
        .first();
      if (latest) {
        await localDb.setupChats.update(latest.id, { messages: [...updatedMessages, errMsg], updatedAt: errMsg.createdAt });
      }
    } finally {
      setSending(false);
    }
  }, [input, snapshot, sending, messages, chatRecord, raceResultId, setupSnapshotId, carId, car, runStats, lapRanges]);

  /** Parse a setup-change JSON block from AI response and create a new setup snapshot. */
  const applySetupChange = useCallback(async (aiText: string) => {
    if (!snapshot) return;
    const match = aiText.match(/```setup-change\n([\s\S]*?)\n```/);
    if (!match) return;
    try {
      setCreatingSetup(true);
      const parsed = JSON.parse(match[1]) as { changes: { capabilityId: string; value: string | number | boolean }[]; name?: string };
      const newEntries = snapshot.entries.map((e) => {
        const change = parsed.changes.find((c) => c.capabilityId === e.capabilityId);
        return change ? { ...e, value: change.value } : e;
      });
      const now = new Date().toISOString();
      const newId = crypto.randomUUID();
      await localDb.setupSnapshots.add({
        ...snapshot,
        id: newId,
        name: parsed.name ?? `${snapshot.name} (AI)`,
        entries: newEntries,
        createdAt: now,
        updatedAt: now,
        _dirty: 1 as const,
      });
    } catch {
      // JSON parse failure — ignore silently
    } finally {
      setCreatingSetup(false);
    }
  }, [snapshot]);

  const hasSetupChange = (text: string) => /```setup-change\n/.test(text);

  return (
    <div className="border-t border-neutral-800 px-3 py-3 space-y-2">
      <h4 className="text-[10px] font-semibold text-neutral-500 uppercase flex items-center gap-1.5">
        <span className="text-purple-400">✦</span> AI Setup Coach
      </h4>

      {/* Chat messages */}
      {messages.length > 0 && (
        <div className="max-h-64 overflow-y-auto space-y-2">
          {messages.map((msg, i) => (
            <div key={i} className={`text-xs ${msg.role === "user" ? "text-neutral-200" : "text-purple-200"}`}>
              <div className="flex items-start gap-2">
                <span className={`text-[9px] font-semibold uppercase mt-0.5 shrink-0 ${msg.role === "user" ? "text-blue-400" : "text-purple-400"}`}>
                  {msg.role === "user" ? "You" : "AI"}
                </span>
                <div className="min-w-0">
                  <div className="whitespace-pre-wrap break-words">{
                    msg.role === "model"
                      ? msg.text.replace(/```setup-change\n[\s\S]*?\n```/g, "[Setup change suggested — see button below]")
                      : msg.text
                  }</div>
                  {msg.role === "model" && hasSetupChange(msg.text) && (
                    <button
                      onClick={() => applySetupChange(msg.text)}
                      disabled={creatingSetup}
                      className="mt-1.5 rounded-md bg-purple-700 text-white px-3 py-1 text-[10px] font-medium hover:bg-purple-600 disabled:opacity-50"
                    >
                      {creatingSetup ? "Creating…" : "Apply Setup Change"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
      )}

      {/* Input */}
      <div className="flex gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder="How did the car feel? (e.g. understeer in corners, loose on exit…)"
          className="flex-1 rounded-md bg-neutral-950 border border-neutral-700 px-2 py-1.5 text-xs text-neutral-200 placeholder:text-neutral-600 resize-none"
          rows={2}
          disabled={sending}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || sending || !snapshot}
          className="self-end rounded-md bg-purple-700 text-white px-3 py-1.5 text-xs font-medium hover:bg-purple-600 disabled:opacity-40"
        >
          {sending ? "…" : "Send"}
        </button>
      </div>

      {!snapshot && (
        <p className="text-[10px] text-neutral-600 italic">Assign a setup to this run group to enable AI coaching.</p>
      )}
    </div>
  );
}

// ─── Car Live Dashboard ──────────────────────────────────────

function CarLiveDashboard({
  resultId,
  carId,
  isSyncing,
  isPaused,
  syncStatus,
  onBack,
  minLapMs,
  maxLapMs,
}: {
  resultId: string;
  carId: string;
  isSyncing: boolean;
  isPaused: boolean;
  syncStatus: string | null;
  onBack: () => void;
  minLapMs?: number;
  maxLapMs?: number;
}) {
  const result = useLiveQuery(() => localDb.raceResults.get(resultId), [resultId]);

  const GAP_MS = 60000;
  const allLaps = result?.laps ?? [];

  const kpiLaps = useMemo(() => allLaps.filter((l) => {
    if (l.hidden) return false;
    if (l.timeMs >= GAP_MS) return false;
    if (minLapMs != null && l.timeMs < minLapMs) return false;
    if (maxLapMs != null && l.timeMs > maxLapMs) return false;
    return true;
  }), [allLaps, minLapMs, maxLapMs]);

  const bestMs = kpiLaps.length > 0 ? Math.min(...kpiLaps.map((l) => l.timeMs)) : 0;
  const avgMs = kpiLaps.length > 0
    ? kpiLaps.reduce((t, l) => t + l.timeMs, 0) / kpiLaps.length
    : 0;
  const worstMs = kpiLaps.length > 0 ? Math.max(...kpiLaps.map((l) => l.timeMs)) : 0;
  const stdDev = useMemo(() => {
    if (kpiLaps.length < 2) return 0;
    const mean = avgMs;
    const variance = kpiLaps.reduce((t, l) => t + (l.timeMs - mean) ** 2, 0) / kpiLaps.length;
    return Math.sqrt(variance);
  }, [kpiLaps, avgMs]);

  const isIgnored = (l: { timeMs: number; hidden?: boolean }) => {
    if (l.hidden) return true;
    if (l.timeMs >= GAP_MS) return true;
    if (minLapMs != null && l.timeMs < minLapMs) return true;
    if (maxLapMs != null && l.timeMs > maxLapMs) return true;
    return false;
  };

  const car = getCarById(carId);

  if (!result) return <p className="text-center text-neutral-500 text-sm py-8">Loading…</p>;

  return (
    <div className="px-4 py-4 space-y-4">
      <button onClick={onBack} className="text-xs text-blue-400 hover:text-blue-300">← Back to Runs</button>

      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-neutral-200">{result.eventName}</h2>
          {isSyncing && (
            <span className={`text-xs ${isPaused ? "text-amber-400" : "text-red-400 animate-pulse"}`}>
              {isPaused ? "⏸ Paused" : "● LIVE"}
            </span>
          )}
        </div>
        {isSyncing && syncStatus && (
          <p className={`text-[10px] mt-0.5 ${isPaused ? "text-amber-400" : "text-green-400"}`}>{syncStatus}</p>
        )}
        <div className="flex gap-3 text-xs text-neutral-400 mt-1">
          <span>{result.className}</span>
          <span>{result.roundType}</span>
          {car && <span>{car.name}</span>}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-2">
        <StatBox label="Position" value={`P${result.position}${result.totalEntries ? `/${result.totalEntries}` : ""}`} />
        <StatBox label="Laps" value={String(kpiLaps.length)} />
        <StatBox label="Fast Lap" value={bestMs > 0 ? fmt(bestMs) : "–"} highlight />
        <StatBox label="Avg Lap" value={avgMs > 0 ? fmt(avgMs) : "–"} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <StatBox label="Worst" value={worstMs > 0 ? fmt(worstMs) : "–"} />
        <StatBox label="Std Dev" value={stdDev > 0 ? fmt(stdDev) : "–"} />
        <StatBox label="Total Time" value={fmtTotal(kpiLaps.reduce((t, l) => t + l.timeMs, 0))} />
      </div>

      {/* Line chart */}
      {kpiLaps.length >= 2 && <CarLapTimeChart laps={kpiLaps} />}

      {/* Lap table — shows ALL laps including ignored */}
      {allLaps.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-neutral-400 uppercase">
            All Laps <span className="text-neutral-600 font-normal">({allLaps.length} total, {allLaps.length - kpiLaps.length} ignored)</span>
          </h3>
          <div className="max-h-80 overflow-y-auto space-y-0.5">
            {allLaps.map((lap) => {
              const ignored = isIgnored(lap);
              const isBest = lap.timeMs === bestMs && !ignored;
              return (
                <div
                  key={lap.lapNumber}
                  className={`flex items-center justify-between rounded px-2 py-1 text-xs ${
                    ignored
                      ? "bg-neutral-900/30 text-neutral-600"
                      : isBest
                        ? "bg-green-950/40 border border-green-800/50 text-green-300"
                        : "bg-neutral-900/50 text-neutral-300"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-neutral-500 w-8">#{lap.lapNumber}</span>
                    {ignored && <span className="text-[9px] text-neutral-600 italic">ignored</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`font-mono ${ignored ? "line-through" : ""}`}>
                      {fmt(lap.timeMs)}
                    </span>
                    {!ignored && bestMs > 0 && lap.timeMs !== bestMs && (
                      <span className="text-[10px] text-neutral-600">
                        +{((lap.timeMs - bestMs) / 1000).toFixed(3)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {result.sourceUrl && (
        <a
          href={result.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-400 hover:text-blue-300 underline"
        >
          View on Next Level Timing →
        </a>
      )}
    </div>
  );
}

// ─── Car Lap Time SVG Chart ──────────────────────────────────

function CarLapTimeChart({ laps }: { laps: { lapNumber: number; timeMs: number }[] }) {
  const W = 360;
  const H = 180;
  const PAD_L = 48;
  const PAD_R = 12;
  const PAD_T = 16;
  const PAD_B = 28;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  const times = laps.map((l) => l.timeMs);
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const yMin = minTime;
  const yMax = Math.max(maxTime, minTime * 2);

  const xScale = (i: number) => PAD_L + (i / Math.max(laps.length - 1, 1)) * plotW;
  const yScale = (ms: number) => PAD_T + plotH - ((ms - yMin) / (yMax - yMin || 1)) * plotH;

  const points = laps.map((l, i) => `${xScale(i)},${yScale(l.timeMs)}`).join(" ");

  const yTicks = 5;
  const yStep = (yMax - yMin) / (yTicks - 1);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto rounded-lg bg-neutral-900 border border-neutral-800">
      {/* Grid lines + Y labels */}
      {Array.from({ length: yTicks }, (_, i) => {
        const ms = yMin + yStep * i;
        const y = yScale(ms);
        return (
          <Fragment key={i}>
            <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} stroke="#333" strokeWidth="0.5" />
            <text x={PAD_L - 4} y={y + 3} textAnchor="end" fill="#666" fontSize="8">
              {(ms / 1000).toFixed(2)}
            </text>
          </Fragment>
        );
      })}

      {/* Data line */}
      <polyline fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeLinejoin="round" points={points} />

      {/* Data dots */}
      {laps.map((l, i) => (
        <circle key={l.lapNumber} cx={xScale(i)} cy={yScale(l.timeMs)} r="2.5" fill={l.timeMs === minTime ? "#22c55e" : "#3b82f6"} />
      ))}

      {/* X labels — first, last, middle */}
      {laps.length > 0 && (
        <>
          <text x={xScale(0)} y={H - 4} textAnchor="middle" fill="#666" fontSize="8">
            #{laps[0].lapNumber}
          </text>
          {laps.length > 2 && (
            <text x={xScale(Math.floor(laps.length / 2))} y={H - 4} textAnchor="middle" fill="#666" fontSize="8">
              #{laps[Math.floor(laps.length / 2)].lapNumber}
            </text>
          )}
          <text x={xScale(laps.length - 1)} y={H - 4} textAnchor="middle" fill="#666" fontSize="8">
            #{laps[laps.length - 1].lapNumber}
          </text>
        </>
      )}
    </svg>
  );
}


