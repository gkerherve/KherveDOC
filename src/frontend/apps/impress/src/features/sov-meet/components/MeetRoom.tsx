/**
 * A video call: everyone's camera (or initials) in a grid, screens shared
 * in large, and the controls — microphone, camera, screen, leave. Media go
 * through the LiveKit server set up with Sovereign Office; the server only
 * lets in people who can open the meeting's (or chat's) document.
 */
import {
  LocalParticipant,
  Participant,
  RemoteTrack,
  Room,
  RoomEvent,
  Track,
} from 'livekit-client';
import { useEffect, useReducer, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { fetchAPI } from '@/api';

import { meetCss } from './meetCss';

export interface MeetChoices {
  audio: boolean;
  video: boolean;
  guestName?: string;
}

interface MeetRoomProps {
  docId: string;
  choices: MeetChoices;
  onLeave: () => void;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('') || '?';

const MediaView = ({ track, mirror }: { track: Track; mirror?: boolean }) => {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    track.attach(element);
    return () => {
      track.detach(element);
    };
  }, [track]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      className={mirror ? 'sov-meet-mirror' : undefined}
    />
  );
};

const AudioOut = ({ track }: { track: RemoteTrack }) => {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    track.attach(element);
    return () => {
      track.detach(element);
    };
  }, [track]);
  return <audio ref={ref} autoPlay />;
};

const Tile = ({
  participant,
  source,
}: {
  participant: Participant;
  source: Track.Source;
}) => {
  const { t } = useTranslation();
  const publication = participant.getTrackPublication(source);
  const track =
    publication && !publication.isMuted ? publication.track : undefined;
  const isLocal = participant instanceof LocalParticipant;
  const name = participant.name || participant.identity;
  const screen = source === Track.Source.ScreenShare;
  return (
    <div
      className={`sov-meet-tile${participant.isSpeaking && !screen ? ' sov-meet-speaking' : ''}${screen ? ' sov-meet-screen' : ''}`}
    >
      {track ? (
        <MediaView track={track} mirror={isLocal && !screen} />
      ) : (
        <div className="sov-meet-avatar" aria-hidden>
          {initials(name)}
        </div>
      )}
      <div className="sov-meet-name">
        {!screen && !participant.isMicrophoneEnabled && (
          <span className="material-icons" aria-label={t('Muted')}>
            mic_off
          </span>
        )}
        {screen
          ? t('{{name}} is sharing their screen', { name })
          : isLocal
            ? t('{{name}} (you)', { name })
            : name}
      </div>
    </div>
  );
};

export const MeetRoom = ({ docId, choices, onLeave }: MeetRoomProps) => {
  const { t } = useTranslation();
  const [room] = useState(
    () => new Room({ adaptiveStream: true, dynacast: true }),
  );
  const [state, setState] = useState<'connecting' | 'connected' | 'error'>(
    'connecting',
  );
  const [problem, setProblem] = useState('');
  const [, refresh] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    let cancelled = false;
    const events = [
      RoomEvent.ParticipantConnected,
      RoomEvent.ParticipantDisconnected,
      RoomEvent.TrackSubscribed,
      RoomEvent.TrackUnsubscribed,
      RoomEvent.TrackMuted,
      RoomEvent.TrackUnmuted,
      RoomEvent.LocalTrackPublished,
      RoomEvent.LocalTrackUnpublished,
      RoomEvent.ActiveSpeakersChanged,
      RoomEvent.ParticipantNameChanged,
    ];
    events.forEach((event) => room.on(event, refresh));
    room.on(RoomEvent.Disconnected, () => {
      if (!cancelled) {
        onLeave();
      }
    });

    const join = async () => {
      try {
        const response = await fetchAPI(`documents/${docId}/meet-token/`, {
          method: 'POST',
          body: JSON.stringify({ name: choices.guestName }),
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as {
            detail?: string;
          };
          throw new Error(body.detail || t('You cannot join this call.'));
        }
        const { url, token } = (await response.json()) as {
          url: string;
          token: string;
        };
        if (cancelled) {
          return;
        }
        await room.connect(url, token);
        if (cancelled) {
          return;
        }
        setState('connected');
        await Promise.all([
          room.localParticipant
            .setMicrophoneEnabled(choices.audio)
            .catch(() => undefined),
          room.localParticipant
            .setCameraEnabled(choices.video)
            .catch(() => undefined),
        ]);
        refresh();
      } catch (error) {
        if (!cancelled) {
          setProblem(error instanceof Error ? error.message : String(error));
          setState('error');
        }
      }
    };
    void join();

    return () => {
      cancelled = true;
      room.removeAllListeners();
      void room.disconnect();
    };
    // Join once per call; the choices are the ones made before joining.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, docId]);

  if (state === 'error') {
    return (
      <div className="sov-meet">
        <style>{meetCss}</style>
        <div className="sov-meet-message">
          <p>{problem}</p>
          <button type="button" className="sov-meet-button" onClick={onLeave}>
            {t('Close')}
          </button>
        </div>
      </div>
    );
  }

  const local = room.localParticipant;
  const participants: Participant[] = [
    local,
    ...Array.from(room.remoteParticipants.values()),
  ];
  const screens = participants.filter(
    (p) => p.getTrackPublication(Track.Source.ScreenShare)?.track,
  );
  const audio = Array.from(room.remoteParticipants.values()).flatMap((p) => {
    const track = p.getTrackPublication(Track.Source.Microphone)?.track;
    return track ? [track] : [];
  });

  const toggle = async (what: 'mic' | 'camera' | 'screen') => {
    try {
      if (what === 'mic') {
        await local.setMicrophoneEnabled(!local.isMicrophoneEnabled);
      } else if (what === 'camera') {
        await local.setCameraEnabled(!local.isCameraEnabled);
      } else {
        await local.setScreenShareEnabled(!local.isScreenShareEnabled);
      }
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    }
    refresh();
  };

  const columns = Math.ceil(Math.sqrt(participants.length));

  return (
    <div className="sov-meet">
      <style>{meetCss}</style>
      {state === 'connecting' ? (
        <div className="sov-meet-message">{t('Joining the call…')}</div>
      ) : (
        <div className="sov-meet-stage">
          {screens.map((p) => (
            <Tile
              key={`${p.identity}-screen`}
              participant={p}
              source={Track.Source.ScreenShare}
            />
          ))}
          <div
            className={`sov-meet-grid${screens.length ? ' sov-meet-grid-side' : ''}`}
            style={
              screens.length
                ? undefined
                : { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }
            }
          >
            {participants.map((p) => (
              <Tile
                key={p.identity}
                participant={p}
                source={Track.Source.Camera}
              />
            ))}
          </div>
        </div>
      )}
      {audio.map((track) => (
        <AudioOut key={track.sid} track={track} />
      ))}
      {problem && state === 'connected' && (
        <div className="sov-meet-notice" role="alert">
          {problem}
          <button type="button" onClick={() => setProblem('')}>
            ×
          </button>
        </div>
      )}
      <div className="sov-meet-controls">
        <span className="sov-meet-count">
          {t('{{count}} in the call', { count: participants.length })}
        </span>
        <button
          type="button"
          className={`sov-meet-button${local.isMicrophoneEnabled ? '' : ' sov-meet-off'}`}
          aria-label={
            local.isMicrophoneEnabled
              ? t('Turn off the microphone')
              : t('Turn on the microphone')
          }
          title={
            local.isMicrophoneEnabled
              ? t('Turn off the microphone')
              : t('Turn on the microphone')
          }
          onClick={() => void toggle('mic')}
          disabled={state !== 'connected'}
        >
          <span className="material-icons">
            {local.isMicrophoneEnabled ? 'mic' : 'mic_off'}
          </span>
        </button>
        <button
          type="button"
          className={`sov-meet-button${local.isCameraEnabled ? '' : ' sov-meet-off'}`}
          aria-label={
            local.isCameraEnabled
              ? t('Turn off the camera')
              : t('Turn on the camera')
          }
          title={
            local.isCameraEnabled
              ? t('Turn off the camera')
              : t('Turn on the camera')
          }
          onClick={() => void toggle('camera')}
          disabled={state !== 'connected'}
        >
          <span className="material-icons">
            {local.isCameraEnabled ? 'videocam' : 'videocam_off'}
          </span>
        </button>
        <button
          type="button"
          className={`sov-meet-button${local.isScreenShareEnabled ? ' sov-meet-active' : ''}`}
          aria-label={
            local.isScreenShareEnabled
              ? t('Stop sharing the screen')
              : t('Share the screen')
          }
          title={
            local.isScreenShareEnabled
              ? t('Stop sharing the screen')
              : t('Share the screen')
          }
          onClick={() => void toggle('screen')}
          disabled={state !== 'connected'}
        >
          <span className="material-icons">present_to_all</span>
        </button>
        <button
          type="button"
          className="sov-meet-button sov-meet-leave"
          aria-label={t('Leave the call')}
          title={t('Leave the call')}
          onClick={() => {
            void room.disconnect();
            onLeave();
          }}
        >
          <span className="material-icons">call_end</span>
        </button>
      </div>
    </div>
  );
};
