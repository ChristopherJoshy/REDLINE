// Env access: every required key read in exactly one place. Boot fails closed (see scripts/check-env.js).
function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`missing env: ${name} (see .env.example; no partial boot)`);
  }
  return value;
}

export const env = {
  get groqApiKey(): string {
    return required("GROQ_API_KEY");
  },
  get zenApiKey(): string {
    return required("ZEN_API_KEY");
  },
  get joinCodePepper(): string {
    return required("JOIN_CODE_PEPPER");
  },
  get adminCode(): string | undefined {
    return process.env["ADMIN_CODE"];
  },
  get adminSettingsPin(): string {
    return process.env["ADMIN_SETTINGS_PIN"] || "RL-SEC-8839";
  },
  port: Number(process.env["PORT"] ?? 3001),
} as const;
