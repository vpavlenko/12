import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import "./App.css";
import playbackData from "../data/playback.json";
import { RAWL_COLORS, type TonicChange } from "librawl";
import { useNotePlaybackClock } from "librawl/native";
import { ScoreSizeSliders } from "librawl/components";
import { PITCH_STEP } from "librawl/geometry";
import "librawl/score-size-sliders.css";
import Papa from "papaparse";
import SoloScore, { DEFAULT_TIME_SPACING, type ScorePlaybackPosition } from "./components/SoloScore";
import { SoloAudio } from "./components/SoloPlayback";
import { createScoreNoteAudition } from "./components/scoreNoteAudition";
import { audioTimeAt, type AudioExcerpt } from "./recordingClock";
import { SoloPianoLegend } from "./components/SoloPianoLegend";
import { SoloMetadata } from "./components/SoloMetadata";
import { readSoloAnnotations, tonicAnnotation, writeSoloAnnotation, type SectionGroup, type SoloAnnotation } from "./soloAnnotations";
import { buildTonalScore, type BeatsItem, type MelodyItem, type ScoreForm } from "./tonalScore";
import {
  annotatedSoloIds, barsPerMeasureBySolo, bluesSolos, bodyAndSoulSoloIds, bodyAndSoulSolos, bodyAndSoulTonality,
  instrumentName, recordingForSolo, rhythmChangesSoloIds, rhythmChangesSolos, soloKey, solos, type JazzSolo,
} from "./weimar";

const STYLES = {
  TRADITIONAL: "trad",
  SWING: "swing",
  BEBOP: "bebop",
  COOL: "cool",
  HARDBOP: "hardbop",
  POSTBOP: "postbop",
  FUSION: "fusion",
};

const INITIAL_SOLO = 1;
const FIRST_BODY_AND_SOUL = bluesSolos.length;
const FIRST_RHYTHM_CHANGES = FIRST_BODY_AND_SOUL + bodyAndSoulSolos.length;
const CATALOGUE_LABELS = { blues: "12", bodyAndSoul: "Body and Soul", rhythmChanges: "Rhythm Changes" };
type Catalogue = keyof typeof CATALOGUE_LABELS;
const CATALOGUES = Object.keys(CATALOGUE_LABELS) as Catalogue[];
const MAJOR_SIXTH_SEMITONES = 9;
const MINOR_BLUES_LINK_STYLE = { "--composition-accent": RAWL_COLORS[MAJOR_SIXTH_SEMITONES].background } as CSSProperties;

const playbackBySolo: Record<string, { audio?: AudioExcerpt } | undefined> = playbackData;
const NO_CHANGES: TonicChange[] = [];

const capitalizeWords = (text: string): string => {
  const words = text.split(/ /g);
  for (let i = 0; i < words.length; i++) {
    words[i] = words[i][0].toUpperCase() + words[i].slice(1);
  }
  return words.join(" ");
};

const makeFileName = ({ title, performer, solopart }: JazzSolo) =>
  performer.replace(/\./g, "").replace(/ /g, "") +
  "_" +
  capitalizeWords(title)
    .replace(/ /g, "")
    .replace(/-/g, "=")
    .replace(/'n/g, "'N") +
  (solopart > 1 ? `-${solopart}` : "") +
  "_Solo.csv";

async function loadCsv<T>(filePath: string, signal: AbortSignal) {
  const response = await fetch(import.meta.env.BASE_URL + filePath, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${filePath}`);
  const { data } = Papa.parse<T>(await response.text(), {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
  });
  return data;
}

type SoloData = ScoreForm & {
  melody: MelodyItem[];
  beats: BeatsItem[];
};

async function loadSoloData(melid: number, fileName: string, signal: AbortSignal): Promise<SoloData> {
  if (annotatedSoloIds.has(melid)) {
    const path = `wjd/${melid}.json`;
    const response = await fetch(import.meta.env.BASE_URL + path, { signal });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${path}`);
    const { beats, notes }: {
      beats: (BeatsItem & { chorus_id: number; form: string | null })[];
      notes: MelodyItem[];
    } = await response.json();
    const choruses = new Map<number, number>();
    for (const { chorus_id, bar, beat } of beats) {
      if (chorus_id > 0 && bar > 0 && beat === 1 && !choruses.has(chorus_id)) {
        choruses.set(chorus_id, bar);
      }
    }
    const sections = rhythmChangesSoloIds.has(melid) || bodyAndSoulSoloIds.has(melid)
      ? beats.filter(({ bar, beat, form }) => beat === 1 && form
        && (/^\*?[ABC]\d+$/.test(form) || (bar > 0 && /^I\d+$/.test(form))))
      : undefined;
    const formBars = sections?.map(({ bar }) => bar);
    const excerptTonality = bodyAndSoulSoloIds.has(melid) && sections ? bodyAndSoulTonality(melid, sections) : undefined;
    return { beats, melody: notes, chorusBars: [...choruses.values()], formBars, excerptTonality };
  }

  const [melody, beats] = await Promise.all([
    loadCsv<MelodyItem>(`csv_melody/${fileName}`, signal),
    loadCsv<BeatsItem>(`csv_beats/${fileName}`, signal),
  ]);
  return { melody, beats };
}

function useSoloData(melid: number, fileName: string) {
  const [loaded, setLoaded] = useState<SoloData & { melid: number }>();
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    loadSoloData(melid, fileName, signal).then((data) => {
      if (!signal.aborted) setLoaded({ melid, ...data });
    }).catch((error) => {
      if (!signal.aborted) console.error("Error loading the solo:", error);
    });
    return () => controller.abort();
  }, [fileName, melid]);
  return loaded?.melid === melid ? loaded : undefined;
}

const soloIndices = new Map(solos.map(({ melid }, index) => [melid, index]));
const soloLink = (melid: number) => `#solo-${melid}`;
function catalogueForSolo(index: number): Catalogue {
  if (index >= FIRST_RHYTHM_CHANGES) return "rhythmChanges";
  return index >= FIRST_BODY_AND_SOUL ? "bodyAndSoul" : "blues";
}

function soloFromLocation() {
  const match = /^#solo-(\d+)$/.exec(window.location.hash);
  return (match && soloIndices.get(Number(match[1]))) ?? INITIAL_SOLO;
}

function decadeRange(years: number[]) {
  if (years.length === 0) return undefined;
  const first = Math.floor(Math.min(...years) / 10) * 10;
  const last = Math.floor(Math.max(...years) / 10) * 10;
  if (first === last) return `${first}s`;
  const abbreviated = Math.floor(first / 100) === Math.floor(last / 100)
    ? String(last % 100).padStart(2, "0") : last;
  return `${first}..${abbreviated}s`;
}

function chronologicalEntries(solos: JazzSolo[], startIndex: number, style?: string) {
  return solos.map((solo, index) => ({
    solo,
    index: index + startIndex,
    year: recordingForSolo(solo.melid)?.recording_year,
  })).filter(({ solo }) => !style || solo.style === style)
    .sort((a, b) => (a.year ?? Number.MAX_SAFE_INTEGER) - (b.year ?? Number.MAX_SAFE_INTEGER));
}

function groupByPerformer(solos: JazzSolo[], startIndex: number, style?: string) {
  const entries = chronologicalEntries(solos, startIndex, style);
  const performers: { performer: string; entries: typeof entries }[] = [];
  for (const entry of entries) {
    const { performer } = entry.solo;
    const group = performers[performers.length - 1];
    if (group?.performer === performer) group.entries.push(entry);
    else performers.push({ performer, entries: [entry] });
  }
  return { years: decadeRange(entries.flatMap(({ year }) => year == null ? [] : [year])), performers };
}

const compositionGroups = Object.entries(STYLES).map(([style, label]) => ({
  style, label, ...groupByPerformer(bluesSolos, 0, style),
}));
const rhythmChangesGroup = groupByPerformer(rhythmChangesSolos, FIRST_RHYTHM_CHANGES);
const bodyAndSoulEntries = chronologicalEntries(bodyAndSoulSolos, FIRST_BODY_AND_SOUL);

function eraForSolo(index: number) {
  return compositionGroups.find(({ style }) => style === solos[index].style) ?? compositionGroups[0];
}

function App() {
  const [selectedSolo, setSelectedSolo] = useState(soloFromLocation);
  const [selectedEra, setSelectedEra] = useState(() => eraForSolo(selectedSolo));
  const catalogue = catalogueForSolo(selectedSolo);
  const lastSolo = useRef({
    blues: INITIAL_SOLO, bodyAndSoul: FIRST_BODY_AND_SOUL, rhythmChanges: FIRST_RHYTHM_CHANGES,
    [catalogue]: selectedSolo,
  });
  const [noteHeight, setNoteHeight] = useState<number>(PITCH_STEP);
  const [timeSpacing, setTimeSpacing] = useState(DEFAULT_TIME_SPACING);
  const [annotations, setAnnotations] = useState(readSoloAnnotations);
  const latestAnnotations = useRef(annotations);
  const notePlayback = useNotePlaybackClock();
  const playbackPosition = useRef<ScorePlaybackPosition>({ listeners: new Set() });
  const playback = useMemo(() => {
    const publish = (time?: number) => {
      playbackPosition.current.time = time;
      playbackPosition.current.listeners.forEach((paint) => paint(time));
    };
    return {
      register: notePlayback.register,
      advance(time: number) {
        notePlayback.advance(time);
        publish(time);
      },
      reset() {
        notePlayback.reset();
        publish();
      },
    };
  }, [notePlayback]);
  const audioRef = useRef<HTMLAudioElement>(null);
  const compositionScroll = useRef<HTMLDivElement>(null);

  const solo = solos[selectedSolo];
  const { instrument, melid } = solo;
  const audition = useMemo(createScoreNoteAudition, []);
  useLayoutEffect(() => audition.cancel, [audition, melid]);
  useEffect(() => audition.dispose, [audition]);
  const barsPerMeasure = barsPerMeasureBySolo[melid];
  const key = soloKey(solo);
  const fileName = makeFileName(solo);
  const soloData = useSoloData(melid, fileName);
  const audio = playbackBySolo[melid]?.audio;
  const score = useMemo(() => soloData?.beats.length
    ? buildTonalScore(soloData.beats, soloData.melody, key, audio?.scoreStart, { ...soloData, barsPerMeasure })
    : undefined, [soloData, key, audio?.scoreStart, barsPerMeasure]);
  const recording = recordingForSolo(melid);
  const annotation = annotations.get(melid);
  const changes = annotation?.tonicChanges ?? score?.tonicChanges ?? NO_CHANGES;
  const heading = [instrumentName(instrument), recording?.recording_year].filter(Boolean).join(", ");

  useEffect(() => {
    if (!window.location.hash) window.history.replaceState(window.history.state, "", soloLink(solos[INITIAL_SOLO].melid));
    const navigate = () => {
      const index = soloFromLocation();
      lastSolo.current[catalogueForSolo(index)] = index;
      setSelectedSolo(index);
      setSelectedEra(eraForSolo(index));
      setTimeSpacing(DEFAULT_TIME_SPACING);
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", navigate);
    return () => window.removeEventListener("hashchange", navigate);
  }, []);

  useLayoutEffect(() => {
    const list = compositionScroll.current;
    const current = list?.querySelector("[aria-current]");
    if (!list || !current) return;
    const area = list.getBoundingClientRect();
    const bounds = current.getBoundingClientRect();
    if (bounds.top < area.top) list.scrollTop += bounds.top - area.top;
    else if (bounds.bottom > area.bottom) list.scrollTop += bounds.bottom - area.bottom;
  }, [selectedEra, selectedSolo]);

  function seekRecording(scoreTime: number) {
    const media = audioRef.current;
    if (!audio || !media || !Number.isFinite(media.duration)) return;
    const position = audioTimeAt(audio, scoreTime);
    media.currentTime = Math.min(media.duration, Math.max(0, position));
  }

  function updateAnnotation(edit: (annotation: SoloAnnotation) => void) {
    if (!score) return;
    const current = latestAnnotations.current.get(melid);
    const next: SoloAnnotation = { ...current, version: 1, soloId: melid, scoreOrigin: score.origin };
    edit(next);
    const saved = next.tonicChanges !== undefined || next.sectionStarts ? next : undefined;
    if (JSON.stringify(current) === JSON.stringify(saved)) return;
    const updated = new Map(latestAnnotations.current);
    if (saved) updated.set(melid, saved);
    else updated.delete(melid);
    writeSoloAnnotation(melid, saved);
    latestAnnotations.current = updated;
    setAnnotations(updated);
  }

  function commitTonicChanges(next: TonicChange[]) {
    const saved = tonicAnnotation(next);
    const base = tonicAnnotation(score?.tonicChanges ?? NO_CHANGES);
    updateAnnotation((annotation) => {
      annotation.tonicChanges = JSON.stringify(saved) === JSON.stringify(base) ? undefined : saved;
    });
  }

  function commitSectionStarts(group: SectionGroup, starts: number[] | undefined) {
    updateAnnotation((annotation) => {
      const sections = { ...annotation.sectionStarts };
      if (starts) sections[group] = starts;
      else delete sections[group];
      annotation.sectionStarts = sections.pickup || sections.choruses ? sections : undefined;
    });
  }

  function soloChoice(solo: JazzSolo, index: number, label: string) {
    return (
      <li key={solo.melid} className="composition-choice">
        <a
          href={soloLink(solo.melid)}
          style={soloKey(solo).endsWith("-min") ? MINOR_BLUES_LINK_STYLE : undefined}
          aria-current={index === selectedSolo ? "true" : undefined}
        >
          {label}
        </a>
      </li>
    );
  }

  const inBlues = catalogue === "blues";
  const group = inBlues ? selectedEra : rhythmChangesGroup;
  return (
    <div className="solo-layout">
      <aside className="composition-pane" aria-label="Compositions">
        {inBlues && <div className="composition-eras" role="group" aria-label="Era">
          {compositionGroups.map((era) => (
            <button
              key={era.style}
              type="button"
              aria-pressed={era === selectedEra}
              aria-controls="composition-list"
              onClick={() => {
                setSelectedEra(era);
                compositionScroll.current?.scrollTo(0, 0);
              }}
            >
              {era.label}
            </button>
          ))}
        </div>}
        <div className="composition-scroll" id="composition-list" ref={compositionScroll}>
          {catalogue !== "bodyAndSoul" && group.years && <b>{group.years}</b>}
          <ul className="composition-performers" role="list">
            {catalogue !== "bodyAndSoul" ? group.performers.map(({ performer, entries }) => (
              <li key={entries[0].solo.melid} className="composition-performer">
                <span className="composition-performer-name">{performer}</span>
                <ul className="composition-solos" role="list">
                  {entries.map(({ solo, index }) => {
                    const title = [solo.title, solo.titleaddon].filter(Boolean).join(" ");
                    const label = solo.solopart > 1 ? `${title} (${solo.solopart})` : title;
                    return soloChoice(solo, index, label);
                  })}
                </ul>
              </li>
            )) : bodyAndSoulEntries.map(({ solo, index }) => {
              const variant = solo.titleaddon || (solo.solopart > 1 ? solo.solopart : undefined);
              const label = variant ? `${solo.performer} (${variant})` : solo.performer;
              return soloChoice(solo, index, label);
            })}
          </ul>
        </div>
        <nav className="composition-picker" aria-label="Catalogue">
          {CATALOGUES.map((id) => (
            <a key={id} href={soloLink(solos[lastSolo.current[id]].melid)} aria-current={catalogue === id ? "true" : undefined}>
              {CATALOGUE_LABELS[id]}
            </a>
          ))}
        </nav>
      </aside>
      <main className="solo-main">
        <header className="solo-heading">
          <div className="solo-title-row">
            <div className="solo-title">{heading}</div>
            <div className="solo-site-links">
              <a href="https://rawl.rocks/" target="_blank" rel="noreferrer" aria-label="Rawl">
                <img src={import.meta.env.BASE_URL + "rawl-favicon.svg"} alt="" width={20} height={20} />
              </a>
              <a href="https://github.com/vpavlenko/12" target="_blank" rel="noreferrer" aria-label="GitHub">
                <span className="octocat" />
              </a>
            </div>
          </div>
        </header>
        {score && <>
          <SoloScore
            key={melid}
            score={score}
            changes={changes}
            onChangesChange={commitTonicChanges}
            sectionStarts={annotation?.sectionStarts}
            onSectionStartsChange={commitSectionStarts}
            playback={playback}
            playbackPosition={playbackPosition}
            onNoteClick={audition.play}
            noteHeight={noteHeight}
            timeSpacing={timeSpacing}
            onNoteHeightChange={setNoteHeight}
            onTimeSpacingChange={setTimeSpacing}
            onSeek={audio ? seekRecording : undefined}
          />
          {recording && <SoloMetadata key={melid} solo={solo} recording={recording} localAnnotation={annotation} />}
        </>}
        <SoloPianoLegend key={melid} tonicKey={key}
          score={changes.length ? score : undefined} changes={changes} playback={playback} />
      </main>
      <ScoreSizeSliders
        noteHeight={noteHeight}
        timeSpacing={timeSpacing}
        onNoteHeightChange={setNoteHeight}
        onTimeSpacingChange={setTimeSpacing}
        keyboardShortcuts
      />
      {audio && <SoloAudio excerpt={audio} playback={playback} score={score} changes={changes} audioRef={audioRef} />}
    </div>
  );
}

export default App;
