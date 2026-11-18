import analysis from "../data/solo_analysis.json";

export type AnalysisLabel = {
  bar: number;
  beat?: number;
  label: string;
  url: string;
  source: string;
  location: string;
};

const catalog: Readonly<Record<number, readonly AnalysisLabel[] | undefined>> = analysis;
const empty: readonly AnalysisLabel[] = [];

export function getSoloAnalysis(melid: number) {
  return catalog[melid] ?? empty;
}
