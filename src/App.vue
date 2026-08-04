<template>
  <div class="relative w-dvw h-dvh overflow-hidden bg-neutral-950">
    <router-view />
  </div>
</template>

<script setup>
import { onMounted } from 'vue';
import { useUsernameStore } from './stores/usernameStore';

const usernameStore = useUsernameStore();

onMounted(() => {
  usernameStore.init();
});
</script>
