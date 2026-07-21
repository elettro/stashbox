import fs from 'node:fs';

// This file also acts as the safe push trigger after the workflow exists on main.
const filePath = 'scripts/apply-dev-playlist-playback.mjs';
let source = fs.readFileSync(filePath, 'utf8');

const replacements = [
  [
    "        setPlayerMessage('__DL__playlistName__BT__ does not contain any currently playable songs.');",
    "        setPlayerMessage(__BT____DL__playlistName} does not contain any currently playable songs.__BT__);"
  ],
  [
    "      setActiveShuffleSourceKey(__BT__playlist:__DL__playlistId:__DL__requestedMode__BT__);",
    "      setActiveShuffleSourceKey(__BT__playlist:__DL__playlistId}:__DL__requestedMode}__BT__);"
  ],
  [
    "      setShuffleNotice(__BT____DL__playlistName · __DL__queue.length song__DL__queue.length === 1 ? '' : 's' · __DL__requestedMode === 'shuffle' ? 'Shuffled playlist' : 'Playlist order'__BT__);",
    "      setShuffleNotice(__BT____DL__playlistName} · __DL__queue.length} song__DL__queue.length === 1 ? '' : 's'} · __DL__requestedMode === 'shuffle' ? 'Shuffled playlist' : 'Playlist order'}__BT__);"
  ],
  [
    "      setPlayerMessage(__BT__Playing “__DL__playlistName” __DL__requestedMode === 'shuffle' ? 'in shuffle mode' : 'in playlist order'. The list will repeat.__BT__);",
    "      setPlayerMessage(__BT__Playing “__DL__playlistName}” __DL__requestedMode === 'shuffle' ? 'in shuffle mode' : 'in playlist order'}. The list will repeat.__BT__);"
  ],
  [
    "            <article class=\"radio-playlist-track\" data-playlist-song-key=\"__DL__escapeHtml(item.song_key || song?.song_key || '')\">",
    "            <article class=\"radio-playlist-track\" data-playlist-song-key=\"__DL__escapeHtml(item.song_key || song?.song_key || '')}\">"
  ],
  [
    "                <img src=\"__DL__escapeHtml(artwork)\" alt=\"__DL__escapeHtml(title) artwork\" loading=\"lazy\">",
    "                <img src=\"__DL__escapeHtml(artwork)}\" alt=\"__DL__escapeHtml(title)} artwork\" loading=\"lazy\">"
  ],
  [
    "                <span aria-hidden=\"true\">__DL__index + 1</span>",
    "                <span aria-hidden=\"true\">__DL__index + 1}</span>"
  ],
  [
    "                <strong>__DL__escapeHtml(title)</strong>",
    "                <strong>__DL__escapeHtml(title)}</strong>"
  ],
  [
    "                <span>__DL__escapeHtml(artist)</span>",
    "                <span>__DL__escapeHtml(artist)}</span>"
  ],
  [
    "      <section class=\"radio-playlist-detail\" data-playlist-detail-id=\"__DL__playlistId\">",
    "      <section class=\"radio-playlist-detail\" data-playlist-detail-id=\"__DL__playlistId}\">"
  ],
  [
    "            <h3 class=\"radio-account-section-title\">__DL__escapeHtml(playlist.name || 'Playlist')</h3>",
    "            <h3 class=\"radio-account-section-title\">__DL__escapeHtml(playlist.name || 'Playlist')}</h3>"
  ],
  [
    "            <button class=\"primary radio-playlist-start-button\" type=\"button\" data-play-playlist=\"__DL__playlistId\" __DL__items.length ? '' : 'disabled'}>",
    "            <button class=\"primary radio-playlist-start-button\" type=\"button\" data-play-playlist=\"__DL__playlistId}\" __DL__items.length ? '' : 'disabled'}>"
  ],
  [
    "            <button class=\"radio-playlist-shuffle-button\" type=\"button\" data-shuffle-playlist=\"__DL__playlistId\" __DL__items.length ? '' : 'disabled'}>",
    "            <button class=\"radio-playlist-shuffle-button\" type=\"button\" data-shuffle-playlist=\"__DL__playlistId}\" __DL__items.length ? '' : 'disabled'}>"
  ]
];

for (const [before, after] of replacements) {
  if (source.includes(after)) continue;
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`Expected one patch-generator correction anchor, found ${count}: ${before}`);
  source = source.replace(before, after);
}

fs.writeFileSync(filePath, source, 'utf8');
console.log('DEV playlist patch generator corrected.');
