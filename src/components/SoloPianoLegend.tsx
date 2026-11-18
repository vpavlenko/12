import { useEffect, useMemo } from "react";
import { FoldablePianoLegend } from "librawl/components";
import "librawl/piano-legend.css";
import { Note } from "tonal";
import { createLegendAudition } from "./legendAudition";

export function SoloPianoLegend({ tonicKey }: { tonicKey: string }) {
  const tonic = Note.chroma(tonicKey.split("-")[0]) ?? 0;
  const player = useMemo(createLegendAudition, []);
  useEffect(() => player.dispose, [player, tonicKey]);
  return (
    <FoldablePianoLegend
      currentTonic={tonic}
      storageKey="piano-legend"
      onAudition={player.audition}
    />
  );
}
