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

function firstRenderedBeatIndex(beats: BeatsItem[], firstNote: number) {
  let start = 0;
  for (let index = 1; index < beats.length; index++) {
    if (beats[start].bar >= 1 || beats[index].onset > firstNote) break;
    if (beats[index].bar !== beats[start].bar) start = index;
  }
  return start;
}

function buildCountInProgress(
  beats: BeatsItem[], measures: Measure[], origin: number, firstRenderedBeat: number, audioStart: number,
) {
  if (audioStart >= origin) return [];

  const chorusBeats = new Map<number, Map<number, number>>();
  for (const { bar, beat, onset } of beats) {
    if (bar < 1) continue;
    if (bar > 12) break;
    const positions = chorusBeats.get(bar) ?? new Map<number, number>();
    positions.set(beat, onset - origin);
    chorusBeats.set(bar, positions);
  }

  const firstBeat = beats[0];
  const openingIntervals = beats.slice(1, 5).map(({ onset }, index) => onset - beats[index].onset)
    .filter((duration) => duration > EPSILON).sort((a, b) => a - b);
  const beatDuration = openingIntervals[Math.floor(openingIntervals.length / 2)];
  const beatsPerBar = parseInt(beats.find(({ signature }) => signature)?.signature ?? "4", 10);
  const inferredBeats: Pick<BeatsItem, "bar" | "beat" | "onset">[] = [];
  let { bar, beat, onset } = firstBeat;
  // Keep recorded beats in the trimmed pickup. Estimate only the earlier,
  // unannotated audio using the opening tempo and known bar and beat.
  if (beatDuration && beatsPerBar > 0) {
    while (onset > audioStart || beat > 1) {
      if (--beat === 0) {
        bar--;
        beat = beatsPerBar;
      }
      onset -= beatDuration;
      inferredBeats.push({ bar, beat, onset });
    }
  }
  const leadIn = [...inferredBeats.reverse(), ...beats.slice(0, firstRenderedBeat + 1)];

  const progress: PickupBeat[][] = [];
  let index = 0;
  while (index < leadIn.length - 1) {
    const { bar: sourceBar } = leadIn[index];
    const targetBar = mod(sourceBar - 1) + 1;
    const targetMeasure = measures.find(({ sourceNumber }) => sourceNumber === targetBar);
    const targetBeats = chorusBeats.get(targetBar);
    const points: PickupBeat[] = [];
    while (index < leadIn.length - 1 && leadIn[index].bar === sourceBar) {
      const { beat, onset } = leadIn[index++];
      const position = targetBeats?.get(beat);
      if (position !== undefined) points.push({ time: onset, position });
    }
    const nextBeat = leadIn[index];
    if (targetMeasure && points.length && nextBeat.onset > audioStart) {
      const nextPosition = nextBeat.bar === sourceBar ? targetBeats?.get(nextBeat.beat) : undefined;
      points.push({
        time: nextBeat.onset, position: nextPosition ?? targetMeasure.start + targetMeasure.duration,
      });
      progress.push(points);
    }
  }
  return progress;
}

export function countInProgressAt(score: TonalScore, time: number) {
  if (time >= score.origin) return;
  const bar = score.countInProgress.find((points) => time >= points[0].time && time < points[points.length - 1].time);
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

export function buildTonalScore(beats: BeatsItem[], melody: MelodyItem[], key: string, audioStart?: number) {
  const tonicName = key.split("-")[0] || "C";
  const tonic = Note.chroma(tonicName) ?? 0;
  const transcribed = melody.filter(({ pitch, onset, duration }) =>
    Number.isFinite(pitch) && Number.isFinite(onset) && Number.isFinite(duration) && duration > EPSILON);
  const firstNote = transcribed.reduce((time, note) => Math.min(time, note.onset), Infinity);
  const lastNoteEnd = transcribed.reduce((time, note) => Math.max(time, note.onset + note.duration), -Infinity);
  const firstRenderedBeat = firstRenderedBeatIndex(beats, firstNote);
  const renderedBeats = beats.slice(firstRenderedBeat);
  const origin = Math.min(firstNote, renderedBeats[0].onset);
  const lastBeat = beats[beats.length - 1];
  const recordedEndTime = Math.max(lastNoteEnd, lastBeat.onset);
  const recordedMeasures = buildMeasures(renderedBeats, origin, recordedEndTime);
  const lastBar = recordedMeasures[recordedMeasures.length - 1]?.sourceNumber ?? 0;
  const lastFullChorusBar = Math.floor(lastBar / 12) * 12;
  // Keep complete choruses and any later measures reached by a sounding note.
  const trailingRest = lastFullChorusBar >= 12 && transcribed.length > 0
    ? recordedMeasures.findIndex(({ sourceNumber, start }) => sourceNumber > lastFullChorusBar && start >= lastNoteEnd - origin)
    : -1;
  const end = trailingRest < 0 ? recordedEndTime - origin : recordedMeasures[trailingRest].start;
  const measures = trailingRest < 0 ? recordedMeasures : recordedMeasures.slice(0, trailingRest);
  const notes: TimedNote[] = transcribed.map(({ pitch, onset, duration }, index) => ({
    id: String(index), pitch, start: onset - origin, duration, voice: 0, playbackSpan: [onset, onset + duration],
  }));
  const lastNoteStart = notes.reduce((last, note) => Math.max(last, note.start), 0);
  const phraseStarts = measures.filter(({ sourceNumber }) => (sourceNumber - 1) % 4 === 0)
    .map(({ start }) => start);
  const chorusStarts = measures.filter(({ sourceNumber, start }) =>
    sourceNumber >= 1 && (sourceNumber - 1) % 12 === 0 && start <= lastNoteStart)
    .map(({ start }) => start);
  const firstChorus = measures.find(({ sourceNumber }) => sourceNumber === 1)?.start;
  const hasLongPickup = measures.filter(({ sourceNumber }) => sourceNumber < 1).length > 1;
  const terminalBar = trailingRest >= 0 || (lastBeat.beat === 1 && lastBeat.onset === recordedEndTime) ? end : undefined;
  const symbols = beats.flatMap(({ chord, onset }) => chord && onset - origin < end ? [{ chord, start: onset - origin }] : []);
  const harmony = symbols.flatMap(({ chord, start }, index) => {
    if (chord === "NC") return [];
    const stop = symbols[index + 1]?.start ?? end;
    return stop - start > EPSILON ? [{ ...chordNotation(chord, tonicName, tonic), start, end: stop }] : [];
  });

  const countInProgress = audioStart === undefined ? []
    : buildCountInProgress(beats, measures, origin, firstRenderedBeat, audioStart);
  return { notes, measures, tonic, end, origin, harmony, chorusStarts, phraseStarts, firstChorus, hasLongPickup, terminalBar, countInProgress };
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
