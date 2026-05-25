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
    const ss = SpreadsheetApp.getActiveSpreadsheet();
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

  if (type === "radio_play") return handleRadioPlay(data);
  if (type === "radio_full_play") return handleRadioFullPlay(data);
  if (type === "radio_listen_time") return handleRadioListenTime(data);
  if (type === "radio_song_share") return handleRadioSongShare(data);

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
    const match = findRadioRow(data);
    if (!match.row) {
      return jsonOut({ success: false, type, sheet: RADIO_SHEET_NAME, error: "Radio track not found" });
    }

    const sheet = match.sheet;
    const row = match.row;
    const headerCell = sheet.getRange(1, countCol);
    if (String(headerCell.getValue() || "").trim() !== expectedHeader) {
      headerCell.setValue(expectedHeader);
    }

    const countCell = sheet.getRange(row, countCol);
    const next = (Number(countCell.getValue()) || 0) + 1;
    countCell.setValue(next);

    return jsonOut({
      success: true,
      type,
      sheet: RADIO_SHEET_NAME,
      row,
      count: next,
      matchMethod: match.matchMethod,
      [colKey]: countCol
    });
  } catch (err) {
    return jsonOut({ success: false, type, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function handleRadioListenTime(data) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const match = findRadioRow(data);
    if (!match.row) return jsonOut({ success: false, type: "radio_listen_time", error: "Radio row not found" });

    const listenedRaw = Number(data.listenedSeconds);
    if (!isFinite(listenedRaw) || listenedRaw <= 0) {
      return jsonOut({ success: false, type: "radio_listen_time", ignored: true, reason: "Invalid listenedSeconds" });
    }

    const listenedSeconds = Math.round(listenedRaw);
    if (listenedSeconds <= 0) {
      return jsonOut({ success: false, type: "radio_listen_time", ignored: true, reason: "Rounded listenedSeconds <= 0" });
    }

    const sheet = match.sheet;
    if (String(sheet.getRange(1, RADIO_TOTAL_SECONDS_COL).getValue()) !== "totalPlaySeconds") {
      sheet.getRange(1, RADIO_TOTAL_SECONDS_COL).setValue("totalPlaySeconds");
    }
    if (String(sheet.getRange(1, RADIO_AVG_SECONDS_COL).getValue()) !== "avgPlaySeconds") {
      sheet.getRange(1, RADIO_AVG_SECONDS_COL).setValue("avgPlaySeconds");
    }

    const totalCell = sheet.getRange(match.row, RADIO_TOTAL_SECONDS_COL);
    const currentTotal = Number(totalCell.getValue()) || 0;
    const totalPlaySeconds = currentTotal + listenedSeconds;
    totalCell.setValue(totalPlaySeconds);

    const clicks = Number(sheet.getRange(match.row, RADIO_CLICKS_COL).getValue()) || 0;
    const denominator = clicks > 0 ? clicks : 1;
    const avgPlaySeconds = totalPlaySeconds / denominator;
    sheet.getRange(match.row, RADIO_AVG_SECONDS_COL).setValue(avgPlaySeconds);

    return jsonOut({
      success: true,
      type: "radio_listen_time",
      sheet: RADIO_SHEET_NAME,
      row: match.row,
      listenedSeconds,
      totalPlaySeconds,
      avgPlaySeconds,
      matchMethod: match.matchMethod
    });
  } catch (err) {
    return jsonOut({ success: false, type: "radio_listen_time", error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function findRadioRow(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(RADIO_SHEET_NAME);
  if (!sheet) throw new Error("Missing Radio sheet");

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { sheet: sheet, row: null, matchMethod: null };

  const numRows = lastRow - 1;
  const values = sheet.getRange(2, 1, numRows, Math.max(RADIO_SONG_SHARES_COL, RADIO_WAV_LINK_COL)).getValues();
  const audioUrl = normalizeAudioUrl(data.audioUrl);
  const tl = String(data.title || "").trim().toLowerCase();
  const al = String(data.artist || "").trim().toLowerCase();

  if (audioUrl) {
    for (let i = 0; i < values.length; i++) {
      const rowAudio = normalizeAudioUrl(values[i][RADIO_WAV_LINK_COL - 1]);
      if (rowAudio && rowAudio === audioUrl) {
        return { sheet: sheet, row: i + 2, matchMethod: "audioUrl" };
      }
    }
  }

  if (tl || al) {
    for (let j = 0; j < values.length; j++) {
      if (
        String(values[j][RADIO_SONG_NAME_COL - 1] || "").trim().toLowerCase() === tl &&
        String(values[j][RADIO_ARTIST_COL - 1] || "").trim().toLowerCase() === al
      ) {
        return { sheet: sheet, row: j + 2, matchMethod: "title_artist" };
      }
    }
  }

  return { sheet: sheet, row: null, matchMethod: null };
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
