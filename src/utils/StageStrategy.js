import { SubscribeType } from 'amazon-ivs-web-broadcast';

export default class Strategy {
  _videoStream = undefined;
  _audioStream = undefined;
  _subscribeType = SubscribeType.NONE;
  _shouldPublish = undefined;
  // Optional: pin a specific simulcast layer label for remote streams.
  // null/undefined means "let the SDK adapt automatically".
  _preferredLayerLabel = null;

  constructor(
    audioStream = null,
    videoStream = null,
    subscribeType = SubscribeType.AUDIO_VIDEO
  ) {
    this._videoStream = videoStream;
    this._audioStream = audioStream;
    this._subscribeType = subscribeType;
  }

  updateMedia(audioStream, videoStream) {
    this._audioStream = audioStream;
    this._videoStream = videoStream;
  }

  updatePublish(shouldPublish) {
    this._shouldPublish = shouldPublish;
  }

  updatePreferredLayerLabel(label) {
    // Pass an empty string / null / undefined to clear and let the SDK adapt.
    this._preferredLayerLabel = label || null;
  }

  stageStreamsToPublish() {
    return [this._videoStream, this._audioStream];
  }

  // eslint-disable-next-line no-unused-vars
  shouldPublishParticipant(participantInfo) {
    return this._shouldPublish;
  }

  // eslint-disable-next-line no-unused-vars
  shouldSubscribeToParticipant(participantInfo) {
    return SubscribeType.AUDIO_VIDEO;
  }

  // eslint-disable-next-line no-unused-vars
  preferredLayerForStream(participant, stream) {
    // Return a layer label (string) when the user pinned one, otherwise
    // return undefined so the SDK adapts to network conditions.
    return this._preferredLayerLabel || undefined;
  }
}
