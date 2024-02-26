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

const MIN_PITCH = 40;
const MAX_PITCH = 90;

const KEYS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

const Measure: FC<{ number: number; left: number; measureWidth: number }> = ({
  number,
  left,
  measureWidth,
}) => (
  <>
    <MeasureBar
      style={{
        left,
        ...(number % 12 === 1
          ? { backgroundColor: "#a0f" }
          : number % 4 === 1
          ? { backgroundColor: "#aaa" }
          : {}),
      }}
    />
    {measureWidth > 30 &&
      [1, 2, 3].map((beat) => (
        <BeatBar style={{ left: left + (beat * measureWidth) / 4 }} />
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
  measures: number[];
  measureWidth: number;
  noteHeight: number;
  mapToRelativeTime: (time: number) => number;
}> = ({
  choruses,
  beats,
  key_,
  currentYoutubeTime,
  measures,
  measureWidth,
  noteHeight,
  mapToRelativeTime,
}) => {
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
            height: 6 * noteHeight,
            left: 0,
            top: (MAX_PITCH - midiNumber - 6) * noteHeight,
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
        width: measures.length * measureWidth,
        height: (MAX_PITCH - MIN_PITCH + 1) * noteHeight,
        backgroundColor: "black",
      }}
    >
      {currentYoutubeTime !== -10 &&
        currentYoutubeTime != null &&
        !isNaN(currentYoutubeTime) && (
          <Cursor style={{ left: currentYoutubeTime * measureWidth }} />
        )}
      {octaves}
      {measures.map((number, index) => (
        <>
          <Measure
            key={number}
            number={number}
            left={index * measureWidth - 1}
            measureWidth={measureWidth}
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
              width: duration * measureWidth,
              height: noteHeight,
              top: (MAX_PITCH - pitch - 1) * noteHeight,
              left: onset * measureWidth,
              zIndex: 10,
            }}
          />
        )
      )}
      {beats
        .filter(({ chord }) => chord)
        .map(({ onset, chord }, index) => (
          <div
            key={index}
            style={{
              position: "absolute",
              left:
                mapToRelativeTime &&
                mapToRelativeTime(parseFloat(onset)) * measureWidth,
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
