import { createRouter, createWebHistory } from 'vue-router';
import Launcher from '../views/Launcher.vue';
import Host from '../views/Host.vue';
import Watch from '../views/Watch.vue';
import ObsAdmin from '../views/ObsAdmin.vue';
import Settings from '../views/Settings.vue';
import { useBackendStore } from '../stores/backend';

const routes = [
  {
    path: '/',
    name: 'Launcher',
    component: Launcher,
  },
  {
    path: '/settings',
    name: 'Settings',
    component: Settings,
  },
  {
    path: '/obs',
    name: 'OBS Admin',
    component: ObsAdmin,
  },
  {
    path: '/host/:hostId',
    name: 'Host',
    component: Host,
    meta: { requiresBackend: true },
  },
  {
    path: '/watch/:hostId',
    name: 'Watch',
    component: Watch,
    meta: { requiresBackend: true },
  },
  // Back-compat with the /g2g/* URLs used in the original demo app.
  { path: '/g2g', redirect: '/' },
  { path: '/g2g/obs', redirect: '/obs' },
  { path: '/g2g/host/:hostId', redirect: (to) => `/host/${to.params.hostId}` },
  { path: '/g2g/watch/:hostId', redirect: (to) => `/watch/${to.params.hostId}` },
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

// Host and Watch cannot fetch a stage token without backend credentials.
// The store is resolved inside the guard, which runs after Pinia is installed.
router.beforeEach((to) => {
  if (!to.meta.requiresBackend) return;
  const backendStore = useBackendStore();
  if (!backendStore.isAuthenticated) {
    return { name: 'Settings', query: { redirect: to.fullPath } };
  }
});

export default router;
