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

const makeCsvMelodyFileName = ({ title, performer }: JazzSolo) =>
  performer.replace(/ /g, "") + "_" + title.replace(/ /g, "") + "_Solo.csv";

const CsvMelodyLoader: React.FC<{ fileName: string }> = ({ fileName }) => {
  const [data, setData] = useState<Array<any>>([]);

  useEffect(() => {
    const filePath = `csv_melody/${fileName}`;

    fetch(filePath)
      .then((response) => response.text())
      .then((csvText) => {
        Papa.parse(csvText, {
          complete: (result: any) => {
            setData(result.data);
          },
          header: true,
        });
      })
      .catch((error) => console.error("Error loading the CSV file:", error));
  }, [fileName]);

  return <div>{JSON.stringify(data)}</div>;
};

const solos: JazzSolo[] = data;

function App() {
  const [selectedSolo, setSelectedSolo] = useState(0);
  return (
    <>
      {solos.map(({ title }, index) => (
        <>
          <span onClick={() => setSelectedSolo(index)}>{title}</span>{" "}
        </>
      ))}
      <div>
        Selected: {solos[selectedSolo].title} {solos[selectedSolo].performer}{" "}
        {solos[selectedSolo].key} {solos[selectedSolo].chord_changes}{" "}
        {solos[selectedSolo].style}
      </div>
      <CsvMelodyLoader fileName={makeCsvMelodyFileName(solos[selectedSolo])} />
    </>
  );
}

export default App;
