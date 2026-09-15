const fs = require('fs');
let c = fs.readFileSync('frontend/src/App.tsx', 'utf8');

c = c.replace(
  '  const [hideNav, setHideNav] = useState(false);',
  '  const [hideNav, setHideNav] = useState(false);\n  const [assessmentSettings, setAssessmentSettings] = useState<any>({});'
);

c = c.replace(
  '    function handleNavVis(e: Event) {',
  '    function handleAssessment(e: Event) {\n      const custom = e as CustomEvent<any>;\n      setAssessmentSettings(custom.detail);\n    }\n    window.addEventListener("arena:assessment_settings", handleAssessment);\n    function handleNavVis(e: Event) {'
);

c = c.replace(
  '      window.removeEventListener("arena:nav_visibility", handleNavVis);\n    };\n  }, []);',
  '      window.removeEventListener("arena:nav_visibility", handleNavVis);\n      window.removeEventListener("arena:assessment_settings", handleAssessment);\n    };\n  }, []);'
);

c = c.replace(
  'locked={!FULLSCREEN_LOCK_ENABLED || locked}',
  'locked={!assessmentSettings.requireFullscreen || locked}'
);

fs.writeFileSync('frontend/src/App.tsx', c);
