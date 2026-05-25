const SHEET_NAME = "videos";
const RADIO_SHEET_NAME = "Radio";
const RADIO_SONG_NAME_COL = 1; // Column A
const RADIO_ARTIST_COL = 3; // Column C
const RADIO_WAV_LINK_COL = 7; // Column G
const RADIO_CLICKS_COL = 12; // Column L
const RADIO_FULL_PLAYS_COL = 13; // Column M
const RADIO_TOTAL_SECONDS_COL = 14; // Column N
const RADIO_AVG_SECONDS_COL = 15; // Column O
const RADIO_SONG_SHARES_COL = 16; // Column P

function doGet(e) {
  const action = String(e.parameter.action || "");
  if (action !== "increment") {
    return jsonOut({ ok: false, error: "Invalid action" });
  }

  const key = cleanKey(e.parameter.key);
  const type = String(e.parameter.type || "").toLowerCase();
  const title = String(e.parameter.title || "");
  const artist = String(e.parameter.artist || "");

  if (!key || ["share", "play", "like"].indexOf(type) === -1) {
    return jsonOut({ ok: false, error: "Invalid params" });
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME);

    if (!sheet) {
      return jsonOut({ ok: false, error: "Missing videos sheet" });
    }

    const data = sheet.getDataRange().getValues();
    const headers = data[0].map(String);

    const keyCol = headers.indexOf("videoKey");
    const shareCol = headers.indexOf("shareCount");
    const playCol = headers.indexOf("playCount");
    const likeCol = headers.indexOf("likeCount");
    const updatedCol = headers.indexOf("updatedAt");
    const titleCol = headers.indexOf("song");
    const artistCol = headers.indexOf("songby");

    if (keyCol === -1 || shareCol === -1 || playCol === -1 || likeCol === -1) {
      return jsonOut({ ok: false, error: "Missing required stats columns" });
    }

    let rowIndex = -1;

    for (let i = 1; i < data.length; i++) {
      if (cleanKey(data[i][keyCol]) === key) {
        rowIndex = i + 1;
        break;
      }
    }

    if (rowIndex === -1) {
      return jsonOut({ ok: false, error: "Video key not found", key });
    }

    const targetCol =
      type === "share" ? shareCol :
      type === "play" ? playCol :
      likeCol;

    const cell = sheet.getRange(rowIndex, targetCol + 1);
    const current = Number(cell.getValue()) || 0;
    const next = current + 1;
    cell.setValue(next);

    if (updatedCol >= 0) {
      sheet.getRange(rowIndex, updatedCol + 1).setValue(new Date());
    }

    if (title && titleCol >= 0 && !sheet.getRange(rowIndex, titleCol + 1).getValue()) {
      sheet.getRange(rowIndex, titleCol + 1).setValue(title);
    }

    if (artist && artistCol >= 0 && !sheet.getRange(rowIndex, artistCol + 1).getValue()) {
      sheet.getRange(rowIndex, artistCol + 1).setValue(artist);
    }

    return jsonOut({ ok: true, key, type, count: next });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function doPost(e) {
  const data = parsePostBody(e);
  const type = String(data.type || "").toLowerCase();

  if (type === "radio_play") {
    return handleRadioPlay(data);
  }

  if (type === "radio_full_play") {
    return handleRadioFullPlay(data);
  }

  if (type === "radio_listen_time") {
    return handleRadioListenTime(data);
  }

  if (type === "radio_song_share") {
    return handleRadioSongShare(data);
  }

  return jsonOut({ ok: false, success: false, error: "Unsupported type", type });
}

function parsePostBody(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  try {
    return JSON.parse(e.postData.contents);
  } catch (err) {
    return {};
  }
}

function handleRadioPlay(data) {
  return handleRadioMetric(data, RADIO_CLICKS_COL, "Clicks", "radio_play", "clicksColumn");
}

function handleRadioFullPlay(data) {
  return handleRadioMetric(data, RADIO_FULL_PLAYS_COL, "fullPlays", "radio_full_play", "fullPlaysColumn");
}

function handleRadioSongShare(data) {
  return handleRadioMetric(data, RADIO_SONG_SHARES_COL, "songShares", "radio_song_share", "songSharesColumn");
}

function handleRadioMetric(data, countCol, expectedHeader, type, colKey) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const ss = getSpreadsheet();
    const sheet = getRadioSheet(ss);
    if (!sheet) {
      return jsonOut({ success: false, error: "Radio sheet not found" });
    }

    ensureHeader(sheet, countCol, expectedHeader);

    const found = findRadioRow(sheet, data);
    if (!found.row) {
      return jsonOut({ success: false, error: "Radio song not found.", title: found.title, artist: found.artist, audioUrl: found.audioUrl });
    }

    const cell = sheet.getRange(found.row, countCol);
    const newValue = (Number(cell.getValue()) || 0) + 1;
    cell.setValue(newValue);

    return jsonOut({ success: true, type, sheet: sheet.getName(), row: found.row, count: newValue, matchMethod: found.matchMethod, [colKey]: columnToLetter(countCol) });
  } catch (err) {
    return jsonOut({ success: false, error: String(err), stack: err && err.stack ? err.stack : "" });
  } finally {
    lock.releaseLock();
  }
}

function handleRadioListenTime(data) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const listenedSeconds = Math.round(Number(data.listenedSeconds) || 0);
    if (!listenedSeconds || listenedSeconds <= 0) {
      return jsonOut({ success: false, error: "Missing or invalid listenedSeconds", listenedSeconds: data.listenedSeconds });
    }

    const ss = getSpreadsheet();
    const sheet = getRadioSheet(ss);
    if (!sheet) {
      return jsonOut({ success: false, error: "Radio sheet not found" });
    }

    ensureHeader(sheet, RADIO_TOTAL_SECONDS_COL, "totalPlaySeconds");
    ensureHeader(sheet, RADIO_AVG_SECONDS_COL, "avgPlaySeconds");

    const found = findRadioRow(sheet, data);
    if (!found.row) {
      return jsonOut({ success: false, error: "Radio song not found. Listen time not written.", title: found.title, artist: found.artist, audioUrl: found.audioUrl });
    }

    const totalCell = sheet.getRange(found.row, RADIO_TOTAL_SECONDS_COL);
    const avgCell = sheet.getRange(found.row, RADIO_AVG_SECONDS_COL);
    const clicksCell = sheet.getRange(found.row, RADIO_CLICKS_COL);

    const newTotal = (Number(totalCell.getValue()) || 0) + listenedSeconds;
    const clicks = Number(clicksCell.getValue()) || 1;
    const avgSeconds = Math.round(newTotal / clicks);

    totalCell.setValue(newTotal);
    avgCell.setValue(avgSeconds);

    return jsonOut({ success: true, type: "radio_listen_time", sheet: sheet.getName(), row: found.row, listenedSeconds, totalPlaySeconds: newTotal, avgPlaySeconds: avgSeconds, matchMethod: found.matchMethod, totalSecondsColumn: columnToLetter(RADIO_TOTAL_SECONDS_COL), avgSecondsColumn: columnToLetter(RADIO_AVG_SECONDS_COL) });
  } catch (err) {
    return jsonOut({ success: false, error: String(err), stack: err && err.stack ? err.stack : "" });
  } finally {
    lock.releaseLock();
  }
}

function findRadioRow(sheet, data) {
  const title = clean(data.title);
  const artist = clean(data.artist);
  const audioUrl = clean(data.audioUrl);

  const lastRow = sheet.getLastRow();
  const lastCol = Math.max(sheet.getLastColumn(), RADIO_SONG_SHARES_COL);

  if (lastRow < 2) {
    return { row: null, matchMethod: null, title, artist, audioUrl };
  }

  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const titleCol = findExistingColumn(headers, ["Song Name","song name","title","Title","song","Song","name","Name"]) || 1;
  const artistCol = findExistingColumn(headers, ["Artist","artist","Song By","songby","SongBy"]) || 3;
  const audioCol = findExistingColumn(headers, ["WAV Link","wav link","Audio Link","audio link","audioUrl","Audio URL","WAV URL"]) || 7;

  const values = sheet.getRange(2, 1, lastRow - 1, Math.max(titleCol, artistCol, audioCol, RADIO_SONG_SHARES_COL)).getValues();

  if (audioUrl) {
    const targetAudio = normalizeUrl(audioUrl);
    for (let i = 0; i < values.length; i++) {
      const rowAudio = normalizeUrl(values[i][audioCol - 1]);
      if (rowAudio && rowAudio === targetAudio) return { row: i + 2, matchMethod: "WAV Link", title, artist, audioUrl };
    }
  }

  if (title && artist) {
    const targetTitle = normalizeText(title);
    const targetArtist = normalizeText(artist);
    for (let i = 0; i < values.length; i++) {
      const rowTitle = normalizeText(values[i][titleCol - 1]);
      const rowArtist = normalizeText(values[i][artistCol - 1]);
      if (rowTitle === targetTitle && rowArtist === targetArtist) return { row: i + 2, matchMethod: "Song Name + Artist", title, artist, audioUrl };
    }
  }

  return { row: null, matchMethod: null, title, artist, audioUrl };
}

function ensureHeader(sheet, col, headerName) {
  const current = String(sheet.getRange(1, col).getValue() || "").trim();
  if (current !== headerName) {
    sheet.getRange(1, col).setValue(headerName);
  }
}

function getRadioSheet(spreadsheet) {
  return spreadsheet.getSheetByName(RADIO_SHEET_NAME);
}

function findExistingColumn(headers, names) {
  for (let i = 0; i < headers.length; i++) {
    const head = String(headers[i] || "").trim().toLowerCase();
    for (let j = 0; j < names.length; j++) {
      if (head === String(names[j]).trim().toLowerCase()) return i + 1;
    }
  }
  return null;
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeUrl(value) {
  return String(value || "").trim().replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();
}

function columnToLetter(column) {
  let temp = "";
  let col = column;
  while (col > 0) {
    const rem = (col - 1) % 26;
    temp = String.fromCharCode(65 + rem) + temp;
    col = Math.floor((col - rem) / 26);
  }
  return temp;
}

function clean(value) {
  return String(value || "").trim();
}

function extractHyperlinkUrl(formula) {
  const src = String(formula || "").trim();
  if (!src) return "";
  const match = src.match(/^=HYPERLINK\("([^"\n]+)"/i);
  return match ? normalizeAudioUrl(match[1]) : "";
}

function normalizeAudioUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

function cleanKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
