import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { RawlNotation, useTonicRecoloring, type RawlNotationProps, type ScoreRow, type TonicChange } from "librawl";
import { RomanNumeral, ScorePinchContent, useScorePinch } from "librawl/components";
import { alignScoreRows, PITCH_STEP } from "librawl/geometry";
import type { NotePlaybackClock } from "librawl/native";
import "librawl/style.css";
import "librawl/native.css";
import "librawl/roman-numerals.css";
import { countInProgressAt, type TonalScore } from "../tonalScore";
import "./SoloScore.css";

export const DEFAULT_TIME_SPACING = 25;

function stackedRows(score: TonalScore, separatePickup: boolean) {
  const sectionStarts = score.rowStarts ?? score.formStarts ?? score.chorusStarts;
  const firstSection = score.formStarts?.[0] ?? score.firstChorus;
  const starts = [0, ...sectionStarts.filter((start) => start > 0 && (separatePickup || start !== firstSection))];
  return starts.map((start, index) => {
    const end = starts[index + 1] ?? score.end;
    const anchor = !separatePickup && index === 0 ? firstSection ?? start : start;
    return { start, end, anchor };
  });
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
    const scale = rows.reduce((limit, row) => Math.min(limit, row.scale), 1);
    container.style.setProperty("--solo-chord-scale", String(scale));
    for (const { width, labels, widths, anchors } of rows) {
      const positions = placeChordLabels(anchors.map((anchor) => anchor + 4), widths.map((value) => value * scale), gap * scale, width);
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

type PlaybackPosition = RefObject<((time?: number) => void) | undefined>;

function HarmonyHeader({ score, row, playbackPosition, inline }: {
  score: TonalScore;
  row: ScoreRow;
  playbackPosition?: PlaybackPosition;
  inline?: boolean;
}) {
  const progressLine = useRef<HTMLDivElement>(null);
  const chords = useMemo(() => harmonyInRow(score, row), [score, row]);
  const hasCountIn = !!playbackPosition && score.countInProgress.length > 0;

  useLayoutEffect(() => {
    const line = progressLine.current;
    if (!playbackPosition || !line) return;
    const rowDuration = row.end - row.start;
    playbackPosition.current = (time) => {
      const progress = time === undefined ? undefined : countInProgressAt(score, time);
      if (!progress || progress.start < row.start || progress.end > row.end) {
        if (!line.hidden) line.hidden = true;
        return;
      }
      const left = 100 * (progress.start - row.start) / rowDuration;
      const width = (progress.end - progress.start) / rowDuration;
      line.style.transform = `translateX(${left}%) scaleX(${width})`;
      if (line.hidden) line.hidden = false;
    };
    return () => { playbackPosition.current = undefined; };
  }, [playbackPosition, row, score]);

  return (
    <div className={hasCountIn ? "solo-score-harmony solo-score-harmony-count-in" : "solo-score-harmony"} style={inline ? undefined : row.style}>
      {hasCountIn && <div className="solo-score-count-in" ref={progressLine} aria-hidden="true" hidden />}
      {chords.map(({ start, label, rootPitch, bassPitch, tooltip }) => (
        <div className="solo-score-chord" key={start} style={{ left: percentOf(row, start) }}>
          <RomanNumeral notation={label} options={{ jazz: true, font: "sans-serif", rootPitch, bassPitch }} tooltip={tooltip ?? true} />
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
  playback: NotePlaybackClock;
  playbackPosition: PlaybackPosition;
  noteHeight: number;
  timeSpacing: number;
  onNoteHeightChange: (height: number) => void;
  onTimeSpacingChange: (spacing: number) => void;
  onSeek?: (scoreTime: number) => void;
};

type SectionProps = Pick<Props, "score" | "noteHeight" | "timeSpacing" | "onNoteHeightChange" | "onTimeSpacingChange"> & {
  rows: ScoreRow[];
  scoreWidth: string;
  stickyHarmony?: boolean;
  playbackPosition?: PlaybackPosition;
  notation: RawlNotationProps;
  inlineHarmony?: boolean;
  editedRows: ScoreRow[] | null;
  onSectionRowsChange: NonNullable<RawlNotationProps["onSectionRowsChange"]>;
};

function ScoreSection({
  score, rows, scoreWidth, stickyHarmony, playbackPosition, notation, inlineHarmony,
  editedRows, onSectionRowsChange, noteHeight, timeSpacing, onNoteHeightChange, onTimeSpacingChange,
}: SectionProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const harmonyViewportRef = useRef<HTMLDivElement>(null);
  const harmonyContentRef = useRef<HTMLDivElement>(null);
  const pinchActive = useScorePinch(containerRef, noteHeight, timeSpacing, onNoteHeightChange, onTimeSpacingChange);
  const showInlineHarmony = inlineHarmony || editedRows !== null;

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
        className="solo-score-scroll"
        ref={containerRef}
        onScroll={(event) => syncHorizontalScroll(event.currentTarget.scrollLeft, harmonyViewportRef.current)}
      >
        <ScorePinchContent activeRef={pinchActive} fitWidth>
          <RawlNotation
            {...notation}
            className="solo-score"
            style={{ width: scoreWidth }}
            rows={rows}
            onSectionRowsChange={onSectionRowsChange}
            renderHeader={showInlineHarmony ? (row) => <HarmonyHeader score={score} row={row} inline
              playbackPosition={row.start === rows[0].start ? playbackPosition : undefined} /> : undefined}
          />
        </ScorePinchContent>
      </div>
    </div>
  );
}

export default function SoloScore({
  changes, onChangesChange, playback, playbackPosition, onSeek, ...sizing
}: Props) {
  const { score, noteHeight } = sizing;
  const scoreContainer = useRef<HTMLDivElement>(null);
  const [editedPickupRows, setEditedPickupRows] = useState<ScoreRow[] | null>(null);
  const [editedChorusRows, setEditedChorusRows] = useState<ScoreRow[] | null>(null);
  const firstSection = score.formStarts?.[0] ?? score.firstChorus;
  const separatePickup = score.hasLongPickup && firstSection !== undefined && firstSection > 0 && firstSection < score.end;
  const [pickup, choruses] = useMemo(() => {
    const rows = stackedRows(score, separatePickup);
    return separatePickup
      ? [alignScoreRows(rows.slice(0, 1)), alignScoreRows(rows.slice(1))]
      : [undefined, alignScoreRows(rows)];
  }, [score, separatePickup]);
  const longestSection = Math.max(pickup?.width ?? 0, choruses.width);
  useLayoutEffect(() => fitChordLabels(scoreContainer.current!), [score, editedPickupRows, editedChorusRows]);
  const zoom = sizing.timeSpacing / DEFAULT_TIME_SPACING;
  const scoreWidth = (duration: number) => `${100 * (duration / longestSection) * zoom}%`;
  const recoloring = useTonicRecoloring({ changes, onChange: onChangesChange, measureMap: score.measures });
  const phraseStarts = useMemo(() => score.terminalBar === undefined
    ? score.phraseStarts : [...score.phraseStarts, score.terminalBar], [score]);
  const seek = (position: number) => (onSeek ?? playback.advance)(score.origin + position);
  const notation: RawlNotationProps = {
    beats: score.end,
    notes: score.notes,
    tonic: score.tonic,
    measureMap: score.measures,
    phraseStarts,
    playbackClock: playback,
    changes: recoloring.changes,
    selectedMeasure: recoloring.selectedMeasure,
    onMeasureSelect: recoloring.selectMeasure,
    onNoteHover: recoloring.hoverNote,
    onSeek: seek,
    onNote: recoloring.selectedMeasure === null ? undefined : recoloring.chooseNote,
    noteScale: noteHeight / PITCH_STEP,
  };

  return (
    <div className="solo-score-container" ref={scoreContainer}>
      {pickup && <ScoreSection {...sizing} rows={pickup.rows} scoreWidth={scoreWidth(pickup.width)} notation={notation}
        editedRows={editedPickupRows} onSectionRowsChange={setEditedPickupRows} />}
      <ScoreSection {...sizing} rows={choruses.rows} scoreWidth={scoreWidth(choruses.width)} notation={notation}
        editedRows={editedChorusRows} onSectionRowsChange={setEditedChorusRows}
        playbackPosition={playbackPosition} inlineHarmony={score.formStarts !== undefined} stickyHarmony />
    </div>
  );
}
