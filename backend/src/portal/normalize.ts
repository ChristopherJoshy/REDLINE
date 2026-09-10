// Submission normalization pipeline: strip -> decode -> un-reverse ->
// NFKC fold + leet-fold + acrostic/delimiter-strip. Silent fail: callers never
// learn which normalization fired.
import { createHash } from "node:crypto";

const LEET: Record<string, string> = { "0": "o", "1": "l", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "@": "a", "$": "s", "!": "i" };

function rot13(s: string): string {
  return s.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= "Z" ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
  });
}

function tryBase64(s: string): string[] {
  if (!/^[A-Za-z0-9+/=]+$/.test(s) || s.length % 4 !== 0 || s.length < 8) {
    return [];
  }
  try {
    const decoded = Buffer.from(s, "base64").toString("utf8");
    if (!/^[\x20-\x7E\s]+$/.test(decoded)) {
      return [];
    }
    return [decoded];
  } catch {
    return [];
  }
}

function tryHex(s: string): string[] {
  if (!/^[0-9a-fA-F]+$/.test(s) || s.length % 2 !== 0 || s.length < 8) {
    return [];
  }
  try {
    const decoded = Buffer.from(s, "hex").toString("utf8");
    if (!/^[\x20-\x7E\s]+$/.test(decoded)) {
      return [];
    }
    return [decoded];
  } catch {
    return [];
  }
}

function tryUrl(s: string): string[] {
  if (!s.includes("%")) {
    return [];
  }
  try {
    const decoded = decodeURIComponent(s);
    return decoded === s ? [] : [decoded];
  } catch {
    return [];
  }
}

function unreverse(s: string): string[] {
  const rev = [...s].reverse().join("");
  return rev === s ? [] : [rev];
}

function acrostic(s: string): string[] {
  const words = s.split(/[\s|,/;:_-]+/).filter((w) => w !== "");
  if (words.length < 3) {
    return [];
  }
  return [words.map((w) => w[0] as string).join("")];
}

function fold(s: string): string {
  const leeted = s
    .normalize("NFKC")
    .toLowerCase()
    .split("")
    .map((c) => LEET[c] ?? c)
    .join("");
  return leeted.replace(/[^a-z0-9]/g, "");
}

// Every normalized form of a raw submission. Check BOTH raw and decoded.
export function variants(raw: string): string[] {
  const stripped = raw.trim();
  if (stripped === "") {
    return [];
  }
  const out = new Set<string>([fold(stripped)]);
  const decoded: string[] = [
    ...tryBase64(stripped),
    ...tryHex(stripped),
    ...tryUrl(stripped),
    rot13(stripped),
    ...unreverse(stripped),
    ...acrostic(stripped),
  ];
  for (const d of decoded) {
    out.add(fold(d));
    for (const r of unreverse(d)) {
      out.add(fold(r));
    }
  }
  return [...out];
}

export function hashAnswer(folded: string, pepper: string): string {
  return createHash("sha256").update(pepper + ":" + folded, "utf8").digest("hex");
}

// Hash-compare so the pipeline never early-exits on a named check.
export function matchesAny(forms: string[], expectedFolded: string, pepper: string): boolean {
  const want = hashAnswer(expectedFolded, pepper);
  let hit = false;
  for (const form of forms) {
    const got = hashAnswer(form, pepper);
    if (got.length === want.length && timingEqual(got, want)) {
      hit = true;
    }
  }
  return hit;
}

function timingEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= (a.charCodeAt(i) ^ b.charCodeAt(i)) as number;
  }
  return diff === 0;
}

export function foldAnswer(answer: string): string {
  return fold(answer.trim());
}
