import { useCallback, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { TonicChange } from "librawl";
import { PlaybackFooter } from "librawl/components";
import type { NotePlaybackClock } from "librawl/native";
import "librawl/playback-footer.css";
import { buildPlaybackTimeline, type TonalScore } from "../tonalScore";
import { audioTimeAt, scoreTimeAt, type AudioExcerpt } from "../recordingClock";

type SoloAudioProps = {
  excerpt: AudioExcerpt;
  playback: NotePlaybackClock;
  score?: TonalScore;
  changes: TonicChange[];
  audioRef: RefObject<HTMLAudioElement | null>;
};

type MediaState = {
  path: string;
  position: number;
  duration: number;
  playing: boolean;
  rate: number;
  volume: number;
  failed: boolean;
};

export function SoloAudio({ excerpt, playback, score, changes, audioRef }: SoloAudioProps) {
  const settings = useRef({ rate: 1, volume: 1 });
  const [media, setMedia] = useState<MediaState>();
  const timeline = useMemo(() => score && buildPlaybackTimeline(score, changes,
    (time) => audioTimeAt(excerpt, time)), [score, changes, excerpt]);
  const current = media?.path === excerpt.path ? media : undefined;

  const publishMedia = useCallback((audio: HTMLAudioElement) => {
    setMedia({
      path: excerpt.path,
      position: audio.currentTime,
      duration: audio.duration,
      playing: !audio.paused && !audio.ended && !audio.error,
      rate: audio.playbackRate,
      volume: audio.volume,
      failed: !!audio.error,
    });
  }, [excerpt.path]);

  useLayoutEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = settings.current.rate;
    audio.volume = settings.current.volume;
    let frame = 0;
    const updateNotes = () => {
      playback.advance(scoreTimeAt(excerpt, audio.currentTime));
    };
    const publish = () => publishMedia(audio);
    const tick = () => {
      updateNotes();
      if (!audio.paused && !audio.ended && !audio.error) frame = requestAnimationFrame(tick);
    };
    const start = () => {
      cancelAnimationFrame(frame);
      tick();
      publish();
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      updateNotes();
      publish();
    };
    const seeked = () => {
      updateNotes();
      publish();
    };
    const reset = () => {
      cancelAnimationFrame(frame);
      playback.reset();
    };
    const fail = () => {
      reset();
      publish();
    };

    const listeners = {
      play: start, pause: stop, ended: stop, seeked, error: fail,
      loadedmetadata: publish, durationchange: publish, seeking: publish,
      volumechange: publish, ratechange: publish,
    };
    for (const [event, listener] of Object.entries(listeners)) audio.addEventListener(event, listener);
    if (!audio.paused) start();
    else publish();
    return () => {
      for (const [event, listener] of Object.entries(listeners)) audio.removeEventListener(event, listener);
      audio.pause();
      reset();
    };
  }, [audioRef, excerpt, playback, publishMedia]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.ended) audio.currentTime = 0;
    if (audio.paused) void audio.play().catch(() => undefined);
    else audio.pause();
  }, [audioRef]);

  const getPosition = useCallback(() => audioRef.current?.currentTime ?? 0, [audioRef]);

  const seek = useCallback((position: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration)) return;
    audio.currentTime = position;
    publishMedia(audio);
  }, [audioRef, publishMedia]);

  const setRate = useCallback((rate: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      audio.playbackRate = rate;
      settings.current.rate = audio.playbackRate;
      publishMedia(audio);
    } catch {
      // Keep the last supported rate if the browser rejects this one.
    }
  }, [audioRef, publishMedia]);

  const setVolume = useCallback((volume: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    settings.current.volume = audio.volume;
    publishMedia(audio);
  }, [audioRef, publishMedia]);

  return (
    <>
      <audio
        key={`audio:${excerpt.path}`}
        ref={audioRef}
        src={import.meta.env.BASE_URL + excerpt.path}
        hidden
        autoPlay
        preload="metadata"
      />
      <PlaybackFooter
        key={`footer:${excerpt.path}`}
        position={current?.position ?? 0}
        duration={current?.duration ?? 0}
        playing={current?.playing ?? false}
        getPosition={getPosition}
        disabled={current?.failed}
        onTogglePlay={togglePlay}
        onSeek={seek}
        rate={current?.rate ?? settings.current.rate}
        onRateChange={setRate}
        volume={current?.volume ?? settings.current.volume}
        onVolumeChange={setVolume}
        timeline={timeline}
        allowSpaceInInputs
        keyboardShortcuts
      />
    </>
  );
}
