import type { TonicChange } from "librawl";

const KEY_PREFIX = "12:solo-annotation:";

export type SectionGroup = "pickup" | "choruses";
export type SectionStarts = Partial<Record<SectionGroup, number[]>>;

export type SoloAnnotation = {
  version: 1;
  soloId: number;
  scoreOrigin: number;
  tonicChanges?: TonicChange[];
  sectionStarts?: SectionStarts;
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

function isSectionStarts(value: unknown): value is SectionStarts {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const sections = value as SectionStarts;
  return (sections.pickup !== undefined || sections.choruses !== undefined)
    && [sections.pickup, sections.choruses].every((starts) => starts === undefined
    || (Array.isArray(starts) && starts.length > 0
      && starts.every((beat, index) => Number.isFinite(beat) && (index === 0 || beat > starts[index - 1]))));
}

function parseAnnotation(key: string, json: string) {
  try {
    const saved = JSON.parse(json) as SoloAnnotation | null;
    if (saved?.version !== 1 || !Number.isSafeInteger(saved.soloId)
      || key !== KEY_PREFIX + saved.soloId || !Number.isFinite(saved.scoreOrigin)) return undefined;
    if (saved.tonicChanges !== undefined
      && (!Array.isArray(saved.tonicChanges) || !saved.tonicChanges.every(isTonicChange))) return undefined;
    if (saved.sectionStarts !== undefined && !isSectionStarts(saved.sectionStarts)) return undefined;
    return saved.tonicChanges !== undefined || saved.sectionStarts ? saved : undefined;
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
