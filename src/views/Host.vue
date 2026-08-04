<template>
  <div class="absolute inset-0 bg-black text-white flex flex-col">
    <header class="flex items-center justify-between px-4 py-3 bg-black/80 border-b border-white/10">
      <div class="flex items-center gap-3">
        <router-link to="/" class="text-xs text-white/50 hover:text-white">&larr; back</router-link>
        <span class="font-bold">G2G publisher · {{ hostId }}</span>
      </div>
      <div class="flex items-center gap-3">
        <span class="text-xs text-white/60 font-mono">
          source: {{ source }}
        </span>
        <button
          v-if="source !== 'screen'"
          class="px-3 py-1 text-xs rounded bg-red-600 hover:bg-red-500 disabled:opacity-50"
          :disabled="switching"
          @click="switchSource('screen')"
        >Share screen</button>
        <button
          v-else
          class="px-3 py-1 text-xs rounded bg-white/10 hover:bg-white/20 disabled:opacity-50"
          :disabled="switching"
          @click="switchSource('camera')"
        >Use camera</button>
        <span class="text-xs text-white/60 font-mono">
          stage: {{ stageStore.stageConnection || 'idle' }}
        </span>
        <button
          class="px-3 py-1 text-xs rounded bg-white/10 hover:bg-white/20"
          @click="panelOpen = !panelOpen"
        >
          {{ panelOpen ? 'Hide' : 'Show' }} settings
        </button>
      </div>
    </header>

    <div class="flex-1 flex min-h-0">
      <main class="relative flex-1 flex items-center justify-center">
        <video
          v-if="previewStream"
          ref="previewEl"
          autoplay
          playsinline
          muted
          class="max-w-full max-h-full"
        />
        <div v-else class="text-white/60">Requesting media...</div>
      </main>

      <aside
        v-if="panelOpen"
        class="w-80 shrink-0 bg-black/90 border-l border-white/10 p-4 overflow-y-auto text-sm space-y-5"
      >
        <section>
          <h3 class="font-semibold mb-2">Source</h3>
          <div class="flex gap-2">
            <button
              class="flex-1 px-2 py-1 rounded text-xs disabled:opacity-50"
              :class="settings.source === 'camera' ? 'bg-red-600' : 'bg-white/10 hover:bg-white/20'"
              :disabled="switching"
              @click="switchSource('camera')"
            >Camera</button>
            <button
              class="flex-1 px-2 py-1 rounded text-xs disabled:opacity-50"
              :class="settings.source === 'screen' ? 'bg-red-600' : 'bg-white/10 hover:bg-white/20'"
              :disabled="switching"
              @click="switchSource('screen')"
            >Screen</button>
          </div>
          <p class="text-[10px] text-white/40 mt-1">
            Switching source applies immediately. Other settings need the Apply button.
          </p>
        </section>

        <section>
          <h3 class="font-semibold mb-2">Capture</h3>
          <label class="block mb-2 text-xs">
            Resolution
            <select v-model.number="settings.captureHeight" class="mt-1 w-full bg-black border border-white/20 rounded px-2 py-1">
              <option :value="360">640x360</option>
              <option :value="480">854x480</option>
              <option :value="720">1280x720</option>
              <option :value="1080">1920x1080</option>
            </select>
          </label>
          <label class="block text-xs">
            Capture FPS
            <select v-model.number="settings.captureFps" class="mt-1 w-full bg-black border border-white/20 rounded px-2 py-1">
              <option :value="15">15</option>
              <option :value="24">24</option>
              <option :value="30">30</option>
              <option :value="60">60</option>
            </select>
          </label>
        </section>

        <section>
          <h3 class="font-semibold mb-2">Encoder</h3>
          <label class="block mb-2 text-xs">
            Max bitrate: <span class="font-mono">{{ settings.maxBitrateKbps }} kbps</span>
            <input type="range" min="100" max="2500" step="50" v-model.number="settings.maxBitrateKbps" class="w-full" />
            <span class="text-[10px] text-white/40">SDK cap is 2500 kbps for Stage.</span>
          </label>
          <label class="block mb-2 text-xs">
            Max framerate: <span class="font-mono">{{ settings.maxFramerate }} fps</span>
            <input type="range" min="10" max="30" step="1" v-model.number="settings.maxFramerate" class="w-full" />
          </label>
          <label class="flex items-center gap-2 text-xs">
            <input type="checkbox" v-model="settings.simulcast" />
            Simulcast (multi-layer)
          </label>
          <p class="text-[10px] text-white/40 mt-1 mb-2">
            Sends 180p / 360p / 720p layers. Required for viewer-side adaptive bitrate.
            Not supported for screen capture or in Firefox; needs max bitrate ≥ 700 kbps.
          </p>
          <p
            v-if="simulcastWarning"
            class="text-[11px] text-amber-400 mb-2 font-mono"
          >{{ simulcastWarning }}</p>
          <label class="block mt-2 text-xs">
            Content hint
            <select v-model="settings.contentHint" class="mt-1 w-full bg-black border border-white/20 rounded px-2 py-1">
              <option value="">(default)</option>
              <option value="motion">motion</option>
              <option value="detail">detail</option>
              <option value="text">text</option>
            </select>
          </label>
        </section>

        <section>
          <h3 class="font-semibold mb-2">Overlay</h3>
          <label class="flex items-center gap-2 text-xs">
            <input type="checkbox" v-model="settings.timecode" />
            Burn timestamp + QR
          </label>
          <p class="text-[10px] text-white/40 mt-1">
            Disabling skips the canvas-capture wrapper, so the raw track is published.
            The viewer cannot measure latency without it.
          </p>
        </section>

        <div class="pt-2 border-t border-white/10 space-y-2">
          <button
            class="w-full px-3 py-2 rounded bg-red-600 hover:bg-red-500 text-sm font-semibold disabled:opacity-50"
            :disabled="switching"
            @click="applySettings"
          >
            {{ switching ? 'Applying...' : 'Apply' }}
          </button>
          <button
            class="w-full px-3 py-1 rounded bg-white/10 hover:bg-white/20 text-xs"
            @click="resetDefaults"
          >Reset to defaults</button>
        </div>

        <details class="text-[11px] text-white/50">
          <summary class="cursor-pointer">Active config</summary>
          <pre class="mt-1 whitespace-pre-wrap font-mono text-[10px]">{{ activeConfig }}</pre>
        </details>
      </aside>
    </div>

    <footer class="px-4 py-2 text-xs text-white/50 font-mono bg-black/80 border-t border-white/10">
      Timestamp burned into video at capture. Open
      <code>/watch/{{ hostId }}</code> on a remote machine to measure.
    </footer>
  </div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, reactive, ref, watchEffect, markRaw } from 'vue';
import { useRoute } from 'vue-router';
import { LocalStageStream, SimulcastLayerPresets, StageEvents } from 'amazon-ivs-web-broadcast';
import { useStageStore } from '../stores/stage';
import { useBackendStore } from '../stores/backend';
import { useUsernameStore } from '../stores/usernameStore';
import { useBackend } from '../composables/useBackend';
import { withTimecode } from '../utils/timecodeTrack';

const route = useRoute();
const stageStore = useStageStore();
const backendStore = useBackendStore();
const usernameStore = useUsernameStore();
const { createStream } = useBackend();

const hostId = route.params.hostId;
const previewEl = ref(null);
const previewStream = ref(null);
const panelOpen = ref(true);
const switching = ref(false);
const source = ref('camera');

const defaults = {
  source: 'camera',
  captureHeight: 720,
  captureFps: 30,
  maxBitrateKbps: 2500,
  maxFramerate: 30,
  simulcast: true,
  contentHint: '',
  timecode: true,
};
const settings = reactive({ ...defaults });
const activeConfig = ref({});
const simulcastWarning = ref('');

// Held tracks so we can stop them cleanly on swap
let rawVideoTrack = null;
let rawAudioTrack = null;
let wrappedVideoTrack = null;

watchEffect(() => {
  if (previewEl.value && previewStream.value) {
    previewEl.value.srcObject = previewStream.value;
    previewEl.value.play().catch(() => {});
  }
});

function stopTrack(t) {
  try { if (t) t.stop(); } catch { /* noop */ }
}

function stopAll() {
  stopTrack(wrappedVideoTrack);
  stopTrack(rawVideoTrack);
  stopTrack(rawAudioTrack);
  wrappedVideoTrack = null;
  rawVideoTrack = null;
  rawAudioTrack = null;
}

async function captureSource(opts) {
  if (opts.source === 'screen') {
    const display = await navigator.mediaDevices.getDisplayMedia({
      video: {
        frameRate: opts.captureFps,
        width: { ideal: Math.round(opts.captureHeight * (16 / 9)) },
        height: { ideal: opts.captureHeight },
      },
      audio: true,
    });
    return {
      video: display.getVideoTracks()[0],
      audio: display.getAudioTracks()[0] || null,
    };
  }
  const cam = await navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: Math.round(opts.captureHeight * (16 / 9)) },
      height: { ideal: opts.captureHeight },
      frameRate: { ideal: opts.captureFps },
      facingMode: 'user',
    },
    audio: true,
  });
  return {
    video: cam.getVideoTracks()[0],
    audio: cam.getAudioTracks()[0] || null,
  };
}

// Build the LocalStageStream directly so the simulcast ladder, bitrate and
// framerate come from the panel rather than SDK defaults.
function makeLocalStream(track, opts) {
  if (!track) return undefined;
  // An explicit 3-layer ladder gives viewers real alternatives to switch to.
  // Layer labels are exposed to the viewer's strategy via preferredLayerForStream.
  const simulcast = opts.simulcast
    ? {
        enabled: true,
        layers: [
          SimulcastLayerPresets.DEFAULT_180,
          SimulcastLayerPresets.DEFAULT_360,
          SimulcastLayerPresets.DEFAULT_720,
        ],
      }
    : { enabled: false };
  return markRaw(
    new LocalStageStream(track, {
      simulcast,
      maxVideoBitrateKbps: opts.maxBitrateKbps,
      maxFramerate: opts.maxFramerate,
    })
  );
}

async function startWith(opts) {
  switching.value = true;
  simulcastWarning.value = '';
  try {
    // Pre-flight: catch the well-known cases where the SDK silently drops simulcast.
    const effective = { ...opts };
    if (effective.simulcast) {
      const ua = navigator.userAgent || '';
      const isFirefox = /firefox/i.test(ua);
      if (effective.source === 'screen') {
        simulcastWarning.value = 'Simulcast is not supported for screen capture. Falling back to single layer.';
        effective.simulcast = false;
      } else if (isFirefox) {
        simulcastWarning.value = 'Simulcast is not supported in Firefox. Falling back to single layer.';
        effective.simulcast = false;
      } else if (effective.maxBitrateKbps < 700) {
        simulcastWarning.value = 'Simulcast requires max bitrate ≥ 700 kbps. Falling back to single layer.';
        effective.simulcast = false;
      }
    }

    // Capture
    const captured = await captureSource(effective);
    stopAll();
    rawVideoTrack = captured.video;
    rawAudioTrack = captured.audio;

    if (effective.contentHint && rawVideoTrack && 'contentHint' in rawVideoTrack) {
      rawVideoTrack.contentHint = effective.contentHint;
    }

    const publishedVideo = effective.timecode
      ? (wrappedVideoTrack = withTimecode(rawVideoTrack, { fps: effective.captureFps }))
      : rawVideoTrack;
    if (effective.contentHint && publishedVideo && 'contentHint' in publishedVideo) {
      publishedVideo.contentHint = effective.contentHint;
    }
    previewStream.value = new MediaStream([publishedVideo]);

    const audioStream = rawAudioTrack ? makeLocalStream(rawAudioTrack, effective) : undefined;
    const videoStream = makeLocalStream(publishedVideo, effective);

    if (rawAudioTrack) stageStore.localAudioTrack = rawAudioTrack;
    if (publishedVideo) stageStore.localVideoTrack = publishedVideo;
    stageStore.localAudioStream = audioStream;
    stageStore.localVideoStream = videoStream;

    stageStore.stageStrategy.updateMedia(audioStream, videoStream);
    stageStore.stageStrategy.updatePublish(true);
    stageStore.refreshStageStrategy();

    source.value = effective.source;
    activeConfig.value = { ...effective };

    if (effective.source === 'screen') {
      rawVideoTrack.addEventListener('ended', () => {
        if (source.value === 'screen') {
          settings.source = 'camera';
          applySettings();
        }
      });
    }
  } catch (err) {
    console.error('Failed to (re)start publishing:', err);
  } finally {
    switching.value = false;
  }
}

async function applySettings() {
  await startWith({ ...settings });
}

async function switchSource(next) {
  if (switching.value) return;
  settings.source = next;
  await applySettings();
}

function resetDefaults() {
  Object.assign(settings, defaults);
}

onMounted(async () => {
  if (!usernameStore.userId) usernameStore.init();
  usernameStore.userId = hostId;

  if (stageStore.stage) stageStore.leaveStage();

  // Provision the stage once
  const { hostParticipantToken, region } = await createStream('VIDEO');
  backendStore.token = hostParticipantToken.token;
  backendStore.awsRegion = region;
  backendStore.participantId = hostParticipantToken.participantId;
  await backendStore.refreshStreams();
  await stageStore.connectToStage(hostParticipantToken.token);

  // Surface SDK warnings/errors related to simulcast in the UI so the user
  // doesn't have to dig through the console.
  if (stageStore.stage && StageEvents?.ERROR) {
    stageStore.stage.on(StageEvents.ERROR, (err) => {
      const msg = err?.message || err?.code || String(err);
      if (/simulcast/i.test(msg)) {
        simulcastWarning.value = `SDK: ${msg}`;
        console.warn('Stage simulcast issue:', err);
      } else {
        console.error('Stage error:', err);
      }
    });
  }

  // Initial publish with default settings
  await startWith({ ...settings });
  stageStore.onStage = true;
});

onBeforeUnmount(() => {
  stopAll();
  stageStore.leaveStage();
});
</script>
