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
