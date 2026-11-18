import { useLayoutEffect, useMemo, useRef, type MutableRefObject } from "react";
import { RawlNotation, useTonicRecoloring, type RawlNotationProps, type ScoreRow, type TonicChange } from "librawl";
import { RomanNumeral, ScorePinchContent, useScorePinch } from "librawl/components";
import { alignScoreRows, PITCH_STEP } from "librawl/geometry";
import type { NotePlaybackClock } from "librawl/native";
import "librawl/style.css";
import "librawl/native.css";
import "librawl/roman-numerals.css";
import type { AnalysisLabel } from "../soloAnalysis";
import { pickupProgressAt, type TonalScore } from "../tonalScore";
import { SoloAnalysisLabels } from "./SoloAnalysis";
import "./TonalGrid.css";

export const DEFAULT_TIME_SPACING = 25;

function stackedRows(score: TonalScore, separatePickup: boolean) {
  const starts = [0, ...score.chorusStarts.filter((start) => start > 0 && (separatePickup || start !== score.firstChorus))];
  return starts.map((start, index) => {
    const end = starts[index + 1] ?? score.end;
    const anchor = !separatePickup && index === 0 ? score.firstChorus ?? start : start;
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

  // Merge overlapping runs so each label stays as close as possible to its anchor.
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

type PlaybackPosition = MutableRefObject<((time?: number) => void) | undefined>;

function HarmonyHeader({ score, row, playbackPosition }: {
  score: TonalScore;
  row: ScoreRow;
  playbackPosition?: PlaybackPosition;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const progressLine = useRef<HTMLDivElement>(null);
  const chords = useMemo(() => harmonyInRow(score, row), [score, row]);
  const hasPickupProgress = !!playbackPosition && score.pickupProgress.length > 0;

  useLayoutEffect(() => {
    const line = progressLine.current;
    if (!playbackPosition || !line) return;
    const rowDuration = row.end - row.start;
    playbackPosition.current = (time) => {
      const progress = time === undefined ? undefined : pickupProgressAt(score.pickupProgress, time);
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
  }, [playbackPosition, row, score.pickupProgress]);

  useLayoutEffect(() => {
    const header = ref.current!;
    const labels = Array.from(header.querySelectorAll<HTMLElement>(".tonal-grid-chord"));
    const arrange = () => {
      const width = header.clientWidth;
      if (!width || !labels.length) return;
      const gap = 4;
      const anchors = labels.map((label) => label.offsetLeft);
      const widths = labels.map((label) => label.offsetWidth + 1);
      const preferredWidth = widths.reduce((total, next) => total + next) + (widths.length - 1) * gap;
      const scale = Math.min(1, width / preferredWidth);
      const positions = placeChordLabels(anchors, widths.map((value) => value * scale), gap * scale, width);
      labels.forEach((label, index) => {
        label.style.transform = `translateX(${positions[index] - anchors[index]}px) scale(${scale})`;
      });
    };
    arrange();
    const observer = new ResizeObserver(arrange);
    observer.observe(header);
    return () => observer.disconnect();
  }, [chords]);

  return (
    <div className={hasPickupProgress ? "tonal-grid-harmony tonal-grid-harmony-count-in" : "tonal-grid-harmony"} ref={ref} style={row.style}>
      {hasPickupProgress && <div className="tonal-grid-count-in" ref={progressLine} aria-hidden="true" hidden />}
      {chords.map(({ start, label, rootPitch, bassPitch, tooltip }) => (
        <div className="tonal-grid-chord" key={start} style={{ left: `calc(${percentOf(row, start)} + 5px)` }}>
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
  analysis: readonly AnalysisLabel[];
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
};

function ScoreSection({
  score, rows, scoreWidth, stickyHarmony, playbackPosition, notation,
  noteHeight, timeSpacing, onNoteHeightChange, onTimeSpacingChange,
}: SectionProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const harmonyViewportRef = useRef<HTMLDivElement>(null);
  const harmonyContentRef = useRef<HTMLDivElement>(null);
  const pinchActive = useScorePinch(containerRef, noteHeight, timeSpacing, onNoteHeightChange, onTimeSpacingChange);

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
  }, []);
  return (
    <div className="tonal-grid-section">
      <div
        className={stickyHarmony ? "tonal-grid-harmony-viewport tonal-grid-sticky-harmony" : "tonal-grid-harmony-viewport"}
        ref={harmonyViewportRef}
        onScroll={(event) => syncHorizontalScroll(event.currentTarget.scrollLeft, containerRef.current)}
      >
        <div ref={harmonyContentRef} style={{ width: scoreWidth }}>
          <HarmonyHeader score={score} row={rows[0]} playbackPosition={playbackPosition} />
        </div>
      </div>
      <div
        className="tonal-grid-scroll"
        ref={containerRef}
        onScroll={(event) => syncHorizontalScroll(event.currentTarget.scrollLeft, harmonyViewportRef.current)}
      >
        <ScorePinchContent activeRef={pinchActive} fitWidth>
          <RawlNotation
            {...notation}
            className="tonal-grid"
            style={{ width: scoreWidth }}
            rows={rows}
          />
        </ScorePinchContent>
      </div>
    </div>
  );
}

export default function TonalGrid({
  analysis, changes, onChangesChange, playback, playbackPosition, onSeek, ...sizing
}: Props) {
  const { score, noteHeight } = sizing;
  const separatePickup = score.hasLongPickup && score.firstChorus !== undefined && score.firstChorus < score.end;
  const [pickup, choruses] = useMemo(() => {
    const rows = stackedRows(score, separatePickup);
    return separatePickup
      ? [alignScoreRows(rows.slice(0, 1)), alignScoreRows(rows.slice(1))]
      : [undefined, alignScoreRows(rows)];
  }, [score, separatePickup]);
  const longestSection = Math.max(pickup?.width ?? 0, choruses.width);
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
    renderHeader: analysis.length > 0
      ? (row) => <SoloAnalysisLabels labels={analysis} score={score} row={row} />
      : undefined,
  };

  return (
    <div className="tonal-grid-container">
      {pickup && <ScoreSection {...sizing} rows={pickup.rows} scoreWidth={scoreWidth(pickup.width)} notation={notation} />}
      <ScoreSection {...sizing} rows={choruses.rows} scoreWidth={scoreWidth(choruses.width)} notation={notation} playbackPosition={playbackPosition} stickyHarmony />
    </div>
  );
}
