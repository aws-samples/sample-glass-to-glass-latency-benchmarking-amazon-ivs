<template>
  <div class="absolute inset-0 bg-neutral-950 text-white overflow-auto">
    <div class="max-w-md mx-auto p-6 space-y-5">
      <header class="flex items-center gap-x-3">
        <router-link to="/" class="text-sm text-white/50 hover:text-white">&larr; back</router-link>
        <h1 class="text-2xl font-bold">Backend connection</h1>
      </header>

      <p class="text-sm text-white/60">
        Values come from the CloudFormation Outputs of the
        <a
          href="https://github.com/aws-samples/amazon-ivs-real-time-serverless-demo"
          target="_blank"
          rel="noreferrer"
          class="underline"
        >IVS Real-Time serverless demo</a>
        stack. Stored in this browser's localStorage only. Both the publisher and
        every viewer machine need the same pair.
      </p>

      <label class="block text-sm">
        <span class="font-medium">Domain ID</span>
        <span class="block text-xs text-white/40 mb-1">
          First part of the <code>domainName</code> output, e.g.
          <code>d0abcdefghijk</code> from <code>d0abcdefghijk.cloudfront.net</code>
        </span>
        <input
          v-model.trim="domain"
          class="w-full px-3 py-2 rounded-lg bg-neutral-900 ring-1 ring-white/10 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
          placeholder="d0abcdefghijk"
        />
      </label>

      <label class="block text-sm">
        <span class="font-medium">API key</span>
        <span class="block text-xs text-white/40 mb-1">
          The <code>apiKey</code> value inside the secret linked from
          <code>secretUrl</code>
        </span>
        <input
          v-model.trim="apiKey"
          type="password"
          autocomplete="off"
          class="w-full px-3 py-2 rounded-lg bg-neutral-900 ring-1 ring-white/10 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
          placeholder="AbCDEFgHIJKLmnOPQrsTUV"
        />
      </label>

      <div class="text-xs text-white/40 font-mono break-all">
        resolved API URL: {{ resolvedApiUrl || '-' }}
      </div>

      <div class="flex gap-3">
        <button
          class="flex-1 px-4 py-2.5 rounded-full bg-red-600 font-bold hover:bg-red-500 disabled:opacity-50"
          :disabled="!domain || !apiKey || testing"
          @click="saveAndTest"
        >
          {{ testing ? 'Testing...' : 'Save and test' }}
        </button>
        <button
          class="px-4 py-2.5 rounded-full bg-white/5 text-white/80 text-sm hover:bg-white/10"
          @click="clear"
        >
          Clear
        </button>
      </div>

      <div
        v-if="message"
        class="p-3 rounded-lg text-sm ring-1"
        :class="ok
          ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/20'
          : 'bg-red-500/10 text-red-300 ring-red-500/20'"
      >
        {{ message }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useBackendStore } from '../stores/backend';
import { useBackend } from '../composables/useBackend';
import { getApiUrlFromDomain } from '../utils/backend';

const route = useRoute();
const router = useRouter();
const backendStore = useBackendStore();
const { listStreams } = useBackend();

const domain = ref(backendStore.domain);
const apiKey = ref(backendStore.apiKey);
const testing = ref(false);
const message = ref('');
const ok = ref(false);

const resolvedApiUrl = computed(() =>
  domain.value ? getApiUrlFromDomain(domain.value) : ''
);

async function saveAndTest() {
  testing.value = true;
  message.value = '';
  backendStore.domain = domain.value;
  backendStore.apiKey = apiKey.value;
  try {
    const stages = await listStreams(apiKey.value, resolvedApiUrl.value);
    ok.value = true;
    message.value = `Connected. ${stages?.length ?? 0} stage(s) currently live.`;
    // If the route guard sent us here, continue to where the user was going.
    const redirect = route.query.redirect;
    if (typeof redirect === 'string' && redirect) router.push(redirect);
  } catch (err) {
    ok.value = false;
    message.value = `Could not reach the backend: ${err?.message || err}`;
  } finally {
    testing.value = false;
  }
}

function clear() {
  domain.value = '';
  apiKey.value = '';
  backendStore.domain = '';
  backendStore.apiKey = '';
  message.value = '';
}
</script>
