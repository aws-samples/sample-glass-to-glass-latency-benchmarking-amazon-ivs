<template>
  <div class="absolute inset-0 bg-neutral-950 text-white overflow-auto">
    <div class="max-w-3xl mx-auto p-6 space-y-6">
      <header class="flex items-center gap-x-3">
        <router-link to="/" class="text-sm text-white/50 hover:text-white">&larr; back</router-link>
        <h1 class="text-2xl font-bold">OBS publisher setup</h1>
      </header>

      <p class="text-sm text-white/60">
        Create an IVS IngestConfiguration so OBS can publish to a Stage via
        WHIP. The flow is: paste Stage ARN, run the generated AWS CLI command,
        paste the JSON response back here, copy the OBS settings.
      </p>

      <!-- Step 1: Stage ARN input -->
      <section class="bg-neutral-900 rounded-xl p-4 space-y-3 ring-1 ring-white/5">
        <h2 class="font-bold">1. Stage ARN</h2>
        <input
          v-model="stageArn"
          class="w-full px-3 py-2 rounded-lg bg-neutral-950 ring-1 ring-white/10 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
          placeholder="arn:aws:ivs:eu-central-1:123456789012:stage/abcDEF123456"
        />
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-xs text-white/50">Name</label>
            <input
              v-model="name"
              class="w-full mt-1 px-3 py-2 rounded-lg bg-neutral-950 ring-1 ring-white/10 font-mono text-sm"
              placeholder="obs-dealer-1"
            />
          </div>
          <div>
            <label class="text-xs text-white/50">User ID (use as hostId)</label>
            <input
              v-model="userId"
              class="w-full mt-1 px-3 py-2 rounded-lg bg-neutral-950 ring-1 ring-white/10 font-mono text-sm"
              placeholder="dealer-1"
            />
          </div>
        </div>
      </section>

      <!-- Step 2: Run the CLI command -->
      <section class="bg-neutral-900 rounded-xl p-4 space-y-3 ring-1 ring-white/5">
        <div class="flex items-center justify-between">
          <h2 class="font-bold">2. Run this on a machine with AWS credentials</h2>
          <button
            class="text-xs px-3 py-1 rounded-full bg-red-600 text-white font-bold hover:bg-red-500 disabled:opacity-50"
            :disabled="!createCommand"
            @click="copy(createCommand)"
          >
            {{ copyLabel('create') }}
          </button>
        </div>
        <pre class="bg-black/80 text-emerald-300 text-xs font-mono rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">{{ createCommand || 'Fill in Stage ARN, name and userId above.' }}</pre>
      </section>

      <!-- Step 3: Paste response -->
      <section class="bg-neutral-900 rounded-xl p-4 space-y-3 ring-1 ring-white/5">
        <h2 class="font-bold">3. Paste the JSON output</h2>
        <textarea
          v-model="responseJson"
          rows="8"
          class="w-full px-3 py-2 rounded-lg bg-neutral-950 ring-1 ring-white/10 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-red-500"
          placeholder='{"ingestConfiguration": {"ingestUrl": "...", "streamKey": "...", ...}}'
        />
        <div v-if="parseError" class="text-sm text-red-400">{{ parseError }}</div>
      </section>

      <!-- Step 4: OBS settings -->
      <section v-if="parsed" class="bg-emerald-500/10 ring-1 ring-emerald-500/30 rounded-xl p-4 space-y-3">
        <h2 class="font-bold text-emerald-300">4. OBS → Settings → Stream</h2>
        <div class="grid grid-cols-[140px_1fr_auto] gap-3 items-center">
          <span class="text-sm text-white/50">Service</span>
          <code class="font-mono text-sm">WHIP</code>
          <span></span>

          <span class="text-sm text-white/50">Server</span>
          <code class="font-mono text-xs break-all bg-black/50 px-2 py-1 rounded">{{ parsed.ingestUrl }}</code>
          <button
            class="text-xs px-3 py-1 rounded-full bg-red-600 text-white font-bold hover:bg-red-500"
            @click="copy(parsed.ingestUrl, 'url')"
          >
            {{ copyLabel('url') }}
          </button>

          <span class="text-sm text-white/50">Bearer Token</span>
          <code class="font-mono text-xs break-all bg-black/50 px-2 py-1 rounded">{{ parsed.streamKey }}</code>
          <button
            class="text-xs px-3 py-1 rounded-full bg-red-600 text-white font-bold hover:bg-red-500"
            @click="copy(parsed.streamKey, 'key')"
          >
            {{ copyLabel('key') }}
          </button>

          <span class="text-sm text-white/50">Watch URL</span>
          <code class="font-mono text-xs break-all bg-black/50 px-2 py-1 rounded">/watch/{{ userId }}</code>
          <router-link
            :to="`/watch/${userId}`"
            class="text-xs px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 font-bold"
          >
            Open
          </router-link>
        </div>

        <div class="pt-3 border-t border-emerald-500/20 text-xs text-white/50 space-y-1">
          <div>Recommended OBS encoder: x264 / NVENC, CBR, 2500–4500 kbps, keyframe interval 1s, profile main, tune zerolatency.</div>
          <div>Output resolution 1280x720 @ 30 fps.</div>
        </div>
      </section>

      <!-- Cleanup -->
      <section v-if="parsed" class="bg-neutral-900 rounded-xl p-4 space-y-3 ring-1 ring-white/5">
        <div class="flex items-center justify-between">
          <h2 class="font-bold">5. After the test, delete this resource</h2>
          <button
            class="text-xs px-3 py-1 rounded-full bg-red-500/20 text-red-300 font-bold"
            @click="copy(deleteCommand, 'delete')"
          >
            {{ copyLabel('delete') }}
          </button>
        </div>
        <pre class="bg-black/80 text-rose-300 text-xs font-mono rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">{{ deleteCommand }}</pre>
      </section>

      <!-- Tips -->
      <section class="text-xs text-white/50 space-y-1">
        <p>
          <strong class="text-white/70">Timestamp overlay for OBS:</strong>
          the browser publisher burns the timestamp + QR itself. With OBS you
          have to supply it: add a Browser Source pointing at a local HTML file
          that renders <code>Date.now()</code> as text plus a QR of the same
          value, so the viewer's meter can decode it. See the README.
        </p>
        <p><strong class="text-white/70">One IngestConfiguration = one publisher.</strong> Re-run for additional cameras.</p>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';

const stageArn = ref(localStorage.getItem('g2g-obs-stage-arn') || '');
const name = ref(localStorage.getItem('g2g-obs-name') || 'obs-dealer-1');
const userId = ref(localStorage.getItem('g2g-host-id') || 'dealer-1');
const responseJson = ref('');

watch(stageArn, (v) => localStorage.setItem('g2g-obs-stage-arn', v));
watch(name, (v) => localStorage.setItem('g2g-obs-name', v));
watch(userId, (v) => localStorage.setItem('g2g-host-id', v));

const region = computed(() => {
  const m = stageArn.value.match(/^arn:aws:ivs:([^:]+):/);
  return m ? m[1] : 'eu-central-1';
});

const createCommand = computed(() => {
  if (!stageArn.value || !name.value || !userId.value) return '';
  return [
    'aws ivs-realtime create-ingest-configuration \\',
    `  --region ${region.value} \\`,
    `  --name "${name.value}" \\`,
    `  --stage-arn "${stageArn.value}" \\`,
    '  --ingest-protocol WHIP \\',
    `  --user-id "${userId.value}"`,
  ].join('\n');
});

const parseError = ref('');
const parsed = computed(() => {
  parseError.value = '';
  if (!responseJson.value.trim()) return null;
  try {
    const obj = JSON.parse(responseJson.value);
    const cfg = obj.ingestConfiguration || obj;
    if (!cfg.ingestUrl || !cfg.streamKey) {
      parseError.value = 'JSON is missing ingestUrl or streamKey.';
      return null;
    }
    return cfg;
  } catch (e) {
    parseError.value = 'Invalid JSON: ' + e.message;
    return null;
  }
});

const deleteCommand = computed(() => {
  if (!parsed.value) return '';
  return [
    'aws ivs-realtime delete-ingest-configuration \\',
    `  --region ${region.value} \\`,
    `  --arn "${parsed.value.arn}"`,
  ].join('\n');
});

const copied = ref({});
function copyLabel(key) {
  return copied.value[key] ? 'Copied' : 'Copy';
}
async function copy(text, key = 'create') {
  try {
    await navigator.clipboard.writeText(text);
    copied.value = { ...copied.value, [key]: true };
    setTimeout(() => {
      copied.value = { ...copied.value, [key]: false };
    }, 1500);
  } catch {
    /* clipboard may be unavailable on http; user can select manually */
  }
}
</script>
