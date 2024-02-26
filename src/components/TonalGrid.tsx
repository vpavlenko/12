import { FC } from "react";
import styled from "styled-components";
import { BeatsItem, Note } from "../App";

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

const BeatBar = styled(VerticalBar)`
  border-left: 1px dashed #262626;
`;

const BEAT_WIDTH = 25;
const MEASURE_WIDTH = BEAT_WIDTH * 4;
const NOTE_HEIGHT = 10;

const MIN_PITCH = 40;
const MAX_PITCH = 90;

const MEASURES = [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

const KEYS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

const Measure: FC<{ number: number; left: number }> = ({ number, left }) => (
  <>
    <MeasureBar
      style={{ left, ...(number % 4 === 1 ? { backgroundColor: "#aaa" } : {}) }}
    />
    {[1, 2, 3].map((beat) => (
      <BeatBar style={{ left: left + beat * BEAT_WIDTH }} />
    ))}
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
      {currentYoutubeTime !== -10 &&
        currentYoutubeTime != null &&
        !isNaN(currentYoutubeTime) && (
          <Cursor style={{ left: currentYoutubeTime * MEASURE_WIDTH }} />
        )}
      {octaves}
      {MEASURES.map((number, index) => (
        <>
          <Measure
            key={number}
            number={number}
            left={index * MEASURE_WIDTH - 1}
          />
        </>
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

export default TonalGrid;