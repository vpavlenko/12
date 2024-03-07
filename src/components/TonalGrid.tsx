import { FC } from "react";
import styled from "styled-components";
import { BeatsItem, MelodyItem } from "../App";
import { Progression, Chord, Note, Collection } from "tonal";

const mod = (n: number, m: number): number => {
  return ((n % m) + m) % m;
};

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

const BeatBar = styled(VerticalBar)`
  border-left: 1px dashed #262626;
`;

const KEYS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

const Measure: FC<{ number: number; left: number; measureWidth: number }> = ({
  number,
  left,
  measureWidth,
}) => {
  const isFullSize = measureWidth > 30;

  const backgroundColor =
    mod(number, 12) === 1 ? "#a0f" : mod(number, 4) === 1 ? "#aaa" : "#444";

  return (
    <>
      <VerticalBar
        style={{
          left,
          backgroundColor,
        }}
      />
      {isFullSize &&
        [1, 2, 3].map((beat) => (
          <BeatBar style={{ left: left + (beat * measureWidth) / 4 }} />
        ))}
      {isFullSize && (
        <div
          style={{
            position: "absolute",
            left: left + 5,
            top: 20,
            color: "white",
          }}
        >
          {number}
        </div>
      )}
    </>
  );
};

const TonalGrid: FC<{
  beats: BeatsItem[];
  melody: MelodyItem[];
  key_: string;
  currentYoutubeTime: number;
  measureWidth: number;
  noteHeight: number;
  mapToRelativeTime: (time: number) => number;
  showChordTones: boolean;
}> = ({
  beats,
  melody,
  key_,
  currentYoutubeTime,
  measureWidth,
  noteHeight,
  mapToRelativeTime,
  showChordTones,
}) => {
  const startBar = beats[0].bar;
  const endBar = beats.at(-1)!.bar;
  const measures = Collection.range(startBar, endBar);

  const tonicName = key_ ? key_.split("-")[0] : KEYS[0];
  const tonic = KEYS.indexOf(tonicName);

  const melodyMidiNumbers = melody.map(({ pitch }) => pitch);

  const minMidiNumber = Math.min(...melodyMidiNumbers);
  const minOctave = Note.octave(Note.fromMidi(minMidiNumber))!;
  const minPitch = minMidiNumber - 2;

  const maxMidiNumber = Math.max(...melodyMidiNumbers);
  const maxOctave = Note.octave(Note.fromMidi(maxMidiNumber))!;
  const maxPitch = maxMidiNumber + 6;

  const octaves = Collection.range(minOctave, maxOctave)
    .map((octave) => Note.midi(tonicName + octave)!)
    .filter(
      (midiNumber) => midiNumber >= minMidiNumber && midiNumber <= maxPitch - 4
    ) // TODO: why -4? compare with maxMidiNumber instead?
    .map((midiNumber) => (
      <div
        key={`tonalgrid_octave_${midiNumber}`}
        style={{
          position: "absolute",
          width: "100%",
          height: 6 * noteHeight,
          left: 0,
          bottom: (midiNumber - minPitch) * noteHeight,
          pointerEvents: "none",
          background: `linear-gradient(to top, #222, transparent)`,
          zIndex: 0,
        }}
      />
    ));

  const chordTones: Array<{ onset: number; chordNotes: number[] }> = [];
  if (showChordTones) {
    beats.forEach(({ chord, onset }) => {
      if (chord === "NC" || chord == null) {
        return;
      }
      const chordNotes = Collection.range(minOctave, maxOctave)
        .flatMap((octave) =>
          Chord.notes(chord).map((noteName) => Note.midi(noteName + octave)!)
        )
        .filter(
          (midiNumber) =>
            midiNumber >= minMidiNumber && midiNumber <= maxMidiNumber
        );

      chordTones.push({ chordNotes, onset });
    });
  }

  return (
    <div
      style={{
        position: "relative",
        width: (measures.length + 1) * measureWidth,
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
      {!showChordTones && octaves}
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
              bottom: (pitch - minPitch) * noteHeight,
              left: mapToRelativeTime(onset) * measureWidth,
              borderRadius: "5px",
              zIndex: 10,
            }}
          />
        )
      )}
      {chordTones.flatMap(({ chordNotes, onset }, index) =>
        chordNotes.map((midiNumber) => (
          <div
            key={`chord_tone_${index}_${midiNumber}`}
            className={`noteColor_${(midiNumber - tonic) % 12}_colors`}
            style={{
              position: "absolute",
              width:
                index + 1 < chordTones.length
                  ? (mapToRelativeTime(chordTones[index + 1].onset) -
                      mapToRelativeTime(chordTones[index].onset)) *
                    measureWidth
                  : measureWidth,
              height: noteHeight,
              bottom: (midiNumber - minPitch) * noteHeight,
              left: mapToRelativeTime(onset) * measureWidth,
              zIndex: 9,
              opacity: "25%",
            }}
          />
        ))
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
