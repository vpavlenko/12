import majorBlues from "../data/wjd_maj_blues.json";
import minorBlues from "../data/wjd_minor_blues.json";
import recordingData from "../data/wjd_recordings.json";

export type JazzSolo = typeof majorBlues[number];
export const solos: JazzSolo[] = [...majorBlues, ...minorBlues].sort((a, b) => a.melid - b.melid);
export const annotatedSoloIds = new Set(minorBlues.map(({ melid }) => melid));
export type WeimarRecording = typeof recordingData[keyof typeof recordingData];
export const weimarRecordings: Record<string, WeimarRecording | undefined> = recordingData;

const correctedKeys: Partial<Record<number, string>> = {
  // Redman's 12-bar progression uses D7#9 as I and A7#9 as V.
  245: "D-blues",
};

export function soloKey(solo: JazzSolo) {
  return correctedKeys[solo.melid] ?? solo.key;
}

const instruments: Record<string, string> = {
  arr: "arranger",
  as: "alto saxophone",
  b: "bass",
  bc: "bass clarinet",
  bcl: "bass clarinet",
  bjo: "banjo",
  bs: "baritone saxophone",
  cga: "congas",
  cl: "clarinet",
  cor: "cornet",
  dr: "drums",
  fl: "flute",
  flgn: "flugelhorn",
  g: "guitar",
  key: "keyboards",
  p: "piano",
  ss: "soprano saxophone",
  tb: "trombone",
  tp: "trumpet",
  ts: "tenor saxophone",
  vc: "cello",
  vib: "vibraphone",
  voc: "vocals",
};

export const instrumentName = (code: string) => instruments[code.trim().toLowerCase()] ?? code.trim();
