import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import "./App.css";
import data from "../data/wjd_maj_blues.json";
import playbackData from "../data/playback.json";
import type { TonicChange } from "librawl";
import { useNotePlaybackClock } from "librawl/native";
import { ScoreSizeSliders } from "librawl/components";
import { PITCH_STEP } from "librawl/geometry";
import "librawl/score-size-sliders.css";
import Papa from "papaparse";
import TonalGrid, { DEFAULT_TIME_SPACING } from "./components/TonalGrid";
import { SoloAudio, type AudioExcerpt } from "./components/SoloPlayback";
import { SoloPianoLegend } from "./components/SoloPianoLegend";
import { SoloMetadata } from "./components/SoloMetadata";
import { buildTonalScore, type BeatsItem, type MelodyItem } from "./tonalScore";
import { instrumentName, weimarRecordings, type JazzSolo } from "./weimar";

const STYLES = {
  TRADITIONAL: "trad",
  SWING: "swing",
  BEBOP: "bebop",
  COOL: "cool",
  HARDBOP: "hardbop",
  POSTBOP: "postbop",
};

const INITIAL_SOLO = 1;

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

function useSoloData(fileName: string) {
  const [loaded, setLoaded] = useState<{
    fileName: string;
    melody: MelodyItem[];
    beats: BeatsItem[];
  }>();
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    Promise.all([
      loadCsv<MelodyItem>(`csv_melody/${fileName}`, signal),
      loadCsv<BeatsItem>(`csv_beats/${fileName}`, signal),
    ]).then(([melody, beats]) => {
      if (!signal.aborted) setLoaded({ fileName, melody, beats });
    }).catch((error) => {
      if (!signal.aborted) console.error("Error loading the CSV file:", error);
    });
    return () => controller.abort();
  }, [fileName]);
  return loaded?.fileName === fileName ? loaded : undefined;
}

const solos: JazzSolo[] = data;
const soloIndices = new Map(solos.map(({ melid }, index) => [melid, index]));
const soloLink = (melid: number) => `#solo-${melid}`;

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
  solos.forEach((solo, index) => {
    if (solo.style !== style) return;
    const year = weimarRecordings[solo.melid]?.recording_year;
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
  const [noteHeight, setNoteHeight] = useState<number>(PITCH_STEP);
  const [timeSpacing, setTimeSpacing] = useState(DEFAULT_TIME_SPACING);
  const [recoloring, setRecoloring] = useState<{ melid: number; changes: TonicChange[] }>();
  const playback = useNotePlaybackClock();
  const audioRef = useRef<HTMLAudioElement>(null);
  const compositionScroll = useRef<HTMLDivElement>(null);

  const solo = solos[selectedSolo];
  const { key, instrument, melid } = solo;
  const fileName = makeFileName(solo);
  const soloData = useSoloData(fileName);
  const score = useMemo(() => soloData?.beats.length ? buildTonalScore(soloData.beats, soloData.melody, key) : undefined, [soloData, key]);
  const audio = playbackBySolo[melid]?.audio;
  const recording = weimarRecordings[melid];
  const changes = recoloring?.melid === melid ? recoloring.changes : NO_CHANGES;
  const heading = [instrumentName(instrument), recording?.recording_year].filter(Boolean).join(", ");

  useEffect(() => {
    if (!window.location.hash) window.history.replaceState(window.history.state, "", soloLink(solos[INITIAL_SOLO].melid));
    const navigate = () => {
      const index = soloFromLocation();
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
    const position = (scoreTime - audio.scoreStart) * audio.secondsPerScoreSecond;
    media.currentTime = Math.min(media.duration, Math.max(0, position));
  }

  return (
    <div className="solo-layout">
      <aside className="composition-pane" aria-label="Compositions">
        <div className="composition-eras" role="group" aria-label="Era">
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
        </div>
        <div className="composition-scroll" id="composition-list" ref={compositionScroll}>
          {selectedEra.years && <b>{selectedEra.years}</b>}
          <ul className="composition-performers" role="list">
            {selectedEra.performers.map(([performer, entries]) => (
              <li key={performer} className="composition-performer">
                <span className="composition-performer-name">{performer}</span>
                <ul className="composition-solos" role="list">
                  {entries.map(({ solo, index }) => {
                    const label = solo.solopart > 1 ? `${solo.title} (${solo.solopart})` : solo.title;
                    return (
                      <li key={solo.melid} className="composition-choice">
                        <a
                          href={soloLink(solo.melid)}
                          aria-current={index === selectedSolo ? "true" : undefined}
                        >
                          {label}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </div>
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
          <TonalGrid
            key={fileName}
            score={score}
            changes={changes}
            onChangesChange={(next) => setRecoloring({ melid, changes: next })}
            playback={playback}
            noteHeight={noteHeight}
            timeSpacing={timeSpacing}
            onNoteHeightChange={setNoteHeight}
            onTimeSpacingChange={setTimeSpacing}
            onSeek={audio ? seekRecording : undefined}
          />
          {recording && <SoloMetadata key={melid} solo={solo} recording={recording} />}
        </>}
        <SoloPianoLegend key={fileName} tonicKey={key} />
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
