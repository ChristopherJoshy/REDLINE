import type { AssessmentSettingsData } from "../contracts/events.js";
import type { DatabaseAdapter } from "../db/database.js";

export const DEFAULT_ASSESSMENT_SETTINGS: AssessmentSettingsData = {
  requireFullscreen: false,
  detectTabSwitches: false,
  singleTabMode: false,
  disableRightClick: false,
  disableCopyPaste: false,
};

export function readAssessmentSettings(db: DatabaseAdapter): AssessmentSettingsData {
  const raw = db.get<{ value: string }>(
    "SELECT value FROM game_state WHERE key = ?",
    "assessment_settings",
  )?.value;
  if (raw === undefined) return DEFAULT_ASSESSMENT_SETTINGS;
  try {
    const value = JSON.parse(raw) as Partial<AssessmentSettingsData>;
    return {
      requireFullscreen: value.requireFullscreen === true,
      detectTabSwitches: value.detectTabSwitches === true,
      singleTabMode: value.singleTabMode === true,
      disableRightClick: value.disableRightClick === true,
      disableCopyPaste: value.disableCopyPaste === true,
    };
  } catch {
    return DEFAULT_ASSESSMENT_SETTINGS;
  }
}

export function normalizeAssessmentSettings(value: unknown): AssessmentSettingsData {
  const body = value !== null && typeof value === "object"
    ? value as Partial<Record<keyof AssessmentSettingsData, unknown>>
    : {};
  return {
    requireFullscreen: body.requireFullscreen === true,
    detectTabSwitches: body.detectTabSwitches === true,
    singleTabMode: body.singleTabMode === true,
    disableRightClick: body.disableRightClick === true,
    disableCopyPaste: body.disableCopyPaste === true,
  };
}
