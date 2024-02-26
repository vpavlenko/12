import { FC, Fragment, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import data from "../data/wjd_maj_blues.json";
import jazztubeData from "../data/jazztube.json";
import Papa from "papaparse";
import YouTube, { YouTubePlayer } from "react-youtube";
import TonalGrid from "./components/TonalGrid";

const STYLES = {
  TRADITIONAL: "1910..30s",
  SWING: "1930..40s",
  BEBOP: "1940..50s",
  COOL: "1950..60s",
  HARDBOP: "1950..60s",
  POSTBOP: "1960..70s",
};

const INSTRUMENTS = {
  as: "alto saxophone",
  bcl: "bass clarinet",
  bs: "baritone saxophone",
  cor: "cornet",
  g: "guitar",
  ss: "soprano saxophone",
  tb: "trombone",
  tp: "trumpet",
  ts: "tenor saxophone",
  vib: "vibraphone",
};

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

export type BeatsItem = {
  bar: string;
  beat: string;
  onset: string;
  chord: string;
};

export type Note = {
  onset: number;
  duration: number;
  pitch: number;
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
  const [selectedSolo, setSelectedSolo] = useState(1);
  const [melodyData, setMelodyData] = useState<MelodyItem[]>([]);
  const [beatsData, setBeatsData] = useState<BeatsItem[]>([]);
  const [youtubeId, setYoutubeId] = useState<string | null>(null);
  const [choruses, setChoruses] = useState<Note[]>([]);
  const [currentYoutubeTime, setCurrentYoutubeTime] = useState<number>(0);
  const playerRef = useRef<YouTubePlayer>();

  const { style, title, performer, key, instrument, melid } =
    solos[selectedSolo];

  const youtubeItem = useMemo(() => {
    return youtubeVideos[melid]?.filter(
      ({ youtube_id }) => youtubeId === youtube_id
    )?.[0];
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
      {Object.entries(STYLES).map(([style_, years]) => (
        <div key={style_}>
          <b>
            {style_.toLowerCase()}, {years}:{" "}
          </b>
          {solos.map(
            ({ title, style }, index) =>
              style === style_ && (
                <Fragment key={index}>
                  <span
                    style={
                      index === selectedSolo
                        ? { fontWeight: 700 }
                        : { cursor: "pointer" }
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
              )
          )}
        </div>
      ))}
      <div style={{ marginTop: "40px" }}>
        A {style.toLowerCase()} solo on{" "}
        <span style={{ color: "darkorange", fontWeight: 700 }}>"{title}"</span>{" "}
        by{" "}
        <span style={{ color: "darkgreen", fontWeight: 700 }}>{performer}</span>{" "}
        ({INSTRUMENTS[instrument as keyof typeof INSTRUMENTS]}) in {key},{" "}
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
                  : { borderBottom: "1px dotted gray", cursor: "pointer" }
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
