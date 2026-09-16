// Token and TPS telemetry tracker for REDLINE Arena
// Maintains cumulative token counters, rolling-window TPS (Tokens Per Second),
// peak TPS, and generation throughput metrics.
import type { DatabaseAdapter } from "../db/database.js";

export interface TokenMetrics {
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  currentTps: number;
  peakTps: number;
  averageTps: number;
  totalRequests: number;
}

class TokenTracker {
  private totalPromptTokens = 0;
  private totalCompletionTokens = 0;
  private totalRequests = 0;
  private peakTps = 0;
  private totalActiveStreamDurationMs = 0;
  private recentDeltas: Array<{ timestamp: number; count: number }> = [];
  private db: DatabaseAdapter | null = null;
  private initialized = false;

  init(db: DatabaseAdapter): void {
    this.db = db;
    if (this.initialized) return;
    this.initialized = true;

    try {
      const promptRow = db.get<{ value: string }>("SELECT value FROM game_state WHERE key = 'total_prompt_tokens'");
      const compRow = db.get<{ value: string }>("SELECT value FROM game_state WHERE key = 'total_completion_tokens'");
      const reqRow = db.get<{ value: string }>("SELECT value FROM game_state WHERE key = 'total_llm_requests'");
      const peakRow = db.get<{ value: string }>("SELECT value FROM game_state WHERE key = 'peak_tps'");

      if (promptRow?.value) this.totalPromptTokens = parseInt(promptRow.value, 10) || 0;
      if (compRow?.value) this.totalCompletionTokens = parseInt(compRow.value, 10) || 0;
      if (reqRow?.value) this.totalRequests = parseInt(reqRow.value, 10) || 0;
      if (peakRow?.value) this.peakTps = parseFloat(peakRow.value) || 0;
    } catch {
      // game_state table might be empty or initializing
    }
  }

  /**
   * Record a streamed token delta chunk to feed the live rolling TPS calculator.
   */
  recordTokenDelta(count: number = 1): void {
    const now = Date.now();
    this.recentDeltas.push({ timestamp: now, count });
    this.pruneOldDeltas(now);

    const tps = this.computeCurrentTps(now);
    if (tps > this.peakTps) {
      this.peakTps = tps;
      this.saveState("peak_tps", this.peakTps.toString());
    }
  }

  /**
   * Record completed stream token usage (exact or estimated) and active duration.
   */
  recordStreamUsage(prompt: number, completion: number, durationMs?: number, provider?: string, model?: string): void {
    const safePrompt = Math.max(0, prompt);
    const safeCompletion = Math.max(0, completion);
    
    this.totalPromptTokens += safePrompt;
    this.totalCompletionTokens += safeCompletion;
    this.totalRequests += 1;
    if (durationMs && durationMs > 0) {
      this.totalActiveStreamDurationMs += durationMs;
    }

    this.saveState("total_prompt_tokens", this.totalPromptTokens.toString());
    this.saveState("total_completion_tokens", this.totalCompletionTokens.toString());
    this.saveState("total_llm_requests", this.totalRequests.toString());

    if (provider && model && this.db) {
      try {
        const promptKey = `model_usage:${provider}:${model}:prompt`;
        const compKey = `model_usage:${provider}:${model}:completion`;
        
        this.db.run(
          "INSERT INTO game_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + ?",
          promptKey, safePrompt.toString(), safePrompt
        );
        this.db.run(
          "INSERT INTO game_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + ?",
          compKey, safeCompletion.toString(), safeCompletion
        );
      } catch {
        // Non-blocking telemetry
      }
    }
  }

  private saveState(key: string, value: string): void {
    if (!this.db) return;
    try {
      this.db.run(
        "INSERT INTO game_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        key,
        value,
      );
    } catch {
      // Non-blocking in background telemetry
    }
  }

  private pruneOldDeltas(now: number): void {
    // 5-second sliding window for current TPS calculation
    const cutoff = now - 5000;
    while (this.recentDeltas.length > 0 && (this.recentDeltas[0]?.timestamp ?? 0) < cutoff) {
      this.recentDeltas.shift();
    }
  }

  private computeCurrentTps(now = Date.now()): number {
    this.pruneOldDeltas(now);
    if (this.recentDeltas.length < 2) {
      return 0;
    }

    // Check if generation was idle for > 2000ms
    const lastDelta = this.recentDeltas[this.recentDeltas.length - 1];
    if (!lastDelta || now - lastDelta.timestamp > 2000) {
      return 0;
    }

    const oldest = this.recentDeltas[0]?.timestamp ?? now;
    const durationSec = (now - oldest) / 1000;
    if (durationSec < 0.2) return 0;

    const totalTokensInWindow = this.recentDeltas.reduce((sum, d) => sum + d.count, 0);
    const tps = totalTokensInWindow / durationSec;
    return Math.round(tps * 10) / 10;
  }

  getMetrics(): TokenMetrics {
    const now = Date.now();
    const currentTps = this.computeCurrentTps(now);
    const totalTokens = this.totalPromptTokens + this.totalCompletionTokens;
    const avgTps = this.totalActiveStreamDurationMs > 0
      ? Math.round((this.totalCompletionTokens / (this.totalActiveStreamDurationMs / 1000)) * 10) / 10
      : 0;

    return {
      totalTokens,
      promptTokens: this.totalPromptTokens,
      completionTokens: this.totalCompletionTokens,
      currentTps,
      peakTps: this.peakTps,
      averageTps: avgTps,
      totalRequests: this.totalRequests,
    };
  }
}

export const tokenTracker = new TokenTracker();
