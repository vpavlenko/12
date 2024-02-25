import { useState } from "react";
import "./App.css";
import data from "../data/wjd_maj_blues.json";

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

const solos: JazzSolo[] = data;

function App() {
  return (
    <>
      {solos.map(({ title, performer, key, chord_changes, style }) => (
        <div>
          {title} {performer} {key} {chord_changes} {style}
        </div>
      ))}
    </>
  );
}

export default App;
