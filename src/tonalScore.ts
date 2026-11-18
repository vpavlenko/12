import { RAWL_COLORS, type MidiNote, type SourceMeasure, type TonicChange } from "librawl";
import type { PlaybackTimeline } from "librawl/components";
import { mod, tonicAt } from "librawl/geometry";
import { Chord, Interval, Note, Progression } from "tonal";

export type MelodyItem = { pitch: number; onset: number; duration: number };

export type BeatsItem = {
  bar: number;
  beat: number;
  onset: number;
  chord: string | null;
  signature: string | null;
};

const EPSILON = 1e-7;
const WJD_CHORD_TYPES: Record<string, string> = {
  j7: "maj7",
  "j7911#": "maj9#11",
  sus7: "7sus4",
  sus7913: "13sus4",
  "79b": "7b9",
  "79#": "7#9",
  "7911#": "9#11",
  "7913b": "9b13",
  "79": "9",
  "7913": "13",
};

type Measure = SourceMeasure & { sourceNumber: number; beatPositions: number[] };
type TimedNote = MidiNote & { playbackSpan: [start: number, end: number] };
type PickupBeat = { time: number; position: number };

function buildMeasures(beats: BeatsItem[], origin: number, endTime: number) {
  const measures: Measure[] = [];
  let index = 0;
  while (index < beats.length) {
    const first = index;
    const { bar, onset } = beats[index++];
    while (index < beats.length && beats[index].bar === bar) index++;
    const startTime = first === 0 ? origin : onset;
    const stopTime = beats[index]?.onset ?? endTime;
    if (stopTime - startTime <= EPSILON) continue;
    measures.push({
      start: startTime - origin,
      duration: stopTime - startTime,
      sourceNumber: bar,
      beatPositions: beats.slice(first, index)
        .filter(({ beat, onset }) => beat !== 1 && onset > startTime && onset < stopTime - EPSILON)
        .map(({ onset }) => onset - origin),
      playbackSpans: [[startTime, stopTime]],
    });
  }
  return measures;
}

function buildPickupProgress(beats: BeatsItem[], measures: Measure[], origin: number) {
  const firstSoloBeat = beats.findIndex(({ bar }) => bar === 1);
  if (firstSoloBeat <= 0) return [];

  const chorusBeats = new Map<number, Map<number, number>>();
  for (let index = firstSoloBeat; index < beats.length && beats[index].bar <= 12; index++) {
    const { bar, beat, onset } = beats[index];
    const positions = chorusBeats.get(bar) ?? new Map<number, number>();
    positions.set(beat, onset - origin);
    chorusBeats.set(bar, positions);
  }

  const progress: PickupBeat[][] = [];
  let index = 0;
  while (index < firstSoloBeat) {
    const { bar } = beats[index];
    const targetBar = mod(bar - 1) + 1;
    const targetMeasure = measures.find(({ sourceNumber }) => sourceNumber === targetBar);
    const targetBeats = chorusBeats.get(targetBar);
    const points: PickupBeat[] = [];
    while (index < firstSoloBeat && beats[index].bar === bar) {
      const { beat, onset } = beats[index++];
      const position = targetBeats?.get(beat);
      if (position !== undefined) points.push({ time: onset, position });
    }
    if (targetMeasure && points.length) {
      // An incomplete target bar only has positions through its recorded end.
      points.push({ time: beats[index].onset, position: targetMeasure.start + targetMeasure.duration });
      progress.push(points);
    }
  }
  return progress;
}

export function pickupProgressAt(bars: PickupBeat[][], time: number) {
  const bar = bars.find((points) => time >= points[0].time && time < points[points.length - 1].time);
  if (!bar) return;
  const nextIndex = bar.findIndex((point) => time < point.time);
  const previous = bar[nextIndex - 1];
  const next = bar[nextIndex];
  const fraction = (time - previous.time) / (next.time - previous.time);
  return { start: bar[0].position, end: previous.position + fraction * (next.position - previous.position) };
}

function chordNotation(symbol: string, tonicName: string, tonic: number) {
  const [chord, bass] = symbol.split("/");
  const [, root, type] = /^([A-G][b#]?)(.*)$/.exec(chord) ?? [];
  if (!root) return { label: symbol };
  const normalized = root + (WJD_CHORD_TYPES[type] ?? type);
  const rootChroma = Note.chroma(root);
  const bassChroma = bass ? Note.chroma(bass) : null;
  const roots = Progression.toRomanNumerals(tonicName, bass ? [normalized, bass] : [normalized]);
  const rootPitch = rootChroma === null ? undefined : mod(rootChroma - tonic);
  const bassPitch = bassChroma === null ? undefined : mod(bassChroma - tonic);
  const chordIntervals = Chord.get(normalized).intervals.map(Interval.semitones);
  const rootPitches = rootPitch === undefined ? [] : chordIntervals.map((interval) => rootPitch + interval);
  const inversion = rootPitches.findIndex((pitch) => mod(pitch) === bassPitch);
  let pitches = rootPitches;
  if (bassPitch !== undefined && rootPitch !== undefined && rootPitches.length > 0) {
    if (inversion >= 0) {
      const lowest = rootPitches[inversion];
      pitches = rootPitches.map((pitch) =>
        pitch + Math.max(0, Math.ceil((lowest - pitch) / 12)) * 12,
      ).sort((a, b) => a - b);
    } else {
      pitches = [bassPitch > rootPitch ? bassPitch - 12 : bassPitch, ...rootPitches];
    }
  }
  return {
    label: roots.join("/"),
    rootPitch,
    bassPitch,
    tooltip: pitches.length ? { pitches, rootPitches, rootNotation: roots[0], inversion: Math.max(0, inversion) } : undefined,
  };
}

export function buildTonalScore(beats: BeatsItem[], melody: MelodyItem[], key: string) {
  const tonicName = key.split("-")[0] || "C";
  const tonic = Note.chroma(tonicName) ?? 0;
  const transcribed = melody.filter(({ pitch, onset, duration }) =>
    Number.isFinite(pitch) && Number.isFinite(onset) && Number.isFinite(duration) && duration > EPSILON);
  const origin = transcribed.reduce((time, note) => Math.min(time, note.onset), beats[0].onset);
  const lastBeat = beats[beats.length - 1];
  const endTime = transcribed.reduce((time, note) => Math.max(time, note.onset + note.duration), lastBeat.onset);
  const end = endTime - origin;
  const notes: TimedNote[] = transcribed.map(({ pitch, onset, duration }, index) => ({
    id: String(index), pitch, start: onset - origin, duration, voice: 0, playbackSpan: [onset, onset + duration],
  }));
  const measures = buildMeasures(beats, origin, endTime);
  const lastNoteStart = notes.reduce((last, note) => Math.max(last, note.start), 0);
  const phraseStarts = measures.filter(({ sourceNumber }) => (sourceNumber - 1) % 4 === 0)
    .map(({ start }) => start);
  const chorusStarts = measures.filter(({ sourceNumber, start }) =>
    sourceNumber >= 1 && (sourceNumber - 1) % 12 === 0 && start <= lastNoteStart)
    .map(({ start }) => start);
  const firstChorus = measures.find(({ sourceNumber }) => sourceNumber === 1)?.start;
  const hasLongPickup = measures.filter(({ sourceNumber }) => sourceNumber < 1).length > 1;
  const terminalBar = lastBeat.beat === 1 && lastBeat.onset === endTime ? end : undefined;
  const symbols = beats.flatMap(({ chord, onset }) => chord ? [{ chord, start: onset - origin }] : []);
  const harmony = symbols.flatMap(({ chord, start }, index) => {
    if (chord === "NC") return [];
    const stop = symbols[index + 1]?.start ?? end;
    return stop - start > EPSILON ? [{ ...chordNotation(chord, tonicName, tonic), start, end: stop }] : [];
  });

  const pickupProgress = buildPickupProgress(beats, measures, origin);
  return {
    notes, measures, tonic, end, origin, harmony, chorusStarts, phraseStarts,
    firstChorus, hasLongPickup, terminalBar, pickupProgress, sourceBeats: beats,
  };
}

export type TonalScore = ReturnType<typeof buildTonalScore>;

export function buildPlaybackTimeline(score: TonalScore, changes: TonicChange[], audioTime: (time: number) => number): PlaybackTimeline {
  const sections = new Set(score.chorusStarts);
  let previousTonic = score.tonic;
  const coloredMarks = changes.flatMap(({ beat, tonic }) => {
    const shift = mod(tonic - previousTonic);
    previousTonic = tonic;
    return beat > 0 && shift ? [{ time: audioTime(score.origin + beat), color: RAWL_COLORS[shift].background }] : [];
  });
  return {
    sections: score.chorusStarts.map((start) => audioTime(score.origin + start)),
    phrases: score.phraseStarts.filter((start) => !sections.has(start)).map((start) => audioTime(score.origin + start)),
    coloredMarks,
    bassBars: score.notes.map(({ pitch, start, duration, playbackSpan }) => {
      const degree = mod(pitch - tonicAt(score.tonic, changes, start + duration / 2));
      return { start: audioTime(playbackSpan[0]), end: audioTime(playbackSpan[1]), color: RAWL_COLORS[degree].background };
    }),
  };
}
