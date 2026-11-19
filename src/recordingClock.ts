export type AudioExcerpt = {
  path: string;
  scoreStart: number;
  secondsPerScoreSecond: number;
  scoreTimeCorrection?: { start: number; end: number; seconds: number };
};

export function audioTimeAt(excerpt: AudioExcerpt, scoreTime: number) {
  const base = (scoreTime - excerpt.scoreStart) * excerpt.secondsPerScoreSecond;
  const correction = excerpt.scoreTimeCorrection;
  if (!correction) return base;
  const progress = (scoreTime - correction.start) / (correction.end - correction.start);
  return base + Math.min(1, Math.max(0, progress)) * correction.seconds;
}

export function scoreTimeAt(excerpt: AudioExcerpt, audioTime: number) {
  const base = excerpt.scoreStart + audioTime / excerpt.secondsPerScoreSecond;
  const correction = excerpt.scoreTimeCorrection;
  if (!correction) return base;
  const audioStart = audioTimeAt(excerpt, correction.start);
  if (audioTime <= audioStart) return base;
  const audioEnd = audioTimeAt(excerpt, correction.end);
  if (audioTime >= audioEnd) return base - correction.seconds / excerpt.secondsPerScoreSecond;
  const progress = (audioTime - audioStart) / (audioEnd - audioStart);
  return correction.start + progress * (correction.end - correction.start);
}
