import {
  FC,
  Fragment,
  ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import "./App.css";
import data from "../data/wjd_maj_blues.json";
import jazztubeData from "../data/jazztube.json";
import Papa from "papaparse";
import YouTube, { YouTubePlayer } from "react-youtube";
import TonalGrid from "./components/TonalGrid";
import useLocalStorageSet from "./components/useLocalStorageSet";

const BAD_VIDEOS = new Set([
  "RXvA6r_BjWQ",
  "4LBaCBT2tOs",
  "1iJdXWY7JRo",
  "DiNzXslovVk",
  "FferX_P7SVs",
  "zQBjD06a6l8",
  "fBQxsQlPDkU",
  "lcKQ3wGI8ZQ",
  "tu4o65SwUIw",
  "DabNQMNsFJk",
  "x084gGjWlpY",
  "tkSrZTEvSkc",
  "Up4NTq5tkhc",
  "oxl5L5Wyybk",
  "74GIncsU9LM",
  "FeRZPQS0Q98",
  "xnJl5CXZ82M",
  "wAMYl6kJkjo",
]);

const STYLES = {
  TRADITIONAL: "1910..30s",
  SWING: "1930..40s",
  BEBOP: "1940..50s",
  COOL: "1950..60s",
  HARDBOP: "1950..60s",
  POSTBOP: "1960..90s",
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
  index: number;
  db: string;
  melid: number;
  mf_median: number;
  mf_min: number;
  query: string;
  solo_end_sec: number;
  solo_start_sec: number;
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

export type MelodyItem = {
  onset: number;
  duration: number;
  pitch: number;
};

export type BeatsItem = {
  bar: number;
  beat: number;
  onset: number;
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
        Papa.parse(csvText.trim(), {
          complete: ({ data }) => {
            innerSetData(data);
            setData(data);
          },
          header: true,
          dynamicTyping: true,
        });
      })
      .catch((error) => console.error("Error loading the CSV file:", error));
  }, [filePath]);

  return (
    <div style={{ fontSize: "10px" }}>
      <CollapsibleDiv title={filePath}>
        {data.map((line, index) => (
          <div key={index}>{JSON.stringify(line)}</div>
        ))}
      </CollapsibleDiv>
    </div>
  );
};

const solos: JazzSolo[] = data;

const CollapsibleDiv: FC<{ title: string; children?: ReactNode }> = ({
  title,
  children,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const toggleOpen = () => setIsOpen(!isOpen);

  return (
    <div>
      <div onClick={toggleOpen} style={{ cursor: "pointer" }}>
        {title}
      </div>
      {isOpen && <div>{children}</div>}
    </div>
  );
};

function App() {
  // TODO: store selectedSolo via melid and persist to URL:
  // https://chat.openai.com/share/54d40902-ea4f-4d83-83aa-4cc444198010
  const [selectedSolo, setSelectedSolo] = useState(1);
  const [melodyData, setMelodyData] = useState<MelodyItem[] | null>(null);
  const [beatsData, setBeatsData] = useState<BeatsItem[] | null>(null);
  const [youtubeId, setYoutubeId] = useState<string | null>("WvKuTS1mBmU");
  const [currentYoutubeTime, setCurrentYoutubeTime] = useState<number>(0);
  const [badVideos, addBadVideo] = useLocalStorageSet("badVideos");
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
    beatsData?.forEach(({ bar, beat, onset }) => {
      if (beat === 1) {
        barOnsets[bar] = onset;
      }
    });
    return beatsData
      ? (absoluteTime: number) => {
          for (const iAsString in barOnsets) {
            const i = parseInt(iAsString, 10);
            if (!(i - 1 in barOnsets)) {
              continue;
            }
            if (absoluteTime <= barOnsets[i]) {
              return (
                i -
                beatsData[0].bar +
                (absoluteTime - barOnsets[i - 1]) /
                  (barOnsets[i] - barOnsets[i - 1])
              );
            }
          }
          return -10;
        }
      : () => 0;
  }, [beatsData]);

  useEffect(() => {
    function updateCurrentTime() {
      const time = playerRef?.current?.getCurrentTime();
      if (typeof time === "number") {
        setCurrentYoutubeTime(time - youtubeItem.solo_start_sec);
      }
      requestAnimationFrame(updateCurrentTime);
    }

    const animationFrameId = requestAnimationFrame(updateCurrentTime);

    return () => cancelAnimationFrame(animationFrameId);
  }, [youtubeItem]);

  const mergedBadVideos = useMemo(
    () => new Set([...badVideos, ...BAD_VIDEOS]),
    [badVideos, BAD_VIDEOS]
  );

  return (
    <>
      <div style={{ position: "absolute", right: 20 }}>
        <a href="https://github.com/vpavlenko/12" target="_blank">
          <div className="octocat" />
        </a>
      </div>
      <div style={{ columnCount: 4, columnGap: "20px", width: "100vw" }}>
        {Object.entries(STYLES).map(([style_, years]) => (
          <div
            key={style_}
            style={{ breakInside: "avoid", marginBottom: "20px" }}
          >
            <b>
              {style_.toLowerCase()}, {years}:{" "}
            </b>
            <div>
              {Object.entries(
                solos.reduce<Record<string, JSX.Element[]>>(
                  (
                    acc,
                    { title, solopart, performer, style, melid },
                    soloIndex
                  ) => {
                    if (style === style_) {
                      if (!acc[performer]) acc[performer] = [];
                      acc[performer].push(
                        <span
                          key={soloIndex}
                          style={{
                            display: "inline",
                            fontWeight:
                              soloIndex === selectedSolo ? 700 : "normal",
                            cursor: "pointer",
                            ...(youtubeVideos[melid]?.filter(
                              ({ youtube_id }) =>
                                !mergedBadVideos.has(youtube_id)
                            ).length > 0
                              ? {}
                              : {
                                  textDecoration: "line-through",
                                  color: "#d8d8d8",
                                }),
                          }}
                          onClick={() => {
                            setSelectedSolo(soloIndex);
                            setYoutubeId(
                              youtubeVideos[solos[soloIndex].melid]?.filter(
                                ({ youtube_id }) =>
                                  !mergedBadVideos.has(youtube_id)
                              )?.[0].youtube_id
                            );
                            setBeatsData(null);
                            setMelodyData(null);
                          }}
                        >
                          {title}
                          {solopart > 1 && ` (${solopart})`}
                        </span>
                      );
                    }
                    return acc;
                  },
                  {}
                )
              ).map(([performer, titles], perfIndex) => (
                <div
                  key={perfIndex}
                  style={{ paddingLeft: "3em", textIndent: "-3em" }}
                >
                  <span style={{ color: "#aaa" }}>{performer}: </span>
                  {titles.reduce(
                    (prev, curr, idx) => (
                      <>
                        {prev}
                        {idx > 0 ? ", " : ""}
                        <span style={{ whiteSpace: "nowrap" }}>{curr}</span>
                      </>
                    ),
                    <></>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: "40px", fontSize: 16 }}>
        A {style.toLowerCase()} solo on{" "}
        <span style={{ color: "darkorange", fontWeight: 700 }}>"{title}"</span>{" "}
        by{" "}
        <span style={{ color: "darkgreen", fontWeight: 700 }}>{performer}</span>{" "}
        ({INSTRUMENTS[instrument as keyof typeof INSTRUMENTS]}) in {key}.
        Youtube videos:{" "}
        {youtubeVideos[melid]?.map(({ youtube_id }) => (
          <Fragment key={youtube_id}>
            <span
              style={
                mergedBadVideos.has(youtube_id)
                  ? { color: "#d8d8d8", textDecoration: "line-through" }
                  : youtubeId === youtube_id
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
      {beatsData && melodyData && (
        <TonalGrid
          beats={beatsData}
          melody={melodyData}
          key_={solos[selectedSolo].key}
          currentYoutubeTime={currentYoutubeTime + 0.05}
          measureWidth={25}
          noteHeight={2}
          mapToRelativeTime={mapToRelativeTime}
        />
      )}
      {beatsData && melodyData && (
        <TonalGrid
          beats={beatsData}
          melody={melodyData}
          key_={solos[selectedSolo].key}
          currentYoutubeTime={currentYoutubeTime + 0.05}
          measureWidth={100}
          noteHeight={9}
          mapToRelativeTime={mapToRelativeTime}
        />
      )}
      {youtubeId && youtubeItem && (
        <div style={{ position: "fixed", left: 0, bottom: 0 }}>
          <YouTube
            videoId={youtubeId}
            opts={{
              height: "100",
              width: "1500",
              playerVars: {
                start: youtubeItem.solo_start_sec,
                autoplay: 1,
              },
            }}
            onReady={(event) => {
              playerRef.current = event.target;
              event.target.seekTo(youtubeItem.solo_start_sec, true);
            }}
            onError={() => addBadVideo(youtubeId)}
          />
        </div>
      )}
      <div style={{ marginTop: 200 }}>
        <CsvLoader
          filePath={`csv_melody/${makeFileName(solos[selectedSolo])}`}
          setData={setMelodyData}
        />
        <CsvLoader
          filePath={`csv_beats/${makeFileName(solos[selectedSolo])}`}
          setData={setBeatsData}
        />
      </div>
    </>
  );
}

export default App;
