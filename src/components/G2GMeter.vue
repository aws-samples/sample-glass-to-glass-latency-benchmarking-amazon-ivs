<template>
  <div class="absolute top-3 right-3 z-20 rounded-lg bg-black/75 text-white font-mono text-sm px-3 py-2 min-w-[180px] shadow-lg">
    <div class="font-bold text-xs uppercase tracking-wider text-emerald-400 mb-1">
      Glass-to-glass
    </div>
    <div class="grid grid-cols-2 gap-x-3 gap-y-0.5">
      <span class="text-white/60">avg</span>
      <span class="text-right">{{ stats.avg }} ms</span>
      <span class="text-white/60">p50</span>
      <span class="text-right">{{ stats.p50 }} ms</span>
      <span class="text-white/60">p95</span>
      <span class="text-right">{{ stats.p95 }} ms</span>
      <span class="text-white/60">last</span>
      <span class="text-right">{{ stats.last }} ms</span>
      <span class="text-white/60">samples</span>
      <span class="text-right">{{ samples.length }}</span>
    </div>
    <button
      class="mt-2 w-full text-xs bg-white/10 hover:bg-white/20 rounded px-2 py-1"
      @click="downloadCsv"
      :disabled="!samples.length"
    >
      Download CSV
    </button>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import jsQR from 'jsqr';

const props = defineProps({
  videoEl: { type: Object, default: null }, // HTMLVideoElement
  label: { type: String, default: 'viewer' },
  bufferSize: { type: Number, default: 200 },
});

const samples = ref([]);
const stats = reactive({ avg: 0, p50: 0, p95: 0, last: 0 });

const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });

// Sample at ~10Hz instead of every animation frame. The QR carries
// millisecond timestamps, so 10 samples/sec is plenty for stats.
const SAMPLE_INTERVAL_MS = 100;

let lastTs = 0;
let intervalHandle = 0;

function pushSample(latencyMs) {
  samples.value.push({ t: Date.now(), latency: latencyMs });
  if (samples.value.length > props.bufferSize) samples.value.shift();
  recomputeStats();
}

function recomputeStats() {
  const arr = samples.value.map((s) => s.latency);
  if (!arr.length) return;
  const sorted = [...arr].sort((a, b) => a - b);
  const sum = arr.reduce((a, b) => a + b, 0);
  stats.avg = Math.round(sum / arr.length);
  stats.p50 = sorted[Math.floor(sorted.length * 0.5)];
  stats.p95 = sorted[Math.floor(sorted.length * 0.95)];
  stats.last = arr[arr.length - 1];
}

function tick() {
  const v = props.videoEl;
  if (v && v.videoWidth && v.videoHeight) {
    // Only sample the top-left quadrant where the QR lives. This is the
    // single biggest performance win — getImageData is O(pixels).
    const cropW = Math.min(v.videoWidth, Math.round(v.videoWidth * 0.4));
    const cropH = Math.min(v.videoHeight, Math.round(v.videoHeight * 0.4));
    if (canvas.width !== cropW) canvas.width = cropW;
    if (canvas.height !== cropH) canvas.height = cropH;
    try {
      // Draw only the source's top-left region into the canvas.
      ctx.drawImage(v, 0, 0, cropW, cropH, 0, 0, cropW, cropH);
      const img = ctx.getImageData(0, 0, cropW, cropH);
      const code = jsQR(img.data, img.width, img.height);
      if (code && code.data) {
        const tSrc = Number(code.data);
        if (Number.isFinite(tSrc) && tSrc !== lastTs) {
          lastTs = tSrc;
          const latency = Date.now() - tSrc;
          if (latency >= 0 && latency < 30000) pushSample(latency);
        }
      }
    } catch {
      /* drawImage may throw if the video isn't ready yet */
    }
  }
}

function downloadCsv() {
  const rows = [['timestamp_ms', 'latency_ms', 'label']];
  for (const s of samples.value) rows.push([s.t, s.latency, props.label]);
  const csv = rows.map((r) => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `g2g-${props.label}-${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

onMounted(() => {
  intervalHandle = setInterval(tick, SAMPLE_INTERVAL_MS);
});

onBeforeUnmount(() => {
  if (intervalHandle) clearInterval(intervalHandle);
});
</script>
