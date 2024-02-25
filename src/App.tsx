import { useEffect, useState } from "react";
import "./App.css";
import data from "../data/wjd_maj_blues.json";
import Papa from "papaparse";

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

const makeFileName = ({ title, performer }: JazzSolo) =>
  performer.replace(/ /g, "") + "_" + title.replace(/ /g, "") + "_Solo.csv";

const CsvLoader: React.FC<{ filePath: string }> = ({ filePath }) => {
  const [data, setData] = useState<Array<any>>([]);

  useEffect(() => {
    fetch(filePath)
      .then((response) => response.text())
      .then((csvText) => {
        Papa.parse(csvText, {
          complete: (result) => {
            setData(result.data);
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
      :{" "}
      {data.map((line) => (
        <div>{JSON.stringify(line)}</div>
      ))}
    </div>
  );
};

const solos: JazzSolo[] = data;

function App() {
  const [selectedSolo, setSelectedSolo] = useState(0);
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
        Selected: {solos[selectedSolo].title} {solos[selectedSolo].performer}{" "}
        {solos[selectedSolo].key} {solos[selectedSolo].chord_changes}{" "}
        {solos[selectedSolo].style}
      </div>
      <CsvLoader filePath={`csv_melody/${makeFileName(solos[selectedSolo])}`} />
      <CsvLoader filePath={`csv_beats/${makeFileName(solos[selectedSolo])}`} />
    </>
  );
}

export default App;
