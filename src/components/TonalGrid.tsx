import { FC, useMemo } from "react";
import styled from "styled-components";
import { Progression, Chord, Note, Collection } from "tonal";
import { BeatsStorage, MelodyStorage, solos } from "../App";

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
  selectedSolos: number[];
  key_: string;
  currentYoutubeTime: number;
  measureWidth: number;
  noteHeight: number;
  showChordTones: boolean;
  isOverlay: boolean;
  melodyStorage: MelodyStorage;
  beatsStorage: BeatsStorage;
}> = ({
  selectedSolos,
  key_,
  currentYoutubeTime,
  measureWidth,
  noteHeight,
  showChordTones,
  isOverlay,
  melodyStorage,
  beatsStorage,
}) => {
  const beats = beatsStorage[selectedSolos[0]];
  //   const melody = melodyStorage[selectedSolos[0]];

  // Every melody should store its own tonic. Everything should be mapped in a relative space, not in midiPitches. Easiest way: subtract tonic difference between tonic[0] and tonic[i]
  const melodies = useMemo(
    () =>
      selectedSolos.map((solo) => {
        const beats = beatsStorage[solo];
        const barOnsets: { [key: number]: number } = {};
        beats?.forEach(({ bar, beat, onset }) => {
          if (beat === 1) {
            barOnsets[bar] = onset;
          }
        });
        const mapToRelativeTime = beats
          ? (absoluteTime: number) => {
              const firstBar = isOverlay ? 0 : beats[0].bar;
              for (const iAsString in barOnsets) {
                const i = parseInt(iAsString, 10);
                if (!(i - 1 in barOnsets)) {
                  continue;
                }
                if (absoluteTime <= barOnsets[i]) {
                  const relativeTime =
                    i -
                    2 +
                    (absoluteTime - barOnsets[i - 1]) /
                      (barOnsets[i] - barOnsets[i - 1]);
                  if (isOverlay && relativeTime < -1) {
                    return -10;
                  }
                  return (
                    (isOverlay ? relativeTime % 12 : relativeTime) -
                    firstBar +
                    2
                  );
                }
              }
              return -10;
            }
          : () => 0;

        const melody = melodyStorage[solo] ?? [];
        const tonicName = solos[solo].key.split("-")[0];
        const tonic = Math.min(
          ...melody
            .map(({ pitch }) => pitch)
            .filter((pitch) => pitch % 12 === KEYS.indexOf(tonicName))
        );
        return {
          melody,
          tonicName,
          tonic,
          mapToRelativeTime,
        };
      }),
    [melodyStorage, beatsStorage, selectedSolos, isOverlay]
  );

  const firstMapToRelativeTime = melodies[0]?.mapToRelativeTime ?? (() => 0);

  const startBar = beats[0].bar;
  const endBar = beats.at(-1)!.bar;
  const measures = Collection.range(startBar, endBar);

  const melodyMidiNumbers = melodies.flatMap(({ melody }) =>
    melody?.map(({ pitch }) => pitch)
  );

  const minMidiNumber = Math.min(...melodyMidiNumbers);
  const minOctave = Note.octave(Note.fromMidi(minMidiNumber))!;
  const minPitch = minMidiNumber - 2;

  const maxMidiNumber = Math.max(...melodyMidiNumbers);
  const maxOctave = Note.octave(Note.fromMidi(maxMidiNumber))!;
  const maxPitch = maxMidiNumber + 6;

  const octaves = Collection.range(minOctave, maxOctave)
    .map((octave) => Note.midi(melodies[0]?.tonicName + octave)!)
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

  console.log("melodies", melodies);

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
              left: firstMapToRelativeTime(currentYoutubeTime) * measureWidth,
            }}
          />
        )}
      {false && !showChordTones && octaves}
      {beats
        .filter(({ beat }) => beat === 1)
        .map(({ bar, onset }) => (
          <>
            <Measure
              key={bar}
              number={bar}
              left={firstMapToRelativeTime(onset) * measureWidth}
              measureWidth={measureWidth}
            />
          </>
        ))}
      {melodies.flatMap(({ melody, tonic, mapToRelativeTime }) =>
        melody.map(({ pitch, onset, duration }, index) =>
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
                bottom:
                  (pitch - minPitch - (tonic - melodies[0].tonic)) * noteHeight,
                left: mapToRelativeTime(onset) * measureWidth,
                borderRadius: "5px",
                zIndex: 10,
                opacity: isOverlay ? 0.3 : 1,
              }}
            />
          )
        )
      )}
      {!isOverlay &&
        chordTones.flatMap(({ chordNotes, onset }, index) =>
          chordNotes.map((midiNumber) => (
            <div
              key={`chord_tone_${index}_${midiNumber}`}
              className={`noteColor_${
                (midiNumber - melodies[0].tonic) % 12
              }_colors`}
              style={{
                position: "absolute",
                width:
                  index + 1 < chordTones.length
                    ? (firstMapToRelativeTime(chordTones[index + 1].onset) -
                        firstMapToRelativeTime(chordTones[index].onset)) *
                      measureWidth
                    : measureWidth,
                height: noteHeight,
                bottom: (midiNumber - minPitch) * noteHeight,
                left: firstMapToRelativeTime(onset) * measureWidth,
                zIndex: 9,
                opacity: "25%",
              }}
            />
          ))
        )}
      {!isOverlay &&
        measureWidth > 30 &&
        beats
          .filter(({ chord }) => chord)
          .map(({ onset, chord }, index) => {
            return (
              <div
                key={index}
                style={{
                  position: "absolute",
                  left: firstMapToRelativeTime(onset) * measureWidth + 5,
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
