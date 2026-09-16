const fs = require('fs');

const files = [
    'backend/src/routes/admin.ts',
    'backend/src/routes/round2.ts',
    'backend/src/routes/merchant.ts',
    'backend/src/server.ts'
];

for (const file of files) {
    let text = fs.readFileSync(file, 'utf-8');
    text = text.replaceAll(
        '"SELECT bot_id AS botId, item_key AS itemKey, status FROM team_inventory WHERE team_id = ?",',
        '"SELECT bot_id AS botId, item_key AS itemKey, status, obtained_by AS obtainedBy FROM team_inventory WHERE team_id = ?",'
    );
    fs.writeFileSync(file, text, 'utf-8');
}
console.log('done');
