/**
 * Wraps an incoming video MediaStreamTrack and returns a new track whose
 * frames carry a `Date.now()` timestamp burned into the pixels:
 *   - human-readable monospace digits, top-left
 *   - a small QR code encoding the same value, just below
 *
 * Consumed by viewers (see G2GMeter.vue) to compute glass-to-glass latency.
 *
 * Usage:
 *   const tcTrack = withTimecode(rawVideoTrack);
 *
 * Notes:
 *   - The QR encoder runs synchronously per frame at ~30 fps. Cost is a few
 *     percent of one core on a modern laptop.
 *   - Audio tracks are not touched.
 */
import QRCode from 'qrcode';

export function withTimecode(videoTrack, options = {}) {
  const { fps = 30 } = options;
  const settings = videoTrack.getSettings();
  const width = settings.width || 1280;
  const height = settings.height || 720;

  // Source: a hidden <video> playing the raw camera track
  const inputVideo = document.createElement('video');
  inputVideo.srcObject = new MediaStream([videoTrack]);
  inputVideo.muted = true;
  inputVideo.playsInline = true;
  inputVideo.autoplay = true;
  inputVideo.play().catch(() => {
    /* will recover once a frame is ready */
  });

  // Output canvas: receives the raw frame plus the overlay
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });

  // Offscreen QR canvas, rendered each frame
  const qrCanvas = document.createElement('canvas');
  const qrSize = Math.max(160, Math.round(height * 0.18));
  qrCanvas.width = qrSize;
  qrCanvas.height = qrSize;

  let stopped = false;
  const frameIntervalMs = 1000 / fps;
  let lastFrameTime = 0;

  const renderLoop = (now) => {
    if (stopped || videoTrack.readyState === 'ended') return;
    // Throttle to the target fps so we don't waste CPU at 60Hz when the
    // output stream is 30 fps.
    if (now - lastFrameTime >= frameIntervalMs && inputVideo.readyState >= 2) {
      lastFrameTime = now;
      const ts = Date.now();

      // 1. Draw the raw camera frame
      ctx.drawImage(inputVideo, 0, 0, width, height);

      // 2. Readable timestamp for the demo audience
      const padX = Math.round(width * 0.015);
      const padY = Math.round(height * 0.025);
      const fontPx = Math.max(28, Math.round(height * 0.05));
      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.fillRect(padX, padY, fontPx * 9, fontPx + 16);
      ctx.fillStyle = '#00ff66';
      ctx.font = `bold ${fontPx}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      ctx.textBaseline = 'top';
      ctx.fillText(String(ts), padX + 12, padY + 8);

      // 3. QR for machine reading. toCanvas resolves a Promise but renders
      //    synchronously, so drawing right after is safe.
      QRCode.toCanvas(qrCanvas, String(ts), {
        width: qrSize,
        margin: 1,
        errorCorrectionLevel: 'L',
        color: { dark: '#000000', light: '#ffffff' },
      }).catch(() => {
        /* transient encode errors are fine; keep last frame */
      });
      ctx.drawImage(qrCanvas, padX, padY + fontPx + 24);
    }
    requestAnimationFrame(renderLoop);
  };
  requestAnimationFrame(renderLoop);

  // captureStream produces the wrapped track
  const stream = canvas.captureStream(fps);
  const outTrack = stream.getVideoTracks()[0];

  // When the camera track ends, end the wrapped track too
  videoTrack.addEventListener('ended', () => {
    stopped = true;
    outTrack.stop();
  });

  return outTrack;
}
