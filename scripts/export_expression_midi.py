#!/usr/bin/env python3
"""Export aligned Weimar Jazz Database solos as expressive MIDI files."""

import argparse
from bisect import bisect_right
from collections import Counter
from heapq import heapify, heappop, heappush
import json
from math import ceil, isfinite, pi, sin
from pathlib import Path
from tempfile import TemporaryDirectory

from mido import Message, MetaMessage, MidiFile

from track_midi_pitch import measured_curves


ROOT = Path(__file__).resolve().parent.parent
PPQ = 960
BEND_RANGE = 12
PITCHED_CHANNELS = tuple(channel for channel in range(16) if channel != 9)
PROGRAMS = {
    "as": 65, "bcl": 71, "bs": 67, "cor": 56, "g": 26,
    "ss": 64, "tb": 57, "tp": 56, "ts": 66, "vib": 11,
}
# Corpus-median defaults are used where a tagged note lacks a measurement.
ESTIMATED_RANGES = {"bend": 50, "fall-off": 60, "slide": 55, "vibrato": 80}
ORY_SOURCE = "https://openresearch.surrey.ac.uk/esploro/outputs/doctoral/Improvisation-in-Early-Jazz-A-Kid/99675366202346"


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def audio_time(seconds, alignment):
    return (seconds - alignment["scoreStart"]) * alignment["secondsPerScoreSecond"]


class BeatClock:
    """Keep the annotated beat grid while placing events at their audio times."""

    def __init__(self, beats, alignment):
        anchors = []
        signature = (4, 4)
        for beat in beats:
            if beat["signature"]:
                signature = tuple(map(int, beat["signature"].split("/")))
            seconds = audio_time(beat["onset"], alignment)
            if seconds >= 0:
                anchors.append((seconds, beat["beat"], signature))
        first_time, first_beat, (numerator, denominator) = anchors[0]
        first_interval = anchors[1][0] - first_time
        self.times = []
        self.ticks = []
        self.tempos = []
        self.events = []
        tick = 0
        if first_time > 0:
            # Pad to the first annotated beat at its phase within the measure.
            phase = first_beat - 1
            intro_beats = phase + round((first_time / first_interval - phase) / numerator) * numerator
            if intro_beats <= 0:
                intro_beats += numerator
            tick = intro_beats * (PPQ * 4 // denominator)
            self.add(0, 0, first_time * PPQ / tick)

        current_signature = (numerator, denominator)
        self.events.append((0, MetaMessage("time_signature", numerator=numerator, denominator=denominator)))
        for index, (seconds, _, signature) in enumerate(anchors):
            numerator, denominator = signature
            beat_ticks = PPQ * 4 // denominator
            if signature != current_signature:
                self.events.append((tick, MetaMessage("time_signature", numerator=numerator, denominator=denominator)))
                current_signature = signature
            if index + 1 < len(anchors):
                self.add(seconds, tick, (anchors[index + 1][0] - seconds) * PPQ / beat_ticks)
            else:
                self.add(seconds, tick, self.tempos[-1] / 1_000_000)
            tick += beat_ticks

    def add(self, seconds, tick, seconds_per_quarter):
        tempo = round(seconds_per_quarter * 1_000_000)
        if tempo < 1 or tempo > 0xFFFFFF:
            raise ValueError(f"Unrepresentable quarter-note duration {seconds_per_quarter}")
        if not self.tempos or self.tempos[-1] != tempo:
            self.events.append((tick, MetaMessage("set_tempo", tempo=tempo)))
        self.times.append(seconds)
        self.ticks.append(tick)
        self.tempos.append(tempo)

    def at(self, seconds):
        index = max(0, bisect_right(self.times, seconds) - 1)
        delta = (seconds - self.times[index]) * PPQ * 1_000_000 / self.tempos[index]
        return max(0, self.ticks[index] + round(delta))


def bounded(value, low, high):
    return min(high, max(low, value))


def smoothstep(value):
    value = bounded(value, 0, 1)
    return value * value * (3 - 2 * value)


def slide_direction(notes, index, span, median):
    """Prefer a nearby target; otherwise use the signed deviation as a cue."""
    note = notes[index]
    targets = []
    if index + 1 < len(notes):
        following = notes[index + 1]
        targets.append((following["onset"] - note["onset"] - note["duration"], following["pitch"], False))
    if index:
        previous = notes[index - 1]
        targets.append((note["onset"] - previous["onset"] - previous["duration"], previous["pitch"], True))
    for gap, neighbor_pitch, incoming in sorted(targets):
        interval = (neighbor_pitch - note["pitch"]) * 100
        if gap <= 0.1 and span / 2 <= abs(interval) <= span * 2.5:
            return (-1 if interval < 0 else 1), incoming
    return (-1 if median <= 0 else 1), True


def approximate_curve(melid, notes, index):
    note = notes[index]
    gesture = note["f0_mod"]
    duration = note["duration"]
    span = note["f0_range"] or ESTIMATED_RANGES[gesture]
    raw_median = note["f0_med_dev"] or 0
    median = bounded(raw_median, -75, 75) if abs(raw_median) < 600 else 0
    source = None
    if gesture == "bend" and melid == 264 and note["eventid"] == 124334:
        # Ingham, p. 112, describes this specific ascending glissando.
        source = ORY_SOURCE
        shape = lambda progress: span * smoothstep(progress)
    elif gesture == "bend":
        amount = min(span, 250) * (-1 if median < -5 else 1)
        shape = lambda progress: amount * sin(pi * progress) ** 1.4
    elif gesture == "vibrato":
        amplitude = min(span / 2, 90)
        rate = bounded(note["f0_freq_hz"] or 5.33, 2, 15.5)
        shape = lambda progress: median + amplitude * smoothstep(progress * 5) * sin(2 * pi * rate * progress * duration)
    elif gesture == "slide":
        span = min(span, 300)
        direction, incoming = slide_direction(notes, index, span, median)
        if incoming:
            shape = lambda progress: direction * span * (1 - smoothstep(progress * 2.5))
        else:
            shape = lambda progress: direction * span * smoothstep((progress - 0.4) / 0.6)
    else:
        shape = lambda progress: median - min(span, 200) * smoothstep((progress - 0.55) / 0.45)
    # Use both endpoints and enough samples to preserve fast vibrato and short scoops.
    steps = max(4, ceil(duration / 0.008))
    return [(duration * step / steps, shape(step / steps)) for step in range(steps + 1)], source


def channel_setup(channel, program):
    yield Message("program_change", channel=channel, program=program)
    # RPN 0,0 selects Pitch Bend Sensitivity. Null it after setting the range.
    for controller, value in ((101, 0), (100, 0), (6, BEND_RANGE), (38, 0), (101, 127), (100, 127)):
        yield Message("control_change", channel=channel, control=controller, value=value)
    yield Message("pitchwheel", channel=channel, pitch=0)


def append_events(track, events):
    previous_tick = 0
    for tick, message in sorted(events, key=lambda event: event[0]):
        track.append(message.copy(time=tick - previous_tick))
        previous_tick = tick


def write_solo(solo, data, alignment, extracted, destination):
    notes = data["notes"]
    clock = BeatClock(data["beats"], alignment)
    midi = MidiFile(type=1, ticks_per_beat=PPQ)
    append_events(midi.add_track("Tempo"), clock.events)
    melody = midi.add_track("Melody")
    events = []
    gestures = []
    available = list(PITCHED_CHANNELS)
    heapify(available)
    active = []
    used = set()
    for index, note in sorted(enumerate(notes), key=lambda item: item[1]["onset"]):
        onset = note["onset"]
        duration = note["duration"]
        if not isfinite(duration) or duration <= 0:
            raise ValueError(f"Invalid note duration for {solo['melid']}:{note['eventid']}")
        start = clock.at(audio_time(onset, alignment))
        stop = max(start + 1, clock.at(audio_time(onset + duration, alignment)))
        while active and active[0][0] <= start:
            _, free_channel = heappop(active)
            heappush(available, free_channel)
        if not available:
            raise ValueError(f"No independent pitch-bend channel for {solo['melid']}:{note['eventid']}")
        channel = heappop(available)
        heappush(active, (stop, channel))
        used.add(channel)

        pitch = round(note["pitch"])
        tuning = (note["pitch"] - pitch) * 100
        gesture = note["f0_mod"]
        curve = [(0, 0)]
        if gesture:
            if gesture not in ESTIMATED_RANGES:
                raise ValueError(f"Unrecognized gesture {gesture!r} on {note['eventid']}")
            curve = extracted.get(index, ())
            row = {"noteIndex": index, "eventId": note["eventid"], "tag": gesture, "method": "measured"}
            if not curve:
                curve, source = approximate_curve(solo["melid"], notes, index)
                row["method"] = "estimated"
                if source:
                    row["source"] = source
            gestures.append(row)

        wheel_points = {}
        for offset, cents in curve:
            tick = bounded(clock.at(audio_time(onset + offset, alignment)), start, stop - 1)
            wheel = round((cents + tuning) / (BEND_RANGE * 100) * 8192)
            wheel_points[tick] = bounded(wheel, -8192, 8191)
        previous_wheel = 0
        for tick, wheel in sorted(wheel_points.items()):
            if wheel != previous_wheel:
                events.append((tick, Message("pitchwheel", channel=channel, pitch=wheel)))
                previous_wheel = wheel
        events.append((start, Message("note_on", channel=channel, note=pitch, velocity=80)))
        events.append((stop, Message("note_off", channel=channel, note=pitch)))
        if previous_wheel:
            events.append((stop, Message("pitchwheel", channel=channel, pitch=0)))

    setups = [(0, message) for channel in sorted(used) for message in channel_setup(channel, PROGRAMS[solo["instrument"]])]
    append_events(melody, setups + events)
    midi.save(destination)
    return {"notes": len(notes), "gestures": gestures}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--solo", type=int, action="append", help="Export only the specified melody ID")
    args = parser.parse_args()
    if args.solo and args.output is None:
        parser.error("Use --output to write a subset without replacing the corpus manifest.")
    output = args.output if args.output is not None else ROOT / "public/midi"
    corpus = [
        *read_json(ROOT / "data/wjd_maj_blues.json"),
        *read_json(ROOT / "data/wjd_minor_blues.json"),
    ]
    selected = set(args.solo or (solo["melid"] for solo in corpus))
    if selected - {solo["melid"] for solo in corpus}:
        parser.error("Unknown melody ID.")
    playback = read_json(ROOT / "data/playback.json")
    solos = {}
    totals = {tag: Counter(measured=0, estimated=0) for tag in ESTIMATED_RANGES}
    output.parent.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(dir=output.parent) as scratch:
        staged = Path(scratch)
        for solo in sorted(corpus, key=lambda row: row["melid"]):
            melid = solo["melid"]
            if melid not in selected:
                continue
            data = read_json(ROOT / f"public/wjd/{melid}.json")
            alignment = playback[str(melid)]["audio"]
            curves = measured_curves(ROOT / "public" / alignment["path"], data["notes"], alignment)
            summary = write_solo(solo, data, alignment, curves, staged / f"{melid}.mid")
            solos[str(melid)] = summary
            for gesture in summary["gestures"]:
                totals[gesture["tag"]][gesture["method"]] += 1
        manifest = {"schema": 1, "timing": "audioExcerpt", "pitchBendRangeSemitones": BEND_RANGE,
                    "totals": totals, "solos": solos}
        output.mkdir(parents=True, exist_ok=True)
        for midi_path in sorted(staged.glob("*.mid")):
            midi_path.replace(output / midi_path.name)
        (staged / "manifest.json").write_text(json.dumps(manifest, separators=(",", ":"), ensure_ascii=False) + "\n")
        (staged / "manifest.json").replace(output / "manifest.json")
    print(f"Exported {len(solos)} MIDI files with {sum(sum(counts.values()) for counts in totals.values())} gestures.")


if __name__ == "__main__":
    main()
