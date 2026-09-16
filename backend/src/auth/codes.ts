// Join codes + sessions. Plaintext codes exist only at creation; only hashes persist.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateJoinCode(): string {
  const bytes = randomBytes(8);
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += ALPHABET[(bytes[i] ?? 0) % ALPHABET.length];
  }
  return code;
}
export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z2-9]/g, "");
}

export function hashJoinCode(normalized: string, pepper: string): string {
  return createHash("sha256").update(pepper + ":" + normalized, "utf8").digest("hex");
}

export function hintFor(normalized: string): string {
  return normalized.slice(0, 4);
}

export function displayCode(normalized: string): string {
  return `${normalized.slice(0, 4)}-${normalized.slice(4)}`;
}

function b64url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function unb64url(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

// Session token: teamId.displayName.nonce.signature (HMAC over all three, keyed by pepper).
// The nonce is per-member server state: bumping it (logout / admin force-logout)
// invalidates every outstanding token while the next login mints a fresh one.
// Legacy 3-part tokens (no nonce) verify as nonce "".
export function makeSessionToken(teamId: string, displayName: string, pepper: string, nonce = ""): string {
  const a = b64url(teamId);
  const b = b64url(displayName);
  const c = b64url(nonce);
  const sig = createHmac("sha256", pepper).update(`${a}.${b}.${c}`, "utf8").digest("hex");
  return `${a}.${b}.${c}.${sig}`;
}

export function verifySessionToken(
  token: string,
  pepper: string,
): { teamId: string; displayName: string; nonce: string } | undefined {
  const parts = token.split(".");
  if (parts.length !== 3 && parts.length !== 4) {
    return undefined;
  }
  if (parts.length === 3) {
    // Legacy token: HMAC over a.b only, carries no nonce (treated as "").
    const [a, b, sig] = parts as [string, string, string];
    const expected = createHmac("sha256", pepper).update(`${a}.${b}`, "utf8").digest("hex");
    const sigBuf = Buffer.from(sig, "utf8");
    const expBuf = Buffer.from(expected, "utf8");
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      return undefined;
    }
    try {
      return { teamId: unb64url(a), displayName: unb64url(b), nonce: "" };
    } catch {
      return undefined;
    }
  }
  const [a, b, c, sig] = parts as [string, string, string, string];
  const expected = createHmac("sha256", pepper).update(`${a}.${b}.${c}`, "utf8").digest("hex");
  const sigBuf = Buffer.from(sig ?? "", "utf8");
  const expBuf = Buffer.from(expected, "utf8");
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return undefined;
  }
  try {
    return { teamId: unb64url(a ?? ""), displayName: unb64url(b ?? ""), nonce: unb64url(c ?? "") };
  } catch {
    return undefined;
  }
}

export function adminOk(provided: string | undefined, adminCode: string | undefined): boolean {
  if (provided === undefined || adminCode === undefined || adminCode === "") {
    return false;
  }
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(adminCode, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (header === undefined) {
    return out;
  }
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) {
      continue;
    }
    try {
      out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
    } catch {
      continue;
    }
  }
  return out;
}
