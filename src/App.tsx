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
import SoloScore, { DEFAULT_TIME_SPACING } from "./components/SoloScore";
import { SoloAudio } from "./components/SoloPlayback";
import { audioTimeAt, type AudioExcerpt } from "./recordingClock";
import { SoloPianoLegend } from "./components/SoloPianoLegend";
import { SoloMetadata } from "./components/SoloMetadata";
import { buildTonalScore, type BeatsItem, type MelodyItem } from "./tonalScore";
import {
  annotatedSoloIds, bluesSolos, bodyAndSoulSoloIds, bodyAndSoulSolos,
  instrumentName, recordingForSolo, soloKey, solos, type JazzSolo,
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

type SoloData = {
  melody: MelodyItem[];
  beats: BeatsItem[];
  chorusBars?: number[];
  formBars?: number[];
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
    const formBars = bodyAndSoulSoloIds.has(melid)
      ? beats.filter(({ bar, beat, form }) => beat === 1 && form
        && (/^\*?[AB]\d+$/.test(form) || (bar > 0 && form === "I1"))).map(({ bar }) => bar)
      : undefined;
    return { beats, melody: notes, chorusBars: [...choruses.values()], formBars };
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
const catalogueForSolo = (index: number) => index >= FIRST_BODY_AND_SOUL ? "bodyAndSoul" : "blues";

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

const compositionGroups = Object.entries(STYLES).map(([style, label]) => {
  const performers = new Map<string, { solo: JazzSolo; index: number }[]>();
  const years: number[] = [];
  bluesSolos.forEach((solo, index) => {
    if (solo.style !== style) return;
    const year = recordingForSolo(solo.melid)?.recording_year;
    if (year != null) years.push(year);
    const entries = performers.get(solo.performer) ?? [];
    entries.push({ solo, index });
    performers.set(solo.performer, entries);
  });
  return { style, label, years: decadeRange(years), performers: [...performers] };
});

function eraForSolo(index: number) {
  return compositionGroups.find(({ style }) => style === solos[index].style) ?? compositionGroups[0];
}

function App() {
  const [selectedSolo, setSelectedSolo] = useState(soloFromLocation);
  const [selectedEra, setSelectedEra] = useState(() => eraForSolo(selectedSolo));
  const catalogue = catalogueForSolo(selectedSolo);
  const lastSolo = useRef({ blues: INITIAL_SOLO, bodyAndSoul: FIRST_BODY_AND_SOUL,
    [catalogue]: selectedSolo });
  const [noteHeight, setNoteHeight] = useState<number>(PITCH_STEP);
  const [timeSpacing, setTimeSpacing] = useState(DEFAULT_TIME_SPACING);
  const [recoloring, setRecoloring] = useState<{ melid: number; changes: TonicChange[] }>();
  const notePlayback = useNotePlaybackClock();
  const playbackPosition = useRef<((time?: number) => void) | undefined>(undefined);
  const playback = useMemo(() => ({
    register: notePlayback.register,
    advance(time: number) {
      notePlayback.advance(time);
      playbackPosition.current?.(time);
    },
    reset() {
      notePlayback.reset();
      playbackPosition.current?.();
    },
  }), [notePlayback]);
  const audioRef = useRef<HTMLAudioElement>(null);
  const compositionScroll = useRef<HTMLDivElement>(null);

  const solo = solos[selectedSolo];
  const { instrument, melid } = solo;
  const key = soloKey(solo);
  const fileName = makeFileName(solo);
  const soloData = useSoloData(melid, fileName);
  const audio = playbackBySolo[melid]?.audio;
  const score = useMemo(() => soloData?.beats.length
    ? buildTonalScore(soloData.beats, soloData.melody, key, audio?.scoreStart, soloData.chorusBars, soloData.formBars)
    : undefined, [soloData, key, audio?.scoreStart]);
  const recording = recordingForSolo(melid);
  const changes = recoloring?.melid === melid ? recoloring.changes : NO_CHANGES;
  const heading = [instrumentName(instrument), recording?.recording_year].filter(Boolean).join(", ");

  useEffect(() => {
    if (!window.location.hash) window.history.replaceState(window.history.state, "", soloLink(solos[INITIAL_SOLO].melid));
    const navigate = () => {
      const index = soloFromLocation();
      lastSolo.current[catalogueForSolo(index)] = index;
      setSelectedSolo(index);
      setSelectedEra(eraForSolo(index));
      setTimeSpacing(DEFAULT_TIME_SPACING);
      setRecoloring(undefined);
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
          {inBlues && selectedEra.years && <b>{selectedEra.years}</b>}
          <ul className="composition-performers" role="list">
            {inBlues ? selectedEra.performers.map(([performer, entries]) => (
              <li key={performer} className="composition-performer">
                <span className="composition-performer-name">{performer}</span>
                <ul className="composition-solos" role="list">
                  {entries.map(({ solo, index }) => {
                    const label = solo.solopart > 1 ? `${solo.title} (${solo.solopart})` : solo.title;
                    return soloChoice(solo, index, label);
                  })}
                </ul>
              </li>
            )) : bodyAndSoulSolos.map((solo, index) => {
              const variant = solo.titleaddon || (solo.solopart > 1 ? solo.solopart : undefined);
              const label = variant ? `${solo.performer} (${variant})` : solo.performer;
              return soloChoice(solo, FIRST_BODY_AND_SOUL + index, label);
            })}
          </ul>
        </div>
        <nav className="composition-picker" aria-label="Catalogue">
          <a href={soloLink(solos[lastSolo.current.blues].melid)} aria-current={inBlues ? "true" : undefined}>12</a>
          <a href={soloLink(solos[lastSolo.current.bodyAndSoul].melid)} aria-current={inBlues ? undefined : "true"}>Body and Soul</a>
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
            onChangesChange={(next) => setRecoloring({ melid, changes: next })}
            playback={playback}
            playbackPosition={playbackPosition}
            noteHeight={noteHeight}
            timeSpacing={timeSpacing}
            onNoteHeightChange={setNoteHeight}
            onTimeSpacingChange={setTimeSpacing}
            onSeek={audio ? seekRecording : undefined}
          />
          {recording && <SoloMetadata key={melid} solo={solo} recording={recording} />}
        </>}
        <SoloPianoLegend key={melid} tonicKey={key} />
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
