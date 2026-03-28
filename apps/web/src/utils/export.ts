import type { SetupSnapshot, CarDefinition, RunSession } from "@setupiq/shared";

/**
 * Export a setup snapshot as a CSV string.
 */
export function exportSetupCsv(
  setup: SetupSnapshot,
  car: CarDefinition
): string {
  const rows: string[][] = [
    ["SetupIQ Setup Export"],
    ["Car", `${car.manufacturer} ${car.name}`],
    ["Setup Name", setup.name],
    ["Created", setup.createdAt],
    ["Updated", setup.updatedAt],
    [],
    ["Category", "Setting", "Value"],
  ];

  for (const entry of setup.entries) {
    const cap = car.capabilities.find((c) => c.id === entry.capabilityId);
    const category = cap?.category ?? "";
    const name = cap?.name ?? entry.capabilityId;
    const option = cap?.options?.find((o) => o.value === entry.value);
    const displayValue = option?.label ?? String(entry.value);
    rows.push([category, name, displayValue]);
  }

  if (setup.notes) {
    rows.push([]);
    rows.push(["Notes", setup.notes]);
  }

  return rows.map((r) => r.map(csvEscape).join(",")).join("\n");
}

/**
 * Export a run session as a CSV string.
 */
export function exportSessionCsv(session: RunSession): string {
  const rows: string[][] = [
    ["SetupIQ Session Export"],
    ["Session ID", session.id],
    ["Started", session.startedAt],
    ["Ended", session.endedAt ?? "In Progress"],
    [],
  ];

  for (const seg of session.segments) {
    rows.push(["Segment " + seg.segmentNumber]);
    rows.push(["Setup", seg.setupSnapshotId]);

    if (seg.feedback) {
      rows.push(["Handling", seg.feedback.handling.join("; ")]);
      rows.push(["Consistency", String(seg.feedback.consistency) + "/5"]);
      if (seg.feedback.notes) rows.push(["Notes", seg.feedback.notes]);
    }

    if (seg.lapTimes && seg.lapTimes.length > 0) {
      rows.push([]);
      rows.push(["Lap", "Time (s)", "Outlier"]);
      for (const lap of seg.lapTimes) {
        rows.push([
          String(lap.lapNumber),
          (lap.timeMs / 1000).toFixed(3),
          lap.isOutlier ? "Yes" : "",
        ]);
      }
    }
    rows.push([]);
  }

  if (session.notes) {
    rows.push(["Session Notes", session.notes]);
  }

  return rows.map((r) => r.map(csvEscape).join(",")).join("\n");
}

/**
 * Trigger a CSV file download in the browser.
 */
export function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}
