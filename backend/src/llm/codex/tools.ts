// ToolDef -> Codex DynamicToolSpec converter (single source of truth).
// Verified shape: { type: "function", name, description, inputSchema }.
import type { ToolDef } from "../groq.js";

export interface DynamicFunctionTool {
  type: "function";
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export function toDynamicTools(tools: ToolDef[]): DynamicFunctionTool[] {
  return tools.map((t) => ({
    type: "function" as const,
    name: t.name,
    description: t.description,
    inputSchema: (t.parameters ?? { type: "object", properties: {} }) as Record<string, unknown>,
  }));
}
