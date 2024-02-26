import { FC } from "react";
import styled from "styled-components";
import { BeatsItem, MelodyItem } from "../App";
import { Progression } from "tonal";

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
    {measureWidth > 30 && (
      <div
        style={{
          position: "absolute",
          left: left + 10,
          top: 20,
          color: "white",
        }}
      >
        {number}
      </div>
    )}
  </>
);

const TonalGrid: FC<{
  beats: BeatsItem[];
  melody: MelodyItem[];
  key_: string;
  currentYoutubeTime: number;
  measureWidth: number;
  noteHeight: number;
  mapToRelativeTime: (time: number) => number;
}> = ({
  beats,
  melody,
  key_,
  currentYoutubeTime,
  measureWidth,
  noteHeight,
  mapToRelativeTime,
}) => {
  const startBar = beats[0].bar;
  const endBar = beats.at(-1)!.bar;
  const measures = Array.from(
    { length: endBar - startBar + 1 },
    (_, index) => index + startBar
  );
  const minPitch = Math.min(...melody.map(({ pitch }) => pitch)) - 2;
  const maxPitch = Math.max(...melody.map(({ pitch }) => pitch)) + 6;
  const tonic = key_ ? KEYS.indexOf(key_.split("-")[0]) : 0;
  const octaves = [];
  for (let octave = 0; octave <= 9; ++octave) {
    const midiNumber = tonic + octave * 12;
    if (midiNumber >= minPitch && midiNumber + 4 <= maxPitch)
      octaves.push(
        <div
          key={`tonalgrid_octave_${midiNumber}`}
          style={{
            position: "absolute",
            width: "100%",
            height: 6 * noteHeight,
            left: 0,
            top: (maxPitch - midiNumber - 6) * noteHeight,
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
        height: (maxPitch - minPitch + 1) * noteHeight,
        backgroundColor: "black",
        marginTop: "20px",
        marginBottom: "20px",
      }}
    >
      {currentYoutubeTime !== -10 &&
        currentYoutubeTime != null &&
        !isNaN(currentYoutubeTime) && (
          <Cursor
            style={{
              left: mapToRelativeTime(currentYoutubeTime) * measureWidth,
            }}
          />
        )}
      {octaves}
      {beats
        .filter(({ beat }) => beat === 1)
        .map(({ bar, onset }) => (
          <>
            <Measure
              key={bar}
              number={bar}
              left={mapToRelativeTime(onset) * measureWidth}
              measureWidth={measureWidth}
            />
          </>
        ))}
      {melody.map(({ pitch, onset, duration }, index) =>
        isNaN(pitch) ? null : (
          <div
            key={index}
            className={`noteColor_${(pitch - tonic) % 12}_colors`}
            style={{
              position: "absolute",
              width:
                (mapToRelativeTime(onset + duration) -
                  mapToRelativeTime(onset)) *
                measureWidth,
              height: noteHeight,
              top: (maxPitch - pitch - 1) * noteHeight,
              left: mapToRelativeTime(onset) * measureWidth,
              zIndex: 10,
            }}
          />
        )
      )}
      {measureWidth > 30 &&
        beats
          .filter(({ chord }) => chord)
          .map(({ onset, chord }, index) => {
            return (
              <div
                key={index}
                style={{
                  position: "absolute",
                  left: mapToRelativeTime(onset) * measureWidth + 5,
                  color: "yellow",
                }}
              >
                {Progression.toRomanNumerals(key_.split("-")[0], [
                  chord,
                ])[0].replace("m7b5", "ø")}
              </div>
            );
          })}
    </div>
  );
};

export default TonalGrid;
