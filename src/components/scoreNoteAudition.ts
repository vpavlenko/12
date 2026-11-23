import type { MidiNote } from "librawl";
import { createSoundFontPlayback, type SoundFontPlayback } from "librawl/audio";

export function createScoreNoteAudition() {
  let context: AudioContext | undefined;
  let playback: SoundFontPlayback | undefined;
  let generation = 0;

  async function play({ pitch, duration }: MidiNote) {
    const request = ++generation;
    try {
      const audio = context ??= new AudioContext();
      if (audio.state !== "running") await audio.resume();
      if (request !== generation) return;
      playback ??= createSoundFontPlayback({ assetBase: import.meta.env.BASE_URL });
      const engine = await playback.prepare(audio);
      if (request === generation) engine.audition({ pitch, duration: Math.min(duration, 2) });
    } catch (error) {
      if (request === generation) console.error("Error auditioning note:", error);
    }
  }

  function cancel() {
    generation++;
    playback?.stopAudition();
  }

  function dispose() {
    generation++;
    playback?.stop();
    playback = undefined;
    void context?.close();
    context = undefined;
  }

  return { play, cancel, dispose };
}
