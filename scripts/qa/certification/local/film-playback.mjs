export function validateFilmPlayback({duration, before, after, paused}) {
  if (![duration, before, after].every(Number.isFinite) || duration <= 1 || before < 0 || after <= before + 0.1 || after > duration || paused !== false) {
    throw new Error('Film must have finite duration and actually advance while playing.');
  }
  return true;
}

export async function dismissFilmTeamAlert(page) {
  const alert = page.getByRole('dialog', {name: 'High Priority Team Alert', exact: true});
  for (let dismissed = 0; dismissed <= 4; dismissed += 1) {
    try { await alert.waitFor({state: 'visible', timeout: 1500}); }
    catch (error) { if (error.name === 'TimeoutError') return; throw error; }
    if (dismissed === 4) throw new Error('Film alert queue exceeded the four-alert fixture bound.');
    await alert.getByRole('button', {name: 'Close', exact: true}).click();
    await alert.waitFor({state: 'hidden', timeout: 5000});
  }
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
