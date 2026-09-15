const fs = require('fs');
let c = fs.readFileSync('frontend/src/App.tsx', 'utf8');

c = c.replace(
  '{FULLSCREEN_LOCK_ENABLED && <FullscreenLock onLockChange={onLockChange} />}',
  '{assessmentSettings.requireFullscreen && <FullscreenLock onLockChange={onLockChange} />}'
);
c = c.replace(
  '<AntiTamper />',
  '<AntiTamper settings={assessmentSettings} />'
);

fs.writeFileSync('frontend/src/App.tsx', c);
