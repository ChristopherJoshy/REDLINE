const fs = require('fs');
let c = fs.readFileSync('frontend/src/screens/AdminTeams.tsx', 'utf8');

c = c.replace(/type="button"[\s\S]*?onClick=\{\(\) => setTab\("gates"\)\}[\s\S]*?<\/button>/m, (match) => {
  return match + `\n              <button
                type="button"
                onClick={() => setTab("proctoring" as any)}
                className={\`flex items-center gap-2 px-5 py-2.5 rounded-md text-[13px] font-bold  tracking-wider font-mono transition cursor-pointer \${
                  tab === "proctoring" as any
                    ? "bg-brass text-text-1 border border-brass"
                    : "bg-surface-1 border border-border text-text-3 hover:bg-border hover:text-text-1"
                }\`}
              >
                <ShieldAlert className="w-4 h-4" />
                <span>Proctoring</span>
              </button>`;
});

c = c.replace(/{tab === "gates" && <RoundControls adminCode=\{adminCode\} \/>}/, 
`{tab === "gates" && <RoundControls adminCode={adminCode} />}
          {tab === "proctoring" as any && <AssessmentControls adminCode={adminCode} />}`);

if (!c.includes('import AssessmentControls')) {
  c = 'import AssessmentControls from "@/components/AssessmentControls";\n' + c;
}

fs.writeFileSync('frontend/src/screens/AdminTeams.tsx', c);
