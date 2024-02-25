import { FC, Fragment, useEffect, useMemo, useRef, useState } from "react";
import styled from "styled-components";
import "./App.css";
import data from "../data/wjd_maj_blues.json";
import jazztubeData from "../data/jazztube.json";
import Papa from "papaparse";
import YouTube, { YouTubePlayer } from "react-youtube";

const KEYS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

type YoutubeEntry = {
  index: string;
  db: string;
  melid: string;
  mf_median: string;
  mf_min: string;
  query: string;
  solo_end_sec: string;
  solo_start_sec: string;
  wp_end_idx: string;
  wp_start_idx: string;
  youtube_id: string;
};

type YoutubeEntries = {
  [key: string]: YoutubeEntry[];
};

const youtubeVideos: YoutubeEntries = jazztubeData;

const VerticalBar = styled.div`
  width: 1px;
  height: 100%;
  position: absolute;
  top: 0;
  pointer-events: none;
`;

const Cursor = styled(VerticalBar)`
  background-color: orange;
  pointer-events: none;
  z-index: 1;
`;

const MeasureBar = styled(VerticalBar)`
  background-color: #444;
`;

// const BeatBar = styled(VerticalBar)`
//   border-left: 1px dashed #262626;
// `;

const BEAT_WIDTH = 25;
const MEASURE_WIDTH = BEAT_WIDTH * 4;
const NOTE_HEIGHT = 10;

const MIN_PITCH = 40;
const MAX_PITCH = 90;

const MEASURES = [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

const capitalizeWords = (text: string): string => {
  let words = text.split(/ /g);
  for (let i = 0; i < words.length; i++) {
    words[i] = words[i][0].toUpperCase() + words[i].slice(1);
  }
  return words.join(" ");
};

type JazzSolo = {
  melid: number;
  trackid: number;
  compid: number;
  recordid: number;
  performer: string;
  title: string;
  titleaddon: string;
  solopart: number;
  instrument: string;
  style: string;
  avgtempo: number;
  tempoclass: string;
  rhythmfeel: string;
  key: string;
  signature: string;
  chord_changes: string;
  chorus_count: number;
  composer: string;
  form: string;
  template: string;
  tonalitytype: string;
  genre: string;
};

type MelodyItem = {
  onset: string;
  duration: string;
  pitch: string;
};

type BeatsItem = {
  bar: string;
  beat: string;
  onset: string;
  chord: string;
};

type Note = {
  onset: number;
  duration: number;
  pitch: number;
};

const Measure: FC<{ number: number; left: number }> = ({ number, left }) => (
  <>
    <MeasureBar
      style={{ left, ...(number % 4 === 1 ? { backgroundColor: "#aaa" } : {}) }}
    />
    <div
      style={{ position: "absolute", left: left + 10, top: 20, color: "white" }}
    >
      {number}
    </div>
  </>
);

const TonalGrid: FC<{
  choruses: Note[];
  beats: BeatsItem[];
  key_: string;
  currentYoutubeTime: number;
}> = ({ choruses, beats, key_, currentYoutubeTime }) => {
  const tonic = key_ ? KEYS.indexOf(key_.split("-")[0]) : 0;
  const octaves = [];
  for (let octave = 0; octave <= 9; ++octave) {
    const midiNumber = tonic + octave * 12;
    if (midiNumber >= MIN_PITCH && midiNumber + 4 <= MAX_PITCH)
      octaves.push(
        <div
          key={`tonalgrid_octave_${midiNumber}`}
          style={{
            position: "absolute",
            width: "100%",
            height: 6 * NOTE_HEIGHT,
            left: 0,
            top: (MAX_PITCH - midiNumber - 6) * NOTE_HEIGHT,
            pointerEvents: "none",
            background: `linear-gradient(to top, #222, transparent)`,
            zIndex: 0,
          }}
        />
      );
  }
  return (
    <div
      style={{
        position: "relative",
        width: MEASURES.length * MEASURE_WIDTH,
        height: (MAX_PITCH - MIN_PITCH + 1) * NOTE_HEIGHT,
        backgroundColor: "black",
      }}
    >
      {currentYoutubeTime !== -10 && currentYoutubeTime != null && (
        <>
          <div
            style={{ position: "absolute", bottom: 0, left: 0, color: "white" }}
          >
            {currentYoutubeTime}
          </div>
          <Cursor style={{ left: currentYoutubeTime * MEASURE_WIDTH }} />
        </>
      )}
      {octaves}
      {MEASURES.map((number, index) => (
        <Measure
          key={number}
          number={number}
          left={index * MEASURE_WIDTH - 1}
        />
      ))}
      {choruses.map(({ pitch, onset, duration }, index) =>
        isNaN(pitch) ? null : (
          <div
            key={index}
            className={`noteColor_${(pitch - tonic) % 12}_colors`}
            style={{
              position: "absolute",
              width: duration * MEASURE_WIDTH,
              height: NOTE_HEIGHT,
              top: (MAX_PITCH - pitch - 1) * NOTE_HEIGHT,
              left: onset * MEASURE_WIDTH,
              zIndex: 10,
            }}
          />
        )
      )}
      {beats
        .filter(({ chord }) => chord)
        .map(({ bar, beat, chord }, index) => (
          <div
            key={index}
            style={{
              position: "absolute",
              left:
                (parseInt(bar, 10) + 1 + (parseInt(beat, 10) - 1) / 4) *
                MEASURE_WIDTH,
              color: "yellow",
            }}
          >
            {chord}
          </div>
        ))}
    </div>
  );
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

const CsvLoader: FC<{
  filePath: string;
  setData: (data: any) => void;
}> = ({ filePath, setData }) => {
  const [data, innerSetData] = useState<Array<any>>([]);

  useEffect(() => {
    fetch(filePath)
      .then((response) => response.text())
      .then((csvText) => {
        Papa.parse(csvText, {
          complete: ({ data }) => {
            innerSetData(data);
            setData(data);
          },
          header: true,
        });
      })
      .catch((error) => console.error("Error loading the CSV file:", error));
  }, [filePath]);

  return (
    <div style={{ fontSize: "10px" }}>
      <div>
        <b>{filePath}</b>
      </div>
      {data.map((line, index) => (
        <div key={index}>{JSON.stringify(line)}</div>
      ))}
    </div>
  );
};

const solos: JazzSolo[] = data;

const dataToChoruses = (
  melodyData: MelodyItem[],
  mapToRelativeTime: (time: number) => number
): Note[] => {
  return melodyData.map(({ duration, onset, pitch }) => ({
    duration:
      mapToRelativeTime(parseFloat(onset) + parseFloat(duration)) -
      mapToRelativeTime(parseFloat(onset)),
    onset: mapToRelativeTime(parseFloat(onset)),
    pitch: parseFloat(pitch),
  }));
};

function App() {
  const [selectedSolo, setSelectedSolo] = useState(8);
  const [melodyData, setMelodyData] = useState<MelodyItem[]>([]);
  const [beatsData, setBeatsData] = useState<BeatsItem[]>([]);
  const [youtubeId, setYoutubeId] = useState<string | null>(null);
  const [choruses, setChoruses] = useState<Note[]>([]);
  const [currentYoutubeTime, setCurrentYoutubeTime] = useState<number>(0);
  const playerRef = useRef<YouTubePlayer>();

  const { style, title, performer, key, melid } = solos[selectedSolo];

  const youtubeItem = useMemo(() => {
    return youtubeVideos[melid].filter(
      ({ youtube_id }) => youtubeId === youtube_id
    )[0];
  }, [melid, youtubeId]);

  const mapToRelativeTime = useMemo(() => {
    const barOnsets: { [key: number]: number } = {};
    beatsData.forEach(({ bar, beat, onset }) => {
      if (beat == "1") {
        barOnsets[parseInt(bar, 10)] = parseFloat(onset);
      }
    });
    return (absoluteTime: number) => {
      for (let i = -1; i <= 14; ++i) {
        if (absoluteTime < barOnsets[i]) {
          return (
            i +
            (absoluteTime - barOnsets[i - 1]) /
              (barOnsets[i] - barOnsets[i - 1])
          );
        }
      }
      console.log(absoluteTime, barOnsets);
      return -10;
    };
  }, [beatsData]);

  useEffect(
    () => setChoruses(dataToChoruses(melodyData, mapToRelativeTime)),
    [melodyData, beatsData, mapToRelativeTime]
  );

  // useEffect(() => {
  //   const interval = setInterval(() => {
  //     const time = playerRef?.current?.getCurrentTime();
  //     if (typeof time == "number") {
  //       console.log(time, youtubeItem);
  //       setCurrentYoutubeTime(time - parseFloat(youtubeItem.solo_start_sec));
  //     }
  //   }, 100);

  //   return () => clearInterval(interval);
  // }, [youtubeItem]);

  useEffect(() => {
    function updateCurrentTime() {
      const time = playerRef?.current?.getCurrentTime();
      if (typeof time === "number") {
        setCurrentYoutubeTime(time - parseFloat(youtubeItem.solo_start_sec));
      }
      requestAnimationFrame(updateCurrentTime);
    }

    const animationFrameId = requestAnimationFrame(updateCurrentTime);

    return () => cancelAnimationFrame(animationFrameId);
  }, [youtubeItem]);

  return (
    <>
      <div>
        {solos.map(({ title }, index) => (
          <Fragment key={index}>
            <span
              style={
                index === selectedSolo
                  ? { fontWeight: 700 }
                  : { borderBottom: "1px dotted gray" }
              }
              onClick={() => {
                setSelectedSolo(index);
                setYoutubeId(null);
              }}
            >
              {title}
            </span>
            {", "}
          </Fragment>
        ))}
      </div>
      <div style={{ marginTop: "40px" }}>
        A {style.toLowerCase()} solo on
        <span style={{ color: "darkorange" }}>"{title}"</span> by{" "}
        <span style={{ color: "darkgreen" }}>{performer}</span> in {key},{" "}
        <a
          href={`http://mir.audiolabs.uni-erlangen.de/jazztube/solos/solo/${melid}`}
          target="_blank"
        >
          listen to on JazzTube
        </a>
        .{" "}
        {youtubeVideos[melid]?.map(({ youtube_id }) => (
          <Fragment key={youtube_id}>
            <span
              style={
                youtubeId === youtube_id
                  ? { fontWeight: 700 }
                  : { borderBottom: "1px dotted gray" }
              }
              onClick={() => {
                setYoutubeId(youtube_id);
              }}
            >
              {youtube_id}
            </span>
            {", "}
          </Fragment>
        ))}
      </div>
      <TonalGrid
        choruses={choruses}
        beats={beatsData}
        key_={solos[selectedSolo].key}
        currentYoutubeTime={mapToRelativeTime(currentYoutubeTime + 0.05)}
      />
      {youtubeId && (
        <YouTube
          videoId={youtubeId}
          opts={{
            playerVars: {
              start: parseFloat(youtubeItem.solo_start_sec),
              autoplay: 1,
            },
          }}
          onReady={(event) => (playerRef.current = event.target)}
        />
      )}
      <CsvLoader
        filePath={`csv_melody/${makeFileName(solos[selectedSolo])}`}
        setData={setMelodyData}
      />
      <CsvLoader
        filePath={`csv_beats/${makeFileName(solos[selectedSolo])}`}
        setData={setBeatsData}
      />
    </>
  );
}

export default App;
