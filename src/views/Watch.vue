<template>
  <div class="absolute inset-0 bg-black text-white flex flex-col">
    <header class="flex items-center justify-between px-4 py-3 bg-black/80 border-b border-white/10">
      <div class="flex items-center gap-3">
        <router-link to="/" class="text-xs text-white/50 hover:text-white">&larr; back</router-link>
        <span class="font-bold">G2G viewer · {{ hostId }}</span>
      </div>
      <div class="flex items-center gap-3 text-xs text-white/60 font-mono">
        <span>
          location:
          <input
            v-model="label"
            class="bg-transparent border border-white/20 rounded px-2 ml-1 w-32"
            placeholder="e.g. frankfurt"
          />
        </span>
        <span>stage: {{ stageStore.stageConnection || 'idle' }}</span>
      </div>
    </header>

    <div class="flex-1 flex min-h-0">
      <main class="relative flex-1 flex items-center justify-center">
        <video
          v-if="hostVideo"
          ref="videoEl"
          autoplay
          playsinline
          :muted="muted"
          class="w-full h-full object-contain"
        />
        <div v-else class="text-white/60">Waiting for publisher...</div>
        <G2GMeter v-if="videoEl && hostVideo" :video-el="videoEl" :label="label" />
      </main>

      <aside class="w-72 shrink-0 bg-black/90 border-l border-white/10 p-4 text-sm space-y-4 overflow-y-auto">
        <section>
          <h3 class="font-semibold mb-2">Adaptive bitrate</h3>
          <div class="text-xs space-y-1 font-mono">
            <div>mode: <span :class="isAdapting ? 'text-emerald-400' : 'text-amber-400'">{{ isAdapting ? 'auto (SDK)' : 'manual' }}</span></div>
            <div>selected: <span class="text-white">{{ selectedLayerLabel || '-' }}</span></div>
            <div v-if="selectedLayer">
              {{ selectedLayer.width }}x{{ selectedLayer.height }} @ {{ selectedLayer.framerate || '?' }}fps
              · {{ selectedLayer.maxBitrate ? Math.round(selectedLayer.maxBitrate / 1000) : '?' }} kbps
            </div>
            <div v-if="lastSelectionReason" class="text-white/40">reason: {{ lastSelectionReason }}</div>
          </div>
        </section>

        <section>
          <h3 class="font-semibold mb-2">Pin layer</h3>
          <div v-if="!availableLayers.length" class="text-[11px] text-white/40">
            No simulcast layers reported yet. Publisher must have simulcast enabled
            (camera source, max bitrate ≥ 700 kbps, not Firefox).
          </div>
          <div v-else class="space-y-1">
            <label
              v-for="opt in pinOptions"
              :key="opt.value"
              class="flex items-center gap-2 text-xs cursor-pointer"
            >
              <input
                type="radio"
                name="layer"
                :value="opt.value"
                v-model="pinnedLayer"
                @change="applyPinnedLayer"
              />
              <span>{{ opt.label }}</span>
            </label>
          </div>
        </section>

        <section>
          <h3 class="font-semibold mb-2">Receive stats</h3>
          <div class="text-xs font-mono space-y-1">
            <div>resolution: {{ stats.frameWidth || '-' }}x{{ stats.frameHeight || '-' }}</div>
            <div>fps: {{ fmt(stats.framesPerSecond, 0) }}</div>
            <div>bitrate: {{ stats.bitrateKbps != null ? fmt(stats.bitrateKbps, 0) + ' kbps' : '-' }}</div>
            <div>jitter: {{ stats.jitterMs != null ? fmt(stats.jitterMs, 0) + ' ms' : '-' }}</div>
            <div>packet loss: {{ stats.packetLossPct != null ? fmt(stats.packetLossPct, 1) + '%' : '-' }}</div>
            <div>nack/pli: {{ stats.nackCount ?? 0 }} / {{ stats.pliCount ?? 0 }}</div>
            <div v-if="stats.error" class="text-amber-400">{{ stats.error }}</div>
          </div>
        </section>

        <section class="text-[11px] text-white/40 leading-relaxed space-y-1">
          <p class="text-amber-400">
            Note: Chrome DevTools throttling does not affect WebRTC traffic.
          </p>
          <p>To shape the link for real, use one of:</p>
          <ul class="list-disc pl-4 space-y-0.5">
            <li>macOS: Network Link Conditioner (Apple → Additional Tools)</li>
            <li>Linux: <code class="text-white/60">sudo tc qdisc add dev eth0 root netem rate 500kbit delay 80ms</code></li>
            <li>Windows: clumsy</li>
          </ul>
          <p>
            Latency numbers require both machines to have NTP-synced clocks.
          </p>
        </section>
      </aside>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { StreamType, StageEvents } from 'amazon-ivs-web-broadcast';
import { useStageStore } from '../stores/stage';
import { useBackendStore } from '../stores/backend';
import { useUsernameStore } from '../stores/usernameStore';
import G2GMeter from '../components/G2GMeter.vue';

const route = useRoute();
const stageStore = useStageStore();
const backendStore = useBackendStore();
const usernameStore = useUsernameStore();

const hostId = route.params.hostId;
const videoEl = ref(null);
const hostVideo = ref(null);
const label = ref(localStorage.getItem('g2g-label') || 'viewer');
const muted = ref(true);

// Adaptive-bitrate UI state
const availableLayers = ref([]);
const selectedLayer = ref(null);
const isAdapting = ref(true);
const lastSelectionReason = ref('');
const pinnedLayer = ref('');

// receiver stats sampled from RemoteStageStream.requestRTCStats()
const stats = ref({});
let statsTimer = null;
let lastBytesReceived = 0;
let lastBytesTs = 0;
let remoteVideoStream = null; // RemoteStageStream

const selectedLayerLabel = computed(() => selectedLayer.value?.label || '');
const pinOptions = computed(() => [
  { value: '', label: 'Auto (let SDK adapt)' },
  ...availableLayers.value.map((l) => ({
    value: l.label,
    label: `${l.label} · ${l.width}x${l.height}${l.maxBitrate ? ' · ' + Math.round(l.maxBitrate / 1000) + ' kbps' : ''}`,
  })),
]);

const fmt = (n, digits = 0) => (typeof n === 'number' && isFinite(n) ? n.toFixed(digits) : '-');

watch(label, (v) => localStorage.setItem('g2g-label', v));

watch([videoEl, hostVideo], ([el, stream]) => {
  if (el && stream) {
    el.srcObject = stream;
    el.play().catch(() => {});
  }
});

const hostParticipant = computed(() => {
  for (const p of stageStore.participants.values()) {
    if (p.userId === hostId) return p;
  }
  for (const p of stageStore.participants.values()) {
    if (p.streams && p.streams.length) return p;
  }
  return null;
});

function refreshLayersFromStream(stream) {
  if (!stream) return;
  try {
    if (typeof stream.getLayers === 'function') {
      availableLayers.value = stream.getLayers() || [];
    }
    if (typeof stream.getSelectedLayer === 'function') {
      selectedLayer.value = stream.getSelectedLayer() || null;
    }
    if ('isAdapting' in stream) isAdapting.value = !!stream.isAdapting;
  } catch { /* getters may not be ready */ }
}

watch(
  hostParticipant,
  (p) => {
    if (!p || !p.streams || !p.streams.length) {
      hostVideo.value = null;
      remoteVideoStream = null;
      availableLayers.value = [];
      selectedLayer.value = null;
      return;
    }
    for (const s of p.streams) {
      if (s.streamType === StreamType.VIDEO) {
        const track = s.mediaStreamTrack;
        if (
          !hostVideo.value ||
          hostVideo.value.getVideoTracks()[0]?.id !== track.id
        ) {
          hostVideo.value = new MediaStream([track]);
        }
        remoteVideoStream = s;
        refreshLayersFromStream(s);
      }
    }
  },
  { immediate: true, deep: true }
);

function applyPinnedLayer() {
  if (!stageStore.stageStrategy) return;
  stageStore.stageStrategy.updatePreferredLayerLabel?.(pinnedLayer.value);
  stageStore.refreshStageStrategy();
}

function attachLayerListeners() {
  const stage = stageStore.stage;
  if (!stage) return;
  stage.on(StageEvents.STAGE_STREAM_LAYERS_CHANGED, (_p, stream, layers) => {
    if (stream === remoteVideoStream) availableLayers.value = layers || [];
  });
  stage.on(StageEvents.STAGE_STREAM_LAYER_SELECTED, (_p, stream, layer, reason) => {
    if (stream !== remoteVideoStream) return;
    selectedLayer.value = layer || null;
    lastSelectionReason.value = String(reason || '');
  });
  stage.on(StageEvents.STAGE_STREAM_ADAPTION_CHANGED, (_p, stream, adapting) => {
    if (stream === remoteVideoStream) isAdapting.value = !!adapting;
  });

  // The streams-added event also fires when the publisher (re)publishes.
  // Refresh layer info eagerly so we don't depend on LAYERS_CHANGED firing
  // exactly when we expect it.
  stage.on(StageEvents.STAGE_PARTICIPANT_STREAMS_ADDED, (_p, streams) => {
    for (const s of streams) {
      if (s.streamType === StreamType.VIDEO) {
        remoteVideoStream = s;
        refreshLayersFromStream(s);
      }
    }
  });
}

async function pollStats() {
  if (!remoteVideoStream) return;
  try {
    // Poll layers too: in some scenarios LAYERS_CHANGED is missed and the
    // poll keeps the UI fresh.
    refreshLayersFromStream(remoteVideoStream);

    // The SDK exposes the underlying RTCStatsReport on the remote stream.
    // Plain MediaStreamTrack.getStats does not exist; this is the right path.
    const report = await remoteVideoStream.requestRTCStats?.();
    if (!report) {
      stats.value = { ...stats.value, error: 'requestRTCStats unavailable on this SDK build' };
      return;
    }
    let inbound = null;
    report.forEach((r) => {
      if (r.type === 'inbound-rtp' && (r.kind === 'video' || r.mediaType === 'video')) {
        inbound = r;
      }
    });
    if (!inbound) return;

    const now = inbound.timestamp;
    const bytes = inbound.bytesReceived || 0;
    let bitrateKbps = stats.value.bitrateKbps;
    if (lastBytesTs && now > lastBytesTs) {
      bitrateKbps = ((bytes - lastBytesReceived) * 8) / (now - lastBytesTs);
    }
    lastBytesTs = now;
    lastBytesReceived = bytes;

    const totalPackets = (inbound.packetsReceived || 0) + (inbound.packetsLost || 0);
    stats.value = {
      frameWidth: inbound.frameWidth,
      frameHeight: inbound.frameHeight,
      framesPerSecond: inbound.framesPerSecond,
      bitrateKbps,
      jitterMs: inbound.jitter != null ? inbound.jitter * 1000 : null,
      packetLossPct: totalPackets ? (inbound.packetsLost / totalPackets) * 100 : 0,
      nackCount: inbound.nackCount,
      pliCount: inbound.pliCount,
      error: null,
    };
  } catch (err) {
    stats.value = { ...stats.value, error: String(err?.message || err) };
  }
}

onMounted(async () => {
  if (!usernameStore.userId) usernameStore.init();
  if (stageStore.stage) stageStore.leaveStage();
  await backendStore.refreshStreams();

  const token = await backendStore.joinStream(hostId);

  // Attach listeners *before* joining so we don't miss the initial
  // STREAMS_ADDED / LAYERS_CHANGED events that fire as the publisher's stream
  // gets subscribed to.
  await stageStore.connectToStage(token);
  attachLayerListeners();

  stageStore.stageStrategy.updatePublish(false);
  stageStore.refreshStageStrategy();

  // If the publisher's streams were already added by the time we got here,
  // pick them up immediately.
  for (const p of stageStore.participants.values()) {
    if (p.streams && p.streams.length) {
      for (const s of p.streams) {
        if (s.streamType === StreamType.VIDEO) {
          remoteVideoStream = s;
          refreshLayersFromStream(s);
        }
      }
    }
  }

  statsTimer = setInterval(pollStats, 1000);
});

onBeforeUnmount(() => {
  if (statsTimer) clearInterval(statsTimer);
  stageStore.leaveStage();
});
</script>
