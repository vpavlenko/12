import type { SourceMeasure } from "librawl";

export type RhythmChange = { beat: number; groups: number[] };

// This caps the rendered subdivisions per measure without limiting the size of a group.
const MAX_SUBDIVISIONS = 256;

export function isRhythmGrouping(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((group) => Number.isSafeInteger(group) && group > 0)
    && Number.isSafeInteger(value.reduce((sum, group) => sum + group, 0));
}

export function rhythmAt(changes: readonly RhythmChange[] | undefined, beat: number) {
  if (!changes) return undefined;
  for (let index = changes.length - 1; index >= 0; index--) {
    if (changes[index].beat <= beat) return changes[index].groups;
  }
  return undefined;
}

function displayedBeats(measure: SourceMeasure, groups: readonly number[]) {
  const total = groups.reduce((sum, group) => sum + group, 0);
  const divisions = groups.length === 1 ? total : groups.length;
  if (divisions > MAX_SUBDIVISIONS) return [];
  const timedBeats = measure.beatPositions ?? [];
  const matchesSource = timedBeats.length === total - 1;
  if (groups.length === 1 && matchesSource) return timedBeats;

  let groupEnd = 0;
  const offsets = groups.length === 1
    ? Array.from({ length: total - 1 }, (_, index) => index + 1)
    : groups.slice(0, -1).map((size) => groupEnd += size);
  const { start, duration } = measure;
  const positions = offsets.map((offset) => matchesSource
    ? timedBeats[offset - 1]
    : start + duration * (offset / total));
  // Roundoff at very small fractional positions can coincide with an adjacent line.
  return positions.filter((beat, index) => beat > start && beat < start + duration && beat > (positions[index - 1] ?? start));
}

export function measuresWithRhythm(measures: SourceMeasure[], changes: readonly RhythmChange[] | undefined): SourceMeasure[] {
  if (!changes?.length) return measures;
  const atMeasure = new Map(changes.map(({ beat, groups }) => [beat, groups] as const));
  let groups: readonly number[] | undefined;
  return measures.map((measure) => {
    groups = atMeasure.get(measure.start) ?? groups;
    return groups?.length ? { ...measure, beatPositions: displayedBeats(measure, groups) } : measure;
  });
}
