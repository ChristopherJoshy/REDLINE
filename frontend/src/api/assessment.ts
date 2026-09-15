import { apiFetch } from "./client";
import type { AssessmentSettingsData as AssessmentSettings } from "@contracts/events";

export type { AssessmentSettings };

export async function getAssessmentSettings(adminCode: string): Promise<AssessmentSettings> {
  const res = await apiFetch("/api/admin/assessment", { headers: { "x-admin-code": adminCode } });
  if (!res.ok) throw new Error("Could not load assessment settings.");
  return await res.json() as AssessmentSettings;
}

export async function updateAssessmentSettings(adminCode: string, settings: AssessmentSettings): Promise<AssessmentSettings> {
  const res = await apiFetch("/api/admin/assessment", {
    method: "POST",
    headers: { "x-admin-code": adminCode, "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error("Could not update assessment settings.");
  return await res.json() as AssessmentSettings;
}
