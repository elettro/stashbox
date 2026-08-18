-- Stashbox Radio audio streaming derivatives
-- Keeps the original WAV as the master while allowing a smaller MP3 to be used for listener playback.
-- Run once per schema. Replace radio_dev with radio for production when promoting.

ALTER TABLE radio_dev.songs
  ADD COLUMN IF NOT EXISTS audio_master_url TEXT,
  ADD COLUMN IF NOT EXISTS audio_stream_url TEXT,
  ADD COLUMN IF NOT EXISTS audio_master_format TEXT,
  ADD COLUMN IF NOT EXISTS audio_stream_format TEXT,
  ADD COLUMN IF NOT EXISTS audio_stream_bitrate INTEGER,
  ADD COLUMN IF NOT EXISTS audio_transcode_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS audio_transcode_error TEXT,
  ADD COLUMN IF NOT EXISTS audio_transcoded_at TIMESTAMPTZ;

-- Existing audio_url values are the current masters until a derivative exists.
UPDATE radio_dev.songs
SET
  audio_master_url = COALESCE(NULLIF(audio_master_url, ''), audio_url),
  audio_master_format = COALESCE(
    NULLIF(audio_master_format, ''),
    CASE
      WHEN COALESCE(audio_url, '') ~* '\\.wav([?#].*)?$' THEN 'wav'
      WHEN COALESCE(audio_url, '') ~* '\\.mp3([?#].*)?$' THEN 'mp3'
      ELSE NULL
    END
  ),
  audio_transcode_status = CASE
    WHEN COALESCE(audio_stream_url, '') <> '' THEN 'ready'
    WHEN COALESCE(audio_url, '') ~* '\\.wav([?#].*)?$' THEN 'pending'
    ELSE COALESCE(NULLIF(audio_transcode_status, ''), 'pending')
  END
WHERE COALESCE(audio_url, '') <> '';

CREATE INDEX IF NOT EXISTS songs_audio_transcode_status_idx
  ON radio_dev.songs (audio_transcode_status);

COMMENT ON COLUMN radio_dev.songs.audio_master_url IS 'Original uploaded audio master. WAV remains preserved here.';
COMMENT ON COLUMN radio_dev.songs.audio_stream_url IS 'Listener streaming derivative. Prefer this URL for normal playback when ready.';
COMMENT ON COLUMN radio_dev.songs.audio_transcode_status IS 'pending | processing | ready | failed | not_required';
