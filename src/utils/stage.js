export const isLocalParticipant = (info) => {
  return info.isLocal;
};

export const createParticipant = (participantInfo) => {
  return {
    ...participantInfo,
    streams: [],
  };
};

export const getRemovedStreams = (participant, updatedStreams) => {
  if (!participant) return [];
  if (!participant.streams?.length) return [];
  return participant.streams?.filter(
    (existingStream) =>
      !updatedStreams.find(
        (removedStream) => existingStream.id === removedStream.id
      )
  );
};
