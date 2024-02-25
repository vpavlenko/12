import { useEffect, useState } from "react";
import styled from "styled-components";
import "./App.css";
import data from "../data/wjd_maj_blues.json";
import Papa from "papaparse";

const VerticalBar = styled.div`
  width: 1px;
  height: 100%;
  position: absolute;
  top: 0;
  pointer-events: none;
`;

// const Cursor = styled(VerticalBar)`
//   background-color: orange;
//   pointer-events: none;
// `;

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

const Measure: React.FC<{ number: number; left: number }> = ({
  number,
  left,
}) => (
  <>
    <MeasureBar style={{ left }} />
    <div
      style={{ position: "absolute", left: left + 10, top: 20, color: "white" }}
    >
      {number}
    </div>
  </>
);

const TonalGrid: React.FC<{ choruses: Note[]; beats: BeatsItem[] }> = ({
  choruses,
  beats,
}) => {
  return (
    <div
      style={{
        position: "relative",
        width: MEASURES.length * MEASURE_WIDTH,
        height: (MAX_PITCH - MIN_PITCH + 1) * NOTE_HEIGHT,
        backgroundColor: "black",
      }}
    >
      {MEASURES.map((number, index) => (
        <Measure number={number} left={index * MEASURE_WIDTH} />
      ))}
      {choruses.map(({ pitch, onset, duration }) => (
        <div
          style={{
            position: "absolute",
            width: duration * MEASURE_WIDTH,
            height: NOTE_HEIGHT,
            top: (MAX_PITCH - pitch - 1) * NOTE_HEIGHT,
            left: onset * MEASURE_WIDTH,
            backgroundColor: "red",
          }}
        />
      ))}
      {beats
        .filter(({ chord }) => chord)
        .map(({ bar, beat, chord }) => (
          <div
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

const makeFileName = ({ title, performer }: JazzSolo) =>
  performer.replace(/ /g, "") + "_" + title.replace(/ /g, "") + "_Solo.csv";

const CsvLoader: React.FC<{
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
      {data.map((line) => (
        <div>{JSON.stringify(line)}</div>
      ))}
    </div>
  );
};

const solos: JazzSolo[] = data;

const dataToChoruses = (
  melodyData: MelodyItem[],
  beatsData: BeatsItem[]
): Note[] => {
  const barOnsets: { [key: number]: number } = {};
  beatsData.forEach(({ bar, beat, onset }) => {
    if (beat == "1") {
      barOnsets[parseInt(bar, 10)] = parseFloat(onset);
    }
  });
  const mapToRelativeTime = (absoluteTime: number) => {
    for (let i = -1; i <= 14; ++i) {
      if (absoluteTime < barOnsets[i]) {
        return (
          i +
          (absoluteTime - barOnsets[i - 1]) / (barOnsets[i] - barOnsets[i - 1])
        );
      }
    }
    return -10;
  };
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

  const [choruses, setChoruses] = useState<Note[]>([]);

  useEffect(
    () => setChoruses(dataToChoruses(melodyData, beatsData)),
    [melodyData, beatsData]
  );

  return (
    <>
      <div>
        {solos.map(({ title }, index) => (
          <>
            <span
              style={
                index === selectedSolo
                  ? { fontWeight: 700 }
                  : { borderBottom: "1px dotted gray" }
              }
              onClick={() => setSelectedSolo(index)}
            >
              {title}
            </span>
            {", "}
          </>
        ))}
      </div>
      <div style={{ marginTop: "40px" }}>
        A {solos[selectedSolo].style.toLowerCase()} solo on
        <span style={{ color: "blue" }}>
          "{solos[selectedSolo].title}"
        </span> by{" "}
        <span style={{ color: "darkgreen" }}>
          {solos[selectedSolo].performer}
        </span>{" "}
        in {solos[selectedSolo].key}, changes:{" "}
        {solos[selectedSolo].chord_changes}{" "}
      </div>
      <TonalGrid choruses={choruses} beats={beatsData} />
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
