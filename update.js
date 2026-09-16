const fs = require('fs');

let text = fs.readFileSync('backend/src/chat/handler.ts', 'utf-8');

text = text.replace(
    'db.run("INSERT INTO chat_logs (team_id, bot_id, role, text_final) VALUES (?, ?, ?, ?)", teamId, botId, "user", text);',
    'db.run("INSERT INTO chat_logs (team_id, bot_id, role, text_final, display_name) VALUES (?, ?, ?, ?, ?)", teamId, botId, "user", text, displayName);'
);

text = text.replace(
    'inventoryDelta = awardItem(db, teamId, botId, assignedKey, parsed.real) ?? inventoryDelta;',
    'inventoryDelta = awardItem(db, teamId, botId, assignedKey, parsed.real, displayName) ?? inventoryDelta;'
);

text = text.replace(
    'db.run("INSERT INTO chat_logs (team_id, bot_id, role, text_final) VALUES (?, ?, ?, ?)", teamId, botId, "assistant", fullText);',
    'db.run("INSERT INTO chat_logs (team_id, bot_id, role, text_final, display_name) VALUES (?, ?, ?, ?, ?)", teamId, botId, "assistant", fullText, displayName);'
);

text = text.replace(
    '"SELECT bot_id AS botId, item_key AS itemKey, status FROM team_inventory WHERE team_id = ?",',
    '"SELECT bot_id AS botId, item_key AS itemKey, status, obtained_by AS obtainedBy FROM team_inventory WHERE team_id = ?",'
);

fs.writeFileSync('backend/src/chat/handler.ts', text, 'utf-8');
console.log('done');
