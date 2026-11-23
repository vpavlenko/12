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

// Source event IDs for pickups into the bridge and the return to A.
const modulationPickups: Partial<Record<number, Record<number, number>>> = {
  85: { 17: 37272, 25: 37326 },
  96: { 17: 41893, 49: 42221 },
  118: { 25: 54497 },
  140: { 25: 62823 },
  206: { 17: 90360, 49: 90870 },
  220: { 33: 99617, 49: 99723 },
  393: { 25: 174819 },
  398: { 25: 176981, 41: 177149 },
};

export function bodyAndSoulTonality(melid: number, sections: { bar: number; form: string | null }[]): ExcerptTonality {
  const bridge = /^\*?B\d+$/;
  const barsPerMeasure = barsPerMeasureBySolo[melid] ?? 1;
  const pickups = modulationPickups[melid];
  return {
    // An excerpt starting with B can include its ii–V pickup.
    openingOffset: bridge.test(sections[0]?.form ?? "") ? 1 : 0,
    modulations: sections.flatMap(({ bar, form }) => {
      if (!bridge.test(form ?? "")) return [];
      const returnBar = bar + 8 * barsPerMeasure;
      return [
        { bar, offset: 1, pickupEvent: pickups?.[bar] },
        { bar: bar + 4 * barsPerMeasure, offset: -1 },
        { bar: returnBar, offset: 0, pickupEvent: pickups?.[returnBar] },
      ];
    }),
  };
}

export type WeimarRecording = typeof recordingData[keyof typeof recordingData];
const weimarRecordings: Record<string, WeimarRecording | undefined> = recordingData;

export function recordingForSolo(melid: number) {
  const recording = weimarRecordings[melid];
  if (melid !== 398 || !recording) return recording;
  // Bill Crow's discography and the matched Verve recording date the session.
  return { ...recording, recordingdate: "1952-12-12", recordingdate_precision: "day", recording_year: 1952 };
}

const correctedKeys: Partial<Record<number, string>> = {
  // Berry's second excerpt returns to D-flat at A3, following its D and C bridge.
  86: "Db-maj",
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
