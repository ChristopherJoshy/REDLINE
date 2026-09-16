const fs = require('fs');

let text = fs.readFileSync('backend/src/routes/admin.ts', 'utf-8');

text = text.replace(
    /return \{ rows \};/,
    'const r2 = round2Status(db) === "active";\n    return { rows, round2: r2 };'
);

text = text.replace(
    /\(SELECT COUNT\(\*\) FROM team_inventory i WHERE i.team_id = t.id AND i.status = 'verified'\) AS solved,/,
    CASE WHEN (SELECT status FROM gates LIMIT 1) = 'round2' THEN
          (SELECT COUNT(*) FROM team_inventory i JOIN r2_assignments a ON i.team_id = a.team_id AND i.bot_id = a.boss WHERE i.team_id = t.id AND i.status = 'verified')
        ELSE
          (SELECT COUNT(*) FROM team_inventory i WHERE i.team_id = t.id AND i.status = 'verified' AND i.bot_id != 'itachi' AND i.bot_id != 'aizen')
        END AS solved,
);

text = text.replace(
    /\(SELECT display_name FROM team_members m WHERE m.team_id = t.id ORDER BY rowid ASC LIMIT 1\) AS hint,/,
    COALESCE(
          (SELECT obtained_by FROM team_inventory WHERE team_id = t.id AND status = 'verified' AND obtained_by IS NOT NULL GROUP BY obtained_by ORDER BY COUNT(*) DESC LIMIT 1),
          (SELECT display_name FROM chat_logs WHERE team_id = t.id AND role = 'user' AND display_name IS NOT NULL AND display_name != '' GROUP BY display_name ORDER BY COUNT(*) DESC LIMIT 1),
          (SELECT display_name FROM team_members WHERE team_id = t.id ORDER BY rowid ASC LIMIT 1)
        ) AS hint,
);

fs.writeFileSync('backend/src/routes/admin.ts', text, 'utf-8');
console.log('done admin.ts');

let front = fs.readFileSync('frontend/src/screens/AdminBoard.tsx', 'utf-8');
front = front.replace(
    'const data = (await res.json()) as { rows: BoardRow[] };',
    'const data = (await res.json()) as { rows: BoardRow[]; round2?: boolean };\n        setIsRound2(data.round2 ?? false);'
);
// replace second occurrence
front = front.replace(
    'const data = (await res.json()) as { rows: BoardRow[] };',
    'const data = (await res.json()) as { rows: BoardRow[]; round2?: boolean };\n        setIsRound2(data.round2 ?? false);'
);
front = front.replace(
    'const [rows, setRows] = useState<BoardRow[]>([]);',
    'const [rows, setRows] = useState<BoardRow[]>([]);\n  const [isRound2, setIsRound2] = useState(false);'
);
front = front.replace(
    '{r.solved}/8',
    '{r.solved}/{isRound2 ? 1 : 8}'
);

fs.writeFileSync('frontend/src/screens/AdminBoard.tsx', front, 'utf-8');
console.log('done AdminBoard.tsx');

