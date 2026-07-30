const RATIO_KEYS = Object.freeze({
  '1:1': '1x1',
  '16:9': '16x9',
  '9:16': '9x16',
  '3:4': '3x4',
  '4:5': '4x5',
  '21:9': '21x9'
});

const OPTIMIZED_ORDER = Object.freeze({
  '1x1': ['1x1'],
  '16x9': ['16x9', '21x9', '1x1'],
  '9x16': ['9x16', '3x4', '4x5', '1x1'],
  '3x4': ['3x4', '4x5', '9x16', '1x1'],
  '4x5': ['4x5', '3x4', '9x16', '1x1'],
  '21x9': ['21x9', '16x9', '1x1']
});

function text(value) {
  return String(value || '').trim();
}

export function artworkRatioKey(aspectRatio) {
  const normalized = text(aspectRatio).toLowerCase().replace(/\s+/g, '');
  return RATIO_KEYS[normalized] || normalized.replace(':', 'x') || '1x1';
}

export function normalizeArtworkImages(media = {}) {
  const images = media?.artwork_images && typeof media.artwork_images === 'object'
    ? media.artwork_images
    : {};
  return {
    '1x1': text(images['1x1'] || media.song_artwork_1x1_url || media.song_artwork_url),
    '16x9': text(images['16x9'] || media.song_artwork_16x9_url),
    '9x16': text(images['9x16'] || media.song_artwork_9x16_url),
    '3x4': text(images['3x4'] || media.song_artwork_3x4_url),
    '4x5': text(images['4x5'] || media.song_artwork_4x5_url),
    '21x9': text(images['21x9'] || media.song_artwork_21x9_url)
  };
}

export function selectRenderArtwork(media = {}, aspectRatio = '1:1', emergencyUrl = '') {
  const requestedRatio = artworkRatioKey(aspectRatio);
  const images = normalizeArtworkImages(media);
  const order = OPTIMIZED_ORDER[requestedRatio] || [requestedRatio, '1x1'];
  const sourceRatio = order.find((ratio) => text(images[ratio])) || '';
  const selectedUrl = sourceRatio ? images[sourceRatio] : text(emergencyUrl);

  return {
    url: selectedUrl,
    requested_ratio: requestedRatio,
    source_ratio: sourceRatio || (selectedUrl ? 'legacy_recipe' : ''),
    fallback_used: Boolean(selectedUrl && sourceRatio !== requestedRatio),
    selection_rule: sourceRatio === requestedRatio
      ? 'exact_ratio'
      : sourceRatio === '1x1'
        ? 'square_fallback'
        : sourceRatio
          ? 'closest_orientation_fallback'
          : selectedUrl
            ? 'legacy_emergency_fallback'
            : 'missing'
  };
}
