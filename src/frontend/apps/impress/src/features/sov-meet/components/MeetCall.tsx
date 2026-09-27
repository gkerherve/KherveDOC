/**
 * A call from start to end: the pre-join screen, then the call itself.
 * Used by meetings and by a chat's "Call" button (same room: the document).
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useConfig } from '@/core/config/api';
import { useAuth } from '@/features/auth';

import { MeetChoices, MeetRoom } from './MeetRoom';
import { PreJoin } from './PreJoin';
import { meetCss } from './meetCss';

interface MeetCallProps {
  docId: string;
  title: string;
  /** Leaving the call (a chat closes it; a meeting shows the lobby). */
  onClose?: () => void;
}

export const MeetCall = ({ docId, title, onClose }: MeetCallProps) => {
  const { t } = useTranslation();
  const { authenticated } = useAuth();
  const enabled = useConfig().data?.MEET_ENABLED;
  const [choices, setChoices] = useState<MeetChoices | null>(null);

  if (choices) {
    return (
      <MeetRoom
        docId={docId}
        choices={choices}
        onLeave={() => {
          setChoices(null);
          onClose?.();
        }}
      />
    );
  }

  return (
    <div className="sov-meet">
      <style>{meetCss}</style>
      {enabled ? (
        <PreJoin title={title} askName={!authenticated} onJoin={setChoices} />
      ) : (
        <div className="sov-meet-message">
          <span className="material-icons" style={{ fontSize: 48 }}>
            videocam_off
          </span>
          <p>
            {t(
              'Video calls need a Sovereign Office server with a video server (LiveKit) set up.',
            )}
          </p>
        </div>
      )}
      {onClose && (
        <div className="sov-meet-controls">
          <button type="button" className="sov-meet-button" onClick={onClose}>
            {t('Close')}
          </button>
        </div>
      )}
    </div>
  );
};
