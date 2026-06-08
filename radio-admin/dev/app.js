const API_BASE_URL = 'https://fmexmp5o52.execute-api.us-east-1.amazonaws.com/default/stashbox-radio-api-dev/admin/songs';
const EVENTS_API_BASE_URL = 'https://fmexmp5o52.execute-api.us-east-1.amazonaws.com/default/stashbox-radio-api-dev/admin/events';
const STATS_SUMMARY_API_URL = 'https://fmexmp5o52.execute-api.us-east-1.amazonaws.com/default/stashbox-radio-api-dev/admin/stats/summary';
const PRODUCT_STATS_API_URL = 'https://fmexmp5o52.execute-api.us-east-1.amazonaws.com/default/stashbox-radio-api-dev/admin/stats/products?limit=25';
const SONG_STATS_API_URL = 'https://fmexmp5o52.execute-api.us-east-1.amazonaws.com/default/stashbox-radio-api-dev/admin/stats/songs?limit=100';
const UPLOAD_PRESIGN_API_URL = 'https://fmexmp5o52.execute-api.us-east-1.amazonaws.com/default/stashbox-radio-api-dev/admin/uploads/presign';
const REFERRER_STATS_API_URL = 'https://fmexmp5o52.execute-api.us-east-1.amazonaws.com/default/stashbox-radio-api-dev/admin/stats/referrers?limit=50';
const DEVICE_STATS_API_URL = 'https://fmexmp5o52.execute-api.us-east-1.amazonaws.com/default/stashbox-radio-api-dev/admin/stats/devices?limit=50';
const TOKEN_STORAGE_KEY = 'stashbox_admin_token_dev';
const RADIO_DEV_BASE_URL = 'https://elettro.github.io/stashbox/radio/dev/';

const ADS_STORAGE_KEY = 'stashbox_radio_dev_ads';
const ADS_STATS_STORAGE_KEY = 'stashbox_radio_dev_ad_events';
const AD_TYPE_OPTIONS = [
  'Stashbox Radio Branding',
  'Merch Promo',
  'Event Promo',
  'Sponsor Ad',
  'Artist Promo',
  'Song Promo',
  'Donation Campaign',
  'Global Promo'
];
const AD_MEDIA_TYPE_OPTIONS = ['Video'];
const AD_FREQUENCY_OPTIONS = ['Low', 'Medium', 'High'];
const AD_UPLOAD_FOLDER_ROUTES = {
  'Stashbox Radio Branding': { video: 'radio-assets/ads/video/branding/', thumbnail: 'radio-assets/ads/thumbnails/branding/' },
  'Merch Promo': { video: 'radio-assets/ads/video/merch/', thumbnail: 'radio-assets/ads/thumbnails/merch/' },
  'Event Promo': { video: 'radio-assets/ads/video/events/', thumbnail: 'radio-assets/ads/thumbnails/events/' },
  'Sponsor Ad': { video: 'radio-assets/ads/video/sponsors/', thumbnail: 'radio-assets/ads/thumbnails/sponsors/' },
  'Artist Promo': { video: 'radio-assets/ads/video/campaigns/', thumbnail: 'radio-assets/ads/thumbnails/campaigns/' },
  'Song Promo': { video: 'radio-assets/ads/video/campaigns/', thumbnail: 'radio-assets/ads/thumbnails/campaigns/' },
  'Donation Campaign': { video: 'radio-assets/ads/video/campaigns/', thumbnail: 'radio-assets/ads/thumbnails/campaigns/' },
  'Global Promo': { video: 'radio-assets/ads/video/global/', thumbnail: 'radio-assets/ads/thumbnails/global/' }
};
const S3_AD_FOLDER_HELP = [
  'radio-assets/ads/video/branding/',
  'radio-assets/ads/video/global/',
  'radio-assets/ads/video/merch/',
  'radio-assets/ads/video/events/',
  'radio-assets/ads/video/sponsors/',
  'radio-assets/ads/video/campaigns/',
  'radio-assets/ads/video/artists/stashbox/',
  'radio-assets/ads/video/artists/therasbox/',
  'radio-assets/ads/video/artists/tahiticora/',
  'radio-assets/ads/video/genres/reggae/',
  'radio-assets/ads/video/genres/rock/',
  'radio-assets/ads/video/genres/blues/',
  'radio-assets/ads/video/genres/rap/',
  'radio-assets/ads/video/genres/edm/',
  'radio-assets/ads/thumbnails/branding/',
  'radio-assets/ads/thumbnails/global/',
  'radio-assets/ads/thumbnails/merch/',
  'radio-assets/ads/thumbnails/events/',
  'radio-assets/ads/thumbnails/sponsors/',
  'radio-assets/ads/thumbnails/campaigns/',
  'radio-assets/ads/thumbnails/artists/stashbox/',
  'radio-assets/ads/thumbnails/artists/therasbox/',
  'radio-assets/ads/thumbnails/artists/tahiticora/',
  'radio-assets/ads/thumbnails/genres/reggae/',
  'radio-assets/ads/thumbnails/genres/rock/',
  'radio-assets/ads/thumbnails/genres/blues/',
  'radio-assets/ads/thumbnails/genres/rap/',
  'radio-assets/ads/thumbnails/genres/edm/'
];
const DEFAULT_DEV_AD = {
  id: 'ad-stashbox-branding-test',
  internal_title: 'Stashbox Radio Branding Test Ad',
  internal_description: 'Primary Stashbox Radio station branding video ad for dev testing.',
  ad_type: 'Stashbox Radio Branding',
  media_type: 'Video',
  media_url: '',
  thumbnail_url: '',
  poster_image_url: '',
  cta_label: 'Explore Stashbox Radio',
  cta_url: 'https://stashbox.com/stashbox/radio/',
  active: false,
  frequency: 'Medium',
  genre_associations: '',
  mood_associations: '',
  artist_associations: '',
  song_associations: '',
  skip_enabled: true,
  skip_after_seconds: 5,
  max_plays_per_session: 3,
  start_date: '',
  end_date: '',
  notes: 'Dev sample ad.'
};
const adFields = [
  { name: 'internal_title', label: 'Internal Title', type: 'text', required: true },
  { name: 'internal_description', label: 'Internal Description', type: 'textarea' },
  { name: 'ad_type', label: 'Ad Type', type: 'select', options: AD_TYPE_OPTIONS, required: true },
  { name: 'media_type', label: 'Media Type', type: 'select', options: AD_MEDIA_TYPE_OPTIONS, required: true, help: 'MVP supports video only.' },
  { name: 'media_url', label: 'Media URL', type: 'url', full: true, upload: 'adVideo', help: 'Upload connection pending. Paste S3/CloudFront URL for now.' },
  { name: 'thumbnail_url', label: 'Thumbnail URL', type: 'url', full: true, upload: 'adThumbnail', help: 'Upload connection pending. Paste S3/CloudFront URL for now.' },
  { name: 'cta_label', label: 'CTA Label', type: 'text' },
  { name: 'cta_url', label: 'CTA URL', type: 'url' },
  { name: 'active', label: 'Active', type: 'checkbox' },
  { name: 'frequency', label: 'Frequency', type: 'select', options: AD_FREQUENCY_OPTIONS },
  { name: 'skip_enabled', label: 'Skip Enabled', type: 'checkbox' },
  { name: 'skip_after_seconds', label: 'Skip After Seconds', type: 'number', min: 0, help: 'Default 5 seconds.' },
  { name: 'max_plays_per_session', label: 'Max Plays Per Session', type: 'number', min: 1, help: 'Default 3 per listener session.' },
  { name: 'start_date', label: 'Start Date', type: 'date' },
  { name: 'end_date', label: 'End Date', type: 'date' },
  { name: 'genre_associations', label: 'Genre Associations', type: 'text', full: true, help: 'Comma-separated for MVP.' },
  { name: 'mood_associations', label: 'Mood Associations', type: 'text', full: true, help: 'Comma-separated for MVP.' },
  { name: 'artist_associations', label: 'Artist Associations', type: 'text', full: true, help: 'Comma-separated for MVP.' },
  { name: 'song_associations', label: 'Song Associations', type: 'text', full: true, help: 'Comma-separated for MVP.' },
  { name: 'notes', label: 'Notes', type: 'textarea', full: true }
];
const DEFAULT_TAB = 'dashboard';
const DEFAULT_LANGUAGES = ['English'];
const SHOPIFY_PRODUCT_BASE_URL = 'https://stashbox.ai/products';
const STASHBOX_PLACEHOLDER_ARTWORK = `data:image/svg+xml,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 88 88" role="img" aria-label="Stashbox artwork placeholder">
    <defs>
      <linearGradient id="stashboxPlaceholderGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#42d982"/>
        <stop offset="52%" stop-color="#17241f"/>
        <stop offset="100%" stop-color="#f0c04c"/>
      </linearGradient>
    </defs>
    <rect width="88" height="88" rx="18" fill="#111816"/>
    <rect x="7" y="7" width="74" height="74" rx="15" fill="url(#stashboxPlaceholderGradient)" opacity="0.72"/>
    <rect x="24" y="26" width="40" height="36" rx="8" fill="rgba(8,11,10,0.72)"/>
    <circle cx="35" cy="39" r="5" fill="#f3f7ef" opacity="0.9"/>
    <path d="M27 56l12-12 8 8 6-7 10 11H27Z" fill="#f3f7ef" opacity="0.9"/>
  </svg>
`)}`;


const metadataSuggestions = {
  artist: ['Stashbox', 'The Ras Box', 'Tahiti Cora', 'Reggaeland'],
  genre: ['Reggae', 'Rock', 'Blues', 'Comedy Rap', 'Tropical Pop', 'Rumba Flamenco', 'Instrumental', 'Folk Rock', 'Country', 'Pop', 'Metal', 'Dance', 'Jazz', 'Live Jam'],
  secondary_genre: ['Improv Jam', 'Live Recording', 'Acoustic', 'Dub', 'Dancehall', 'Folk', 'Blues Rock', 'Comedy', 'Tropical', 'World', 'Experimental'],
  mood_tags: ['Happy', 'Chill', 'Uplifting', 'Funny', 'Sexy', 'Spiritual', 'Emotional', 'Party', 'Nostalgic', 'Energetic', 'Relaxed', 'Dark', 'Romantic', 'Trippy']
};

const metadataSelectOptions = {
  release_format: [
    { value: 'single', label: 'single' },
    { value: 'video_only', label: 'video_only' },
    { value: 'album_track', label: 'album_track' },
    { value: 'live_recording', label: 'live_recording' },
    { value: 'demo', label: 'demo' },
    { value: 'unreleased', label: 'unreleased' }
  ],
  song_origin: [
    { value: 'original', label: 'original' },
    { value: 'cover', label: 'cover' },
    { value: 'traditional', label: 'traditional' },
    { value: 'live recording', label: 'live recording' },
    { value: 'public domain', label: 'public domain' },
    { value: 'remix', label: 'remix' },
    { value: 'instrumental', label: 'instrumental' },
    { value: 'AI assisted', label: 'AI assisted' },
    { value: 'unknown', label: 'unknown' }
  ],
  public_visibility: [
    { value: 'visible', label: 'Visible' },
    { value: 'hidden', label: 'Hidden' },
    { value: 'archived', label: 'Archived' }
  ]
};

const editableFields = [
  { name: 'song_key', label: 'Song key', type: 'text', createOnly: true, full: true, help: 'Unique URL-safe key for this song. You can generate it from display title + artist, then edit it manually.' },
  { name: 'song_name', label: 'Song Name', type: 'text' },
  { name: 'display_title', label: 'Display title', type: 'text' },
  { name: 'artist', label: 'Artist', type: 'text', suggestions: metadataSuggestions.artist },
  { name: 'album_name', label: 'Album', type: 'text' },
  { name: 'genre', label: 'Genre', type: 'text', suggestions: metadataSuggestions.genre },
  { name: 'internal_version_name', label: 'Internal version name', type: 'text', full: true },
  {
    name: 'languages',
    label: 'Languages',
    type: 'text',
    full: true,
    help: 'Use commas for multiple languages. Leave blank for instrumental/no language.'
  },
  { name: 'secondary_genre', label: 'Secondary genre', type: 'text', suggestions: metadataSuggestions.secondary_genre },
  { name: 'release_format', label: 'Release Format', type: 'select', options: metadataSelectOptions.release_format },
  { name: 'song_origin', label: 'Song origin', type: 'select', options: metadataSelectOptions.song_origin },
  { name: 'audio_url', label: 'Audio URL', type: 'url', full: true, help: 'At least one is required: Audio URL or Video Link.' },
  { name: 'song_artwork_url', label: 'Song artwork URL', type: 'url', full: true },
  { name: 'video_link', label: 'Video Link', type: 'url', full: true, help: 'At least one is required: Audio URL or Video Link.' },
  { name: 'public_track_note', label: 'Public track note', type: 'textarea', full: true },
  { name: 'show_public_note', label: 'Show Public Note', type: 'checkbox' },
  { name: 'public_video_note', label: 'Public video note', type: 'textarea', full: true },
  { name: 'video_setlist', label: 'Video setlist', type: 'textarea', full: true },
  {
    name: 'public_visibility',
    label: 'Public Visibility',
    type: 'select',
    options: metadataSelectOptions.public_visibility,
    help: 'Controls whether this song is visible, hidden, or archived in radio/admin views.'
  },
  { name: 'exclusive', label: 'Exclusive', type: 'checkbox' },
  { name: 'explicit', label: 'Explicit', type: 'checkbox' },
  { name: 'live_recording', label: 'Live recording', type: 'checkbox' },
  { name: 'featured', label: 'Featured', type: 'checkbox' },
  {
    name: 'specific_product_urls',
    label: 'Specific product URLs',
    type: 'textarea',
    full: true,
    help: 'Enter one URL per line. Blank lines are ignored.'
  },
  { name: 'spotify_url', label: 'Spotify URL', type: 'url', full: true },
  { name: 'apple_music_url', label: 'Apple Music URL', type: 'url', full: true },
  { name: 'youtube_music_url', label: 'YouTube Music URL', type: 'url', full: true },
  { name: 'official_song_page_url', label: 'Official song page URL', type: 'url', full: true },
  { name: 'shop_url', label: 'Shop URL', type: 'url', full: true },
  {
    name: 'mood_tags',
    label: 'Mood',
    type: 'text',
    full: true,
    suggestions: metadataSuggestions.mood_tags,
    help: 'Choose a common mood or enter custom comma-separated mood tags. Empty tags are ignored.'
  },
  { name: 'internal_notes', label: 'Internal notes', type: 'textarea', full: true }
];

const plainTextFields = new Set([
  'public_track_note',
  'public_video_note',
  'video_setlist',
  'internal_notes',
  'song_key',
  'song_name',
  'display_title',
  'artist',
  'album_name',
  'genre',
  'secondary_genre',
  'release_format',
  'song_origin',
  'audio_url',
  'song_artwork_url',
  'video_link',
  'spotify_url',
  'apple_music_url',
  'youtube_music_url',
  'official_song_page_url',
  'shop_url',
  'internal_version_name'
]);

const booleanFields = new Set([
  'show_public_note',
  'exclusive',
  'explicit',
  'live_recording',
  'featured'
]);

const kpiDefinitions = [
  { key: 'total_events', label: 'Total Events' },
  { key: 'events_last_24h', label: 'Events Last 24h' },
  { key: 'events_last_7d', label: 'Events Last 7 Days' },
  { key: 'play_starts', label: 'Play Starts' },
  { key: 'full_plays', label: 'Full Plays' },
  { key: 'partial_plays', label: 'Partial Plays' },
  { key: 'skips', label: 'Skips' },
  { key: 'likes', label: 'Likes' },
  { key: 'shares', label: 'Shares' },
  { key: 'video_clicks', label: 'Video Clicks' },
  { key: 'product_clicks', label: 'Product Clicks' },
  { key: 'total_seconds_played', label: 'Total Listening Time', formatter: formatListeningTime },
  { key: 'average_seconds_played', label: 'Average Seconds Played', formatter: formatAverageSeconds },
  { key: 'average_completion_percent', label: 'Average Completion %', formatter: formatPercentValue }
];

const todayStatDefinitions = [
  { key: 'events_today', label: 'Events Today' },
  { key: 'plays_today', label: 'Plays Today' },
  { key: 'likes_today', label: 'Likes Today' },
  { key: 'shares_today', label: 'Shares Today' },
  { key: 'product_clicks_today', label: 'Product Clicks Today' },
  { key: 'video_clicks_today', label: 'Video Clicks Today' }
];

const productKpiDefinitions = [
  { key: 'total_product_clicks', label: 'Total Product Clicks' },
  { key: 'unique_products_clicked', label: 'Unique Products Clicked' },
  { key: 'product_clicks_last_24h', label: 'Product Clicks Last 24h' },
  { key: 'product_clicks_last_7d', label: 'Product Clicks Last 7 Days' }
];

const referrerKpiDefinitions = [
  { key: 'total_events', label: 'Total Events' },
  { key: 'events_with_referrer', label: 'Events With Referrer' },
  { key: 'direct_or_unknown_events', label: 'Direct / Unknown Events' },
  { key: 'unique_referrers', label: 'Unique Referrers' },
  { key: 'events_last_24h', label: 'Events Last 24h' },
  { key: 'events_last_7d', label: 'Events Last 7 Days' }
];

const deviceKpiDefinitions = [
  { key: 'total_events', label: 'Total Events' },
  { key: 'desktop_events', label: 'Desktop Events' },
  { key: 'mobile_events', label: 'Mobile Events' },
  { key: 'other_or_unknown_events', label: 'Other / Unknown Events' },
  { key: 'unique_device_types', label: 'Unique Device Types' },
  { key: 'events_last_24h', label: 'Events Last 24h' },
  { key: 'events_last_7d', label: 'Events Last 7 Days' }
];

const fieldElements = new Map();
const fieldWrappers = new Map();
const mediaUploadElements = new Map();
const adUploadElements = new Map();

const requiredSongFields = new Set([
  'song_name',
  'artist',
  'genre',
  'release_format',
  'public_visibility'
]);

const mediaRequiredFields = new Set([
  'audio_url',
  'video_link'
]);

const requiredFieldLabels = {
  song_name: 'Song Name',
  artist: 'Artist',
  genre: 'Genre',
  release_format: 'Release Format',
  public_visibility: 'Public Visibility'
};

const fieldsWithRequiredMarkers = new Set([
  ...requiredSongFields,
  ...mediaRequiredFields
]);

const uploadConfigs = {
  audio_url: {
    purpose: 'audio',
    buttonText: 'Upload Audio',
    idleLabel: 'audio',
    uploadingMessage: 'Uploading audio...',
    successMessage: 'Audio uploaded. URL added.',
    failurePrefix: 'Upload failed',
    accept: 'audio/wav,audio/x-wav,audio/mpeg,audio/mp3,audio/mp4,audio/aac,audio/flac,audio/aiff,audio/x-aiff,.wav,.mp3,.m4a,.flac,.aiff,.aif',
    allowedExtensions: ['wav', 'mp3', 'm4a', 'flac', 'aiff', 'aif'],
    allowedMimeTypes: ['audio/wav', 'audio/x-wav', 'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/aac', 'audio/flac', 'audio/aiff', 'audio/x-aiff'],
    previewType: 'audio'
  },
  song_artwork_url: {
    purpose: 'artwork',
    buttonText: 'Upload Artwork',
    idleLabel: 'artwork',
    uploadingMessage: 'Uploading artwork...',
    successMessage: 'Artwork uploaded. URL added.',
    failurePrefix: 'Artwork upload failed',
    accept: 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp',
    allowedExtensions: ['jpg', 'jpeg', 'png', 'webp'],
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    previewType: 'image'
  }
};


const adUploadConfigs = {
  adVideo: {
    fieldName: 'media_url',
    folderType: 'video',
    purpose: 'ad_video',
    buttonText: 'Upload Ad Video',
    uploadingMessage: 'Uploading ad video...',
    successMessage: 'Ad video uploaded. Media URL added.',
    failurePrefix: 'Ad video upload failed',
    accept: 'video/mp4,.mp4',
    allowedExtensions: ['mp4'],
    allowedMimeTypes: ['video/mp4'],
    previewType: 'video'
  },
  adThumbnail: {
    fieldName: 'thumbnail_url',
    folderType: 'thumbnail',
    purpose: 'ad_thumbnail',
    buttonText: 'Upload Thumbnail',
    uploadingMessage: 'Uploading thumbnail...',
    successMessage: 'Thumbnail uploaded. Thumbnail URL added.',
    failurePrefix: 'Thumbnail upload failed',
    accept: 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp',
    allowedExtensions: ['jpg', 'jpeg', 'png', 'webp'],
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    previewType: 'image'
  }
};
const createDefaults = {
  song_key: '',
  song_name: '',
  display_title: '',
  artist: 'Stashbox',
  release_format: 'single',
  public_visibility: 'visible',
  exclusive: false,
  explicit: false,
  live_recording: false,
  featured: false,
  show_public_note: false,
  song_origin: 'original',
  languages: [...DEFAULT_LANGUAGES],
  mood_tags: [],
  specific_product_urls: []
};

let songs = [];
let songsByKey = {};
let filteredSongs = [];
let archivedSongs = [];
let events = [];
let statsSummary = null;
let statsSummaryError = '';
let productStats = null;
let productStatsError = '';
let referrerStats = null;
let referrerStatsError = '';
let deviceStats = null;
let deviceStatsError = '';
let imagePreviewEl = null;
let activeImagePreviewThumb = null;
let imagePreviewPinned = false;
let imagePreviewDismissListenerAttached = false;
let songStats = null;
let songStatsError = '';
let songStatsSortKey = 'play_starts';
let songStatsSortDirection = 'desc';
const productMetadataCache = new Map();
let selectedSong = null;
let selectedSongKey = '';
let messageTimer = null;
let activeTab = DEFAULT_TAB;
let editorMode = 'edit';
let ads = [];
let selectedAdId = '';

const els = {
  tokenPanel: document.getElementById('tokenPanel'),
  adminPanel: document.getElementById('adminPanel'),
  adminToken: document.getElementById('adminToken'),
  saveTokenButton: document.getElementById('saveTokenButton'),
  clearTokenButton: document.getElementById('clearTokenButton'),
  tokenStatus: document.getElementById('tokenStatus'),
  tabButtons: Array.from(document.querySelectorAll('.tab-button')),
  dashboardView: document.getElementById('dashboardView'),
  songsView: document.getElementById('songsView'),
  editView: document.getElementById('editView'),
  archiveView: document.getElementById('archiveView'),
  eventsView: document.getElementById('eventsView'),
  adsView: document.getElementById('adsView'),
  refreshDashboardButton: document.getElementById('refreshDashboardButton'),
  kpiGrid: document.getElementById('kpiGrid'),
  statsSummaryWarning: document.getElementById('statsSummaryWarning'),
  statsGeneratedAt: document.getElementById('statsGeneratedAt'),
  productStatsWarning: document.getElementById('productStatsWarning'),
  productStatsGeneratedAt: document.getElementById('productStatsGeneratedAt'),
  referrerStatsWarning: document.getElementById('referrerStatsWarning'),
  referrerStatsGeneratedAt: document.getElementById('referrerStatsGeneratedAt'),
  referrerKpiGrid: document.getElementById('referrerKpiGrid'),
  topReferrersTableBody: document.getElementById('topReferrersTableBody'),
  recentReferrerEventsTableBody: document.getElementById('recentReferrerEventsTableBody'),
  deviceStatsWarning: document.getElementById('deviceStatsWarning'),
  deviceStatsGeneratedAt: document.getElementById('deviceStatsGeneratedAt'),
  deviceKpiGrid: document.getElementById('deviceKpiGrid'),
  deviceBreakdownTableBody: document.getElementById('deviceBreakdownTableBody'),
  recentDeviceEventsTableBody: document.getElementById('recentDeviceEventsTableBody'),
  songStatsWarning: document.getElementById('songStatsWarning'),
  songStatsGeneratedAt: document.getElementById('songStatsGeneratedAt'),
  songInsightGrid: document.getElementById('songInsightGrid'),
  songAnalyticsTableBody: document.getElementById('songAnalyticsTableBody'),
  songStatsSortButtons: Array.from(document.querySelectorAll('[data-song-stats-sort]')),
  productKpiGrid: document.getElementById('productKpiGrid'),
  topProductsTableBody: document.getElementById('topProductsTableBody'),
  recentProductClicksTableBody: document.getElementById('recentProductClicksTableBody'),
  todayStatsGrid: document.getElementById('todayStatsGrid'),
  devicesStatsList: document.getElementById('devicesStatsList'),
  eventTypesStatsList: document.getElementById('eventTypesStatsList'),
  topSongsTableBody: document.getElementById('topSongsTableBody'),
  likedSongsList: document.getElementById('likedSongsList'),
  sharedSongsList: document.getElementById('sharedSongsList'),
  watchedVideosList: document.getElementById('watchedVideosList'),
  productClicksList: document.getElementById('productClicksList'),
  engagementList: document.getElementById('engagementList'),
  skipRateList: document.getElementById('skipRateList'),
  createSongButton: document.getElementById('createSongButton'),
  refreshSongsButton: document.getElementById('refreshSongsButton'),
  refreshArchiveButton: document.getElementById('refreshArchiveButton'),
  refreshEventsButton: document.getElementById('refreshEventsButton'),
  eventLimit: document.getElementById('eventLimit'),
  eventsStatus: document.getElementById('eventsStatus'),
  eventsTableBody: document.getElementById('eventsTableBody'),
  songSearch: document.getElementById('songSearch'),
  songCount: document.getElementById('songCount'),
  songTableBody: document.getElementById('songTableBody'),
  archiveCount: document.getElementById('archiveCount'),
  archiveTableBody: document.getElementById('archiveTableBody'),
  editHeading: document.getElementById('editHeading'),
  selectedSongKey: document.getElementById('selectedSongKey'),
  selectedVisibility: document.getElementById('selectedVisibility'),
  emptyEditor: document.getElementById('emptyEditor'),
  editForm: document.getElementById('editForm'),
  formFields: document.getElementById('formFields'),
  saveChangesButton: document.getElementById('saveChangesButton'),
  cancelChangesButton: document.getElementById('cancelChangesButton'),
  dangerZone: document.getElementById('dangerZone'),
  deleteSongButton: document.getElementById('deleteSongButton'),
  deleteModal: document.getElementById('deleteModal'),
  cancelDeleteButton: document.getElementById('cancelDeleteButton'),
  confirmDeleteButton: document.getElementById('confirmDeleteButton'),
  adsStatus: document.getElementById('adsStatus'),
  adsTableBody: document.getElementById('adsTableBody'),
  adStatsTableBody: document.getElementById('adStatsTableBody'),
  adForm: document.getElementById('adForm'),
  adFormFields: document.getElementById('adFormFields'),
  adFormHeading: document.getElementById('adFormHeading'),
  createAdButton: document.getElementById('createAdButton'),
  refreshAdsButton: document.getElementById('refreshAdsButton'),
  saveAdButton: document.getElementById('saveAdButton'),
  saveAdAsNewButton: document.getElementById('saveAdAsNewButton'),
  previewAdButton: document.getElementById('previewAdButton'),
  cancelAdButton: document.getElementById('cancelAdButton'),
  deleteAdButton: document.getElementById('deleteAdButton'),
  adsStorageNote: document.getElementById('adsStorageNote'),
  message: document.getElementById('message')
};

document.addEventListener('DOMContentLoaded', () => {
  buildEditForm();
  buildAdForm();
  bindEvents();
  renderDashboard();
  renderAdsTab();
  initializeAdmin();

  window.setTimeout(() => {
    if (activeTab === 'ads' && !hasLiveAdsManager()) {
      console.warn('[Ads Dev] Ads Manager disappeared after load. Rebuilding.');
      renderAdsTab();
    }
  }, 1500);
});

function refreshAdsDomRefs() {
  els.adsView = document.getElementById('adsView');
  els.adsStatus = document.getElementById('adsStatus');
  els.adsTableBody = document.getElementById('adsTableBody');
  els.adStatsTableBody = document.getElementById('adStatsTableBody');
  els.adForm = document.getElementById('adForm');
  els.adFormFields = document.getElementById('adFormFields');
  els.adFormHeading = document.getElementById('adFormHeading');
  els.createAdButton = document.getElementById('createAdButton');
  els.refreshAdsButton = document.getElementById('refreshAdsButton');
  els.cancelAdButton = document.getElementById('cancelAdButton');
  els.saveAdButton = document.getElementById('saveAdButton');
  els.adsStorageNote = document.getElementById('adsStorageNote');
}

function isLiveNode(node) {
  return Boolean(node && document.body.contains(node));
}

function hasLiveAdsManager() {
  refreshAdsDomRefs();

  return Boolean(
    isLiveNode(els.adsView)
    && els.adsView.querySelector('.ads-panel')
    && isLiveNode(els.adsTableBody)
    && isLiveNode(els.createAdButton)
    && isLiveNode(els.refreshAdsButton)
  );
}

function bindAdsEvents() {
  refreshAdsDomRefs();

  if (els.createAdButton) {
    els.createAdButton.onclick = () => startCreateAd();
  }

  if (els.refreshAdsButton) {
    els.refreshAdsButton.onclick = () => loadAds();
  }

  if (els.cancelAdButton) {
    els.cancelAdButton.onclick = () => renderAdForm(null);
  }

  if (els.adForm) {
    els.adForm.onsubmit = saveAd;
  }
}

function bindEvents() {
  els.saveTokenButton.addEventListener('click', saveToken);
  els.adminToken.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveToken();
    }
  });
  els.clearTokenButton.addEventListener('click', clearToken);
  els.refreshDashboardButton.addEventListener('click', () => loadDashboardData());
  els.createSongButton.addEventListener('click', startCreateSong);
  els.refreshSongsButton.addEventListener('click', () => loadSongs({ preserveSelection: true }));
  els.refreshArchiveButton.addEventListener('click', () => loadSongs({ preserveSelection: true }));
  els.refreshEventsButton.addEventListener('click', () => loadEvents());
  bindAdsEvents();
  els.saveAdAsNewButton?.addEventListener('click', saveAdAsNew);
  els.previewAdButton?.addEventListener('click', updateAdPreview);
  els.deleteAdButton?.addEventListener('click', deleteSelectedAd);
  els.eventLimit.addEventListener('change', () => loadEvents());
  els.songSearch.addEventListener('input', renderSongList);
  els.saveChangesButton.addEventListener('click', () => {
    console.log("Save clicked");
  });
  els.editForm.addEventListener('submit', saveSelectedSong);
  els.deleteSongButton.addEventListener('click', openDeleteModal);
  els.cancelDeleteButton.addEventListener('click', closeDeleteModal);
  els.confirmDeleteButton.addEventListener('click', archiveSelectedSong);
  els.deleteModal.addEventListener('click', (event) => {
    if (event.target === els.deleteModal) {
      closeDeleteModal();
    }
  });
  els.cancelChangesButton.addEventListener('click', () => {
    if (editorMode === 'create') {
      clearEditor();
      return;
    }

    if (selectedSongKey) {
      loadSongDetails(selectedSongKey);
    }
  });
  els.tabButtons.forEach((button) => {
    button.addEventListener('click', () => setActiveTab(button.dataset.tab));
  });
  els.songStatsSortButtons.forEach((button) => {
    button.addEventListener('click', () => setSongStatsSort(button.dataset.songStatsSort));
  });
}

function initializeAdmin() {
  const token = getToken();
  updateTokenUi(Boolean(token));

  if (token) {
    setActiveTab(activeTab || DEFAULT_TAB, { forceReloadAds: false });
    loadDashboardData();
  } else {
    els.adminToken.focus();
  }
}

function getToken() {
  return localStorage.getItem(TOKEN_STORAGE_KEY) || '';
}

function saveToken() {
  const token = els.adminToken.value.trim();

  if (!token) {
    showMessage('Enter an admin token before saving.', 'error');
    return;
  }

  localStorage.setItem(TOKEN_STORAGE_KEY, token);
  els.adminToken.value = '';
  updateTokenUi(true);
  setActiveTab(DEFAULT_TAB);
  loadDashboardData();
}

function clearToken() {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  songs = [];
  songsByKey = {};
  filteredSongs = [];
  selectedSong = null;
  selectedSongKey = '';
  events = [];
  statsSummary = null;
  statsSummaryError = '';
  productStats = null;
  productStatsError = '';
  referrerStats = null;
  referrerStatsError = '';
  songStats = null;
  songStatsError = '';
  renderDashboard();
  renderSongList();
  renderArchiveList();
  renderEvents();
  loadAds();
  clearEditor();
  updateTokenUi(false);
  setActiveTab(DEFAULT_TAB);
  showMessage('Admin token cleared from this browser.', 'success');
  els.adminToken.focus();
}

function updateTokenUi(hasToken) {
  els.tokenStatus.textContent = hasToken ? 'Token saved locally' : 'No token saved';
  els.tokenPanel.classList.toggle('hidden', hasToken);
  els.adminPanel.classList.toggle('hidden', !hasToken);
  els.clearTokenButton.classList.toggle('hidden', !hasToken);
}

function setActiveTab(tabName, { forceReloadAds = true } = {}) {
  const requestedTab = tabName || DEFAULT_TAB;
  activeTab = ['dashboard', 'songs', 'events', 'ads', 'archive', 'edit'].includes(requestedTab) ? requestedTab : DEFAULT_TAB;
  els.tabButtons.forEach((button) => {
    const isActive = button.dataset.tab === activeTab;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-current', isActive ? 'page' : 'false');
  });

  [
    ['dashboard', els.dashboardView],
    ['songs', els.songsView],
    ['events', els.eventsView],
    ['ads', els.adsView],
    ['archive', els.archiveView],
    ['edit', els.editView]
  ].forEach(([name, view]) => {
    view.classList.toggle('hidden', name !== activeTab);
  });

  if (activeTab === 'ads' && forceReloadAds) {
    loadAds();
  }

  if (activeTab === 'events' && !events.length) {
    loadEvents();
  }
}

async function adminFetch(url, options = {}) {
  const token = getToken();

  if (!token) {
    throw new Error('Enter and save an admin token first.');
  }

  const headers = {
    'x-admin-token': token,
    ...(options.headers || {})
  };

  const response = await fetch(url, {
    ...options,
    headers
  });

  const responseText = await response.text();
  let data = null;

  if (responseText) {
    try {
      data = JSON.parse(responseText);
    } catch {
      data = responseText;
    }
  }

  if (!response.ok) {
    const message = getApiErrorMessage(data, response.statusText, response.status);
    const error = new Error(message);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

function getApiErrorMessage(data, fallback, status) {
  const fallbackMessage = status === 401
    ? 'Unauthorized. Check admin token.'
    : fallback || 'API request failed.';

  if (!data) {
    return fallbackMessage;
  }

  if (typeof data === 'string') {
    return data;
  }

  const parsedBody = parseJsonMaybe(data.body);

  if (typeof data.error === 'string' && data.error.trim()) {
    return data.error;
  }

  if (typeof parsedBody?.error === 'string' && parsedBody.error.trim()) {
    return parsedBody.error;
  }

  const backendDetails = [
    data.message,
    data.detail,
    data.details,
    data.field,
    parsedBody?.message,
    parsedBody?.detail,
    parsedBody?.details,
    parsedBody?.field
  ]
    .filter(Boolean)
    .map((detail) => (typeof detail === 'string' ? detail : JSON.stringify(detail)));

  return backendDetails.length ? backendDetails.join(' | ') : fallbackMessage;
}

function parseJsonMaybe(value) {
  if (typeof value !== 'string') {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function getBackendErrorField(data) {
  if (!data || typeof data === 'string') {
    return '';
  }

  if (typeof data.error === 'string' && data.error.trim()) {
    return data.error;
  }

  const parsedBody = parseJsonMaybe(data.body);

  if (typeof parsedBody?.error === 'string' && parsedBody.error.trim()) {
    return parsedBody.error;
  }

  return '';
}

async function loadEvents() {
  const limit = getSelectedEventLimit();
  const url = `${EVENTS_API_BASE_URL}?limit=${encodeURIComponent(limit)}`;

  setBusy(els.refreshEventsButton, true);
  els.eventsStatus.textContent = `Loading latest ${limit} events…`;

  try {
    await ensureSongsLoadedForEvents();
    const data = await adminFetch(url);
    events = normalizeEventsResponse(data);
    renderEvents();
    showMessage(`Loaded ${events.length} event${events.length === 1 ? '' : 's'}.`, 'success');
  } catch (error) {
    events = [];
    renderEvents(error.message);
    showMessage(`Could not load events: ${error.message}`, 'error');
  } finally {
    setBusy(els.refreshEventsButton, false);
  }
}

async function ensureSongsLoadedForEvents() {
  if (songs.length && Object.keys(songsByKey).length) {
    return;
  }

  els.eventsStatus.textContent = 'Loading songs before latest events…';
  await fetchSongsData({ preserveSelection: Boolean(selectedSongKey) });
  renderDashboard();
  renderSongList();
  renderArchiveList();
}

function getSelectedEventLimit() {
  const selectedLimit = Number(els.eventLimit.value || 100);
  return [25, 50, 100, 200].includes(selectedLimit) ? selectedLimit : 100;
}

function normalizeEventsResponse(data) {
  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data?.events)) {
    return data.events;
  }

  if (Array.isArray(data?.items)) {
    return data.items;
  }

  if (Array.isArray(data?.rows)) {
    return data.rows;
  }

  if (Array.isArray(data?.body)) {
    return data.body;
  }

  if (typeof data?.body === 'string') {
    try {
      return normalizeEventsResponse(JSON.parse(data.body));
    } catch {
      return [];
    }
  }

  return [];
}

function renderEvents(errorMessage = '') {
  els.eventsTableBody.innerHTML = '';

  if (errorMessage) {
    els.eventsStatus.textContent = errorMessage;
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="9" class="song-meta">Could not load events.</td>';
    els.eventsTableBody.appendChild(row);
    return;
  }

  els.eventsStatus.textContent = events.length
    ? `${events.length} event${events.length === 1 ? '' : 's'} loaded. Newest first.`
    : 'No events loaded';

  if (!events.length) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="9" class="song-meta">No events returned.</td>';
    els.eventsTableBody.appendChild(row);
    return;
  }

  events.forEach((event) => {
    const matchedSong = getEventMatchedSong(event);
    const row = document.createElement('tr');
    row.appendChild(makeTextCell(formatDateTime(event.created_at || event.event_time || event.timestamp), 'event-time'));
    row.appendChild(buildEventTypeCell(event.event_type));
    row.appendChild(buildEventSongCell(event, matchedSong));
    row.appendChild(makeTextCell(event.artist || event.artist_name || matchedSong?.artist || '—'));
    row.appendChild(makeTextCell(formatDisplayValue(event.device || event.device_type || event.platform || '—')));
    row.appendChild(makeTextCell(formatNumberOrDash(event.seconds_played ?? event.played_seconds ?? event.duration_seconds)));
    row.appendChild(makeTextCell(formatCompletionPercent(event.completion_percent ?? event.completion_pct ?? event.completion)));
    row.appendChild(buildProductUrlCell(event.product_url));
    row.appendChild(makeTextCell(event.session_id || event.sessionId || '—', 'song-key-inline'));
    els.eventsTableBody.appendChild(row);
  });
}

function buildEventTypeCell(eventType) {
  const cell = document.createElement('td');
  const badge = document.createElement('span');
  badge.className = `event-badge event-badge-${sanitizeClassName(eventType)}`;
  badge.textContent = formatEventType(eventType);
  cell.appendChild(badge);
  return cell;
}

function buildProductUrlCell(productUrl) {
  const cell = document.createElement('td');
  const normalizedUrl = String(productUrl || '').trim();

  if (!normalizedUrl) {
    cell.textContent = '—';
    return cell;
  }

  const link = document.createElement('a');
  link.className = 'song-action-button event-product-link';
  link.href = normalizedUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'Product';
  cell.appendChild(link);
  return cell;
}

function buildEventSongCell(event, matchedSong = null) {
  const cell = document.createElement('td');
  const titleText = formatEventSongTitle(event, matchedSong);
  const metaText = formatEventSongMeta(event, matchedSong);
  const songForArtwork = getEventArtworkSource(event, matchedSong);

  const wrap = document.createElement('div');
  wrap.className = 'event-song-cell';

  const image = document.createElement('img');
  image.className = 'event-song-thumb';
  configureSongArtworkImage(image, songForArtwork, `Artwork for ${titleText}`);

  const meta = document.createElement('div');
  meta.className = 'event-song-meta';

  const title = document.createElement('strong');
  title.textContent = titleText;

  meta.appendChild(title);

  if (metaText) {
    const detail = document.createElement('span');
    detail.textContent = metaText;
    meta.appendChild(detail);
  }

  wrap.append(image, meta);
  cell.appendChild(wrap);
  return cell;
}

function getEventMatchedSong(event) {
  const songKey = getEventSongKey(event);
  return songKey ? songsByKey[songKey] || null : null;
}

function getEventArtworkSource(event, matchedSong = null) {
  const directArtworkUrl = firstNonEmptyString([
    event?.song_artwork_url,
    event?.resolved_artwork_url,
    matchedSong?.resolved_artwork_url,
    matchedSong?.song_artwork_url
  ]);

  if (directArtworkUrl) {
    return { resolved_artwork_url: directArtworkUrl };
  }

  const videoLink = firstNonEmptyString([event?.video_link, matchedSong?.video_link]);

  if (videoLink) {
    return { video_link: videoLink };
  }

  return {};
}

function firstNonEmptyString(values) {
  return values
    .map((value) => String(value || '').trim())
    .find(Boolean) || '';
}

function getEventSongKey(event) {
  return firstNonEmptyString([event?.song_key, event?.songKey, event?.song_id, event?.songId]);
}

function formatEventSongMeta(event, matchedSong = null) {
  return event.artist || event.artist_name || matchedSong?.artist || getEventSongKey(event) || '';
}

function formatEventSongTitle(event, matchedSong = null) {
  return event.display_title || event.song_name || matchedSong?.display_title || matchedSong?.song_name || getEventSongKey(event) || '—';
}

function formatEventType(eventType) {
  return String(eventType || 'unknown').replace(/_/g, ' ');
}

function sanitizeClassName(value) {
  return String(value || 'unknown').toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
}

function formatDateTime(value) {
  if (!value) {
    return '—';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString();
}

function formatNumberOrDash(value) {
  if (value === null || value === undefined || value === '') {
    return '—';
  }

  const number = Number(value);
  return Number.isFinite(number) ? formatNumber(number) : String(value);
}

function formatCompletionPercent(value) {
  if (value === null || value === undefined || value === '') {
    return '—';
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return String(value);
  }

  const percent = number > 0 && number <= 1 ? number * 100 : number;
  return `${Math.round(percent)}%`;
}


async function loadDashboardData({ silent = false, preserveSelection = Boolean(selectedSongKey) } = {}) {
  const tabBeforeRefresh = activeTab;
  setBusy(els.refreshDashboardButton, true);
  setBusy(els.refreshSongsButton, true);
  setBusy(els.refreshArchiveButton, true);

  const [songsResult, statsResult, productStatsResult, songStatsResult, referrerStatsResult, deviceStatsResult] = await Promise.allSettled([
    fetchSongsData({ preserveSelection }),
    fetchStatsSummaryData(),
    fetchProductStatsData(),
    fetchSongStatsData(),
    fetchReferrerStatsData(),
    fetchDeviceStatsData()
  ]);

  if (songsResult.status === 'rejected') {
    showMessage(`Could not load song list: ${songsResult.reason.message}`, 'error');
  }

  if (statsResult.status === 'rejected') {
    statsSummary = null;
    statsSummaryError = statsResult.reason.message;
    showMessage(`Could not load stats summary: ${statsSummaryError}`, 'error');
  }

  if (productStatsResult.status === 'rejected') {
    productStats = null;
    productStatsError = productStatsResult.reason.message;
    showMessage(`Could not load product stats: ${productStatsError}`, 'error');
  }

  if (songStatsResult.status === 'rejected') {
    songStats = null;
    songStatsError = songStatsResult.reason.message;
    showMessage(`Could not load song analytics: ${songStatsError}`, 'error');
  }

  if (referrerStatsResult.status === 'rejected') {
    referrerStats = null;
    referrerStatsError = referrerStatsResult.reason.message;
    showMessage(`Could not load referrer stats: ${referrerStatsError}`, 'error');
  }

  if (deviceStatsResult.status === 'rejected') {
    deviceStats = null;
    deviceStatsError = deviceStatsResult.reason.message;
    showMessage(`Could not load device stats: ${deviceStatsError}`, 'error');
  }

  renderDashboard();
  renderSongList();
  renderArchiveList();
  preserveActiveTabAfterAsyncRefresh(tabBeforeRefresh);

  if (events.length) {
    renderEvents();
  }

  if (!silent && songsResult.status === 'fulfilled' && statsResult.status === 'fulfilled' && productStatsResult.status === 'fulfilled' && songStatsResult.status === 'fulfilled' && referrerStatsResult.status === 'fulfilled' && deviceStatsResult.status === 'fulfilled') {
    showMessage(`Loaded dashboard stats plus ${getActiveSongs().length} active and ${getArchivedSongs().length} archived song${songs.length === 1 ? '' : 's'}.`, 'success');
  }

  setBusy(els.refreshDashboardButton, false);
  setBusy(els.refreshSongsButton, false);
  setBusy(els.refreshArchiveButton, false);
}

function preserveActiveTabAfterAsyncRefresh(tabName) {
  if (!tabName || tabName !== activeTab) {
    return;
  }

  setActiveTab(tabName, { forceReloadAds: false });

  if (tabName === 'ads') {
    loadAds({ preserveEditor: true });
  }
}

async function fetchSongsData({ preserveSelection = Boolean(selectedSongKey) } = {}) {
  const previousSelectedSongKey = preserveSelection ? selectedSongKey : '';
  const data = await adminFetch(API_BASE_URL);
  songs = normalizeSongsResponse(data);
  songsByKey = buildSongsByKey(songs);

  if (previousSelectedSongKey) {
    preserveSelectedSong(previousSelectedSongKey);
  }

  return songs;
}

async function fetchStatsSummaryData() {
  const data = await adminFetch(STATS_SUMMARY_API_URL);
  statsSummary = normalizeStatsSummaryResponse(data);
  statsSummaryError = '';
  return statsSummary;
}

async function fetchProductStatsData() {
  const data = await adminFetch(PRODUCT_STATS_API_URL);
  productStats = normalizeProductStatsResponse(data);
  productStatsError = '';
  return productStats;
}

async function fetchSongStatsData() {
  const data = await adminFetch(SONG_STATS_API_URL);
  songStats = normalizeSongStatsResponse(data);
  songStatsError = '';
  return songStats;
}

async function fetchReferrerStatsData() {
  const data = await adminFetch(REFERRER_STATS_API_URL);
  referrerStats = normalizeReferrerStatsResponse(data);
  referrerStatsError = '';
  return referrerStats;
}

async function fetchDeviceStatsData() {
  const data = await adminFetch(DEVICE_STATS_API_URL);
  deviceStats = normalizeDeviceStatsResponse(data);
  deviceStatsError = '';
  return deviceStats;
}

function normalizeSongStatsResponse(data) {
  if (typeof data?.body === 'string') {
    try {
      return normalizeSongStatsResponse(JSON.parse(data.body));
    } catch {
      return { success: false, count: 0, limit: 100, songs: [], generated_at: '' };
    }
  }

  return {
    success: Boolean(data?.success),
    count: Number(data?.count || 0),
    limit: Number(data?.limit || 100),
    songs: Array.isArray(data?.songs) ? data.songs : [],
    generated_at: data?.generated_at || ''
  };
}

function normalizeReferrerStatsResponse(data) {
  if (typeof data?.body === 'string') {
    try {
      return normalizeReferrerStatsResponse(JSON.parse(data.body));
    } catch {
      return { summary: {}, referrers: [], recent_events: [], generated_at: '' };
    }
  }

  return {
    summary: data?.summary || {},
    referrers: Array.isArray(data?.referrers) ? data.referrers : [],
    recent_events: Array.isArray(data?.recent_events) ? data.recent_events : [],
    generated_at: data?.generated_at || ''
  };
}

function normalizeDeviceStatsResponse(data) {
  if (typeof data?.body === 'string') {
    try {
      return normalizeDeviceStatsResponse(JSON.parse(data.body));
    } catch {
      return { summary: {}, devices: [], recent_events: [], generated_at: '' };
    }
  }

  return {
    summary: data?.summary || {},
    devices: Array.isArray(data?.devices) ? data.devices : [],
    recent_events: Array.isArray(data?.recent_events) ? data.recent_events : [],
    generated_at: data?.generated_at || ''
  };
}

function normalizeProductStatsResponse(data) {
  if (typeof data?.body === 'string') {
    try {
      return normalizeProductStatsResponse(JSON.parse(data.body));
    } catch {
      return { summary: {}, products: [], recent_clicks: [], generated_at: '' };
    }
  }

  return {
    summary: data?.summary || {},
    products: Array.isArray(data?.products) ? data.products : [],
    recent_clicks: Array.isArray(data?.recent_clicks) ? data.recent_clicks : [],
    generated_at: data?.generated_at || ''
  };
}

function normalizeStatsSummaryResponse(data) {
  if (typeof data?.body === 'string') {
    try {
      return normalizeStatsSummaryResponse(JSON.parse(data.body));
    } catch {
      return { summary: {}, today: {}, devices: [], event_types: [], generated_at: '' };
    }
  }

  return {
    summary: data?.summary || {},
    today: data?.today || {},
    devices: Array.isArray(data?.devices) ? data.devices : [],
    event_types: Array.isArray(data?.event_types) ? data.event_types : [],
    generated_at: data?.generated_at || ''
  };
}

async function loadSongs({ silent = false, preserveSelection = Boolean(selectedSongKey) } = {}) {
  setBusy(els.refreshSongsButton, true);
  setBusy(els.refreshArchiveButton, true);

  try {
    await fetchSongsData({ preserveSelection });
    renderDashboard();
    renderSongList();
    renderArchiveList();

    if (events.length) {
      renderEvents();
    }

    if (!silent) {
      showMessage(`Loaded ${getActiveSongs().length} active and ${getArchivedSongs().length} archived song${songs.length === 1 ? '' : 's'}.`, 'success');
    }
  } catch (error) {
    showMessage(`Could not load song list: ${error.message}`, 'error');
  } finally {
    setBusy(els.refreshSongsButton, false);
    setBusy(els.refreshArchiveButton, false);
  }
}

function preserveSelectedSong(songKey) {
  const refreshedSong = songs.find((song) => getSongKey(song) === songKey);

  if (!refreshedSong) {
    selectedSong = null;
    selectedSongKey = '';
    clearEditor();
    return;
  }

  selectedSong = refreshedSong;
  selectedSongKey = getSongKey(refreshedSong);

  if (!els.editForm.classList.contains('hidden')) {
    populateEditor(refreshedSong);
  }
}

function buildSongsByKey(songList) {
  return songList.reduce((lookup, song) => {
    const songKey = getSongKey(song);

    if (songKey) {
      lookup[songKey] = song;
    }

    return lookup;
  }, {});
}

function normalizeSongsResponse(data) {
  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data?.songs)) {
    return data.songs;
  }

  if (Array.isArray(data?.items)) {
    return data.items;
  }

  if (Array.isArray(data?.body)) {
    return data.body;
  }

  if (typeof data?.body === 'string') {
    try {
      const parsedBody = JSON.parse(data.body);
      return normalizeSongsResponse(parsedBody);
    } catch {
      return [];
    }
  }

  return [];
}


function getActiveSongs() {
  return songs.filter((song) => !isArchivedSong(song));
}

function getArchivedSongs() {
  archivedSongs = songs.filter((song) => isArchivedSong(song));
  return archivedSongs;
}

function isArchivedSong(songOrValue) {
  return normalizePublicVisibility(getPublicVisibilityValue(songOrValue)) === 'archived';
}

function renderDashboard() {
  const activeSongs = getActiveSongs();
  renderStatsSummaryWarning();
  renderStatsGeneratedAt();
  renderKpiCards(calculateDashboardTotals(activeSongs));
  renderProductAnalytics();
  renderReferrerAnalytics();
  renderDeviceAnalytics();
  renderSongAnalytics();
  renderTodayStats();
  renderDevicesStats();
  renderEventTypesStats();
  renderTopSongsTable(sortSongsByMetric('total_plays', activeSongs));
  renderRankList(els.likedSongsList, sortSongsByMetric('likes', activeSongs).slice(0, 5), 'likes');
  renderRankList(els.sharedSongsList, sortSongsByMetric('shares', activeSongs).slice(0, 5), 'shares');
  renderRankList(els.watchedVideosList, sortSongsByMetric('video_clicks', activeSongs), 'video clicks');
  renderRankList(els.productClicksList, sortSongsByMetric('product_clicks', activeSongs), 'product clicks');
  renderRankList(els.engagementList, sortSongsByEngagement(activeSongs).slice(0, 5), 'engagement', getSongEngagement);
  renderRankList(els.skipRateList, sortSongsBySkipRate(activeSongs), 'skip rate', getSongSkipRate, formatPercent);
}

function calculateDashboardTotals(songList) {
  const summary = statsSummary?.summary;

  if (summary) {
    return kpiDefinitions.reduce((totals, metric) => {
      totals[metric.key] = Number(summary[metric.key] || 0);
      return totals;
    }, {});
  }

  return {
    total_events: 0,
    events_last_24h: 0,
    events_last_7d: 0,
    play_starts: songList.reduce((sum, song) => sum + getMetricValue(song, 'total_plays'), 0),
    full_plays: songList.reduce((sum, song) => sum + getMetricValue(song, 'full_plays'), 0),
    partial_plays: songList.reduce((sum, song) => sum + getMetricValue(song, 'partial_plays'), 0),
    skips: songList.reduce((sum, song) => sum + getMetricValue(song, 'skip_count'), 0),
    likes: songList.reduce((sum, song) => sum + getMetricValue(song, 'likes'), 0),
    shares: songList.reduce((sum, song) => sum + getMetricValue(song, 'shares'), 0),
    video_clicks: songList.reduce((sum, song) => sum + getMetricValue(song, 'video_clicks'), 0),
    product_clicks: songList.reduce((sum, song) => sum + getMetricValue(song, 'product_clicks'), 0),
    total_seconds_played: songList.reduce((sum, song) => sum + getMetricValue(song, 'total_seconds_played'), 0),
    average_seconds_played: 0,
    average_completion_percent: 0
  };
}

function renderKpiCards(totals) {
  els.kpiGrid.innerHTML = '';

  kpiDefinitions.forEach((metric) => {
    const card = document.createElement('article');
    card.className = 'kpi-card';
    card.innerHTML = '<span class="kpi-label"></span><strong class="kpi-value"></strong>';
    card.querySelector('.kpi-label').textContent = metric.label;
    card.querySelector('.kpi-value').textContent = formatSummaryMetric(totals[metric.key], metric.formatter);
    els.kpiGrid.appendChild(card);
  });
}

function renderProductAnalytics() {
  renderProductStatsWarning();
  renderProductStatsGeneratedAt();
  renderProductKpiCards();
  renderTopProductsTable();
  renderRecentProductClicksTable();
}

function renderProductStatsWarning() {
  if (!els.productStatsWarning) {
    return;
  }

  els.productStatsWarning.classList.toggle('hidden', !productStatsError);
  els.productStatsWarning.textContent = productStatsError
    ? `Product stats warning: ${productStatsError}`
    : '';
}

function renderProductStatsGeneratedAt() {
  if (!els.productStatsGeneratedAt) {
    return;
  }

  els.productStatsGeneratedAt.textContent = productStats?.generated_at
    ? `Product stats generated: ${formatDateTime(productStats.generated_at)}`
    : 'Product stats generated: —';
}

function renderProductKpiCards() {
  if (!els.productKpiGrid) {
    return;
  }

  renderSummaryStatCards(els.productKpiGrid, productKpiDefinitions, productStats?.summary || {});
}

function renderTopProductsTable() {
  if (!els.topProductsTableBody) {
    return;
  }

  els.topProductsTableBody.innerHTML = '';
  const products = productStats?.products || [];

  if (!products.length) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="6" class="song-meta">No product clicks returned.</td>';
    els.topProductsTableBody.appendChild(row);
    return;
  }

  products.forEach((product) => {
    const productUrl = product.product_url || '';
    const songTitles = normalizeTextArray(product.song_titles).join(', ');
    const row = document.createElement('tr');
    row.appendChild(buildProductTitleCell(productUrl));
    row.appendChild(makeTextCell(formatNumber(product.click_count)));
    row.appendChild(makeTextCell(formatNumber(product.unique_sessions)));
    row.appendChild(makeTruncatedTextCell(songTitles || '—', 'related-songs-cell'));
    row.appendChild(makeTextCell(formatDateTime(product.last_clicked_at), 'event-time'));
    row.appendChild(buildOpenProductCell(productUrl));
    els.topProductsTableBody.appendChild(row);
  });
}

function renderRecentProductClicksTable() {
  if (!els.recentProductClicksTableBody) {
    return;
  }

  els.recentProductClicksTableBody.innerHTML = '';
  const recentClicks = productStats?.recent_clicks || [];

  if (!recentClicks.length) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="6" class="song-meta">No recent product clicks returned.</td>';
    els.recentProductClicksTableBody.appendChild(row);
    return;
  }

  recentClicks.forEach((click) => {
    const productUrl = click.product_url || '';
    const row = document.createElement('tr');
    row.appendChild(makeTextCell(formatDateTime(click.created_at), 'event-time'));
    row.appendChild(makeTextCell(click.song_title || click.song_key || '—'));
    row.appendChild(makeTextCell(click.artist || '—'));
    row.appendChild(makeTextCell(formatDisplayValue(click.device_type || '—')));
    row.appendChild(buildProductTitleCell(productUrl));
    row.appendChild(buildOpenProductCell(productUrl));
    els.recentProductClicksTableBody.appendChild(row);
  });
}



function renderReferrerAnalytics() {
  renderReferrerStatsWarning();
  renderReferrerStatsGeneratedAt();
  renderReferrerKpiCards();
  renderTopReferrersTable();
  renderRecentReferrerEventsTable();
}

function renderReferrerStatsWarning() {
  if (!els.referrerStatsWarning) {
    return;
  }

  els.referrerStatsWarning.classList.toggle('hidden', !referrerStatsError);
  els.referrerStatsWarning.textContent = referrerStatsError
    ? `Referrer stats warning: ${referrerStatsError}`
    : '';
}

function renderReferrerStatsGeneratedAt() {
  if (!els.referrerStatsGeneratedAt) {
    return;
  }

  els.referrerStatsGeneratedAt.textContent = referrerStats?.generated_at
    ? `Referrer stats generated: ${formatDateTime(referrerStats.generated_at)}`
    : 'Referrer stats generated: —';
}

function renderReferrerKpiCards() {
  if (!els.referrerKpiGrid) {
    return;
  }

  renderSummaryStatCards(els.referrerKpiGrid, referrerKpiDefinitions, referrerStats?.summary || {});
}

function renderTopReferrersTable() {
  if (!els.topReferrersTableBody) {
    return;
  }

  els.topReferrersTableBody.innerHTML = '';
  const referrers = Array.isArray(referrerStats?.referrers) ? referrerStats.referrers : [];

  if (!referrers.length) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="12" class="song-meta">No referrer stats returned.</td>';
    els.topReferrersTableBody.appendChild(row);
    return;
  }

  referrers.forEach((referrer) => {
    const row = document.createElement('tr');
    row.appendChild(buildReferrerCell(referrer.referrer));
    row.appendChild(makeTextCell(formatNumber(referrer.event_count)));
    row.appendChild(makeTextCell(formatNumber(referrer.play_starts)));
    row.appendChild(makeTextCell(formatNumber(referrer.full_plays)));
    row.appendChild(makeTextCell(formatNumber(referrer.partial_plays)));
    row.appendChild(makeTextCell(formatNumber(referrer.skips)));
    row.appendChild(makeTextCell(formatNumber(referrer.likes)));
    row.appendChild(makeTextCell(formatNumber(referrer.shares)));
    row.appendChild(makeTextCell(formatNumber(referrer.video_clicks)));
    row.appendChild(makeTextCell(formatNumber(referrer.product_clicks)));
    row.appendChild(makeTextCell(formatNumber(referrer.unique_sessions)));
    row.appendChild(makeTextCell(formatDateTime(referrer.last_seen_at), 'event-time'));
    els.topReferrersTableBody.appendChild(row);
  });
}

function renderRecentReferrerEventsTable() {
  if (!els.recentReferrerEventsTableBody) {
    return;
  }

  els.recentReferrerEventsTableBody.innerHTML = '';
  const recentEvents = Array.isArray(referrerStats?.recent_events) ? referrerStats.recent_events : [];

  if (!recentEvents.length) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="7" class="song-meta">No recent referrer events returned.</td>';
    els.recentReferrerEventsTableBody.appendChild(row);
    return;
  }

  recentEvents.forEach((event) => {
    const row = document.createElement('tr');
    row.appendChild(makeTextCell(formatDateTime(event.created_at), 'event-time'));
    row.appendChild(buildReferrerCell(event.referrer));
    row.appendChild(buildEventTypeCell(event.event_type));
    row.appendChild(makeTextCell(event.song_title || event.song_key || '—'));
    row.appendChild(makeTextCell(event.artist || '—'));
    row.appendChild(makeTextCell(formatDisplayValue(event.device_type || '—')));
    row.appendChild(buildReferrerProductCell(event.product_url));
    els.recentReferrerEventsTableBody.appendChild(row);
  });
}

function buildReferrerCell(referrer) {
  const cell = document.createElement('td');
  cell.className = 'referrer-cell';
  const label = formatReferrerDisplay(referrer);
  const span = document.createElement('span');
  span.className = isDirectOrUnknownReferrer(referrer) ? 'referrer-direct' : 'referrer-label';
  span.textContent = label;
  span.title = String(referrer || label);
  cell.appendChild(span);
  return cell;
}

function buildReferrerProductCell(productUrl) {
  const cell = document.createElement('td');
  const normalizedUrl = String(productUrl || '').trim();

  if (!normalizedUrl) {
    cell.textContent = '—';
    return cell;
  }

  const link = document.createElement('a');
  link.className = 'song-action-button event-product-link';
  link.href = normalizedUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'Product';
  cell.appendChild(link);
  return cell;
}

function formatReferrerDisplay(referrer) {
  const normalizedReferrer = String(referrer || '').trim();

  if (isDirectOrUnknownReferrer(normalizedReferrer)) {
    return 'Direct / Unknown';
  }

  try {
    const url = new URL(normalizedReferrer);
    const path = `${url.pathname || '/'}${url.search || ''}`;
    const readablePath = path === '/' ? '' : ` ${path}`;
    return `${url.hostname}${readablePath}`;
  } catch {
    return normalizedReferrer;
  }
}

function isDirectOrUnknownReferrer(referrer) {
  const normalizedReferrer = String(referrer || '').trim().toLowerCase();
  return !normalizedReferrer
    || normalizedReferrer === 'direct / unknown'
    || normalizedReferrer === 'direct'
    || normalizedReferrer === 'unknown'
    || normalizedReferrer === 'null'
    || normalizedReferrer === '(direct)';
}


function renderDeviceAnalytics() {
  renderDeviceStatsWarning();
  renderDeviceStatsGeneratedAt();
  renderDeviceKpiCards();
  renderDeviceBreakdownTable();
  renderRecentDeviceEventsTable();
}

function renderDeviceStatsWarning() {
  if (!els.deviceStatsWarning) {
    return;
  }

  els.deviceStatsWarning.classList.toggle('hidden', !deviceStatsError);
  els.deviceStatsWarning.textContent = deviceStatsError
    ? `Device stats warning: ${deviceStatsError}`
    : '';
}

function renderDeviceStatsGeneratedAt() {
  if (!els.deviceStatsGeneratedAt) {
    return;
  }

  els.deviceStatsGeneratedAt.textContent = deviceStats?.generated_at
    ? `Device stats generated: ${formatDateTime(deviceStats.generated_at)}`
    : 'Device stats generated: —';
}

function renderDeviceKpiCards() {
  if (!els.deviceKpiGrid) {
    return;
  }

  renderSummaryStatCards(els.deviceKpiGrid, deviceKpiDefinitions, deviceStats?.summary || {});
}

function renderDeviceBreakdownTable() {
  if (!els.deviceBreakdownTableBody) {
    return;
  }

  els.deviceBreakdownTableBody.innerHTML = '';
  const devices = Array.isArray(deviceStats?.devices) ? deviceStats.devices : [];

  if (!devices.length) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="14" class="song-meta">No device stats returned.</td>';
    els.deviceBreakdownTableBody.appendChild(row);
    return;
  }

  devices.forEach((device) => {
    const row = document.createElement('tr');
    row.appendChild(makeTextCell(formatDisplayValue(device.device_type || 'unknown')));
    row.appendChild(makeTextCell(formatNumber(device.event_count)));
    row.appendChild(makeTextCell(formatNumber(device.play_starts)));
    row.appendChild(makeTextCell(formatNumber(device.full_plays)));
    row.appendChild(makeTextCell(formatNumber(device.partial_plays)));
    row.appendChild(makeTextCell(formatNumber(device.skips)));
    row.appendChild(makeTextCell(formatNumber(device.likes)));
    row.appendChild(makeTextCell(formatNumber(device.shares)));
    row.appendChild(makeTextCell(formatNumber(device.video_clicks)));
    row.appendChild(makeTextCell(formatNumber(device.product_clicks)));
    row.appendChild(makeTextCell(formatNumber(device.unique_sessions)));
    row.appendChild(makeTextCell(formatAverageSeconds(device.average_seconds_played)));
    row.appendChild(makeTextCell(formatPercentValue(device.average_completion_percent)));
    row.appendChild(makeTextCell(formatDateTime(device.last_seen_at), 'event-time'));
    els.deviceBreakdownTableBody.appendChild(row);
  });
}

function renderRecentDeviceEventsTable() {
  if (!els.recentDeviceEventsTableBody) {
    return;
  }

  els.recentDeviceEventsTableBody.innerHTML = '';
  const recentEvents = Array.isArray(deviceStats?.recent_events) ? deviceStats.recent_events : [];

  if (!recentEvents.length) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="7" class="song-meta">No recent device events returned.</td>';
    els.recentDeviceEventsTableBody.appendChild(row);
    return;
  }

  recentEvents.forEach((event) => {
    const row = document.createElement('tr');
    row.appendChild(makeTextCell(formatDateTime(event.created_at), 'event-time'));
    row.appendChild(makeTextCell(formatDisplayValue(event.device_type || 'unknown')));
    row.appendChild(buildEventTypeCell(event.event_type));
    row.appendChild(makeTextCell(event.song_title || event.song_key || '—'));
    row.appendChild(makeTextCell(event.artist || '—'));
    row.appendChild(buildReferrerCell(event.referrer));
    row.appendChild(buildProductUrlCell(event.product_url));
    els.recentDeviceEventsTableBody.appendChild(row);
  });
}


function buildProductTitleCell(productUrl) {
  const cell = document.createElement('td');
  cell.className = 'product-title-cell';

  const title = formatProductTitle(productUrl);
  const wrap = document.createElement('div');
  wrap.className = 'product-cell-with-image';

  const image = document.createElement('img');
  image.className = 'product-thumb dashboard-art-thumb image-preview-trigger';
  image.src = STASHBOX_PLACEHOLDER_ARTWORK;
  image.alt = title === '—' ? 'Product image placeholder' : `Product image for ${title}`;
  image.loading = 'lazy';
  image.decoding = 'async';
  image.tabIndex = 0;
  image.dataset.previewReady = 'false';
  image.dataset.previewBroken = 'false';
  image.addEventListener('load', () => {
    if (image.dataset.loadingProductImage === 'true') {
      image.dataset.previewReady = 'true';
      image.dataset.previewBroken = 'false';
      image.dataset.previewSrc = image.currentSrc || image.src;
      image.dataset.loadingProductImage = 'false';
    }
  });
  image.addEventListener('error', () => {
    image.dataset.previewReady = 'false';
    image.dataset.previewBroken = 'true';
    image.dataset.loadingProductImage = 'false';
    hideImagePreview(true);

    if (image.src !== STASHBOX_PLACEHOLDER_ARTWORK) {
      image.src = STASHBOX_PLACEHOLDER_ARTWORK;
    } else {
      image.hidden = true;
    }
  });
  attachImagePreviewHandlers(image);

  const meta = document.createElement('div');
  meta.className = 'product-cell-meta';

  const titleEl = document.createElement('strong');
  titleEl.textContent = title;

  const hostEl = document.createElement('span');
  hostEl.textContent = getProductHost(productUrl);

  meta.append(titleEl, hostEl);
  wrap.append(image, meta);
  cell.appendChild(wrap);

  getProductImageUrl(productUrl).then((imageUrl) => {
    if (imageUrl && imageUrl !== STASHBOX_PLACEHOLDER_ARTWORK) {
      image.hidden = false;
      image.dataset.loadingProductImage = 'true';
      image.dataset.previewBroken = 'false';
      image.src = imageUrl;
    }
  });

  return cell;
}

function attachImagePreviewHandlers(image, { enableClickToggle = true } = {}) {
  image.addEventListener('mouseenter', (event) => {
    imagePreviewPinned = false;
    showImagePreview(image, event);
  });
  image.addEventListener('mousemove', (event) => {
    if (!imagePreviewPinned) {
      updateImagePreviewPosition(event.clientX, event.clientY);
    }
  });
  image.addEventListener('mouseleave', () => {
    if (!imagePreviewPinned) {
      hideImagePreview();
    }
  });
  image.addEventListener('focus', () => {
    imagePreviewPinned = false;
    showImagePreview(image);
  });
  image.addEventListener('blur', () => {
    hideImagePreview(true);
  });
  if (enableClickToggle) {
    image.addEventListener('click', (event) => {
      if (!canShowImagePreview(image)) {
        return;
      }

      if (activeImagePreviewThumb === image && imagePreviewPinned) {
        hideImagePreview(true);
        return;
      }

      imagePreviewPinned = true;
      showImagePreview(image, event);
    });
  }
  image.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      hideImagePreview(true);
      image.blur();
    }
  });

  attachImagePreviewDismissListener();
}

function attachImagePreviewDismissListener() {
  if (imagePreviewDismissListenerAttached) {
    return;
  }

  imagePreviewDismissListenerAttached = true;
  document.addEventListener('pointerdown', (event) => {
    if (!imagePreviewPinned || event.target.closest('.image-preview-trigger')) {
      return;
    }

    hideImagePreview(true);
  });
}

function canShowImagePreview(image) {
  return Boolean(
    image
    && image.dataset.previewReady === 'true'
    && image.dataset.previewBroken !== 'true'
    && image.dataset.previewSrc
  );
}

function ensureImagePreview() {
  if (imagePreviewEl) {
    return imagePreviewEl;
  }

  const preview = document.createElement('div');
  preview.className = 'image-preview-popup product-image-preview hidden';
  preview.setAttribute('aria-hidden', 'true');

  const previewImage = document.createElement('img');
  previewImage.alt = '';
  previewImage.decoding = 'async';
  preview.appendChild(previewImage);
  document.body.appendChild(preview);
  imagePreviewEl = preview;
  return imagePreviewEl;
}

function showImagePreview(image, event) {
  if (!canShowImagePreview(image)) {
    return;
  }

  const preview = ensureImagePreview();
  const previewImage = preview.querySelector('img');
  previewImage.src = image.dataset.previewSrc;
  activeImagePreviewThumb = image;
  preview.classList.remove('hidden');

  if (event) {
    updateImagePreviewPosition(event.clientX, event.clientY);
  } else {
    const rect = image.getBoundingClientRect();
    updateImagePreviewPosition(rect.right, rect.top + rect.height / 2);
  }
}

function updateImagePreviewPosition(clientX, clientY) {
  if (!imagePreviewEl || imagePreviewEl.classList.contains('hidden')) {
    return;
  }

  const offset = 18;
  const rect = imagePreviewEl.getBoundingClientRect();
  const previewWidth = rect.width || 260;
  const previewHeight = rect.height || 260;
  let left = clientX + offset;
  let top = clientY + offset;

  if (left + previewWidth > window.innerWidth - offset) {
    left = clientX - previewWidth - offset;
  }

  if (top + previewHeight > window.innerHeight - offset) {
    top = window.innerHeight - previewHeight - offset;
  }

  imagePreviewEl.style.left = `${Math.max(offset, left)}px`;
  imagePreviewEl.style.top = `${Math.max(offset, top)}px`;
}

function hideImagePreview(force = false) {
  if (!imagePreviewEl || (!force && imagePreviewPinned)) {
    return;
  }

  imagePreviewEl.classList.add('hidden');
  imagePreviewEl.querySelector('img').removeAttribute('src');
  activeImagePreviewThumb = null;
  imagePreviewPinned = false;
}

function getProductHandle(productUrl) {
  const normalizedUrl = String(productUrl || '').trim();

  if (!normalizedUrl) {
    return '';
  }

  try {
    const url = new URL(normalizedUrl);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const productIndex = pathParts.indexOf('products');
    return productIndex >= 0 ? pathParts[productIndex + 1] || '' : '';
  } catch {
    const pathWithoutQuery = normalizedUrl.split(/[?#]/)[0];
    const pathParts = pathWithoutQuery.split('/').filter(Boolean);
    const productIndex = pathParts.indexOf('products');
    return productIndex >= 0 ? pathParts[productIndex + 1] || '' : '';
  }
}

async function fetchProductByHandle(handle) {
  const normalizedHandle = String(handle || '').trim();

  if (!normalizedHandle) {
    return null;
  }

  if (!productMetadataCache.has(normalizedHandle)) {
    productMetadataCache.set(
      normalizedHandle,
      fetch(`${SHOPIFY_PRODUCT_BASE_URL}/${encodeURIComponent(normalizedHandle)}.js`)
        .then((response) => {
          if (!response.ok) {
            throw new Error(`Shopify product request failed with ${response.status}`);
          }

          return response.json();
        })
    );
  }

  return productMetadataCache.get(normalizedHandle);
}

async function getProductImageUrl(productUrl) {
  const handle = getProductHandle(productUrl);

  if (!handle) {
    return STASHBOX_PLACEHOLDER_ARTWORK;
  }

  try {
    const product = await fetchProductByHandle(handle);
    const imageUrl = product?.featured_image || product?.images?.[0] || '';

    if (!imageUrl) {
      return STASHBOX_PLACEHOLDER_ARTWORK;
    }

    return normalizeProductImageUrl(imageUrl);
  } catch (error) {
    console.warn('Could not load product image', productUrl, error);
    return STASHBOX_PLACEHOLDER_ARTWORK;
  }
}

function normalizeProductImageUrl(imageUrl) {
  const normalizedUrl = String(imageUrl || '').trim();

  if (normalizedUrl.startsWith('//')) {
    return `https:${normalizedUrl}`;
  }

  return normalizedUrl || STASHBOX_PLACEHOLDER_ARTWORK;
}

function getProductHost(productUrl) {
  const normalizedUrl = String(productUrl || '').trim();

  if (!normalizedUrl) {
    return 'stashbox.ai';
  }

  try {
    return new URL(normalizedUrl).hostname || 'stashbox.ai';
  } catch {
    return 'stashbox.ai';
  }
}

function buildOpenProductCell(productUrl) {
  const cell = document.createElement('td');
  const normalizedUrl = String(productUrl || '').trim();

  if (!normalizedUrl) {
    cell.textContent = '—';
    return cell;
  }

  const link = document.createElement('a');
  link.className = 'song-action-button event-product-link';
  link.href = normalizedUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'Open';
  cell.appendChild(link);
  return cell;
}

function makeTruncatedTextCell(text, className = '') {
  const cell = makeTextCell(text, className);
  cell.title = String(text || '');
  return cell;
}

function normalizeTextArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }

  return [];
}

function formatProductTitle(productUrl) {
  const normalizedUrl = String(productUrl || '').trim();

  if (!normalizedUrl) {
    return '—';
  }

  let slug = normalizedUrl;

  try {
    const url = new URL(normalizedUrl);
    const pathParts = url.pathname.split('/').filter(Boolean);
    slug = pathParts[pathParts.length - 1] || url.hostname || normalizedUrl;
  } catch {
    const pathParts = normalizedUrl.split(/[/?#]/)[0].split('/').filter(Boolean);
    slug = pathParts[pathParts.length - 1] || normalizedUrl;
  }

  const title = decodeURIComponent(slug)
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return title
    ? title.replace(/\b\w/g, (letter) => letter.toUpperCase())
    : normalizedUrl;
}


function renderSongAnalytics() {
  renderSongStatsWarning();
  renderSongStatsGeneratedAt();
  renderSongInsightCards();
  renderSongAnalyticsTable();
  updateSongStatsSortControls();
}

function renderSongStatsWarning() {
  if (!els.songStatsWarning) {
    return;
  }

  els.songStatsWarning.classList.toggle('hidden', !songStatsError);
  els.songStatsWarning.textContent = songStatsError
    ? `Song analytics warning: ${songStatsError}`
    : '';
}

function renderSongStatsGeneratedAt() {
  if (!els.songStatsGeneratedAt) {
    return;
  }

  const count = Number(songStats?.count || songStats?.songs?.length || 0);
  const limit = Number(songStats?.limit || 100);
  const generatedAt = songStats?.generated_at ? formatDateTime(songStats.generated_at) : '—';
  els.songStatsGeneratedAt.textContent = `Song stats generated: ${generatedAt} · ${formatNumber(count)} of ${formatNumber(limit)} returned`;
}

function renderSongInsightCards() {
  if (!els.songInsightGrid) {
    return;
  }

  els.songInsightGrid.innerHTML = '';
  const playableSongs = getSongStatsRows().filter((song) => getSongStatNumber(song, 'play_starts') >= 1);
  const insights = [
    { label: 'Highest Completion Rate', key: 'completion_rate' },
    { label: 'Highest Skip Rate', key: 'skip_rate' },
    { label: 'Most Liked Rate', key: 'like_rate' },
    { label: 'Most Product Click Rate', key: 'product_click_rate' },
    { label: 'Most Video Click Rate', key: 'video_click_rate' }
  ];

  insights.forEach((insight) => {
    const song = getTopSongByStat(playableSongs, insight.key);
    const card = document.createElement('article');
    card.className = 'song-insight-card';
    card.innerHTML = '<span class="mini-stat-label"></span><strong class="mini-stat-value"></strong><span class="song-meta"></span>';
    card.querySelector('.mini-stat-label').textContent = insight.label;
    card.querySelector('.mini-stat-value').textContent = song ? formatRatePercent(song[insight.key]) : '—';
    card.querySelector('.song-meta').textContent = song ? `${formatSongTitle(song)} · ${formatNumber(getSongStatNumber(song, 'play_starts'))} plays` : 'No songs with plays yet.';
    els.songInsightGrid.appendChild(card);
  });
}

function getTopSongByStat(songList, statKey) {
  return [...songList].sort((a, b) => getSongStatNumber(b, statKey) - getSongStatNumber(a, statKey))[0] || null;
}

function renderSongAnalyticsTable() {
  if (!els.songAnalyticsTableBody) {
    return;
  }

  els.songAnalyticsTableBody.innerHTML = '';
  const rows = getSortedSongStatsRows();

  if (!rows.length) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="16" class="song-meta">No per-song analytics returned.</td>';
    els.songAnalyticsTableBody.appendChild(row);
    return;
  }

  rows.forEach((song) => {
    const songKey = getSongKey(song);
    const row = document.createElement('tr');
    row.appendChild(buildSongTitleCell(song, songKey, 'compact-title'));
    row.appendChild(makeTextCell(formatNumber(getSongStatNumber(song, 'play_starts'))));
    row.appendChild(makeTextCell(formatNumber(getSongStatNumber(song, 'full_plays'))));
    row.appendChild(makeTextCell(formatNumber(getSongStatNumber(song, 'partial_plays'))));
    row.appendChild(makeTextCell(formatNumber(getSongStatNumber(song, 'skips'))));
    row.appendChild(makeTextCell(formatNumber(getSongStatNumber(song, 'likes'))));
    row.appendChild(makeTextCell(formatNumber(getSongStatNumber(song, 'shares'))));
    row.appendChild(makeTextCell(formatNumber(getSongStatNumber(song, 'video_clicks'))));
    row.appendChild(makeTextCell(formatNumber(getSongStatNumber(song, 'product_clicks'))));
    row.appendChild(makeTextCell(formatRatePercent(song.completion_rate)));
    row.appendChild(makeTextCell(formatRatePercent(song.skip_rate)));
    row.appendChild(makeTextCell(formatRatePercent(song.like_rate)));
    row.appendChild(makeTextCell(formatRatePercent(song.share_rate)));
    row.appendChild(makeTextCell(formatRatePercent(song.product_click_rate)));
    row.appendChild(makeTextCell(formatDateTime(song.last_event_at), 'event-time'));
    row.appendChild(buildQuickLinksCell(songKey));
    els.songAnalyticsTableBody.appendChild(row);
  });
}

function getSongStatsRows() {
  return Array.isArray(songStats?.songs) ? songStats.songs : [];
}

function getSortedSongStatsRows() {
  const directionMultiplier = songStatsSortDirection === 'asc' ? 1 : -1;

  return [...getSongStatsRows()].sort((a, b) => {
    let comparison = 0;

    if (songStatsSortKey === 'last_event_at') {
      comparison = getDateSortValue(a.last_event_at) - getDateSortValue(b.last_event_at);
    } else {
      comparison = getSongStatNumber(a, songStatsSortKey) - getSongStatNumber(b, songStatsSortKey);
    }

    if (comparison !== 0) {
      return comparison * directionMultiplier;
    }

    return String(formatSongTitle(a)).localeCompare(String(formatSongTitle(b)));
  });
}

function getDateSortValue(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function getSongStatNumber(song, key) {
  const number = Number(song?.[key] || 0);
  return Number.isFinite(number) ? number : 0;
}

function formatRatePercent(value) {
  return `${Number(value || 0).toFixed(2)}%`;
}

function setSongStatsSort(nextSortKey) {
  if (!nextSortKey) {
    return;
  }

  if (songStatsSortKey === nextSortKey) {
    songStatsSortDirection = songStatsSortDirection === 'desc' ? 'asc' : 'desc';
  } else {
    songStatsSortKey = nextSortKey;
    songStatsSortDirection = 'desc';
  }

  renderSongAnalyticsTable();
  updateSongStatsSortControls();
}

function updateSongStatsSortControls() {
  els.songStatsSortButtons.forEach((button) => {
    const isActive = button.dataset.songStatsSort === songStatsSortKey;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-sort', isActive ? (songStatsSortDirection === 'desc' ? 'descending' : 'ascending') : 'none');
    const baseLabel = button.dataset.sortLabel || button.textContent.replace(/[↕↓↑]/g, '').trim();
    button.dataset.sortLabel = baseLabel;
    button.textContent = isActive ? `${baseLabel} ${songStatsSortDirection === 'desc' ? '↓' : '↑'}` : `${baseLabel} ↕`;
  });
}


function renderStatsSummaryWarning() {
  if (!els.statsSummaryWarning) {
    return;
  }

  els.statsSummaryWarning.classList.toggle('hidden', !statsSummaryError);
  els.statsSummaryWarning.textContent = statsSummaryError
    ? `Stats summary warning: ${statsSummaryError}`
    : '';
}

function renderStatsGeneratedAt() {
  if (!els.statsGeneratedAt) {
    return;
  }

  els.statsGeneratedAt.textContent = statsSummary?.generated_at
    ? `Stats generated: ${formatDateTime(statsSummary.generated_at)}`
    : 'Stats generated: —';
}

function renderTodayStats() {
  renderSummaryStatCards(els.todayStatsGrid, todayStatDefinitions, statsSummary?.today || {});
}

function renderSummaryStatCards(container, definitions, source) {
  if (!container) {
    return;
  }

  container.innerHTML = '';

  definitions.forEach((metric) => {
    const card = document.createElement('article');
    card.className = 'mini-stat-card';
    card.innerHTML = '<span class="mini-stat-label"></span><strong class="mini-stat-value"></strong>';
    card.querySelector('.mini-stat-label').textContent = metric.label;
    card.querySelector('.mini-stat-value').textContent = formatNumber(Number(source[metric.key] || 0));
    container.appendChild(card);
  });
}

function renderDevicesStats() {
  renderNamedCountList(els.devicesStatsList, statsSummary?.devices || [], 'device_type', ['desktop', 'mobile', 'unknown']);
}

function renderEventTypesStats() {
  renderNamedCountList(els.eventTypesStatsList, statsSummary?.event_types || [], 'event_type');
}

function renderNamedCountList(container, rows, labelKey, preferredOrder = []) {
  if (!container) {
    return;
  }

  container.innerHTML = '';
  const counts = new Map();

  rows.forEach((row) => {
    const rawLabel = String(row[labelKey] || 'unknown').toLowerCase();
    counts.set(rawLabel, (counts.get(rawLabel) || 0) + Number(row.event_count || 0));
  });

  const labels = [
    ...preferredOrder,
    ...Array.from(counts.keys()).filter((label) => !preferredOrder.includes(label)).sort()
  ];

  if (!labels.length) {
    container.appendChild(makeEmptySummaryItem('No stats returned.'));
    return;
  }

  labels.forEach((label) => {
    const item = document.createElement('div');
    item.className = 'summary-list-item';
    item.innerHTML = '<span></span><strong></strong>';
    item.querySelector('span').textContent = formatDisplayValue(label);
    item.querySelector('strong').textContent = formatNumber(Number(counts.get(label) || 0));
    container.appendChild(item);
  });
}

function makeEmptySummaryItem(message) {
  const item = document.createElement('div');
  item.className = 'summary-list-item summary-list-empty';
  item.textContent = message;
  return item;
}

function formatSummaryMetric(value, formatter = formatNumber) {
  return formatter(Number(value || 0));
}

function formatListeningTime(value) {
  const totalSeconds = Math.max(0, Math.floor(Number(value || 0)));

  if (totalSeconds < 60) {
    return `${formatNumber(totalSeconds)}s`;
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];

  if (hours) {
    parts.push(`${hours}h`);
  }

  if (minutes || hours) {
    parts.push(`${minutes}m`);
  }

  parts.push(`${seconds}s`);
  return parts.join(' ');
}

function formatAverageSeconds(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? `${formatNumber(roundMetric(number))}s` : '0s';
}

function formatPercentValue(value) {
  const number = Number(value || 0);

  if (!Number.isFinite(number)) {
    return '0%';
  }

  const percent = number > 0 && number <= 1 ? number * 100 : number;
  return `${formatNumber(roundMetric(percent))}%`;
}

function roundMetric(value) {
  return Math.round(value * 10) / 10;
}

function renderTopSongsTable(songList) {
  els.topSongsTableBody.innerHTML = '';

  if (!songList.length) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="10" class="song-meta">No songs loaded.</td>';
    els.topSongsTableBody.appendChild(row);
    return;
  }

  songList.forEach((song) => {
    const row = document.createElement('tr');
    const songKey = getSongKey(song);
    row.appendChild(buildSongTitleCell(song, songKey, 'compact-title'));
    row.appendChild(makeTextCell(song.artist || '—'));
    row.appendChild(makeTextCell(song.genre || '—'));
    row.appendChild(makeTextCell(formatNumber(getMetricValue(song, 'total_plays'))));
    row.appendChild(makeTextCell(formatNumber(getMetricValue(song, 'likes'))));
    row.appendChild(makeTextCell(formatNumber(getMetricValue(song, 'shares'))));
    row.appendChild(makeTextCell(formatNumber(getMetricValue(song, 'video_clicks'))));
    row.appendChild(makeTextCell(formatNumber(getMetricValue(song, 'product_clicks'))));
    row.appendChild(makeTextCell(formatNumber(getMetricValue(song, 'skip_count'))));
    row.appendChild(buildQuickLinksCell(songKey));
    els.topSongsTableBody.appendChild(row);
  });
}

function renderRankList(container, songList, metricLabel, valueGetter = null, formatter = formatNumber) {
  container.innerHTML = '';

  if (!songList.length) {
    const empty = document.createElement('p');
    empty.className = 'song-meta';
    empty.textContent = 'No songs loaded.';
    container.appendChild(empty);
    return;
  }

  songList.forEach((song, index) => {
    const songKey = getSongKey(song);
    const value = valueGetter ? valueGetter(song) : getMetricValue(song, metricLabel.replaceAll(' ', '_'));
    const item = document.createElement('div');
    item.className = 'rank-item';
    item.innerHTML = `
      <span class="rank-number"></span>
      <div class="song-cell-with-art rank-song-cell">
        <div class="rank-main">
          <strong></strong>
          <span></span>
        </div>
      </div>
      <div class="rank-value"></div>
      <div class="song-card-actions rank-actions">
        <button class="song-action-button" type="button">Edit</button>
        <a class="song-action-button song-action-link" target="_blank" rel="noopener noreferrer">Open in Radio</a>
      </div>
    `;
    item.querySelector('.rank-number').textContent = String(index + 1);
    item.querySelector('.rank-song-cell').prepend(buildSongArtworkImage(song));
    item.querySelector('.rank-main strong').textContent = formatSongTitle(song);
    item.querySelector('.rank-main span').textContent = [song.artist, song.genre].filter(Boolean).join(' · ') || songKey || '—';
    item.querySelector('.rank-value').textContent = `${formatter(value)} ${metricLabel}`;

    const editButton = item.querySelector('button');
    editButton.addEventListener('click', () => loadSongDetails(songKey, { openEditor: true }));

    const radioLink = item.querySelector('a');
    radioLink.href = getRadioSongUrl(songKey);

    container.appendChild(item);
  });
}

function sortSongsByMetric(metricKey, songList = getActiveSongs()) {
  return [...songList].sort((a, b) => getMetricValue(b, metricKey) - getMetricValue(a, metricKey));
}

function sortSongsByEngagement(songList = getActiveSongs()) {
  return [...songList].sort((a, b) => getSongEngagement(b) - getSongEngagement(a));
}

function sortSongsBySkipRate(songList = getActiveSongs()) {
  return [...songList].sort((a, b) => getSongSkipRate(b) - getSongSkipRate(a));
}

function getSongEngagement(song) {
  return getMetricValue(song, 'likes') + getMetricValue(song, 'shares') + getMetricValue(song, 'video_clicks') + getMetricValue(song, 'product_clicks');
}

function getSongSkipRate(song) {
  const plays = getMetricValue(song, 'total_plays');

  if (!plays) {
    return 0;
  }

  return getMetricValue(song, 'skip_count') / plays;
}

function getMetricValue(song, key) {
  const aliases = {
    skip_count: ['skip_count', 'skips'],
    total_seconds_played: ['total_seconds_played', 'seconds_played']
  };
  const keys = aliases[key] || [key];
  const rawValue = keys.map((fieldName) => song?.[fieldName]).find((value) => value !== undefined && value !== null && value !== '');
  const number = Number(rawValue || 0);
  return Number.isFinite(number) ? number : 0;
}


function getSongArtworkUrl(songOrEvent) {
  const directArtworkUrl = [songOrEvent?.resolved_artwork_url, songOrEvent?.song_artwork_url]
    .map((value) => String(value || '').trim())
    .find(Boolean);

  if (directArtworkUrl) {
    return directArtworkUrl;
  }

  return getYoutubeThumbnailUrl(songOrEvent?.video_link) || STASHBOX_PLACEHOLDER_ARTWORK;
}

function getYoutubeThumbnailUrl(videoLink) {
  const youtubeVideoId = getYouTubeVideoId(videoLink);
  return youtubeVideoId ? `https://img.youtube.com/vi/${youtubeVideoId}/hqdefault.jpg` : '';
}

function getYouTubeVideoId(videoLink) {
  if (!videoLink) {
    return '';
  }

  try {
    const url = new URL(String(videoLink).trim());
    const hostname = url.hostname.replace(/^www\./, '').toLowerCase();

    if (hostname === 'youtu.be') {
      return sanitizeYouTubeVideoId(url.pathname.split('/').filter(Boolean)[0]);
    }

    if (hostname === 'youtube.com' || hostname === 'm.youtube.com' || hostname.endsWith('.youtube.com')) {
      const watchId = sanitizeYouTubeVideoId(url.searchParams.get('v'));

      if (watchId) {
        return watchId;
      }

      const pathParts = url.pathname.split('/').filter(Boolean);
      const videoPathIndex = pathParts.findIndex((part) => ['embed', 'shorts', 'live'].includes(part));

      if (videoPathIndex !== -1) {
        return sanitizeYouTubeVideoId(pathParts[videoPathIndex + 1]);
      }
    }
  } catch {
    return '';
  }

  return '';
}

function sanitizeYouTubeVideoId(value) {
  const videoId = String(value || '').trim().match(/^[a-zA-Z0-9_-]{6,}$/)?.[0] || '';
  return videoId.slice(0, 32);
}

function configureSongArtworkImage(image, songOrEvent, altText) {
  image.classList.add('dashboard-art-thumb', 'song-art-preview-trigger', 'image-preview-trigger');
  image.alt = altText;
  image.loading = 'lazy';
  image.decoding = 'async';
  image.tabIndex = 0;
  image.dataset.previewReady = 'false';
  image.dataset.previewBroken = 'false';
  image.addEventListener('load', () => {
    image.hidden = false;
    image.dataset.previewReady = 'true';
    image.dataset.previewBroken = 'false';
    image.dataset.previewSrc = image.currentSrc || image.src;
  });
  image.addEventListener('error', () => {
    image.dataset.previewReady = 'false';
    hideImagePreview(true);

    if (image.dataset.fallbackApplied === 'true') {
      image.dataset.previewBroken = 'true';
      image.hidden = true;
      image.removeAttribute('src');
      return;
    }

    image.dataset.fallbackApplied = 'true';
    image.dataset.previewBroken = 'false';
    image.src = STASHBOX_PLACEHOLDER_ARTWORK;
  });
  attachImagePreviewHandlers(image, { enableClickToggle: false });
  image.src = getSongArtworkUrl(songOrEvent);
}

function buildSongArtworkImage(song) {
  const image = document.createElement('img');
  image.className = 'song-thumb';
  configureSongArtworkImage(image, song, `Artwork for ${formatSongTitle(song)}`);
  return image;
}

function buildSongTitleCell(song, songKey, titleClassName = '') {
  const cell = document.createElement('td');
  const wrap = document.createElement('div');
  wrap.className = 'song-cell-with-art';

  const textWrap = document.createElement('div');
  textWrap.className = 'song-cell-text';

  const title = document.createElement('span');
  title.className = ['song-title', titleClassName].filter(Boolean).join(' ');
  title.textContent = formatSongTitle(song);

  const meta = document.createElement('span');
  meta.className = 'song-meta';
  meta.textContent = [song.artist, song.album_name, song.genre].filter(Boolean).join(' · ') || songKey || '—';

  const languageBadges = buildLanguageBadges(song.languages);

  textWrap.append(title, meta, languageBadges);
  wrap.append(buildSongArtworkImage(song), textWrap);
  cell.appendChild(wrap);
  return cell;
}

function makeTextCell(text, className = '') {
  const cell = document.createElement('td');
  const span = document.createElement('span');
  if (className) {
    span.className = className;
  }
  span.textContent = text;
  cell.appendChild(span);
  return cell;
}

function buildQuickLinksCell(songKey) {
  const cell = document.createElement('td');
  cell.className = 'quick-links-cell';
  const actions = document.createElement('div');
  actions.className = 'song-card-actions table-actions';

  const editButton = document.createElement('button');
  editButton.className = 'song-action-button';
  editButton.type = 'button';
  editButton.textContent = 'Edit';
  editButton.addEventListener('click', () => loadSongDetails(songKey, { openEditor: true }));

  const radioLink = document.createElement('a');
  radioLink.className = 'song-action-button song-action-link';
  radioLink.href = getRadioSongUrl(songKey);
  radioLink.target = '_blank';
  radioLink.rel = 'noopener noreferrer';
  radioLink.textContent = 'Open in Radio';

  actions.append(editButton, radioLink);
  cell.appendChild(actions);
  return cell;
}

function renderSongList() {
  const query = els.songSearch.value.trim().toLowerCase();
  const activeSongs = getActiveSongs();
  filteredSongs = activeSongs.filter((song) => songMatchesQuery(song, query));

  els.songCount.textContent = `${filteredSongs.length} of ${activeSongs.length} active song${activeSongs.length === 1 ? '' : 's'}`;
  els.songTableBody.innerHTML = '';

  if (!filteredSongs.length) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="3" class="song-meta">No matching songs.</td>';
    els.songTableBody.appendChild(row);
    return;
  }

  filteredSongs.forEach((song) => {
    const row = document.createElement('tr');
    const songKey = getSongKey(song);
    row.classList.toggle('is-selected', songKey === selectedSongKey);
    row.tabIndex = 0;
    row.setAttribute('role', 'button');
    row.addEventListener('click', (event) => {
      if (isCardActionEvent(event)) {
        return;
      }

      loadSongDetails(songKey, { openEditor: true });
    });
    row.addEventListener('keydown', (event) => {
      if (isCardActionEvent(event)) {
        return;
      }

      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        loadSongDetails(songKey, { openEditor: true });
      }
    });

    row.appendChild(buildSongCell(song, songKey));
    row.appendChild(buildStatsCell(song));
    row.appendChild(buildUpdatedCell(song));
    els.songTableBody.appendChild(row);
  });
}

function isCardActionEvent(event) {
  return Boolean(event.target.closest('a, button'));
}

function songMatchesQuery(song, query) {
  if (!query) {
    return true;
  }

  return [song.display_title, song.song_name, song.artist, song.album_name, song.genre, formatLanguages(song.languages), getSongKey(song)]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(query));
}

function buildSongCell(song, songKey) {
  const cell = buildSongTitleCell(song, songKey);
  const textWrap = cell.querySelector('.song-cell-text');
  const actions = document.createElement('div');
  actions.className = 'song-card-actions';
  actions.innerHTML = `
    <button class="song-action-button" type="button">Edit</button>
    <a class="song-action-button song-action-link" target="_blank" rel="noopener noreferrer">Open in Radio</a>
  `;
  const badges = document.createElement('div');
  badges.className = 'badges';
  textWrap.append(actions, badges);

  const editButton = cell.querySelector('.song-action-button[type="button"]');
  editButton.addEventListener('click', (event) => {
    event.stopPropagation();
    loadSongDetails(songKey, { openEditor: true });
  });

  const radioLink = cell.querySelector('.song-action-link');
  radioLink.href = getRadioSongUrl(songKey);
  radioLink.addEventListener('click', (event) => {
    event.stopPropagation();
  });

  badges.appendChild(makeVisibilityBadge(song));

  if (song.album_name) {
    badges.appendChild(makeBadge('album', song.album_name));
  }

  badges.appendChild(makeBadge('format', song.release_format));
  return cell;
}

function buildStatsCell(song) {
  const cell = document.createElement('td');
  const stats = document.createElement('div');
  stats.className = 'stats-grid';

  [
    ['plays', getMetricValue(song, 'total_plays')],
    ['likes', getMetricValue(song, 'likes')],
    ['shares', getMetricValue(song, 'shares')],
    ['video', getMetricValue(song, 'video_clicks')],
    ['products', getMetricValue(song, 'product_clicks')],
    ['skips', getMetricValue(song, 'skip_count')]
  ].forEach(([label, value]) => {
    const stat = document.createElement('span');
    stat.className = 'stat';
    stat.textContent = `${label}: ${formatNumber(value)}`;
    stats.appendChild(stat);
  });

  cell.appendChild(stats);
  return cell;
}

function buildUpdatedCell(song) {
  const cell = document.createElement('td');
  const line = document.createElement('div');
  line.className = 'updated-line';
  line.textContent = formatDate(song.updated_at);
  cell.appendChild(line);
  return cell;
}

function buildLanguageBadges(languages) {
  const badges = document.createElement('div');
  badges.className = 'badges language-badges';
  const parsedLanguages = normalizeLanguages(languages);

  if (!parsedLanguages.length) {
    badges.appendChild(makeBadge('language', getNoLanguageLabel(), true));
    return badges;
  }

  parsedLanguages.forEach((language) => {
    badges.appendChild(makeBadge('language', language, true));
  });

  return badges;
}

function makeBadge(label, value, isOn = Boolean(value)) {
  const badge = document.createElement('span');
  badge.className = `badge ${isOn ? 'badge-on' : ''}`;
  badge.textContent = `${label}: ${formatDisplayValue(value)}`;
  return badge;
}

function makeVisibilityBadge(song) {
  const badge = document.createElement('span');
  badge.className = `badge ${isShownInRadio(song) ? 'badge-on' : ''} ${isArchivedSong(song) ? 'badge-archived' : ''}`;
  badge.textContent = getRadioVisibilityLabel(song);
  return badge;
}

function renderArchiveList() {
  const archived = getArchivedSongs().sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  els.archiveCount.textContent = `${archived.length} archived song${archived.length === 1 ? '' : 's'}`;
  els.archiveTableBody.innerHTML = '';

  if (!archived.length) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="5" class="song-meta">No archived songs.</td>';
    els.archiveTableBody.appendChild(row);
    return;
  }

  archived.forEach((song) => {
    const row = document.createElement('tr');
    const songKey = getSongKey(song);
    row.classList.toggle('is-selected', songKey === selectedSongKey);
    row.appendChild(makeTextCell(formatSongTitle(song), 'song-title compact-title'));
    row.appendChild(makeTextCell(song.artist || '—'));
    row.appendChild(makeTextCell(songKey || '—', 'song-key-inline'));
    row.appendChild(buildUpdatedCell(song));
    row.appendChild(buildArchiveActionsCell(song, songKey));
    els.archiveTableBody.appendChild(row);
  });
}

function buildArchiveActionsCell(song, songKey) {
  const cell = document.createElement('td');
  const actions = document.createElement('div');
  actions.className = 'song-card-actions table-actions';

  const editButton = document.createElement('button');
  editButton.className = 'song-action-button';
  editButton.type = 'button';
  editButton.textContent = 'Edit';
  editButton.addEventListener('click', () => loadSongDetails(songKey, { openEditor: true }));

  const restoreButton = document.createElement('button');
  restoreButton.className = 'song-action-button song-action-restore';
  restoreButton.type = 'button';
  restoreButton.textContent = 'Restore';
  restoreButton.addEventListener('click', () => restoreArchivedSong(song, restoreButton));

  actions.append(editButton, restoreButton);
  cell.appendChild(actions);
  return cell;
}


async function loadSongDetails(songKey, { openEditor = false } = {}) {
  if (!songKey) {
    showMessage('Selected song is missing a song_key.', 'error');
    return;
  }

  selectedSongKey = songKey;
  renderSongList();

  if (openEditor) {
    setActiveTab('edit');
  }

  setEditorLoading(true);

  try {
    const data = await adminFetch(`${API_BASE_URL}/${encodeURIComponent(songKey)}`);
    selectedSong = normalizeSongResponse(data);
    selectedSongKey = getSongKey(selectedSong) || songKey;
    populateEditor(selectedSong);
  } catch (error) {
    showMessage(error.message, 'error');
  } finally {
    setEditorLoading(false);
  }
}

function normalizeSongResponse(data) {
  if (data?.song) {
    return data.song;
  }

  if (data?.item) {
    return data.item;
  }

  if (typeof data?.body === 'string') {
    try {
      return normalizeSongResponse(JSON.parse(data.body));
    } catch {
      return data;
    }
  }

  return data || {};
}

function createFieldControl(field, fieldId) {
  if (field.type === 'textarea') {
    const textarea = document.createElement('textarea');
    textarea.id = fieldId;
    textarea.name = field.name;
    return textarea;
  }

  if (field.type === 'select') {
    const select = document.createElement('select');
    select.id = fieldId;
    select.name = field.name;
    populateSelectOptions(select, field.options || []);
    return select;
  }

  const input = document.createElement('input');
  input.id = fieldId;
  input.name = field.name;
  input.type = field.type;

  if (field.suggestions?.length) {
    input.setAttribute('list', `${fieldId}_suggestions`);
    input.autocomplete = 'off';
  }

  return input;
}

function createFieldDatalist(field, fieldId) {
  const datalist = document.createElement('datalist');
  datalist.id = `${fieldId}_suggestions`;

  field.suggestions.forEach((suggestion) => {
    const option = document.createElement('option');
    option.value = suggestion;
    datalist.appendChild(option);
  });

  return datalist;
}

function populateSelectOptions(select, options) {
  select.innerHTML = '';

  options.forEach((optionDefinition) => {
    const option = document.createElement('option');
    option.value = optionDefinition.value;
    option.textContent = optionDefinition.label;
    select.appendChild(option);
  });
}

function setSelectValue(select, field, value) {
  populateSelectOptions(select, field.options || []);

  const normalizedValue = value === null || value === undefined ? '' : String(value);

  if (!normalizedValue) {
    const blankOption = document.createElement('option');
    blankOption.value = '';
    blankOption.textContent = '— No current value —';
    select.prepend(blankOption);
    select.value = '';
    return;
  }

  if (!Array.from(select.options).some((option) => option.value === normalizedValue)) {
    const customOption = document.createElement('option');
    customOption.value = normalizedValue;
    customOption.textContent = `${normalizedValue} (current custom value)`;
    select.appendChild(customOption);
  }

  select.value = normalizedValue;
}

function getDefaultSelectValue(field) {
  return field.options?.[0]?.value || '';
}

function createRequiredStar() {
  const star = document.createElement('span');
  star.className = 'required-star';
  star.setAttribute('aria-hidden', 'true');
  star.textContent = '*';
  return star;
}

function buildEditForm() {
  const checkboxWrap = document.createElement('div');
  checkboxWrap.className = 'checkbox-grid';

  editableFields.forEach((field) => {
    const fieldId = `field_${field.name}`;

    if (field.type === 'checkbox') {
      const wrap = document.createElement('div');
      wrap.className = 'checkbox-item';
      wrap.dataset.fieldName = field.name;
      fieldWrappers.set(field.name, wrap);

      const label = document.createElement('label');
      label.className = 'checkbox-field';
      label.setAttribute('for', fieldId);

      const input = document.createElement('input');
      input.id = fieldId;
      input.name = field.name;
      input.type = 'checkbox';
      fieldElements.set(field.name, input);

      const textWrap = document.createElement('span');
      textWrap.className = 'checkbox-text';

      const span = document.createElement('span');
      span.textContent = field.label;
      textWrap.appendChild(span);

      if (field.help) {
        const help = document.createElement('span');
        help.className = 'checkbox-help';
        help.textContent = field.help;
        textWrap.appendChild(help);
      }

      label.append(input, textWrap);
      checkboxWrap.appendChild(label);
      return;
    }

    const wrap = document.createElement('div');
    wrap.className = `field ${field.full ? 'field-full' : ''}`;
    wrap.dataset.fieldName = field.name;
    fieldWrappers.set(field.name, wrap);

    const labelRow = document.createElement('div');
    labelRow.className = 'field-label-row';

    const label = document.createElement('label');
    label.setAttribute('for', fieldId);
    label.textContent = field.label;

    if (fieldsWithRequiredMarkers.has(field.name)) {
      label.appendChild(createRequiredStar());
    }

    labelRow.appendChild(label);

    if (field.name === 'song_key') {
      const generateButton = document.createElement('button');
      generateButton.id = 'generateSongKeyButton';
      generateButton.className = 'song-action-button';
      generateButton.type = 'button';
      generateButton.textContent = 'Generate Song Key';
      generateButton.addEventListener('click', generateSongKeyFromForm);
      labelRow.appendChild(generateButton);
    }

    const input = createFieldControl(field, fieldId);
    fieldElements.set(field.name, input);
    wrap.append(labelRow, input);

    if (uploadConfigs[field.name]) {
      wrap.appendChild(createUploadControls(field.name));
      input.addEventListener('input', () => updateMediaPreview(field.name));
    }

    if (field.suggestions?.length) {
      wrap.appendChild(createFieldDatalist(field, fieldId));
    }

    if (field.help) {
      const help = document.createElement('div');
      help.className = 'field-help';
      help.textContent = field.help;
      wrap.appendChild(help);
    }

    els.formFields.appendChild(wrap);
  });

  els.formFields.appendChild(checkboxWrap);
}


function createUploadControls(fieldName) {
  const config = uploadConfigs[fieldName];
  const controls = document.createElement('div');
  controls.className = 'upload-controls';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button button-ghost button-small upload-button';
  button.textContent = config.buttonText;

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = config.accept;
  fileInput.className = 'hidden';

  const status = document.createElement('div');
  status.className = 'upload-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');

  const preview = document.createElement('div');
  preview.className = 'media-preview compact-media-preview';

  button.addEventListener('click', () => {
    const validationError = getUploadMetadataValidationError();

    if (validationError) {
      setUploadStatus(fieldName, validationError, 'error');
      return;
    }

    fileInput.value = '';
    fileInput.click();
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];

    if (!file) {
      setUploadStatus(fieldName, 'No file selected.', 'error');
      return;
    }

    uploadSongMedia(fieldName, file);
  });

  controls.append(button, fileInput, status, preview);
  mediaUploadElements.set(fieldName, { button, fileInput, status, preview });
  return controls;
}

function startCreateSong() {
  selectedSong = null;
  selectedSongKey = '';
  renderSongList();
  populateEditor(getCreateSongDefaults(), { mode: 'create' });
  setActiveTab('edit');
}

function getCreateSongDefaults() {
  return { ...createDefaults };
}

function populateEditor(song, { mode = 'edit' } = {}) {
  editorMode = mode;
  selectedSong = mode === 'create' ? null : song;
  selectedSongKey = mode === 'create' ? '' : getSongKey(song) || selectedSongKey;
  els.editHeading.textContent = mode === 'create' ? 'Create New Song' : song.display_title || song.song_name || 'Untitled song';
  els.selectedSongKey.textContent = mode === 'create' ? 'new song' : selectedSongKey;
  updateEditorVisibilityStatus(song, mode);
  els.saveChangesButton.textContent = mode === 'create' ? 'Create Song' : 'Save Changes';
  els.cancelChangesButton.textContent = mode === 'create' ? 'Cancel' : 'Cancel/Revert';
  els.emptyEditor.classList.add('hidden');
  els.editForm.classList.remove('hidden');
  els.dangerZone.classList.toggle('hidden', mode === 'create');
  applyEditorModeToFields(mode);

  editableFields.forEach((field) => {
    const input = fieldElements.get(field.name);
    const value = song[field.name];

    if (field.type === 'select') {
      setSelectValue(input, field, field.name === 'public_visibility' ? normalizePublicVisibility(value) : value);
    } else if (field.type === 'checkbox') {
      input.checked = toBoolean(value);
    } else if (field.name === 'specific_product_urls') {
      input.value = normalizeArrayValue(value, '\n').join('\n');
    } else if (field.name === 'mood_tags') {
      input.value = normalizeArrayValue(value, ',').join(', ');
    } else if (field.name === 'languages') {
      input.value = formatLanguages(value);
    } else if (Array.isArray(value)) {
      input.value = value.join('\n');
    } else if (value === null || value === undefined) {
      input.value = '';
    } else {
      input.value = value;
    }

    if (uploadConfigs[field.name]) {
      setUploadStatus(field.name, '', 'idle');
      updateMediaPreview(field.name);
    }
  });
}


function updateEditorVisibilityStatus(song, mode) {
  if (mode === 'create') {
    els.selectedVisibility.classList.add('hidden');
    els.selectedVisibility.textContent = '';
    return;
  }

  const isArchived = isArchivedSong(song);
  els.selectedVisibility.textContent = getRadioVisibilityLabel(song);
  els.selectedVisibility.classList.toggle('visibility-archived', isArchived);
  els.selectedVisibility.classList.toggle('visibility-visible', isShownInRadio(song));
  els.selectedVisibility.classList.remove('hidden');
}

function applyEditorModeToFields(mode) {
  editableFields.forEach((field) => {
    const input = fieldElements.get(field.name);
    const wrap = fieldWrappers.get(field.name);
    const isCreateOnlyHidden = Boolean(field.createOnly && mode !== 'create');

    if (wrap) {
      wrap.classList.toggle('is-hidden-for-mode', isCreateOnlyHidden);
    }

    if (input) {
      input.disabled = isCreateOnlyHidden;
      input.required = !isCreateOnlyHidden
        && requiredSongFields.has(field.name)
        && field.type !== 'checkbox';
    }

    if (uploadConfigs[field.name]) {
      setUploadControlDisabled(field.name, isCreateOnlyHidden);
    }
  });
}

function clearEditor() {
  editorMode = 'edit';
  els.editHeading.textContent = 'Select a song';
  els.selectedSongKey.textContent = '';
  els.saveChangesButton.textContent = 'Save Changes';
  els.cancelChangesButton.textContent = 'Cancel/Revert';
  els.emptyEditor.classList.remove('hidden');
  els.editForm.classList.add('hidden');
  els.dangerZone.classList.add('hidden');
  els.selectedVisibility.classList.add('hidden');
  selectedSong = null;
  selectedSongKey = '';
  applyEditorModeToFields('edit');
  editableFields.forEach((field) => {
    const input = fieldElements.get(field.name);
    if (field.type === 'checkbox') {
      input.checked = false;
    } else if (field.type === 'select') {
      setSelectValue(input, field, getDefaultSelectValue(field));
    } else {
      input.value = '';
    }

    if (uploadConfigs[field.name]) {
      setUploadStatus(field.name, '', 'idle');
      updateMediaPreview(field.name);
    }
  });
  renderSongList();
}

async function saveSelectedSong(event) {
  event.preventDefault();

  console.log("Selected song before save:", selectedSong);

  if (editorMode === 'create') {
    await createSelectedSong();
    return;
  }

  if (!selectedSongKey) {
    showMessage('Select a song before saving.', 'error');
    return;
  }

  const validationPayload = buildCurrentEditorPayload({ includeCreateOnly: false });

  if (!validateSongPayload(validationPayload, { action: 'saving' })) {
    return;
  }

  const payload = buildUpdatePayload();
  const changedFields = Object.keys(payload);

  console.log("Admin PUT payload:", payload);

  if (!changedFields.length) {
    showMessage('No changes to save', 'success');
    return;
  }

  const url = `${API_BASE_URL}/${encodeURIComponent(selectedSongKey)}`;
  console.log("Admin PUT URL:", url);
  showMessage('Saving...', 'success');
  setBusy(els.saveChangesButton, true);

  try {
    const result = await adminFetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    console.log("Admin PUT response:", result);

    const returnedSong = normalizeSongResponse(result);
    const updatedSong = returnedSong && Object.keys(returnedSong).length
      ? { ...selectedSong, ...returnedSong }
      : { ...selectedSong, ...payload };

    selectedSong = updatedSong;
    selectedSongKey = getSongKey(updatedSong) || selectedSongKey;
    updateSongInList(updatedSong);
    renderDashboard();
    renderSongList();
    renderArchiveList();

    if (events.length) {
      renderEvents();
    }
    populateEditor(updatedSong);
    setActiveTab('edit');
    showMessage('Saved successfully', 'success');
  } catch (error) {
    showMessage(error.message, 'error');
  } finally {
    setBusy(els.saveChangesButton, false);
  }
}

function openDeleteModal() {
  if (editorMode === 'create' || !selectedSongKey) {
    return;
  }

  els.deleteModal.classList.remove('hidden');
  els.confirmDeleteButton.focus();
}

function closeDeleteModal() {
  els.deleteModal.classList.add('hidden');
}

async function archiveSelectedSong() {
  if (!selectedSongKey) {
    closeDeleteModal();
    showMessage('Select a song before deleting.', 'error');
    return;
  }

  const archivedAt = new Date().toLocaleString();
  const archiveNote = `Archived from admin CMS on ${archivedAt}.`;
  const currentNotes = String(selectedSong?.internal_notes || '').trim();
  const payload = {
    public_visibility: 'archived',
    internal_notes: currentNotes ? [currentNotes, archiveNote].join('\n') : archiveNote
  };

  setBusy(els.confirmDeleteButton, true);
  setBusy(els.deleteSongButton, true);
  showMessage('Moving song to archive...', 'success');

  try {
    const result = await updateSongByKey(selectedSongKey, payload);
    const returnedSong = normalizeSongResponse(result);
    const archivedSong = returnedSong && Object.keys(returnedSong).length
      ? { ...selectedSong, ...returnedSong, public_visibility: 'archived' }
      : { ...selectedSong, ...payload };

    updateSongInList(archivedSong);
    closeDeleteModal();
    clearEditor();
    renderDashboard();
    renderSongList();
    renderArchiveList();

    if (events.length) {
      renderEvents();
    }
    setActiveTab('songs');
    showMessage('Song moved to archive.', 'success');
  } catch (error) {
    showMessage(error.message, 'error');
  } finally {
    setBusy(els.confirmDeleteButton, false);
    setBusy(els.deleteSongButton, false);
  }
}

async function restoreArchivedSong(song, button) {
  const songKey = getSongKey(song);

  if (!songKey) {
    showMessage('Archived song is missing a song_key.', 'error');
    return;
  }

  setBusy(button, true);
  showMessage('Restoring song as hidden...', 'success');

  try {
    const result = await updateSongByKey(songKey, { public_visibility: 'hidden' });
    const returnedSong = normalizeSongResponse(result);
    const restoredSong = returnedSong && Object.keys(returnedSong).length
      ? { ...song, ...returnedSong, public_visibility: 'hidden' }
      : { ...song, public_visibility: 'hidden' };

    updateSongInList(restoredSong);

    if (selectedSongKey === songKey) {
      selectedSong = restoredSong;
      populateEditor(restoredSong);
    }

    renderDashboard();
    renderSongList();
    renderArchiveList();

    if (events.length) {
      renderEvents();
    }
    showMessage('Song restored as hidden.', 'success');
  } catch (error) {
    showMessage(error.message, 'error');
  } finally {
    setBusy(button, false);
  }
}

function updateSongByKey(songKey, payload) {
  return adminFetch(`${API_BASE_URL}/${encodeURIComponent(songKey)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
}


async function createSelectedSong() {
  const payload = buildCreatePayload();

  if (!validateCreatePayload(payload)) {
    return;
  }

  console.log("Create Song payload:", payload);
  showMessage('Creating song...', 'success');
  setBusy(els.saveChangesButton, true);

  try {
    const result = await adminFetch(API_BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    console.log("Admin POST response:", result);

    const returnedSong = normalizeSongResponse(result);
    const createdSong = returnedSong && Object.keys(returnedSong).length
      ? { ...payload, ...returnedSong }
      : payload;
    const createdSongKey = getSongKey(createdSong) || payload.song_key;

    selectedSong = createdSong;
    selectedSongKey = createdSongKey;
    updateSongInList(createdSong);
    renderDashboard();
    renderSongList();
    renderArchiveList();

    if (events.length) {
      renderEvents();
    }
    await loadSongs({ silent: true, preserveSelection: false });

    updateSongInList(createdSong);
    selectedSong = createdSong;
    selectedSongKey = createdSongKey;
    populateEditor(createdSong, { mode: 'edit' });
    renderSongList();
    renderArchiveList();
    setActiveTab('edit');
    showMessage('Song created successfully', 'success');
  } catch (error) {
    if (error.status === 409 && !getBackendErrorField(error.data)) {
      showMessage('Song key already exists. Choose a different song key.', 'error');
      return;
    }

    showMessage(error.message, 'error');
  } finally {
    setBusy(els.saveChangesButton, false);
  }
}

function updateSongInList(updatedSong) {
  const updatedSongKey = getSongKey(updatedSong) || selectedSongKey;

  if (!updatedSongKey) {
    return;
  }

  const index = songs.findIndex((song) => getSongKey(song) === updatedSongKey);

  if (index === -1) {
    songs = [updatedSong, ...songs];
    songsByKey = buildSongsByKey(songs);
    return;
  }

  songs = songs.map((song, songIndex) => (songIndex === index ? { ...song, ...updatedSong } : song));
  songsByKey = buildSongsByKey(songs);
}

function buildCreatePayload() {
  const payload = buildCurrentEditorPayload({ includeCreateOnly: true });

  return normalizeCreatePayload(payload);
}

function buildCurrentEditorPayload({ includeCreateOnly = true } = {}) {
  return editableFields.reduce((payload, field) => {
    if (!includeCreateOnly && field.createOnly) {
      return payload;
    }

    payload[field.name] = getFieldPayloadValue(field);
    return payload;
  }, {});
}

function normalizeCreatePayload(payload) {
  return {
    ...payload,
    mood_tags: normalizeArrayValue(payload.mood_tags, ','),
    languages: normalizeLanguagesForCreate(payload.languages),
    specific_product_urls: normalizeArrayValue(payload.specific_product_urls, '\n'),
    show_public_note: toBoolean(payload.show_public_note),
    exclusive: toBoolean(payload.exclusive),
    explicit: toBoolean(payload.explicit),
    live_recording: toBoolean(payload.live_recording),
    featured: toBoolean(payload.featured),
    public_visibility: normalizePublicVisibility(payload.public_visibility)
  };
}

function validateCreatePayload(payload) {
  return validateSongPayload(payload, { action: 'creating' });
}

function validateSongPayload(payload, { action = 'saving' } = {}) {
  const missingFields = Array.from(requiredSongFields).filter((fieldName) => {
    if (fieldName === 'public_visibility') {
      return !['visible', 'hidden', 'archived'].includes(payload[fieldName]);
    }

    return !String(payload[fieldName] || '').trim();
  });

  if (missingFields.length) {
    const missingLabels = missingFields.map((fieldName) => requiredFieldLabels[fieldName] || fieldName);
    showMessage(`Fill required fields before ${action}: ${missingLabels.join(', ')}.`, 'error');
    return false;
  }

  if (!String(payload.audio_url || '').trim() && !String(payload.video_link || '').trim()) {
    showMessage('Audio URL or Video Link is required.', 'error');
    return false;
  }

  return true;
}

function generateSongKeyFromForm() {
  const songName = fieldElements.get('song_name')?.value || '';
  const artist = fieldElements.get('artist')?.value || '';
  const generatedKey = generateSongKey(songName, artist);
  const songKeyInput = fieldElements.get('song_key');

  if (!generatedKey) {
    showMessage('Enter a song name and artist before generating a song key.', 'error');
    return;
  }

  songKeyInput.value = generatedKey;
  songKeyInput.focus();
}

function generateSongKey(songName, artist) {
  return slugifySongKey(`${songName || ''}-${artist || ''}`);
}

function slugifySongKey(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/&/g, ' and ')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}


function getUploadMetadataValidationError() {
  const songName = String(fieldElements.get('song_name')?.value || '').trim();
  const artist = String(fieldElements.get('artist')?.value || '').trim();

  if (!songName) {
    return 'Song Name is required before upload.';
  }

  if (!artist) {
    return 'Artist is required before upload.';
  }

  if (!getCurrentUploadSongKey(songName, artist)) {
    return 'Song Key is required before upload.';
  }

  return '';
}

function getCurrentUploadSongKey(songName, artist) {
  const existingKey = String(fieldElements.get('song_key')?.value || selectedSongKey || '').trim();

  if (existingKey) {
    return existingKey;
  }

  return generateSongKey(songName, artist);
}

function getFileExtension(filename) {
  const name = String(filename || '');
  const dotIndex = name.lastIndexOf('.');
  return dotIndex === -1 ? '' : name.slice(dotIndex + 1).toLowerCase();
}

function getUploadContentType(file) {
  return file.type || 'application/octet-stream';
}

function validateUploadFile(fieldName, file, configs = uploadConfigs) {
  const config = configs[fieldName];
  const extension = getFileExtension(file.name);
  const contentType = getUploadContentType(file).toLowerCase();
  const hasAllowedExtension = config.allowedExtensions.includes(extension);
  const hasAllowedMimeType = config.allowedMimeTypes.includes(contentType);

  if (!hasAllowedExtension) {
    return `${config.buttonText.replace('Upload ', '')} file type is not allowed.`;
  }

  if (!hasAllowedMimeType && !(contentType === 'application/octet-stream' && hasAllowedExtension)) {
    return `${config.buttonText.replace('Upload ', '')} MIME type is not allowed.`;
  }

  return '';
}

async function uploadSongMedia(fieldName, file) {
  const config = uploadConfigs[fieldName];
  const metadataError = getUploadMetadataValidationError();

  if (metadataError) {
    setUploadStatus(fieldName, metadataError, 'error');
    return;
  }

  const fileError = validateUploadFile(fieldName, file);

  if (fileError) {
    setUploadStatus(fieldName, fileError, 'error');
    return;
  }

  const songName = String(fieldElements.get('song_name')?.value || '').trim();
  const artist = String(fieldElements.get('artist')?.value || '').trim();
  const songKey = getCurrentUploadSongKey(songName, artist);
  const songKeyInput = fieldElements.get('song_key');

  if (editorMode === 'create' && songKeyInput && !String(songKeyInput.value || '').trim()) {
    songKeyInput.value = songKey;
  }

  setUploadStatus(fieldName, config.uploadingMessage, 'busy');
  setUploadControlDisabled(fieldName, true);

  try {
    const contentType = getUploadContentType(file);
    const presignResult = normalizeUploadPresignResponse(await adminFetch(UPLOAD_PRESIGN_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        song_key: songKey,
        song_name: songName,
        artist,
        purpose: config.purpose,
        filename: file.name,
        content_type: contentType
      })
    }));

    const uploadUrl = presignResult?.upload_url;
    const publicUrl = presignResult?.public_url;

    if (!uploadUrl || !publicUrl) {
      throw new Error('Presign response was missing upload_url or public_url.');
    }

    const s3Response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType
      },
      body: file
    });

    if (!s3Response.ok) {
      throw new Error(`S3 upload failed with status ${s3Response.status}.`);
    }

    const urlInput = fieldElements.get(fieldName);
    urlInput.value = publicUrl;
    urlInput.dispatchEvent(new Event('input', { bubbles: true }));
    setUploadStatus(fieldName, config.successMessage, 'success');
    showMessage(config.successMessage, 'success');
  } catch (error) {
    setUploadStatus(fieldName, `${config.failurePrefix}: ${error.message}`, 'error');
  } finally {
    setUploadControlDisabled(fieldName, false);
  }
}


function normalizeUploadPresignResponse(data) {
  if (typeof data?.body === 'string') {
    return parseJsonMaybe(data.body) || data;
  }

  return data || {};
}

function setUploadControlDisabled(fieldName, isDisabled) {
  const controls = mediaUploadElements.get(fieldName);

  if (controls?.button) {
    controls.button.disabled = Boolean(isDisabled);
  }
}

function setUploadStatus(fieldName, message, status = 'idle') {
  const statusEl = mediaUploadElements.get(fieldName)?.status;

  if (!statusEl) {
    return;
  }

  statusEl.textContent = message || '';
  statusEl.classList.toggle('is-error', status === 'error');
  statusEl.classList.toggle('is-success', status === 'success');
  statusEl.classList.toggle('is-busy', status === 'busy');
}

function updateMediaPreview(fieldName) {
  const controls = mediaUploadElements.get(fieldName);
  const config = uploadConfigs[fieldName];
  const url = String(fieldElements.get(fieldName)?.value || '').trim();

  if (!controls?.preview) {
    return;
  }

  controls.preview.innerHTML = '';
  controls.preview.classList.toggle('hidden', !url);

  if (!url) {
    return;
  }

  if (config.previewType === 'audio') {
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.preload = 'metadata';
    audio.src = url;
    controls.preview.appendChild(audio);
    return;
  }

  if (config.previewType === 'image') {
    const image = document.createElement('img');
    image.src = url;
    image.alt = 'Song artwork preview';
    image.loading = 'lazy';
    controls.preview.appendChild(image);
  }
}

function buildUpdatePayload() {
  return editableFields.reduce((payload, field) => {
    if (field.createOnly) {
      return payload;
    }

    const nextValue = getFieldPayloadValue(field);
    const currentValue = getComparableFieldValue(field, selectedSong?.[field.name]);

    if (areFieldValuesEqual(nextValue, currentValue)) {
      return payload;
    }

    payload[field.name] = nextValue;
    return payload;
  }, {});
}

function getFieldPayloadValue(field) {
  const input = fieldElements.get(field.name);

  if (field.name === 'public_visibility') {
    return normalizePublicVisibility(input.value);
  }

  if (booleanFields.has(field.name)) {
    return Boolean(input.checked);
  }

  if (field.name === 'specific_product_urls') {
    return parseLineSeparatedArray(input.value);
  }

  if (field.name === 'mood_tags') {
    return parseCommaSeparatedArray(input.value);
  }

  if (field.name === 'languages') {
    return normalizeLanguages(input.value);
  }

  if (plainTextFields.has(field.name)) {
    return String(input.value || '').trim();
  }

  return String(input.value || '').trim();
}

function getComparableFieldValue(field, value) {
  if (field.name === 'public_visibility') {
    return normalizePublicVisibility(getPublicVisibilityValue(value));
  }

  if (booleanFields.has(field.name)) {
    return toBoolean(value);
  }

  if (field.name === 'specific_product_urls') {
    return normalizeArrayValue(value, '\n');
  }

  if (field.name === 'mood_tags') {
    return normalizeArrayValue(value, ',');
  }

  if (field.name === 'languages') {
    return normalizeLanguages(value);
  }

  return value === null || value === undefined ? '' : String(value).trim();
}

function normalizeArrayValue(value, stringSeparator) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (value === null || value === undefined || value === '') {
    return [];
  }

  if (typeof value === 'string') {
    return stringSeparator === ',' ? parseCommaSeparatedArray(value) : parseLineSeparatedArray(value);
  }

  return [];
}

function parseLineSeparatedArray(value) {
  return String(value || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseCommaSeparatedArray(value) {
  const seen = new Set();

  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => {
      const key = item.toLowerCase();

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
}

function normalizeLanguages(value) {
  return parseCommaSeparatedArray(Array.isArray(value) ? value.join(',') : value);
}

function normalizeLanguagesForCreate(value) {
  const languages = normalizeLanguages(value);

  return languages.length ? languages : [...DEFAULT_LANGUAGES];
}

function formatLanguages(languages) {
  return normalizeLanguages(languages).join(', ');
}

function getNoLanguageLabel() {
  return 'No language / instrumental';
}


function normalizePublicVisibility(value) {
  return value === 'archived' || value === 'hidden' ? value : 'visible';
}

function getRadioVisibilityLabel(songOrValue) {
  const visibility = normalizePublicVisibility(getPublicVisibilityValue(songOrValue));
  return visibility === 'archived' ? 'archived' : `radio: ${visibility}`;
}

function isShownInRadio(songOrValue) {
  return normalizePublicVisibility(getPublicVisibilityValue(songOrValue)) === 'visible';
}

function getPublicVisibilityValue(songOrValue) {
  return typeof songOrValue === 'object' && songOrValue !== null
    ? songOrValue.public_visibility
    : songOrValue;
}

function toBoolean(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value === 1;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return ['true', '1', 'yes', 'y', 'on'].includes(normalized);
  }

  return false;
}

function areFieldValuesEqual(nextValue, currentValue) {
  if (Array.isArray(nextValue) || Array.isArray(currentValue)) {
    return JSON.stringify(nextValue) === JSON.stringify(currentValue);
  }

  return nextValue === currentValue;
}

function getSongKey(song) {
  return song?.song_key || song?.id || song?.key || '';
}

function getRadioSongUrl(songKey) {
  return `${RADIO_DEV_BASE_URL}?song=${encodeURIComponent(songKey)}`;
}

function formatSongTitle(song) {
  return song?.display_title || song?.song_name || selectedSongKey || 'selected song';
}

function setBusy(button, isBusy) {
  button.disabled = isBusy;
}

function setEditorLoading(isLoading) {
  els.saveChangesButton.disabled = isLoading;
  els.cancelChangesButton.disabled = isLoading;
  els.deleteSongButton.disabled = isLoading;
  if (isLoading) {
    els.editHeading.textContent = 'Loading song…';
  }
}

function showMessage(text, type = 'success') {
  window.clearTimeout(messageTimer);
  els.message.textContent = text;
  els.message.className = `message ${type}`;
  messageTimer = window.setTimeout(() => {
    els.message.classList.add('hidden');
  }, type === 'error' ? 7000 : 4000);
}

function formatNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number.toLocaleString() : '0';
}

function formatPercent(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? `${(number * 100).toFixed(1)}%` : '0.0%';
}

function formatDate(value) {
  if (!value) {
    return '—';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString();
}

function formatDisplayValue(value) {
  if (value === true) {
    return 'yes';
  }

  if (value === false) {
    return 'no';
  }

  if (value === null || value === undefined || value === '') {
    return '—';
  }

  return String(value);
}

function cloneDefaultAd() {
  return typeof structuredClone === 'function' ? structuredClone(DEFAULT_DEV_AD) : { ...DEFAULT_DEV_AD };
}

function getAdValue(ad, snakeName, camelName) {
  if (!ad) return undefined;
  if (ad[snakeName] !== undefined) return ad[snakeName];
  return ad[camelName];
}

function normalizeAdRecord(ad) {
  const source = ad || {};
  const next = { ...cloneDefaultAd() };
  next.id = String(source.id || next.id || `dev-ad-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  next.internal_title = String(getAdValue(source, 'internal_title', 'internalTitle') ?? next.internal_title ?? '').trim();
  next.internal_description = String(getAdValue(source, 'internal_description', 'internalDescription') ?? next.internal_description ?? '').trim();
  next.ad_type = getAdValue(source, 'ad_type', 'adType') || next.ad_type;
  next.media_type = getAdValue(source, 'media_type', 'mediaType') || next.media_type;
  next.media_url = String(getAdValue(source, 'media_url', 'mediaUrl') ?? next.media_url ?? '').trim();
  next.thumbnail_url = String(getAdValue(source, 'thumbnail_url', 'thumbnailUrl') ?? source.poster_image_url ?? next.thumbnail_url ?? '').trim();
  next.poster_image_url = next.thumbnail_url;
  next.cta_label = String(getAdValue(source, 'cta_label', 'ctaLabel') ?? next.cta_label ?? '').trim();
  next.cta_url = String(getAdValue(source, 'cta_url', 'ctaUrl') ?? next.cta_url ?? '').trim();
  next.active = Boolean(source.active ?? next.active);
  next.frequency = getAdValue(source, 'frequency', 'frequency') || next.frequency;
  next.skip_enabled = getAdValue(source, 'skip_enabled', 'skipEnabled');
  next.skip_after_seconds = getAdValue(source, 'skip_after_seconds', 'skipAfterSeconds');
  next.max_plays_per_session = getAdValue(source, 'max_plays_per_session', 'maxPlaysPerSession');
  next.start_date = String(getAdValue(source, 'start_date', 'startDate') ?? next.start_date ?? '');
  next.end_date = String(getAdValue(source, 'end_date', 'endDate') ?? next.end_date ?? '');
  next.genre_associations = String(getAdValue(source, 'genre_associations', 'genreAssociations') ?? next.genre_associations ?? '');
  next.mood_associations = String(getAdValue(source, 'mood_associations', 'moodAssociations') ?? next.mood_associations ?? '');
  next.artist_associations = String(getAdValue(source, 'artist_associations', 'artistAssociations') ?? next.artist_associations ?? '');
  next.song_associations = String(getAdValue(source, 'song_associations', 'songAssociations') ?? next.song_associations ?? '');
  next.notes = String(getAdValue(source, 'notes', 'notes') ?? next.notes ?? '');
  next.ad_type = AD_TYPE_OPTIONS.includes(next.ad_type) ? next.ad_type : DEFAULT_DEV_AD.ad_type;
  next.media_type = AD_MEDIA_TYPE_OPTIONS.includes(next.media_type) ? next.media_type : DEFAULT_DEV_AD.media_type;
  next.frequency = AD_FREQUENCY_OPTIONS.includes(next.frequency) ? next.frequency : DEFAULT_DEV_AD.frequency;
  next.skip_enabled = next.skip_enabled === undefined ? true : Boolean(next.skip_enabled);
  next.skip_after_seconds = Math.max(0, Number(next.skip_after_seconds ?? DEFAULT_DEV_AD.skip_after_seconds) || 0);
  next.max_plays_per_session = Math.max(1, Number(next.max_plays_per_session ?? DEFAULT_DEV_AD.max_plays_per_session) || DEFAULT_DEV_AD.max_plays_per_session);
  return next;
}

function toStoredAdRecord(ad) {
  const next = normalizeAdRecord(ad);
  const stored = {
    id: next.id,
    internalTitle: next.internal_title,
    internalDescription: next.internal_description,
    adType: next.ad_type,
    mediaType: next.media_type,
    mediaUrl: next.media_url,
    thumbnailUrl: next.thumbnail_url,
    ctaLabel: next.cta_label,
    ctaUrl: next.cta_url,
    active: next.active,
    frequency: next.frequency,
    skipEnabled: next.skip_enabled,
    skipAfterSeconds: next.skip_after_seconds,
    maxPlaysPerSession: next.max_plays_per_session,
    genreAssociations: next.genre_associations,
    moodAssociations: next.mood_associations,
    artistAssociations: next.artist_associations,
    songAssociations: next.song_associations,
    notes: next.notes
  };
  if (next.start_date) stored.startDate = next.start_date;
  if (next.end_date) stored.endDate = next.end_date;
  return stored;
}

function writeAdsStorage() {
  writeJsonStorage(ADS_STORAGE_KEY, ads.map(toStoredAdRecord));
}

function ensureDefaultAds(nextAds) {
  const normalized = (Array.isArray(nextAds) ? nextAds : [])
    .filter(ad => ad && ad.id !== 'dev-sample-stashbox-radio-test-video-ad')
    .map(normalizeAdRecord);

  if (normalized.length) {
    return normalized;
  }

  return [normalizeAdRecord(cloneDefaultAd())];
}

function readJsonStorage(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch (_) {
    return fallback;
  }
}

function writeJsonStorage(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (_) {
    // DEV localStorage can be blocked or full; keep the in-memory Ads panel usable.
  }
}

function loadAds({ preserveEditor = true } = {}) {
  const previousSelectedAdId = selectedAdId;
  const previousMode = els.adForm?.dataset.mode || 'idle';
  ads = ensureDefaultAds(readJsonStorage(ADS_STORAGE_KEY, []));
  writeAdsStorage();
  renderAdsTab();
  renderAdStats();

  if (preserveEditor && previousSelectedAdId) {
    const refreshedAd = ads.find(ad => ad.id === previousSelectedAdId);
    if (refreshedAd) {
      renderAdForm(refreshedAd, previousMode === 'create');
    }
  }
}

function buildAdForm() {
  if (!els.adFormFields) return;
  els.adFormFields.innerHTML = '';
  adUploadElements.clear();
  adFields.forEach(field => {
    const wrapper = document.createElement('label');
    wrapper.className = `field ${field.full ? 'field-full' : ''}`;
    wrapper.htmlFor = `ad_${field.name}`;
    const label = document.createElement('span');
    label.textContent = field.label;
    if (field.required) label.appendChild(createRequiredStar());
    wrapper.appendChild(label);
    let input;
    if (field.type === 'textarea') {
      input = document.createElement('textarea');
      input.rows = 3;
    } else if (field.type === 'select') {
      input = document.createElement('select');
      field.options.forEach(option => {
        const opt = document.createElement('option');
        opt.value = option;
        opt.textContent = option;
        input.appendChild(opt);
      });
    } else {
      input = document.createElement('input');
      input.type = field.type;
      if (field.min !== undefined) input.min = field.min;
    }
    input.id = `ad_${field.name}`;
    input.name = field.name;
    if (field.required) input.required = true;
    if (field.name === 'media_type') input.disabled = true;
    input.addEventListener('input', updateAdPreview);
    input.addEventListener('change', updateAdPreview);
    wrapper.appendChild(input);
    if (field.upload) wrapper.appendChild(createAdUploadControls(field.upload));
    if (field.help) {
      const help = document.createElement('small');
      help.textContent = field.help;
      wrapper.appendChild(help);
    }
    els.adFormFields.appendChild(wrapper);
  });

  const preview = document.createElement('section');
  preview.className = 'ad-editor-preview field-full';
  preview.setAttribute('aria-labelledby', 'adPreviewHeading');
  preview.innerHTML = `
    <div class="section-heading compact-heading">
      <p class="eyebrow">Preview</p>
      <h3 id="adPreviewHeading">Ad preview</h3>
      <p class="panel-copy">Preview plays are local editor checks only and do not write ad impressions, starts, or completions.</p>
    </div>
    <div id="adThumbnailPreview" class="ad-thumbnail-preview"></div>
    <div id="adVideoPreview" class="ad-video-preview"></div>`;
  els.adFormFields.appendChild(preview);
}

function createAdUploadControls(configKey) {
  const config = adUploadConfigs[configKey];
  const controls = document.createElement('div');
  controls.className = 'upload-controls ad-upload-controls';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button button-ghost button-small upload-button';
  button.textContent = config.buttonText;
  button.disabled = true;
  button.title = 'Upload connection pending. Paste S3/CloudFront URL for now.';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = config.accept;
  fileInput.className = 'hidden';
  fileInput.disabled = true;

  const status = document.createElement('div');
  status.className = 'upload-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');

  status.textContent = 'Upload connection pending. Paste S3/CloudFront URL for now.';

  button.addEventListener('click', () => {
    setAdUploadStatus(configKey, 'Upload connection pending. Paste S3/CloudFront URL for now.', 'idle');
  });

  controls.append(button, fileInput, status);
  adUploadElements.set(configKey, { button, fileInput, status });
  return controls;
}

function emptyAd() {
  return normalizeAdRecord({
    ...cloneDefaultAd(),
    id: `dev-ad-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    internal_title: '',
    internal_description: '',
    media_url: '',
    thumbnail_url: '',
    poster_image_url: '',
    cta_label: '',
    cta_url: '',
    active: false,
    notes: ''
  });
}

function startCreateAd() {
  renderAdForm(emptyAd(), true);
}

function renderAdForm(ad = null, isNew = false) {
  if (!els.adForm) return;
  selectedAdId = ad?.id || '';
  els.adForm.dataset.mode = isNew ? 'create' : (ad ? 'edit' : 'idle');
  els.adForm.classList.toggle('hidden', !ad);
  if (els.adFormHeading) els.adFormHeading.textContent = ad ? (isNew ? 'Create Ad' : `Edit Ad · ${ad.internal_title || ad.id}`) : 'Select or create an ad';
  adFields.forEach(field => {
    const input = els.adForm.elements[field.name];
    if (!input || !ad) return;
    const value = ad[field.name] ?? DEFAULT_DEV_AD[field.name] ?? '';
    if (field.type === 'checkbox') input.checked = Boolean(value);
    else input.value = value;
  });
  Object.keys(adUploadConfigs).forEach(key => setAdUploadStatus(key, 'Upload connection pending. Paste S3/CloudFront URL for now.', 'idle'));
  updateAdPreview();
}

function serializeAdForm({ forceNew = false } = {}) {
  const form = els.adForm;
  const existing = !forceNew && selectedAdId ? ads.find(ad => ad.id === selectedAdId) : null;
  const next = { ...(existing || emptyAd()), id: forceNew || !selectedAdId ? `dev-ad-${Date.now()}-${Math.random().toString(16).slice(2)}` : selectedAdId };
  adFields.forEach(field => {
    const input = form.elements[field.name];
    if (!input) return;
    if (field.type === 'checkbox') next[field.name] = input.checked;
    else if (field.type === 'number') next[field.name] = Number(input.value || DEFAULT_DEV_AD[field.name] || 0);
    else next[field.name] = input.value.trim();
  });
  next.media_type = 'Video';
  next.thumbnail_url = next.thumbnail_url || next.poster_image_url || '';
  next.poster_image_url = next.thumbnail_url;
  next.skip_after_seconds = Number.isFinite(next.skip_after_seconds) ? Math.max(0, next.skip_after_seconds) : 5;
  next.max_plays_per_session = Math.max(1, Number(next.max_plays_per_session) || 3);
  next.updated_at = new Date().toISOString();
  return normalizeAdRecord(next);
}

function validateAd(ad) {
  const missing = [];
  if (!ad.internal_title) missing.push('Internal Title');
  if (!AD_TYPE_OPTIONS.includes(ad.ad_type)) missing.push('Ad Type');
  if (ad.media_type !== 'Video') missing.push('Media Type');
  if (missing.length) {
    showMessage(`Fill required ad fields before saving: ${missing.join(', ')}.`, 'error');
    return false;
  }
  if (ad.active && !ad.media_url) {
    showMessage('Add a Media URL before activating this ad.', 'error');
    return false;
  }
  return true;
}

function persistAd(ad) {
  const existingIndex = ads.findIndex(item => item.id === ad.id);
  if (existingIndex >= 0) ads.splice(existingIndex, 1, ad);
  else ads.unshift(ad);
  ads = ensureDefaultAds(ads);
  writeAdsStorage();
  renderAdsTab();
  renderAdStats();
  renderAdForm(ad);
  showMessage(`Saved ad: ${ad.internal_title || ad.id}`, 'success');
}

function saveAd(event) {
  event.preventDefault();
  const ad = serializeAdForm();
  if (!validateAd(ad)) return;
  persistAd(ad);
}

function saveAdAsNew() {
  const ad = serializeAdForm({ forceNew: true });
  if (!validateAd(ad)) return;
  persistAd(ad);
}

function deleteSelectedAd() {
  if (!selectedAdId) {
    showMessage('Select an ad before deleting.', 'error');
    return;
  }
  deleteAd(selectedAdId);
}

function deleteAd(adId) {
  const ad = ads.find(item => item.id === adId);
  if (!ad) {
    showMessage('Ad not found.', 'error');
    return;
  }
  if (!window.confirm(`Delete ad: ${ad.internal_title || ad.id}?`)) return;
  ads = ads.filter(item => item.id !== adId);
  writeAdsStorage();
  if (selectedAdId === adId) renderAdForm(null);
  renderAdsTab();
  renderAdStats();
  showMessage(`Deleted ad: ${ad.internal_title || ad.id}`, 'success');
}

function getAdThumbnail(ad) {
  return String(ad?.thumbnail_url || ad?.poster_image_url || '').trim();
}

function renderAdsTab() {
  refreshAdsDomRefs();

  if (!hasLiveAdsManager()) {
    rebuildAdsManagerLayout();
    refreshAdsDomRefs();
  }

  bindAdsEvents();
  renderAdsFolderHelp();
  renderAds();
  renderAdStats();
  renderAdsDomStatus();
}

function rebuildAdsManagerLayout() {
  refreshAdsDomRefs();
  if (!isLiveNode(els.adsView)) return;

  console.warn('[Ads Dev] Rebuilding Ads Manager layout because manager DOM was missing or detached');

  els.adsView.querySelectorAll('.ads-panel').forEach(panel => panel.remove());

  const editorPanel = els.adsView.querySelector('.ads-edit-panel');
  const manager = document.createElement('aside');
  manager.className = 'card list-panel ads-panel';
  manager.innerHTML = `
    <div class="panel-header events-header">
      <div>
        <p class="eyebrow">ADS MANAGER</p>
        <h2 id="adsHeading">Ads Manager</h2>
        <p class="panel-copy">DEV-only ads manager for adding, editing, uploading, previewing, and saving video ads.</p>
        <p id="adsStorageNote" class="stats-generated">MVP persistence: browser localStorage. Connect real persistence later.</p>
      </div>
      <div class="panel-actions events-actions">
        <button id="createAdButton" class="button button-small" type="button">Add New Ad</button>
        <button id="refreshAdsButton" class="button button-small button-ghost" type="button">Refresh Ads</button>
      </div>
    </div>

    <div class="stats-warning ads-folder-help" role="note">
      <p><strong>Expected DEV S3 video/thumbnail folders for upload routing:</strong></p>
      <div id="adsFolderHelp"></div>
      <p class="ads-upload-note">Upload connection pending. Paste S3/CloudFront URL for now.</p>
    </div>

    <div id="adsStatus" class="song-count">No ads loaded</div>
    <div class="table-wrap events-table-wrap">
      <table class="song-table ads-table">
        <thead>
          <tr>
            <th>Thumbnail</th>
            <th>Internal Title</th>
            <th>Ad Type</th>
            <th>Media Type</th>
            <th>Status</th>
            <th>Frequency</th>
            <th>Preview</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="adsTableBody"></tbody>
      </table>
    </div>`;
  els.adsView.insertBefore(manager, editorPanel || els.adsView.firstChild);
}

function renderAdsFolderHelp() {
  const folderHelp = document.getElementById('adsFolderHelp');
  if (!folderHelp) return;

  folderHelp.innerHTML = S3_AD_FOLDER_HELP
    .map(folder => `<code>${escapeHtml(folder)}</code>`)
    .join('');
}

function renderAdsDomStatus() {
  const adsView = document.getElementById('adsView');
  if (!adsView) return;

  let status = adsView.querySelector('#adsDomStatus');

  if (!status) {
    status = document.createElement('p');
    status.id = 'adsDomStatus';
    status.className = 'ads-ui-version';
    adsView.appendChild(status);
  }

  status.textContent = [
    'Ads DOM status:',
    `adsPanel=${adsView.querySelector('.ads-panel') ? 'live' : 'missing'}`,
    `adsTableBody=${document.body.contains(document.getElementById('adsTableBody')) ? 'live' : 'missing'}`,
    `createAdButton=${document.body.contains(document.getElementById('createAdButton')) ? 'live' : 'missing'}`,
    `lastRender=${new Date().toLocaleTimeString()}`
  ].join(' ');
}

function renderAds() {
  refreshAdsDomRefs();

  if (!isLiveNode(els.adsTableBody)) {
    rebuildAdsManagerLayout();
    refreshAdsDomRefs();
    bindAdsEvents();
    renderAdsFolderHelp();
  }

  if (!isLiveNode(els.adsTableBody)) {
    console.error('[Ads Dev] adsTableBody missing after rebuild');
    return;
  }

  els.adsTableBody.innerHTML = '';
  if (els.adsStatus) els.adsStatus.textContent = `${ads.length} dev ad${ads.length === 1 ? '' : 's'} loaded from browser localStorage.`;
  if (els.adsStorageNote) els.adsStorageNote.textContent = `DEV persistence: ad records save to ${ADS_STORAGE_KEY} localStorage using the same record shape consumed by /stashbox/radio/dev/. Connect this shape to the real dev backend when the ads API is available.`;

  if (!ads.length) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="8" class="empty-state">No ads yet. Click Add New Ad to create your first Stashbox Radio Branding ad.</td>';
    els.adsTableBody.appendChild(row);
    renderAdsDomStatus();
    return;
  }

  ads.forEach(ad => {
    const thumb = getAdThumbnail(ad);
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${thumb ? `<img class="ad-list-thumb" src="${escapeHtml(thumb)}" alt="${escapeHtml(ad.internal_title || 'Ad')} thumbnail" loading="lazy">` : '<div class="ad-list-thumb ad-list-thumb-empty">No thumbnail</div>'}</td>
      <td><strong>${escapeHtml(ad.internal_title || 'Untitled ad')}</strong><div class="song-meta">${escapeHtml(ad.internal_description || '')}</div></td>
      <td>${escapeHtml(ad.ad_type || '')}</td>
      <td>${escapeHtml(ad.media_type || 'Video')}</td>
      <td>${ad.active ? '<span class="visibility-pill visible">Active</span>' : '<span class="visibility-pill hidden-state">Inactive</span>'}</td>
      <td>${escapeHtml(ad.frequency || 'Medium')}</td>
      <td><button class="button button-small button-ghost" type="button" data-preview-ad="${escapeHtml(ad.id)}">Play</button></td>
      <td class="row-actions"><button class="button button-small" type="button" data-edit-ad="${escapeHtml(ad.id)}">Edit</button><button class="button button-small button-ghost" type="button" data-delete-ad="${escapeHtml(ad.id)}">Delete</button></td>`;
    els.adsTableBody.appendChild(row);
  });
  els.adsTableBody.querySelectorAll('[data-edit-ad]').forEach(button => button.addEventListener('click', () => renderAdForm(ads.find(ad => ad.id === button.dataset.editAd))));
  els.adsTableBody.querySelectorAll('[data-delete-ad]').forEach(button => button.addEventListener('click', () => deleteAd(button.dataset.deleteAd)));
  els.adsTableBody.querySelectorAll('[data-preview-ad]').forEach(button => button.addEventListener('click', () => showListAdPreview(button.dataset.previewAd, button.closest('tr'))));
  renderAdsDomStatus();
}

function showListAdPreview(adId, anchorRow) {
  const ad = ads.find(item => item.id === adId);
  if (!ad?.media_url) {
    window.alert('No video URL yet.');
    return;
  }
  if (!anchorRow) return;
  const nextRow = anchorRow.nextElementSibling;
  if (nextRow?.classList.contains('ad-inline-preview-row') && nextRow.dataset.previewFor === adId) {
    nextRow.remove();
    return;
  }
  els.adsTableBody.querySelectorAll('.ad-inline-preview-row').forEach(row => row.remove());
  const row = document.createElement('tr');
  row.className = 'ad-inline-preview-row';
  row.dataset.previewFor = adId;
  row.innerHTML = `<td colspan="8"><div class="ad-inline-preview"><video controls playsinline preload="metadata" src="${escapeHtml(ad.media_url)}" poster="${escapeHtml(getAdThumbnail(ad))}"></video><p>Preview only — no ad tracking events are recorded.</p></div></td>`;
  anchorRow.insertAdjacentElement('afterend', row);
}

function updateAdPreview() {
  const thumbnailPreview = document.getElementById('adThumbnailPreview');
  const videoPreview = document.getElementById('adVideoPreview');
  if (!thumbnailPreview || !videoPreview || !els.adForm) return;
  const mediaUrl = String(els.adForm.elements.media_url?.value || '').trim();
  const thumbnailUrl = String(els.adForm.elements.thumbnail_url?.value || '').trim();
  thumbnailPreview.innerHTML = thumbnailUrl ? `<img src="${escapeHtml(thumbnailUrl)}" alt="Ad thumbnail preview" loading="lazy">` : '<div class="ad-preview-empty">No thumbnail URL yet.</div>';
  videoPreview.innerHTML = mediaUrl
    ? `<video controls playsinline preload="metadata" src="${escapeHtml(mediaUrl)}" ${thumbnailUrl ? `poster="${escapeHtml(thumbnailUrl)}"` : ''}></video>`
    : '<div class="ad-preview-empty">No video URL yet. Upload or paste a Media URL, then click Preview Ad.</div>';
}

function getAdUploadMetadataValidationError() {
  const title = String(els.adForm?.elements.internal_title?.value || '').trim();
  if (!title) return 'Internal Title is required before upload.';
  return '';
}

function getAdUploadRoute(adType, folderType) {
  return (AD_UPLOAD_FOLDER_ROUTES[adType] || AD_UPLOAD_FOLDER_ROUTES[DEFAULT_DEV_AD.ad_type])[folderType];
}

function slugifyAdTitle(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/&/g, ' and ')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '') || 'stashbox-radio-ad';
}

function buildAdUploadKey(config, file) {
  const title = String(els.adForm?.elements.internal_title?.value || '').trim();
  const adType = String(els.adForm?.elements.ad_type?.value || DEFAULT_DEV_AD.ad_type).trim();
  const folder = getAdUploadRoute(adType, config.folderType);
  const originalExtension = getFileExtension(file.name);
  const extension = originalExtension || (config.previewType === 'video' ? 'mp4' : 'png');
  const slug = slugifyAdTitle(title);
  const baseKey = `${folder}${slug}.${extension}`;
  const existingKeys = ads.flatMap(ad => [ad.media_url, getAdThumbnail(ad)]).filter(Boolean);
  const alreadyUsed = existingKeys.some(url => String(url).includes(baseKey));
  return alreadyUsed ? `${folder}${slug}-${Date.now()}.${extension}` : baseKey;
}

async function uploadAdMedia(configKey, file) {
  const config = adUploadConfigs[configKey];
  const metadataError = getAdUploadMetadataValidationError();
  if (metadataError) {
    setAdUploadStatus(configKey, metadataError, 'error');
    return;
  }
  const fileError = validateUploadFile(configKey, file, adUploadConfigs);
  if (fileError) {
    setAdUploadStatus(configKey, fileError, 'error');
    return;
  }

  const title = String(els.adForm.elements.internal_title.value || '').trim();
  const adType = String(els.adForm.elements.ad_type.value || DEFAULT_DEV_AD.ad_type).trim();
  const contentType = getUploadContentType(file);
  const targetKey = buildAdUploadKey(config, file);
  const keyPrefix = getAdUploadRoute(adType, config.folderType);

  setAdUploadStatus(configKey, config.uploadingMessage, 'busy');
  setAdUploadControlDisabled(configKey, true);

  try {
    const presignResult = normalizeUploadPresignResponse(await adminFetch(UPLOAD_PRESIGN_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        purpose: config.purpose,
        filename: file.name,
        content_type: contentType,
        ad_id: selectedAdId || '',
        ad_title: title,
        ad_type: adType,
        song_key: slugifyAdTitle(title),
        song_name: title,
        artist: 'Stashbox Radio Ads',
        key_prefix: keyPrefix,
        target_key: targetKey
      })
    }));

    const uploadUrl = presignResult?.upload_url;
    const publicUrl = presignResult?.public_url;
    if (!uploadUrl || !publicUrl) throw new Error('Presign response was missing upload_url or public_url.');

    const s3Response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: file
    });
    if (!s3Response.ok) throw new Error(`S3 upload failed with status ${s3Response.status}.`);

    const input = els.adForm.elements[config.fieldName];
    input.value = publicUrl;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    setAdUploadStatus(configKey, config.successMessage, 'success');
    showMessage(config.successMessage, 'success');
  } catch (error) {
    setAdUploadStatus(configKey, `${config.failurePrefix}: ${error.message}`, 'error');
  } finally {
    setAdUploadControlDisabled(configKey, false);
  }
}

function setAdUploadControlDisabled(configKey, isDisabled) {
  const controls = adUploadElements.get(configKey);
  if (controls?.button) controls.button.disabled = Boolean(isDisabled);
}

function setAdUploadStatus(configKey, message, status = 'idle') {
  const statusEl = adUploadElements.get(configKey)?.status;
  if (!statusEl) return;
  statusEl.textContent = message || '';
  statusEl.classList.toggle('is-error', status === 'error');
  statusEl.classList.toggle('is-success', status === 'success');
  statusEl.classList.toggle('is-busy', status === 'busy');
}

function adStatsSummary() {
  const storedEvents = readJsonStorage(ADS_STATS_STORAGE_KEY, []);
  const events = Array.isArray(storedEvents) ? storedEvents : [];
  const byAd = new Map(ads.map(ad => [ad.id, { ad, ad_impression: 0, ad_started: 0, ad_completed: 0, ad_skipped: 0, ad_cta_clicked: 0, ad_error: 0 }]));
  events.forEach(event => {
    const id = event.ad_id || event.adId;
    if (!byAd.has(id)) byAd.set(id, { ad: { id, internal_title: event.ad_title || event.adTitle || id }, ad_impression: 0, ad_started: 0, ad_completed: 0, ad_skipped: 0, ad_cta_clicked: 0, ad_error: 0 });
    const row = byAd.get(id);
    if (row[event.event_type] !== undefined) row[event.event_type] += 1;
  });
  return Array.from(byAd.values());
}

function pct(part, total) {
  return total ? `${Math.round((part / total) * 100)}%` : '0%';
}

function renderAdStats() {
  if (!els.adStatsTableBody) return;
  els.adStatsTableBody.innerHTML = '';
  adStatsSummary().forEach(row => {
    const tr = document.createElement('tr');
    const impressions = row.ad_impression;
    const starts = row.ad_started;
    tr.innerHTML = `
      <td><strong>${escapeHtml(row.ad.internal_title || row.ad.id)}</strong></td>
      <td>${impressions}</td><td>${starts}</td><td>${row.ad_completed}</td><td>${row.ad_skipped}</td><td>${row.ad_cta_clicked}</td><td>${row.ad_error}</td>
      <td>${pct(row.ad_completed, starts)}</td><td>${pct(row.ad_skipped, starts)}</td><td>${pct(row.ad_cta_clicked, impressions)}</td>`;
    els.adStatsTableBody.appendChild(tr);
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
