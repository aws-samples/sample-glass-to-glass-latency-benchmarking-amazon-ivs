import { defineStore } from 'pinia';
import { useBackend } from '../composables/useBackend';
import { getApiUrlFromDomain } from '../utils/backend';

export const useBackendStore = defineStore('backend', {
  state: () => ({
    domain: '',
    apiKey: '',
    streams: [],
    token: '',
    participantId: '',
    awsRegion: '',
  }),
  actions: {
    async refreshStreams() {
      const { listStreams } = useBackend();
      let streams;
      try {
        streams = await listStreams(this.apiKey, getApiUrlFromDomain(this.domain));
      } catch (err) {
        console.error(err);
      }
      this.streams = streams || [];
      return this.streams;
    },
    async joinStream(hostId) {
      const { fetchStreamToken } = useBackend();
      try {
        const { token, participantId, region } = await fetchStreamToken(hostId);
        this.token = token;
        this.participantId = participantId;
        this.awsRegion = region;
        return token;
      } catch (err) {
        console.error(err);
      }
    },
    async destroyStream(hostId) {
      const { destroyStream } = useBackend();
      try {
        await destroyStream(hostId);
        this.token = '';
        this.participantId = '';
      } catch (err) {
        console.error(err);
      }
    },
  },
  getters: {
    apiUrl(state) {
      return getApiUrlFromDomain(state.domain);
    },
    isAuthenticated(state) {
      return state.domain !== '' && state.apiKey !== '';
    },
    hasToken(state) {
      return !!state.token;
    },
  },
  persist: {
    pick: ['domain', 'apiKey'],
  },
});
