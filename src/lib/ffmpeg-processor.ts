/**
 * ffmpeg-processor.ts
 *
 * Client-side video processing using FFmpeg WASM.
 * All operations work on in-memory Uint8Array buffers — no CORS issues.
 * FFmpeg is loaded lazily on first use and cached for subsequent calls.
 */

let ffmpegInstance: any = null;
let ffmpegLoaded = false;
let loadingPromise: Promise<any> | null = null;

/**
 * Load FFmpeg WASM core. Called once; cached after first load.
 * Uses dynamic imports to prevent SSR crashes.
 */
export async function loadFFmpeg(onProgress?: (ratio: number) => void): Promise<any> {
  // Prevent server-side execution entirely
  if (typeof window === 'undefined') return null;

  if (ffmpegLoaded && ffmpegInstance) return ffmpegInstance;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    // Dynamically import to avoid SSR evaluation of browser-only code
    const { FFmpeg } = await import('@ffmpeg/ffmpeg');
    const { fetchFile, toBlobURL } = await import('@ffmpeg/util');

    const ffmpeg = new FFmpeg();

    ffmpeg.on('log', ({ message }) => {
      // console.log('[FFmpeg]', message);
    });

    if (onProgress) {
      ffmpeg.on('progress', (event: any) => onProgress(event.ratio ?? event.progress ?? 0));
    }

    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';

    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });

    ffmpegInstance = ffmpeg;
    ffmpegLoaded = true;
    (window as any)._fetchFile = fetchFile; // Store for helper access
    return ffmpeg;
  })();

  return loadingPromise;
}

/**
 * Helper to get fetchFile from the dynamic import
 */
async function getFetchFile() {
  if (typeof window === 'undefined') return null;
  const { fetchFile } = await import('@ffmpeg/util');
  return fetchFile;
}

/**
 * Trim a video to a specific time range.
 */
export async function trimVideoClip(
  sourceFile: File | Blob,
  startTime: number,
  endTime: number,
  onProgress?: (ratio: number) => void
): Promise<Blob> {
  const ffmpeg = await loadFFmpeg(onProgress);
  const fetchFile = await getFetchFile();
  if (!ffmpeg || !fetchFile) throw new Error('FFmpeg only available in browser');

  const duration = endTime - startTime;
  const inputName = `input_${Date.now()}.mp4`;
  const outputName = `clip_${Date.now()}.mp4`;

  try {
    const sourceData = await fetchFile(sourceFile);
    await ffmpeg.writeFile(inputName, sourceData);

    await ffmpeg.exec([
      '-ss', String(startTime),
      '-i', inputName,
      '-t', String(duration),
      '-c:v', 'copy',
      '-c:a', 'copy',
      '-movflags', '+faststart',
      outputName,
    ]);

    const outputData = await ffmpeg.readFile(outputName);
    return new Blob([outputData], { type: 'video/mp4' });
  } finally {
    try { await ffmpeg.deleteFile(inputName); } catch (_) {}
    try { await ffmpeg.deleteFile(outputName); } catch (_) {}
  }
}

/**
 * Merge multiple video clip Blobs into a single reel.
 */
export async function mergeVideoClips(
  clips: Blob[],
  onProgress?: (ratio: number) => void
): Promise<Blob> {
  if (clips.length === 0) throw new Error('No clips provided to merge.');
  if (clips.length === 1) return clips[0];

  const ffmpeg = await loadFFmpeg(onProgress);
  const fetchFile = await getFetchFile();
  if (!ffmpeg || !fetchFile) throw new Error('FFmpeg only available in browser');

  const inputNames: string[] = [];
  const outputName = `merged_${Date.now()}.mp4`;

  try {
    for (let i = 0; i < clips.length; i++) {
      const name = `seg_${i}_${Date.now()}.mp4`;
      inputNames.push(name);
      const data = await fetchFile(clips[i]);
      await ffmpeg.writeFile(name, data);
    }

    const concatListName = `concat_${Date.now()}.txt`;
    const concatContent = inputNames.map(n => `file '${n}'`).join('\n');
    await ffmpeg.writeFile(concatListName, concatContent);

    await ffmpeg.exec([
      '-f', 'concat',
      '-safe', '0',
      '-i', concatListName,
      '-c:v', 'copy',
      '-c:a', 'copy',
      '-movflags', '+faststart',
      outputName,
    ]);

    const outputData = await ffmpeg.readFile(outputName);
    return new Blob([outputData], { type: 'video/mp4' });
  } finally {
    for (const name of inputNames) {
      try { await ffmpeg.deleteFile(name); } catch (_) {}
    }
    try { await ffmpeg.deleteFile(outputName); } catch (_) {}
  }
}

/**
 * Capture a single HD JPEG frame from a video at a specific timestamp.
 * Outputs at full native resolution (up to 1920×1080), quality 2 (near-lossless),
 * with unsharp masking to maximise sharpness for scout-grade screenshots.
 */
export async function captureVideoFrame(
  sourceFile: File | Blob,
  atTime: number,
  quality: number = 0.95
): Promise<Blob> {
  try {
    const ffmpeg = await loadFFmpeg();
    const fetchFile = await getFetchFile();
    if (ffmpeg && fetchFile) {
      const inputName = `frame_input_${Date.now()}.mp4`;
      const outputName = `frame_${Date.now()}.jpg`;

      try {
        const sourceData = await fetchFile(sourceFile);
        await ffmpeg.writeFile(inputName, sourceData);

        await ffmpeg.exec([
          '-ss', String(atTime),
          '-i', inputName,
          '-vframes', '1',
          '-vf', 'scale=1920:-2:force_original_aspect_ratio=decrease,unsharp=5:5:1.0:5:5:0.0',
          '-q:v', '2',
          '-f', 'image2',
          outputName,
        ]);

        const outputData = await ffmpeg.readFile(outputName);
        return new Blob([outputData], { type: 'image/jpeg' });
      } finally {
        try { await ffmpeg.deleteFile(inputName); } catch (_) {}
        try { await ffmpeg.deleteFile(outputName); } catch (_) {}
      }
    }
  } catch (err) {
    console.warn('[FFmpeg] Capture failed, falling back to Canvas:', err);
  }

  // --- FALLBACK: Canvas API (Native browser capture) ---
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(sourceFile);
    const video = document.createElement('video');
    video.src = url;
    video.muted = true;
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';

    video.addEventListener('loadedmetadata', () => {
      video.currentTime = atTime;
    });

    video.addEventListener('seeked', () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas context failed');
        
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          URL.revokeObjectURL(url);
          if (blob) resolve(blob);
          else reject(new Error('Canvas toBlob returned null'));
        }, 'image/jpeg', quality);
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    });

    video.addEventListener('error', () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Video load error: ${video.error?.message || 'Unknown'}`));
    });
    
    video.load();
  });
}

/**
 * Process a full highlight: trim + capture screenshot at clip midpoint.
 */
export async function processHighlightClip(
  sourceFile: File | Blob,
  startTime: number,
  endTime: number,
  onProgress?: (ratio: number) => void
): Promise<{ clipBlob: Blob; screenshotBlob: Blob }> {
  const clipBlob = await trimVideoClip(sourceFile, startTime, endTime, onProgress);
  // Capture at 40% into the clip — biases toward the action peak vs. dead-centre
  const captureAt = (endTime - startTime) * 0.4;
  const screenshotBlob = await captureVideoFrame(clipBlob, captureAt);
  return { clipBlob, screenshotBlob };
}

/**
 * Extract N evenly-spaced frames using the HTML5 Canvas API.
 * Works on any local blob:// URL the browser can play natively — no CORS issues.
 * This is the primary/fallback method when FFmpeg WASM is unavailable or fails.
 */
async function extractFramesViaCanvas(
  sourceFile: File | Blob,
  duration: number,
  frameCount: number,
  onProgress?: (ratio: number) => void
): Promise<Array<{ timestamp: number; base64: string }>> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(sourceFile);
    const video = document.createElement('video');
    video.src = url;
    video.muted = true;
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';

    const frames: Array<{ timestamp: number; base64: string }> = [];
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;

    const safeStart = Math.min(2, duration * 0.05);
    const safeEnd = Math.max(duration - 2, duration * 0.95);
    const step = (safeEnd - safeStart) / Math.max(frameCount - 1, 1);
    const timestamps = Array.from({ length: frameCount }, (_, i) =>
      Math.min(safeStart + step * i, safeEnd)
    );

    let idx = 0;

    const captureNext = () => {
      if (idx >= timestamps.length) {
        URL.revokeObjectURL(url);
        resolve(frames);
        return;
      }

      const ts = timestamps[idx];
      video.currentTime = ts;
    };

    video.addEventListener('loadedmetadata', () => {
      canvas.width = 640;
      canvas.height = Math.round((video.videoHeight / video.videoWidth) * 640);
      captureNext();
    });

    video.addEventListener('seeked', () => {
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        // toDataURL gives us "data:image/jpeg;base64,..."  — strip the prefix
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        const base64 = dataUrl.split(',')[1];
        frames.push({ timestamp: parseFloat(timestamps[idx].toFixed(2)), base64 });
      } catch (err) {
        console.warn(`[Canvas] Frame capture failed at ${timestamps[idx].toFixed(2)}s:`, err);
      }

      if (onProgress) onProgress((idx + 1) / timestamps.length);
      idx++;
      captureNext();
    });

    video.addEventListener('error', (e) => {
      URL.revokeObjectURL(url);
      reject(new Error(`Video failed to load for canvas capture: ${video.error?.message || 'Unknown error'}`));
    });

    // Start loading
    video.load();
  });
}

/**
 * Extract N evenly-spaced frames from a video for AI vision analysis.
 *
 * Strategy:
 *   1. Try FFmpeg WASM (handles any codec, but requires WASM to load from CDN)
 *   2. Fall back to Canvas API (works for all browser-native formats: MP4/H.264, WebM, MOV)
 *
 * Returns an array of { timestamp, base64 } objects.
 */
export async function extractFramesForAnalysis(
  sourceFile: File | Blob,
  duration: number,
  frameCount: number = 20,
  onProgress?: (ratio: number) => void
): Promise<Array<{ timestamp: number; base64: string }>> {
  if (typeof window === 'undefined') throw new Error('Frame extraction only available in browser');

  // --- Attempt 1: Canvas API (High Speed, Native Browser Codecs) ---
  try {
    console.log('[Vision] Extracting frames via HTML5 Canvas API...');
    const canvasFrames = await extractFramesViaCanvas(sourceFile, duration, frameCount, onProgress);
    if (canvasFrames && canvasFrames.length > 0) {
      console.log(`[Vision] Fast Canvas extraction successful: ${canvasFrames.length}/${frameCount} frames.`);
      return canvasFrames;
    }
  } catch (canvasErr) {
    console.warn('[Vision] Canvas extraction failed, falling back to FFmpeg WASM:', canvasErr);
  }

  // --- Attempt 2: FFmpeg WASM (High Compatibility, Heavyweight) ---
  try {
    const ffmpeg = await Promise.race([
      loadFFmpeg(),
      new Promise<null>((_, reject) => setTimeout(() => reject(new Error('FFmpeg load timeout')), 10000))
    ]);
    const fetchFile = await getFetchFile();

    if (ffmpeg && fetchFile) {
      console.log('[Vision] Running high-compatibility extraction via FFmpeg...');
      const inputName = `analysis_input_${Date.now()}.mp4`;
      const frames: Array<{ timestamp: number; base64: string }> = [];

      try {
        const sourceData = await fetchFile(sourceFile);
        await ffmpeg.writeFile(inputName, sourceData);

        const safeStart = Math.min(2, duration * 0.05);
        const safeEnd = Math.max(duration - 2, duration * 0.95);
        const step = (safeEnd - safeStart) / Math.max(frameCount - 1, 1);

        for (let i = 0; i < frameCount; i++) {
          const ts = Math.min(safeStart + step * i, safeEnd);
          const outputName = `frame_${i}.jpg`;
          try {
            await ffmpeg.exec([
              '-ss', ts.toFixed(3),
              '-i', inputName,
              '-vframes', '1',
              '-vf', 'scale=640:-1',
              '-q:v', '5',
              '-f', 'image2',
              outputName,
            ]);
            const data = await ffmpeg.readFile(outputName) as Uint8Array<ArrayBuffer>;
            // Convert to base64 efficiently
            const blob = new Blob([data.buffer], { type: 'image/jpeg' });
            const reader = new FileReader();
            const b64 = await new Promise<string>((resolve) => {
              reader.onload = () => resolve((reader.result as string).split(',')[1]);
              reader.readAsDataURL(blob);
            });
            frames.push({ timestamp: parseFloat(ts.toFixed(2)), base64: b64 });
          } catch (frameErr) {
            console.warn(`[FFmpeg] Frame at ${ts.toFixed(2)}s skipped:`, frameErr);
          } finally {
            try { await ffmpeg.deleteFile(outputName); } catch (_) {}
          }
          if (onProgress) onProgress((i + 1) / frameCount);
        }

        if (frames.length > 0) return frames;
      } finally {
        try { await ffmpeg.deleteFile(inputName); } catch (_) {}
      }
    }
  } catch (ffmpegErr) {
    console.error('[Vision] All extraction methods failed:', ffmpegErr);
  }

  return [];
}
