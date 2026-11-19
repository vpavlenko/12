"""Recover pitch trajectories inside Weimar's pre-annotated note spans.

The recordings are mixes, so this tracker uses the annotated pitch and
deviation to limit its search. It rejects weak or incompatible tracks.
The MIDI exporter can then use an explicitly approximate contour instead.
"""

import math
from pathlib import Path
import subprocess

import numpy as np
from scipy.fft import rfft
from scipy.ndimage import median_filter, uniform_filter1d
from scipy.signal import detrend

SAMPLE_RATE = 22050
HOP_SECONDS = 0.012
CENT_STEP = 5.0
HARMONICS = np.arange(1, 8)
HARMONIC_WEIGHTS = np.array([0.8, 1.0, 0.95, 0.8, 0.65, 0.55, 0.4])
GESTURES = {"bend", "slide", "fall-off", "vibrato"}


def audio_time(score_time, alignment):
    base = (score_time - alignment["scoreStart"]) * alignment["secondsPerScoreSecond"]
    correction = alignment.get("scoreTimeCorrection")
    if correction is None:
        return base
    progress = (score_time - correction["start"]) / (correction["end"] - correction["start"])
    return base + np.clip(progress, 0, 1) * correction["seconds"]


def _decode_audio(path):
    decoded = subprocess.run(
        [
            "ffmpeg", "-v", "error", "-i", str(path), "-vn", "-ac", "1",
            "-ar", str(SAMPLE_RATE), "-f", "f32le", "-",
        ],
        check=True,
        capture_output=True,
    )
    return np.frombuffer(decoded.stdout, dtype="<f4")


def _spectral_evidence(signal, positions, nominal_hz, candidates, window_seconds):
    half_samples = round(window_seconds * SAMPLE_RATE / 2)
    indexes = np.rint(positions * SAMPLE_RATE).astype(int)[:, None]
    indexes = indexes + np.arange(-half_samples, half_samples)
    if indexes.min() < 0 or indexes.max() >= len(signal):
        return None

    frames = signal[indexes] * np.hanning(2 * half_samples)
    fft_size = 8192
    magnitudes = np.abs(rfft(frames, fft_size))
    # Flatten the local frequency envelope so a loud accompaniment band alone
    # contributes less than evidence across several harmonics of the note.
    neighborhood = uniform_filter1d(magnitudes, size=37, axis=1)
    contrast = np.log1p(magnitudes / (neighborhood + 0.02))
    fundamentals = nominal_hz * 2 ** (candidates / 1200)
    audible = HARMONICS * fundamentals[-1] < SAMPLE_RATE / 2 - 10
    weights = HARMONIC_WEIGHTS[audible]
    bins = fundamentals[:, None] * HARMONICS[audible] * fft_size / SAMPLE_RATE
    floor = bins.astype(int)
    remainder = bins - floor
    harmonic_contrast = contrast[:, floor] * (1 - remainder) + contrast[:, floor + 1] * remainder
    return (harmonic_contrast @ weights) / weights.sum()


def _track_path(evidence, candidates, center, spread):
    # A small penalty prevents switches between unrelated spectral peaks while
    # leaving fast scoops and vibrato free to move.
    delta = np.abs(candidates[:, None] - candidates)
    transition_cost = 0.015 * (delta / 18) ** 1.4
    prior = 0.09 * ((candidates - center) / spread) ** 2
    scores = evidence[0] - prior
    backtrack = []
    arange = np.arange(len(candidates))
    for frame in evidence[1:]:
        choices = scores[:, None] - transition_cost
        previous = choices.argmax(axis=0)
        scores = choices[previous, arange] + frame - prior
        backtrack.append(previous)

    path = [scores.argmax()]
    for previous in reversed(backtrack):
        path.append(previous[path[-1]])
    return np.array(path[::-1])


def _fits_gesture(curve, times, gesture, expected_range, frequency):
    excursion = np.quantile(curve, 0.95) - np.quantile(curve, 0.05)
    if not max(10, 0.3 * expected_range) <= excursion <= 1.9 * expected_range + 27:
        return False
    # Use edge medians rather than individual frames, which are vulnerable to
    # other notes crossing the beginning or end of the analysis window.
    edge = max(1, len(curve) // 5)
    if gesture == "fall-off":
        return np.median(curve[-edge:]) < np.median(curve[:edge]) - 0.18 * expected_range
    if gesture == "vibrato":
        # A spectral ridge with only a slope is not evidence for oscillation.
        # Large jumps between harmonics can also look periodic in low notes.
        if excursion > 300:
            return False
        oscillation = detrend(curve)
        if np.std(oscillation) < 0.15 * excursion:
            return False
        if frequency and times[-1] * frequency >= 1.1:
            omega = 2 * np.pi * frequency * times
            model = np.column_stack((np.sin(omega), np.cos(omega)))
            fit = model @ np.linalg.lstsq(model, oscillation, rcond=None)[0]
            return np.std(fit) >= 0.35 * np.std(oscillation)
        return bool(np.any(np.diff(oscillation) > 4) and np.any(np.diff(oscillation) < -4))
    return True


def _measure_note(signal, note, alignment):
    gesture = note.get("f0_mod")
    duration = note["duration"]
    expected_range = note.get("f0_range")
    if gesture not in GESTURES or duration < 0.068 or not expected_range or expected_range < 14:
        return None

    nominal_hz = 440 * 2 ** ((note["pitch"] - 69) / 12)
    center = note.get("f0_med_dev") or 0
    # The source has a few octave-displaced F0 estimates. Retain their local
    # tuning offset and use the annotated note to disambiguate the octave.
    center = (center + 600) % 1200 - 600
    spread = min(620, max(95, 0.82 * expected_range + 35))
    candidates = center + CENT_STEP * np.arange(-math.ceil(spread / CENT_STEP), math.ceil(spread / CENT_STEP) + 1)
    window = min(0.076, max(0.038, 4.5 / nominal_hz), 0.65 * duration)
    trim = window / (2 * alignment["secondsPerScoreSecond"])
    count = max(5, math.ceil((duration - 2 * trim) / HOP_SECONDS) + 1)
    times = np.linspace(trim, duration - trim, count)
    audio_times = audio_time(note["onset"] + times, alignment)
    evidence = _spectral_evidence(signal, audio_times, nominal_hz, candidates, window)
    if evidence is None:
        return None

    path = _track_path(evidence, candidates, center, spread)
    curve = median_filter(candidates[path], size=3, mode="nearest")
    frame_scores = evidence[np.arange(len(path)), path]
    # Compare the chosen spectral ridge with the rest of the search band.
    if np.median(frame_scores - np.median(evidence, axis=1)) < 0.075:
        return None
    if np.median(frame_scores) < 0.54 or abs(np.median(curve) - center) > max(85, 0.38 * expected_range):
        return None
    if not _fits_gesture(curve, times, gesture, expected_range, note.get("f0_freq_hz")):
        return None

    points = [(0.0, float(curve[0]))]
    points.extend((float(time), float(cents)) for time, cents in zip(times, curve))
    points.append((duration, float(curve[-1])))
    return points


def measured_curves(audio_path: Path, notes: list[dict], alignment: dict):
    """Map annotated note indices to (seconds after onset, signed cents)."""
    if not any(note.get("f0_mod") in GESTURES for note in notes):
        return {}
    audio = _decode_audio(audio_path)
    curves = {}
    for index, note in enumerate(notes):
        points = _measure_note(audio, note, alignment)
        if points is not None:
            curves[index] = points
    return curves
