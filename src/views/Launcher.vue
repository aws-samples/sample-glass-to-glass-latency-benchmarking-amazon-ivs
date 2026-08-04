<template>
  <div class="absolute inset-0 bg-neutral-950 text-white overflow-auto">
    <div class="min-h-full flex items-center justify-center p-6">
      <div class="w-full max-w-md flex flex-col gap-y-4">
        <header class="mb-2">
          <h1 class="text-2xl font-bold">Glass-to-glass latency</h1>
          <p class="text-sm text-white/50 mt-1">
            Amazon IVS Real-Time benchmarking harness
          </p>
        </header>

        <p class="text-sm text-white/60">
          Open the host page on the publishing machine, then open the watch page
          on each viewer machine using the same Host ID. The publisher burns a
          millisecond timestamp + QR into every frame; the viewer decodes it and
          reports avg / p50 / p95.
        </p>

        <label class="text-sm font-medium mt-2">Host ID</label>
        <input
          v-model="hostId"
          class="w-full px-3 py-2 rounded-lg bg-neutral-900 ring-1 ring-white/10 font-mono focus:outline-none focus:ring-2 focus:ring-red-500"
          placeholder="e.g. dealer-1"
        />

        <div class="grid grid-cols-2 gap-3 mt-2">
          <button
            @click="goHost"
            :disabled="!hostId"
            class="px-4 py-2.5 rounded-full bg-red-600 text-white font-bold hover:bg-red-500 disabled:opacity-50"
          >
            Open host
          </button>
          <button
            @click="goWatch"
            :disabled="!hostId"
            class="px-4 py-2.5 rounded-full bg-emerald-500/15 text-emerald-400 font-bold hover:bg-emerald-500/25 disabled:opacity-50"
          >
            Open viewer
          </button>
        </div>

        <router-link
          to="/obs"
          class="block text-center px-4 py-2 rounded-full bg-white/5 text-white/80 text-sm hover:bg-white/10"
        >
          Publish from OBS instead
        </router-link>

        <div class="mt-4 text-xs text-white/40 font-mono space-y-0.5">
          <div>host URL: /host/{{ hostId || '&lt;id&gt;' }}</div>
          <div>watch URL: /watch/{{ hostId || '&lt;id&gt;' }}</div>
        </div>

        <div
          v-if="!backendStore.isAuthenticated"
          class="mt-2 p-3 rounded-lg bg-amber-500/10 text-amber-300 text-sm ring-1 ring-amber-500/20"
        >
          Backend not connected. Open
          <router-link to="/settings" class="underline font-medium">Settings</router-link>
          and paste your Domain ID + API key first.
        </div>
        <router-link
          v-else
          to="/settings"
          class="text-xs text-white/40 hover:text-white/70 text-center"
        >
          Backend connected ({{ backendStore.domain }}) · edit settings
        </router-link>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useBackendStore } from '../stores/backend';

const router = useRouter();
const backendStore = useBackendStore();

const hostId = ref(localStorage.getItem('g2g-host-id') || 'dealer-1');

function persistAndGo(path) {
  localStorage.setItem('g2g-host-id', hostId.value);
  router.push(path);
}

function goHost() {
  persistAndGo(`/host/${encodeURIComponent(hostId.value)}`);
}

function goWatch() {
  persistAndGo(`/watch/${encodeURIComponent(hostId.value)}`);
}
</script>
