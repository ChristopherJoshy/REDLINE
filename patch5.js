const fs = require('fs');
let c = fs.readFileSync('backend/src/routes/admin.ts', 'utf8');

const regex = /  app\.get\('\/api\/admin\/assessment'[\s\S]*?\}\);/g;
c = c.replace(regex, '');

const regex2 = /  app\.post\('\/api\/admin\/assessment'[\s\S]*?\}\);/g;
c = c.replace(regex2, '');

const insertion = `
  app.get('/api/admin/assessment', async (req, reply) => {
    if (!adminOk(req.headers, env.joinCodePepper)) return reply.code(401).send({ error: 'unauthorized' });
    const row = db.get<{value: string}>('SELECT value FROM game_state WHERE key = ?', 'assessment_settings');
    return row ? JSON.parse(row.value) : { requireFullscreen: false, detectTabSwitches: false, singleTabMode: false, disableRightClick: false, disableCopyPaste: false };
  });
  app.post('/api/admin/assessment', async (req, reply) => {
    if (!adminOk(req.headers, env.joinCodePepper)) return reply.code(401).send({ error: 'unauthorized' });
    const body = req.body as any;
    const settings = { requireFullscreen: !!body.requireFullscreen, detectTabSwitches: !!body.detectTabSwitches, singleTabMode: !!body.singleTabMode, disableRightClick: !!body.disableRightClick, disableCopyPaste: !!body.disableCopyPaste };
    db.run('INSERT INTO game_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', 'assessment_settings', JSON.stringify(settings));
    if (bus) bus.broadcastAll(bus.frame('assessment_settings_sync', settings));
    return settings;
  });
`;

c = c.replace(/(export function registerAdminRoutes[\s\S]*?)(^})/m, (match, p1, p2) => {
  return p1 + insertion + p2;
});

fs.writeFileSync('backend/src/routes/admin.ts', c);
