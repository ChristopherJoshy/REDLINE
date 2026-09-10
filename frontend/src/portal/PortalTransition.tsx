import { useEffect, useRef, useState } from "react";

// Vault transition: ~3s brass swirl + hum loop, hard cut to round 2.
// Reduced-motion: static poster + caption, short dissolve, same cut.
// WebGL unavailable: CSS swirl fallback, same duration, same cut.
const DURATION_MS = 3000;

const VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const FRAG = `
precision mediump float;
varying vec2 vUv;
uniform float uTime;
uniform float uZoom;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

void main() {
  vec2 p = (vUv - 0.5) * 2.0 * uZoom;
  float r = length(p);
  float a = atan(p.y, p.x);
  float swirl = a * 3.0 + uTime * 1.6 - r * 4.0;
  float n = noise(vec2(swirl, r * 3.0 - uTime * 0.7)) * 0.6
          + noise(vec2(swirl * 2.0, r * 6.0 + uTime)) * 0.4;
  float bands = smoothstep(0.15, 0.9, n * (1.2 - r * 0.55));
  vec3 deep = vec3(0.078, 0.063, 0.043);
  vec3 mid = vec3(0.431, 0.333, 0.078);
  vec3 hi = vec3(0.953, 0.929, 0.878);
  vec3 col = mix(deep, mid, bands);
  col = mix(col, hi, pow(bands, 3.0) * 0.9);
  col *= 1.0 - smoothstep(0.7, 1.4, r);
  float suck = smoothstep(0.0, 0.25, r) * 0.5 + 0.5;
  gl_FragColor = vec4(col * suck, 1.0);
}
`;

async function tryThree(canvas: HTMLCanvasElement, reduced: boolean, done: () => void): Promise<() => void> {
  const THREE = await import("three");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const uniforms = { uTime: { value: 0 }, uZoom: { value: 1 } };
  const quad = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, depthTest: false }),
  );
  quad.frustumCulled = false;
  scene.add(quad);
  let raf = 0;
  const start = performance.now();
  function frame(now: number): void {
    const t = (now - start) / 1000;
    uniforms.uTime.value = reduced ? 0 : t;
    uniforms.uZoom.value = reduced ? 1 : 1 + (t / (DURATION_MS / 1000)) * 0.9;
    renderer.render(scene, camera);
    if (now - start < DURATION_MS) {
      raf = requestAnimationFrame(frame);
    } else {
      done();
    }
  }
  raf = requestAnimationFrame(frame);
  return () => {
    cancelAnimationFrame(raf);
    quad.geometry.dispose();
    quad.material.dispose();
    renderer.dispose();
  };
}

export default function PortalTransition({ onDone }: { onDone: () => void }): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const [noGl, setNoGl] = useState(false);
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const hum = new Audio("/sounds/portal/open-loop.mp3");
    hum.loop = true;
    hum.volume = 0.5;
    hum.play().catch(() => {});
    const whoosh = (): void => {
      const w = new Audio("/sounds/portal/enter-whoosh.mp3");
      w.volume = 0.5;
      w.play().catch(() => {});
    };
    let cleanup = (): void => {};
    let finished = false;
    const finish = (): void => {
      if (finished) {
        return;
      }
      finished = true;
      whoosh();
      hum.pause();
      doneRef.current();
    };
    const canvas = canvasRef.current;
    if (canvas !== null && !reduced) {
      let alive = true;
      tryThree(canvas, reduced, finish)
        .then((stop) => {
          if (alive) {
            cleanup = stop;
          } else {
            stop();
          }
        })
        .catch(() => {
          // WebGL unavailable: CSS fallback runs the same duration.
          setNoGl(true);
          window.setTimeout(finish, DURATION_MS);
        });
      const obs = new IntersectionObserver((entries) => {
        if (entries[0]?.isIntersecting === false) {
          cleanup();
          alive = false;
        }
      });
      obs.observe(canvas);
      return () => {
        alive = false;
        obs.disconnect();
        cleanup();
        hum.pause();
      };
    }
    const timer = window.setTimeout(finish, reduced ? 200 : DURATION_MS);
    return () => {
      window.clearTimeout(timer);
      hum.pause();
    };
  }, []);

  return (
    <div className="dark-cinematic fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-bg-0)]" role="status" aria-label="Entering round 2">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {noGl && <div className="portal-fallback absolute inset-0" aria-hidden="true" />}
      <p className="relative font-[family-name:var(--font-vault)] text-[22px] tracking-wide text-[var(--color-text-1)]">
        Entering the vault
      </p>
    </div>
  );
}
