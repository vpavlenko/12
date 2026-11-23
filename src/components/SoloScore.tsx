import { useCallback, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { RawlNotation, useTonicRecoloring, type MidiNote, type RawlNotationProps, type ScoreRow, type TonicChange } from "librawl";
import { RomanNumeral, ScorePinchContent, useScorePinch } from "librawl/components";
import { alignScoreRows, PITCH_STEP } from "librawl/geometry";
import type { NotePlaybackClock } from "librawl/native";
import "librawl/style.css";
import "librawl/native.css";
import "librawl/roman-numerals.css";
import { countInProgressAt, type TonalScore } from "../tonalScore";
import type { SectionGroup, SectionStarts } from "../soloAnnotations";
import "./SoloScore.css";

export const DEFAULT_TIME_SPACING = 25;
const CHORD_LABEL_SCALE = 0.63;

function stackedRows(score: TonalScore, separatePickup: boolean) {
  const sectionStarts = score.formStarts ?? score.chorusStarts;
  const firstSection = score.formStarts?.[0] ?? score.firstChorus;
  const starts = [0, ...sectionStarts.filter((start) => start > 0 && (separatePickup || start !== firstSection))];
  return starts.map((start, index) => {
    const end = starts[index + 1] ?? score.end;
    const anchor = !separatePickup && index === 0 ? firstSection ?? start : start;
    return { start, end, anchor };
  });
}

function sameSectionStarts(rows: ScoreRow[], starts: number[]) {
  return rows.length === starts.length && rows.every((row, index) => row.start === starts[index]);
}

function restoreSectionRows(score: TonalScore, rows: ScoreRow[], starts: number[] | undefined) {
  const end = rows[rows.length - 1].end;
  if (!starts || starts[0] !== rows[0].start || starts[starts.length - 1] >= end
    || sameSectionStarts(rows, starts)
    || starts.slice(1).some((start) => !score.measures.some((measure) => measure.start === start))) return rows;
  const authored = new Map(rows.map((row) => [row.start, row]));
  return alignScoreRows(starts.map((start, index) => ({
    ...authored.get(start), start, end: starts[index + 1] ?? end,
  }))).rows;
}

const percentOf = (row: ScoreRow, beat: number) => `${(beat - row.start) / (row.end - row.start) * 100}%`;

function harmonyInRow(score: TonalScore, row: ScoreRow) {
  return score.harmony.flatMap((harmony) => {
    const start = Math.max(harmony.start, row.start);
    const end = Math.min(harmony.end, row.end);
    return start < end ? [{ ...harmony, start }] : [];
  });
}

function placeChordLabels(anchors: number[], widths: number[], gap: number, available: number) {
  let end = 0;
  const offsets = widths.map((width) => {
    const offset = end;
    end += width + gap;
    return offset;
  });
  const slack = Math.max(0, available - end + gap);
  const runs: { start: number; end: number; mean: number }[] = [];
  const positions = [...offsets];

  // Merge overlapping runs to minimize the displacement from the chord changes.
  anchors.forEach((anchor, index) => {
    let run = { start: index, end: index + 1, mean: anchor - offsets[index] };
    while (runs.length && runs[runs.length - 1].mean > run.mean) {
      const previous = runs.pop()!;
      const sum = previous.mean * (previous.end - previous.start) + run.mean * (run.end - run.start);
      run = { start: previous.start, end: run.end, mean: sum / (run.end - previous.start) };
    }
    runs.push(run);
  });
  for (const { start, end, mean } of runs) {
    const shift = Math.max(0, Math.min(slack, mean));
    for (let index = start; index < end; index++) positions[index] += shift;
  }
  return positions;
}

function fitChordLabels(container: HTMLDivElement) {
  const headers = Array.from(container.querySelectorAll<HTMLElement>(".solo-score-harmony"),
    (header) => ({ header, labels: Array.from(header.querySelectorAll<HTMLElement>(".solo-score-chord")) }));
  const fit = () => {
    const gap = 4;
    const rows = headers.flatMap(({ header, labels }) => {
      const width = parseFloat(getComputedStyle(header).width);
      if (!width || !labels.length) return [];
      const widths = labels.map((label) => label.offsetWidth + 1);
      const anchors = labels.map((label) => parseFloat(getComputedStyle(label).left));
      const required = widths.reduce((sum, value) => sum + value) + (labels.length - 1) * gap;
      return [{ width, labels, widths, anchors, scale: width / required }];
    });
    const fittedScale = rows.reduce((limit, row) => Math.min(limit, row.scale), 1);
    const scale = fittedScale * CHORD_LABEL_SCALE;
    container.style.setProperty("--solo-chord-scale", String(scale));
    for (const { width, labels, widths, anchors } of rows) {
      const positions = placeChordLabels(anchors.map((anchor) => anchor + 4), widths.map((value) => value * scale), gap * fittedScale, width);
      labels.forEach((label, index) => {
        label.style.setProperty("--solo-chord-offset", `${positions[index] - anchors[index]}px`);
      });
    }
  };
  fit();
  const observer = new ResizeObserver(fit);
  for (const { header, labels } of headers) {
    observer.observe(header);
    labels.forEach((label) => observer.observe(label));
  }
  return () => observer.disconnect();
}

export type ScorePlaybackPosition = {
  time?: number;
  listeners: Set<(time?: number) => void>;
};
type PlaybackPosition = RefObject<ScorePlaybackPosition>;

function HarmonyHeader({ score, row, playbackPosition, inline }: {
  score: TonalScore;
  row: ScoreRow;
  playbackPosition?: PlaybackPosition;
  inline?: boolean;
}) {
  const progressLine = useRef<HTMLDivElement>(null);
  const chords = useMemo(() => harmonyInRow(score, row), [score, row]);
  const hasCountIn = !!playbackPosition && score.countInProgress.some((points) =>
    points[0].position < row.end - 1e-7 && points[points.length - 1].position > row.start + 1e-7);

  useLayoutEffect(() => {
    const line = progressLine.current;
    if (!playbackPosition || !line) return;
    const rowDuration = row.end - row.start;
    const paint = (time?: number) => {
      const progress = time === undefined ? undefined : countInProgressAt(score, time);
      const start = Math.max(row.start, progress?.start ?? row.end);
      const end = Math.min(row.end, progress?.end ?? row.start);
      if (start >= end) {
        if (!line.hidden) line.hidden = true;
        return;
      }
      const left = 100 * (start - row.start) / rowDuration;
      const width = (end - start) / rowDuration;
      line.style.transform = `translateX(${left}%) scaleX(${width})`;
      if (line.hidden) line.hidden = false;
    };
    const { listeners, time } = playbackPosition.current;
    listeners.add(paint);
    paint(time);
    return () => { listeners.delete(paint); };
  }, [hasCountIn, playbackPosition, row, score]);

  return (
    <div className={hasCountIn ? "solo-score-harmony solo-score-harmony-count-in" : "solo-score-harmony"} style={inline ? undefined : row.style}>
      {hasCountIn && <div className="solo-score-count-in" ref={progressLine} aria-hidden="true" hidden />}
      {chords.map(({ start, label, rootPitch, tooltip }) => (
        <div className="solo-score-chord" key={start} style={{ left: percentOf(row, start) }}>
          <RomanNumeral notation={label} options={{ jazz: true, font: "sans-serif", rootPitch }} tooltip={tooltip ?? true} />
        </div>
      ))}
    </div>
  );
}

function syncHorizontalScroll(scrollLeft: number, target: HTMLDivElement | null) {
  if (target && target.scrollLeft !== scrollLeft) target.scrollLeft = scrollLeft;
}

type Props = {
  score: TonalScore;
  changes: TonicChange[];
  onChangesChange: (changes: TonicChange[]) => void;
  sectionStarts?: SectionStarts;
  phraseStarts?: number[];
  onPhraseStartsChange: (starts: number[]) => void;
  onSectionStartsChange: (group: SectionGroup, starts: number[] | undefined) => void;
  playback: NotePlaybackClock;
  playbackPosition: PlaybackPosition;
  noteHeight: number;
  timeSpacing: number;
  onNoteHeightChange: (height: number) => void;
  onTimeSpacingChange: (spacing: number) => void;
  onSeek?: (scoreTime: number) => void;
  onNoteClick: (note: MidiNote) => void;
};

type SectionProps = Pick<Props, "score" | "noteHeight" | "timeSpacing" | "onNoteHeightChange" | "onTimeSpacingChange" | "onSectionStartsChange"> & {
  rows: ScoreRow[];
  scoreWidth: string;
  stickyHarmony?: boolean;
  playbackPosition?: PlaybackPosition;
  notation: RawlNotationProps;
  inlineHarmony?: boolean;
  group: SectionGroup;
  savedStarts?: number[];
};

function ScoreSection({
  score, rows, scoreWidth, stickyHarmony, playbackPosition, notation, inlineHarmony,
  group, savedStarts, onSectionStartsChange, noteHeight, timeSpacing, onNoteHeightChange, onTimeSpacingChange,
}: SectionProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const harmonyViewportRef = useRef<HTMLDivElement>(null);
  const harmonyContentRef = useRef<HTMLDivElement>(null);
  const pinchActive = useScorePinch(containerRef, noteHeight, timeSpacing, onNoteHeightChange, onTimeSpacingChange);
  // Librawl edits the mounted rows. Keep the loaded layout stable across later saves.
  const [initialRows] = useState(() => restoreSectionRows(score, rows, savedStarts));
  const [edited, setEdited] = useState(initialRows !== rows);
  const lastRows = useRef(initialRows);
  const showInlineHarmony = inlineHarmony || edited;
  const onSectionRowsChange = useCallback((next: ScoreRow[] | null) => {
    const visibleRows = next ?? initialRows;
    if (lastRows.current === visibleRows) return;
    lastRows.current = visibleRows;
    const starts = visibleRows.map(({ start }) => start);
    const custom = !sameSectionStarts(rows, starts);
    setEdited(custom);
    onSectionStartsChange(group, custom ? starts : undefined);
  }, [group, initialRows, onSectionStartsChange, rows]);

  useLayoutEffect(() => {
    const scoreContent = containerRef.current?.querySelector<HTMLElement>("[data-score-pinch-content]");
    const harmonyContent = harmonyContentRef.current;
    if (!scoreContent || !harmonyContent) return;
    const syncPreview = () => {
      const { transform, transformOrigin } = scoreContent.style;
      harmonyContent.style.transform = transform ? `scaleX(${new DOMMatrixReadOnly(transform).a})` : "";
      harmonyContent.style.transformOrigin = transformOrigin;
    };
    const observer = new MutationObserver(syncPreview);
    observer.observe(scoreContent, { attributes: true, attributeFilter: ["style"] });
    return () => observer.disconnect();
  }, [showInlineHarmony]);
  return (
    <div className="solo-score-section">
      {!showInlineHarmony && <div
        className={stickyHarmony ? "solo-score-harmony-viewport solo-score-sticky-harmony" : "solo-score-harmony-viewport"}
        ref={harmonyViewportRef}
        onScroll={(event) => syncHorizontalScroll(event.currentTarget.scrollLeft, containerRef.current)}
      >
        <div ref={harmonyContentRef} style={{ width: scoreWidth }}>
          <HarmonyHeader score={score} row={rows[0]} playbackPosition={playbackPosition} />
        </div>
      </div>}
      <div
        className={showInlineHarmony ? "solo-score-scroll solo-score-scroll-inline" : "solo-score-scroll"}
        ref={containerRef}
        onScroll={(event) => syncHorizontalScroll(event.currentTarget.scrollLeft, harmonyViewportRef.current)}
      >
        <ScorePinchContent activeRef={pinchActive} fitWidth>
          <RawlNotation
            {...notation}
            className="solo-score"
            style={{ width: scoreWidth }}
            rows={initialRows}
            onSectionRowsChange={onSectionRowsChange}
            renderHeader={showInlineHarmony ? (row) => <HarmonyHeader score={score} row={row} inline
              playbackPosition={playbackPosition} /> : undefined}
          />
        </ScorePinchContent>
      </div>
    </div>
  );
}

export default function SoloScore({
  changes, onChangesChange, sectionStarts, onSectionStartsChange,
  phraseStarts: editedPhraseStarts, onPhraseStartsChange, playback, playbackPosition, onSeek, onNoteClick, ...sizing
}: Props) {
  const { score, noteHeight } = sizing;
  const scoreContainer = useRef<HTMLDivElement>(null);
  const firstSection = score.formStarts?.[0] ?? score.firstChorus;
  const separatePickup = score.hasLongPickup && firstSection !== undefined && firstSection > 0 && firstSection < score.end;
  const [pickup, choruses] = useMemo(() => {
    const rows = stackedRows(score, separatePickup);
    return separatePickup
      ? [alignScoreRows(rows.slice(0, 1)), alignScoreRows(rows.slice(1))]
      : [undefined, alignScoreRows(rows)];
  }, [score, separatePickup]);
  const longestSection = Math.max(pickup?.width ?? 0, choruses.width);
  useLayoutEffect(() => fitChordLabels(scoreContainer.current!), [score, sectionStarts]);
  const zoom = sizing.timeSpacing / DEFAULT_TIME_SPACING;
  const scoreWidth = (duration: number) => `${100 * (duration / longestSection) * zoom}%`;
  const recoloring = useTonicRecoloring({ changes, onChange: onChangesChange, measureMap: score.measures });
  const phraseStarts = useMemo(() => {
    const starts = editedPhraseStarts ?? score.phraseStarts;
    return score.terminalBar === undefined || starts.includes(score.terminalBar) ? starts : [...starts, score.terminalBar];
  }, [score, editedPhraseStarts]);
  const seek = (position: number) => (onSeek ?? playback.advance)(score.origin + position);
  const notation: RawlNotationProps = {
    beats: score.end,
    notes: score.notes,
    tonic: score.tonic,
    measureMap: score.measures,
    phraseStarts,
    onPhraseStartsChange,
    playbackClock: playback,
    recoloring,
    onSeek: seek,
    onNote: (note, event) => {
      // Librawl also calls this without an event for Shift-hover.
      if (event) onNoteClick(note);
    },
    noteScale: noteHeight / PITCH_STEP,
  };

  return (
    <div className="solo-score-container" ref={scoreContainer}>
      {pickup && <ScoreSection {...sizing} rows={pickup.rows} scoreWidth={scoreWidth(pickup.width)} notation={notation}
        group="pickup" savedStarts={sectionStarts?.pickup} onSectionStartsChange={onSectionStartsChange} />}
      <ScoreSection {...sizing} rows={choruses.rows} scoreWidth={scoreWidth(choruses.width)} notation={notation}
        group="choruses" savedStarts={sectionStarts?.choruses} onSectionStartsChange={onSectionStartsChange}
        playbackPosition={playbackPosition} inlineHarmony={score.formStarts !== undefined} stickyHarmony />
    </div>
  );
}
