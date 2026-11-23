import type { TonicChange } from "librawl";
import { isRhythmGrouping, type RhythmChange } from "./scoreRhythm";

const KEY_PREFIX = "12:solo-annotation:";

export type SectionGroup = "pickup" | "choruses";
export type SectionStarts = Partial<Record<SectionGroup, number[]>>;

export type SoloAnnotation = {
  version: 1;
  soloId: number;
  scoreOrigin: number;
  tonicChanges?: TonicChange[];
  sectionStarts?: SectionStarts;
  phraseStarts?: number[];
  rhythmChanges?: RhythmChange[];
};

export function tonicAnnotation(changes: TonicChange[]) {
  return changes.map(({ beat, tonic, measureBeat, onsetOverride, name, join }) => ({
    beat, tonic, measureBeat, onsetOverride: onsetOverride || undefined, name, join: join || undefined,
  }));
}

function isTonicChange(value: unknown): value is TonicChange {
  if (!value || typeof value !== "object") return false;
  const change = value as Partial<TonicChange>;
  return Number.isFinite(change.beat) && change.tonic !== undefined
    && Number.isInteger(change.tonic) && change.tonic >= 0 && change.tonic < 12
    && (change.measureBeat === undefined || Number.isFinite(change.measureBeat))
    && (change.onsetOverride === undefined || typeof change.onsetOverride === "boolean")
    && (change.join === undefined || typeof change.join === "boolean")
    && (change.name === undefined || typeof change.name === "string");
}

function isOrderedStarts(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((beat, index) => Number.isFinite(beat) && (index === 0 || beat > value[index - 1]));
}

function isSectionStarts(value: unknown): value is SectionStarts {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const sections = value as SectionStarts;
  return (sections.pickup !== undefined || sections.choruses !== undefined)
    && [sections.pickup, sections.choruses].every((starts) => starts === undefined
    || (isOrderedStarts(starts) && starts.length > 0));
}

function isRhythmChanges(value: unknown): value is RhythmChange[] {
  return Array.isArray(value) && value.every((change, index) =>
    change != null && Number.isFinite(change.beat) && isRhythmGrouping(change.groups)
    && (index === 0 || change.beat > value[index - 1].beat));
}

function parseAnnotation(key: string, json: string) {
  try {
    const saved = JSON.parse(json) as SoloAnnotation | null;
    if (saved?.version !== 1 || !Number.isSafeInteger(saved.soloId)
      || key !== KEY_PREFIX + saved.soloId || !Number.isFinite(saved.scoreOrigin)) return undefined;
    if (saved.tonicChanges !== undefined
      && (!Array.isArray(saved.tonicChanges) || !saved.tonicChanges.every(isTonicChange))) return undefined;
    if (saved.sectionStarts !== undefined && !isSectionStarts(saved.sectionStarts)) return undefined;
    if (saved.phraseStarts !== undefined && !isOrderedStarts(saved.phraseStarts)) return undefined;
    if (saved.rhythmChanges !== undefined && !isRhythmChanges(saved.rhythmChanges)) delete saved.rhythmChanges;
    return saved.tonicChanges !== undefined || saved.sectionStarts || saved.phraseStarts || saved.rhythmChanges ? saved : undefined;
  } catch {
    return undefined;
  }
}

export function readSoloAnnotations() {
  const annotations = new Map<number, SoloAnnotation>();
  try {
    const storage = window.localStorage;
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (!key?.startsWith(KEY_PREFIX)) continue;
      const annotation = parseAnnotation(key, storage.getItem(key) ?? "");
      if (annotation) annotations.set(annotation.soloId, annotation);
    }
  } catch {
    // The editor still works when the browser denies access to storage.
  }
  return annotations;
}

export function writeSoloAnnotation(soloId: number, annotation: SoloAnnotation | undefined) {
  try {
    const key = KEY_PREFIX + soloId;
    if (annotation) window.localStorage.setItem(key, JSON.stringify(annotation));
    else window.localStorage.removeItem(key);
  } catch (error) {
    console.warn("Could not persist the solo annotation:", error);
  }
}
