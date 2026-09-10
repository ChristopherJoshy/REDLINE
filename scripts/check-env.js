// Fail-closed env gate: `npm run dev` and server boot refuse partial startup.
const REQUIRED = ["GROQ_API_KEY", "ZEN_API_KEY", "JOIN_CODE_PEPPER"];
const missing = REQUIRED.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(`missing env: ${missing.join(", ")} (see .env.example; no partial boot)`);
  process.exit(1);
}
