import { defineStore } from 'pinia';

// Random participant identity. The publisher overrides userId with the hostId
// from the route so viewers can find it on the stage.
const generateUsername = () => {
  return `bench-${Math.random().toString(36).slice(2, 7)}`;
};

const generateUserId = () => {
  return Math.random().toString(36).slice(2);
};

export const useUsernameStore = defineStore('username', {
  state: () => ({
    username: '',
    userId: '',
  }),
  actions: {
    regenerateUsername(forceUpdate) {
      if (this.username !== '' && !forceUpdate) return;
      this.username = generateUsername();
    },
    regenerateUserId(forceUpdate) {
      if (this.userId !== '' && !forceUpdate) return;
      this.userId = generateUserId();
    },
    init() {
      this.regenerateUsername();
      this.regenerateUserId();
    },
  },
  persist: true,
});
