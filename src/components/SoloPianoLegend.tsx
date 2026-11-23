import { useEffect, useMemo, useState } from "react";
import type { TonicChange } from "librawl";
import { FoldablePianoLegend } from "librawl/components";
import type { NotePlaybackClock } from "librawl/native";
import "librawl/piano-legend.css";
import { Note } from "tonal";
import type { TonalScore } from "../tonalScore";
import { createLegendAudition } from "./legendAudition";

type Props = {
  tonicKey: string;
  score?: TonalScore;
  changes: TonicChange[];
  playback: NotePlaybackClock;
};

export function SoloPianoLegend({ tonicKey, score, changes, playback }: Props) {
  const tonic = Note.chroma(tonicKey.split("-")[0]) ?? 0;
  const [activeTonic, setActiveTonic] = useState(tonic);
  const player = useMemo(createLegendAudition, []);
  useEffect(() => player.dispose, [player, tonicKey]);

  useEffect(() => {
    if (!score) return;
    setActiveTonic(tonic);
    const regions = [{ beat: Math.min(0, score.origin) - score.origin, tonic }, ...changes];
    const unregister = regions.map(({ beat, tonic }, index) => {
      const end = regions[index + 1]?.beat ?? score.end;
      return playback.register(score.origin + beat, score.origin + end, (active) => {
        if (active) setActiveTonic(tonic);
      });
    });
    return () => unregister.forEach((remove) => remove());
  }, [changes, playback, score, tonic]);

  return (
    <FoldablePianoLegend
      currentTonic={score ? activeTonic : tonic}
      storageKey="piano-legend"
      onAudition={player.audition}
    />
  );
}
