/**
 * Before joining a call: a look at your own camera, microphone and camera
 * on or off, your name if you are not signed in, and "Join".
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { MeetChoices } from './MeetRoom';

interface PreJoinProps {
  title: string;
  askName: boolean;
  onJoin: (choices: MeetChoices) => void;
}

export const PreJoin = ({ title, askName, onJoin }: PreJoinProps) => {
  const { t } = useTranslation();
  const [audio, setAudio] = useState(true);
  const [video, setVideo] = useState(true);
  const [name, setName] = useState('');
  const [blocked, setBlocked] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // The camera preview, while the camera is on.
  useEffect(() => {
    if (!video || !navigator.mediaDevices?.getUserMedia) {
      return;
    }
    let stream: MediaStream | undefined;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: true })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = s;
        setBlocked(false);
        if (videoRef.current) {
          videoRef.current.srcObject = s;
        }
      })
      .catch(() => setBlocked(true));
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [video]);

  return (
    <div className="sov-meet-prejoin">
      <div className="sov-meet-preview">
        {video && !blocked ? (
          <video ref={videoRef} autoPlay playsInline muted />
        ) : (
          <div className="sov-meet-message">
            {blocked
              ? t('The camera is not available (check the permission).')
              : t('Your camera is off')}
          </div>
        )}
        <div className="sov-meet-controls">
          <button
            type="button"
            className={`sov-meet-button${audio ? '' : ' sov-meet-off'}`}
            aria-label={
              audio ? t('Turn off the microphone') : t('Turn on the microphone')
            }
            title={
              audio ? t('Turn off the microphone') : t('Turn on the microphone')
            }
            onClick={() => setAudio(!audio)}
          >
            <span className="material-icons">{audio ? 'mic' : 'mic_off'}</span>
          </button>
          <button
            type="button"
            className={`sov-meet-button${video ? '' : ' sov-meet-off'}`}
            aria-label={
              video ? t('Turn off the camera') : t('Turn on the camera')
            }
            title={video ? t('Turn off the camera') : t('Turn on the camera')}
            onClick={() => setVideo(!video)}
          >
            <span className="material-icons">
              {video ? 'videocam' : 'videocam_off'}
            </span>
          </button>
        </div>
      </div>
      <form
        className="sov-meet-side"
        onSubmit={(e) => {
          e.preventDefault();
          onJoin({
            audio,
            video,
            guestName: askName ? name.trim() : undefined,
          });
        }}
      >
        <h2>{title}</h2>
        <p>{t('Ready to join?')}</p>
        {askName && (
          <input
            aria-label={t('Your name')}
            placeholder={t('Your name')}
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
          />
        )}
        <button
          type="submit"
          className="sov-meet-button sov-meet-join"
          disabled={askName && !name.trim()}
        >
          <span className="material-icons">videocam</span>
          {t('Join the call')}
        </button>
      </form>
    </div>
  );
};
