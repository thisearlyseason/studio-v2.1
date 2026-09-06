export function validateFilmPlayback({duration, before, after, paused}) {
  if (![duration, before, after].every(Number.isFinite) || duration <= 1 || before < 0 || after <= before + 0.1 || after > duration || paused !== false) {
    throw new Error('Film must have finite duration and actually advance while playing.');
  }
  return true;
}

// Serialized into the real browser; no synthetic timeupdate/watch event.
export async function observeFilmPlayback(media, startFraction = 0) {
  media.muted = true;
  media.pause();
  media.currentTime = media.duration * startFraction;
  const before = media.currentTime;
  let timer;
  let finished = false;
  try {
    await Promise.race([
      (async () => {
        await media.play();
        while (!finished && media.currentTime <= before + 0.15) await new Promise(resolve => requestAnimationFrame(resolve));
      })(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Film playback did not advance within 5s.')), 5000); }),
    ]);
    return {duration: media.duration, before, after: media.currentTime, paused: media.paused};
  } finally {
    finished = true;
    clearTimeout(timer);
    media.pause();
  }
}
