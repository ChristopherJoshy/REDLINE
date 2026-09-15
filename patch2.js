const fs = require('fs');
let c = fs.readFileSync('frontend/src/screens/EnterScreen.tsx', 'utf8');

c = c.replace(/  \/\/ Poll active seats every 3s once we have a teamId[\s\S]*?  \}, \[joined\]\);/m, 
`  // WebSocket for presence and assessment settings
  useEffect(() => {
    if (joined === null) return;
    const { teamId } = joined;
    let dead = false;
    
    const ws = new WebSocket(wsUrl());
    ws.onopen = () => {
      ws.send(JSON.stringify(createFrame("hello", { teamId, displayName: "", round: "r1" })));
    };
    ws.onmessage = (e) => {
      if (dead) return;
      try {
        const event = parseEvent(e.data);
        if (event.event === "presence_sync") {
          const members = (event as any).data.members;
          const active = members.map((m: any) => m.displayName);
          setActiveMembers(active);
          
          const pmap: Record<string, string> = {};
          for (const m of members) {
            pmap[m.displayName] = m.status;
          }
          setPresenceMap(pmap);
        } else if (event.event === "assessment_settings_sync") {
          window.dispatchEvent(new CustomEvent("arena:assessment_settings", { detail: (event as any).data }));
        }
      } catch {}
    };

    async function poll(): Promise<void> {
      try {
        const active = await getActiveMembers(teamId);
        if (!dead) {
          setActiveMembers((prev) => prev.length > 0 ? prev : active);
        }
      } catch {}
    }
    void poll();
    
    return () => { dead = true; ws.close(); };
  }, [joined]);`);

fs.writeFileSync('frontend/src/screens/EnterScreen.tsx', c);
