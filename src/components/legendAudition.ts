const SAMPLES = [
  { midi: 48, file: "C3.mp3" },
  { midi: 60, file: "C4.mp3" },
  { midi: 72, file: "C5.mp3" },
];

type AuditionOptions = {
  kind: "note" | "chord" | "scale";
  onActiveNote?: (index: number | null) => void;
};

export function createLegendAudition() {
  let context: AudioContext | undefined;
  let stopPrevious: (() => void) | undefined;
  const buffers = new Map<string, Promise<AudioBuffer>>();

  function sample(audio: AudioContext, file: string) {
    let pending = buffers.get(file);
    if (!pending) {
      pending = fetch(import.meta.env.BASE_URL + "piano/" + file)
        .then((response) => {
          if (!response.ok) throw new Error(`Piano sample: HTTP ${response.status}`);
          return response.arrayBuffer();
        })
        .then((bytes) => audio.decodeAudioData(bytes));
      buffers.set(file, pending);
      void pending.catch(() => {
        if (buffers.get(file) === pending) buffers.delete(file);
      });
    }
    return pending;
  }

  function audition(pitches: number[], { kind, onActiveNote }: AuditionOptions) {
    stopPrevious?.();
    const audio = context ??= new AudioContext();
    const output = audio.createGain();
    output.gain.value = 0.45;
    output.connect(audio.destination);
    const scheduled = new Set<AudioBufferSourceNode>();
    const timers: number[] = [];
    let stopped = false;

    function cancel() {
      if (stopped) return;
      stopped = true;
      for (const timer of timers) window.clearTimeout(timer);
      for (const note of scheduled) note.stop();
      scheduled.clear();
      output.disconnect();
      if (stopPrevious === cancel) stopPrevious = undefined;
    }
    stopPrevious = cancel;

    const ready = audio.resume();
    const notes = pitches.map((pitch) => {
      const midi = pitch + 48;
      const entry = SAMPLES.reduce((nearest, candidate) =>
        Math.abs(midi - candidate.midi) < Math.abs(midi - nearest.midi) ? candidate : nearest,
      );
      return sample(audio, entry.file).then((buffer) => ({
        buffer,
        rate: 2 ** ((midi - entry.midi) / 12),
      }));
    });
    void Promise.all([ready, Promise.all(notes)]).then(([, voices]) => {
      if (stopped) return;
      const spacing = kind === "scale" ? 0.5 : 0.06;
      const start = audio.currentTime + 0.015;
      voices.forEach(({ buffer, rate }, index) => {
        const note = audio.createBufferSource();
        const envelope = audio.createGain();
        const onset = start + index * spacing;
        note.buffer = buffer;
        note.playbackRate.value = rate;
        envelope.gain.setValueAtTime(1, onset);
        envelope.gain.setValueAtTime(1, onset + 0.41);
        envelope.gain.linearRampToValueAtTime(0, onset + 0.5);
        note.connect(envelope).connect(output);
        note.onended = () => {
          scheduled.delete(note);
          if (!stopped && !scheduled.size) {
            onActiveNote?.(null);
            cancel();
          }
        };
        scheduled.add(note);
        note.start(onset);
        note.stop(onset + 0.5);
        if (onActiveNote) timers.push(window.setTimeout(
          () => onActiveNote(index),
          Math.max(0, (onset - audio.currentTime) * 1000),
        ));
      });
      if (!voices.length) cancel();
    }).catch(() => {
      if (!stopped) onActiveNote?.(null);
      cancel();
    });
    return cancel;
  }

  function dispose() {
    stopPrevious?.();
    void context?.close();
    context = undefined;
    buffers.clear();
  }

  return { audition, dispose };
}
