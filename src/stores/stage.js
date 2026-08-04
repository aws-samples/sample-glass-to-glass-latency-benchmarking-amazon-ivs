import { defineStore } from 'pinia';
import {
  Stage,
  StageConnectionState,
  StageParticipantPublishState,
  StageEvents,
} from 'amazon-ivs-web-broadcast';
import Strategy from '../utils/StageStrategy';
import {
  createParticipant,
  isLocalParticipant,
  getRemovedStreams,
} from '../utils/stage';
import { markRaw, ref, shallowRef } from 'vue';

export const useStageStore = defineStore('stage', () => {
  // SDK objects use native private fields (#foo). Vue's reactive Proxy
  // breaks private-field access, so keep these out of reactivity.
  const stage = shallowRef(null);
  const stageStrategy = shallowRef(null);

  const stageJoined = ref(false);
  const stageConnection = ref();
  const onStage = ref(false);

  // The publisher (Host.vue) builds its own LocalStageStream so it can control
  // the simulcast ladder, bitrate and framerate. These refs just track what is
  // currently published so it can be torn down cleanly.
  const localVideoStream = shallowRef(null);
  const localVideoTrack = shallowRef(null);
  const localAudioStream = shallowRef(null);
  const localAudioTrack = shallowRef(null);

  const participants = ref(new Map());
  const localParticipant = ref(null);
  const localStreams = ref([]);

  function refreshStageStrategy() {
    if (stage.value && stageJoined.value) {
      stage.value.refreshStrategy();
    }
  }

  function destroyLocalStreams() {
    if (localVideoTrack.value) {
      localVideoTrack.value.stop();
    }
    if (localAudioTrack.value) {
      localAudioTrack.value.stop();
    }
  }

  function handleParticipantJoin(participant) {
    if (isLocalParticipant(participant)) {
      localParticipant.value = participant;
    } else {
      const newParticipant = createParticipant(participant);

      // Set a new Map to trigger reactivity
      participants.value = new Map(
        participants.value?.set(newParticipant.id, newParticipant)
      );
    }
    refreshStageStrategy();
  }

  function handleParticipantLeave(participant) {
    if (isLocalParticipant(participant)) {
      localParticipant.value = {};
    } else {
      const nextState = participants.value;
      nextState.delete(participant.id);

      // Set a new Map to trigger reactivity
      participants.value = new Map(nextState);
    }
  }

  function handleMediaAdded(participant, streams) {
    if (isLocalParticipant(participant)) {
      localParticipant.value = participant;
      localStreams.value = [...streams, ...localStreams.value];
    } else {
      if (!participants.value.has(participant.id)) {
        handleParticipantJoin(participant);
      }

      const { id } = participant;
      let updatedParticipant = participants.value.get(id);
      updatedParticipant = {
        ...updatedParticipant,
        streams: [...streams, ...(updatedParticipant?.streams ?? [])],
      };
      const nextState = participants.value;

      // Set a new Map to trigger reactivity
      participants.value = new Map(nextState.set(id, updatedParticipant));
    }
  }

  function handleMediaRemoved(participant, streams) {
    if (isLocalParticipant(participant)) {
      localParticipant.value = participant;
      localStreams.value = getRemovedStreams(participant, streams);
    } else {
      const { id } = participant;
      let updatedParticipant = participants.value.get(id);
      if (!updatedParticipant) return;

      updatedParticipant = {
        ...updatedParticipant,
        streams: getRemovedStreams(updatedParticipant, streams),
      };
      const nextState = participants.value;

      // Set a new Map to trigger reactivity
      participants.value = new Map(nextState.set(id, updatedParticipant));
    }
  }

  function handleParticipantMuteChange(participant) {
    if (isLocalParticipant(participant)) {
      localParticipant.value = participant;
    } else {
      const { id } = participant;

      let updatedParticipant = participants.value.get(id);
      updatedParticipant = {
        ...updatedParticipant,
        ...participant,
      };
      const nextState = participants.value;

      // Set a new Map to trigger reactivity
      participants.value = new Map(nextState.set(id, updatedParticipant));
    }
  }

  function handleConnectionStateChange(state) {
    stageConnection.value = state;
    switch (state) {
      case StageConnectionState.DISCONNECTED:
      case StageConnectionState.CONNECTING:
        stageJoined.value = false;
        break;
      case StageConnectionState.CONNECTED:
        stageJoined.value = true;
        break;
      case StageConnectionState.ERRORED:
        // Reset stage
        stage.value.leave();
        stage.value.removeAllListeners();
        console.error(
          'Error: Could not connect to the session. Refresh the page to try again.'
        );
        break;
      default:
        break;
    }
  }

  // eslint-disable-next-line no-unused-vars
  function handleParticipantPublishStateChange(participantInfo, state) {
    if (state === StageParticipantPublishState.ERRORED) {
      console.error('Error publishing to stage');
    }
  }

  // eslint-disable-next-line no-unused-vars
  function handleParticipantSubscribeStateChange(participantInfo, state) {
    if (state === StageParticipantPublishState.ERRORED) {
      console.error('Error subscribing to stage');
    }
  }

  function attachStageHandlers(stage) {
    stage.on(
      StageEvents.STAGE_CONNECTION_STATE_CHANGED,
      handleConnectionStateChange
    );
    stage.on(StageEvents.STAGE_PARTICIPANT_JOINED, handleParticipantJoin);
    stage.on(StageEvents.STAGE_PARTICIPANT_LEFT, handleParticipantLeave);
    stage.on(StageEvents.STAGE_PARTICIPANT_STREAMS_ADDED, handleMediaAdded);
    stage.on(StageEvents.STAGE_PARTICIPANT_STREAMS_REMOVED, handleMediaRemoved);
    stage.on(
      StageEvents.STAGE_PARTICIPANT_PUBLISH_STATE_CHANGED,
      handleParticipantPublishStateChange
    );
    stage.on(
      StageEvents.STAGE_PARTICIPANT_SUBSCRIBE_STATE_CHANGED,
      handleParticipantSubscribeStateChange
    );
    stage.on(
      StageEvents.STAGE_STREAM_MUTE_CHANGED,
      handleParticipantMuteChange
    );
  }

  async function createStage(token) {
    try {
      stageStrategy.value = markRaw(new Strategy());
      stage.value = markRaw(new Stage(token, stageStrategy.value));
      attachStageHandlers(stage.value);
    } catch (err) {
      console.error('Error: Could not create stage', err);
    }
  }

  async function connectToStage(token) {
    if (!stage.value) await createStage(token);
    try {
      await stage.value.join();
      localParticipant.value = stage.value.localParticipant;
      refreshStageStrategy();
    } catch (err) {
      console.error('Failed to join stage:', err);
    }
  }

  function leaveStage() {
    if (stage.value) {
      destroyLocalStreams();

      participants.value = new Map();
      localParticipant.value = null;
      localStreams.value = [];

      stage.value.leave();
      stage.value = null;
    }
  }

  return {
    stage,
    stageStrategy,
    onStage,
    localVideoStream,
    localVideoTrack,
    localAudioStream,
    localAudioTrack,
    localStreams,
    stageJoined,
    destroyLocalStreams,
    participants,
    localParticipant,
    connectToStage,
    leaveStage,
    refreshStageStrategy,
    stageConnection,
  };
});
