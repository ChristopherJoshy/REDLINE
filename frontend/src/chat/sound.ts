// Sound playback: vendored same-origin files only. Master gain cap 0.5, 300ms fade-in.
// AudioContext unlocks on the first user gesture (autoplay policy).
let ctx: AudioContext | null = null;
let master: GainNode | null = null;

function ensure(): AudioContext | null {
  if (ctx !== null) {
    return ctx;
  }
  try {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  } catch {
    return null;
  }
  return ctx;
}

export function unlockAudio(): void {
  const ac = ensure();
  if (ac !== null && ac.state === "suspended") {
    void ac.resume();
  }
}

export function playSound(src: string): { stop: () => void } {
  const ac = ensure();
  let activeNode: AudioBufferSourceNode | null = null;
  let aborted = false;

  const stopper = {
    stop: () => {
      aborted = true;
      if (activeNode) {
        try {
          activeNode.stop();
        } catch { /* ignore */ }
      }
    }
  };

  if (ac === null || master === null) {
    return stopper;
  }
  void fetch(src)
    .then((r) => r.arrayBuffer())
    .then((buf) => ac.decodeAudioData(buf))
    .then((audio) => {
      if (master === null || aborted) {
        return;
      }
      const node = ac.createBufferSource();
      node.buffer = audio;
      const gain = ac.createGain();
      gain.gain.setValueAtTime(0, ac.currentTime);
      gain.gain.linearRampToValueAtTime(1, ac.currentTime + 0.3);
      node.connect(gain);
      gain.connect(master);
      node.start();
      activeNode = node;
    })
    .catch(() => {});

  return stopper;
}
