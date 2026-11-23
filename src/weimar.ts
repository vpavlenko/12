import majorBlues from "../data/wjd_maj_blues.json";
import minorBlues from "../data/wjd_minor_blues.json";
import bodyAndSoul from "../data/wjd_body_and_soul.json";
import rhythmChanges from "../data/wjd_rhythm_changes.json";
import measureGroups from "../data/measure_groups.json";
import recordingData from "../data/wjd_recordings.json";
import type { ExcerptTonality } from "./tonalScore";

export type JazzSolo = typeof majorBlues[number];
export const bluesSolos: JazzSolo[] = [...majorBlues, ...minorBlues].sort((a, b) => a.melid - b.melid);
export const bodyAndSoulSolos: JazzSolo[] = bodyAndSoul;
export const rhythmChangesSolos: JazzSolo[] = rhythmChanges;
export const solos = [...bluesSolos, ...bodyAndSoulSolos, ...rhythmChangesSolos];
export const bodyAndSoulSoloIds = new Set(bodyAndSoulSolos.map(({ melid }) => melid));
export const rhythmChangesSoloIds = new Set(rhythmChangesSolos.map(({ melid }) => melid));
export const annotatedSoloIds = new Set([...minorBlues, ...bodyAndSoulSolos, ...rhythmChangesSolos].map(({ melid }) => melid));
export const barsPerMeasureBySolo: Partial<Record<number, number>> = measureGroups;
export const excerptTonalityBySolo: Partial<Record<number, ExcerptTonality>> = {
  // Murray's excerpt starts on Dmaj7, turns to C via Dm7–G7, then returns to the D-flat A.
  119: {
    openingTonic: "D",
    modulations: [{ bar: -3, tonic: "C" }, { bar: 1, tonic: "Db" }],
  },
};
export type WeimarRecording = typeof recordingData[keyof typeof recordingData];
const weimarRecordings: Record<string, WeimarRecording | undefined> = recordingData;

export function recordingForSolo(melid: number) {
  const recording = weimarRecordings[melid];
  if (melid !== 398 || !recording) return recording;
  // Bill Crow's discography and the matched Verve recording date the session.
  return { ...recording, recordingdate: "1952-12-12", recordingdate_precision: "day", recording_year: 1952 };
}

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
