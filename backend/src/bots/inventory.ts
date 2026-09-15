import type { BotId, InventoryDelta } from "../contracts/events.js";
import type { DatabaseAdapter } from "../db/database.js";

// An explicit tool may improve an article, but never revoke or resell a genuine one.
export function awardItem(db: DatabaseAdapter, teamId: string, botId: BotId, itemKey: string, real: boolean): InventoryDelta | undefined {
  return db.transaction(() => {
    const changed = db.run(
      "INSERT INTO team_inventory (team_id, bot_id, item_key, is_real, status, obtained_at) VALUES (?, ?, ?, ?, 'obtained', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(team_id, bot_id) DO UPDATE SET item_key = excluded.item_key, is_real = excluded.is_real, status = 'obtained', obtained_at = excluded.obtained_at WHERE team_inventory.status != 'verified' AND team_inventory.is_real = 0",
      teamId, botId, itemKey, real ? 1 : 0,
    );
    return changed.changes > 0 ? { botId, itemKey, status: "obtained" } : undefined;
  });
}
