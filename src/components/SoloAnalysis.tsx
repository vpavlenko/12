import { useLayoutEffect, useMemo, useRef } from "react";
import type { ScoreRow } from "librawl";
import type { AnalysisLabel } from "../soloAnalysis";
import type { TonalScore } from "../tonalScore";
import "./SoloAnalysis.css";

export function AnalysisIcon() {
  return (
    <svg className="solo-analysis-icon" viewBox="0 0 20 20" width="14" height="14" role="img" aria-label="Analysis" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <title>Analysis</title>
      <path d="M17 3.5H3v10h3v3l4-3h7z" />
    </svg>
  );
}

export function SoloAnalysisLabels({ labels, score, row }: {
  labels: readonly AnalysisLabel[];
  score: TonalScore;
  row: Pick<ScoreRow, "start" | "end">;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const positioned = useMemo(() => labels.flatMap((entry) => {
    const measure = score.measures.find(({ sourceNumber }) => sourceNumber === entry.bar);
    const beat = entry.beat === undefined ? undefined : score.sourceBeats.find(({ bar, beat }) =>
      bar === entry.bar && beat === entry.beat,
    );
    const position = beat ? beat.onset - score.origin : measure?.start;
    return position !== undefined && position >= row.start && position < row.end
      ? [{ ...entry, position }] : [];
  }).sort((a, b) => a.position - b.position), [labels, score, row.start, row.end]);

  useLayoutEffect(() => {
    const container = ref.current;
    if (!container) return;
    const links = Array.from(container.querySelectorAll("a"));
    const arrange = () => {
      const rightEdges: number[] = [];
      for (const link of links) {
        const anchor = link.offsetLeft;
        const x = Math.max(0, Math.min(anchor, container.clientWidth - link.offsetWidth));
        const vacantLane = rightEdges.findIndex((edge) => x >= edge + 6);
        const lane = vacantLane === -1 ? rightEdges.length : vacantLane;
        rightEdges[lane] = x + link.offsetWidth;
        link.style.transform = `translate(${x - anchor}px, ${lane * 19}px)`;
        link.style.setProperty("--annotation-anchor", `${anchor - x}px`);
      }
      container.style.height = `${rightEdges.length * 19}px`;
    };
    arrange();
    const observer = new ResizeObserver(arrange);
    observer.observe(container);
    return () => observer.disconnect();
  }, [positioned]);

  if (positioned.length === 0) return null;
  return (
    <div className="solo-analysis-labels" ref={ref}>
      {positioned.map(({ bar, beat, position, label, url, source, location }) => (
        <a
          key={`${bar}-${beat ?? 1}-${label}`}
          data-bar={bar}
          data-beat={beat}
          style={{ left: `${(position - row.start) / (row.end - row.start) * 100}%` }}
          href={url}
          target="_blank"
          rel="noreferrer"
          title={`${source} · ${location}`}
        >
          {label}
        </a>
      ))}
    </div>
  );
}
