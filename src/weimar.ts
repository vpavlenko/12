import catalog from "../data/wjd_maj_blues.json";
import recordingData from "../data/wjd_recordings.json";

export type JazzSolo = typeof catalog[number];
export type WeimarRecording = typeof recordingData[keyof typeof recordingData];
export const weimarRecordings: Record<string, WeimarRecording | undefined> = recordingData;

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
