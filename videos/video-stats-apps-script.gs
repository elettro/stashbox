const SHEET_NAME = "videos";
const RADIO_SHEET_NAME = "radio";
const RADIO_WAV_LINK_COL = 8; // Column H
const RADIO_SONG_NAME_COL = 1; // Column A
const RADIO_ARTIST_COL = 2; // Column B
const RADIO_CLICKS_COL = 12; // Column L
const RADIO_FULL_PLAYS_COL = 13; // Column M

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


function doPost(e) {
  const data = parsePostBody(e);
  const type = String(data.type || "").toLowerCase();

  if (type === "radio_play") {
    return handleRadioPlay(data);
  }

  if (type === "radio_full_play") {
    return handleRadioFullPlay(data);
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

function handleRadioMetric(data, countCol, expectedHeader, type, colKey) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(RADIO_SHEET_NAME);

    if (!sheet) {
      return jsonOut({ success: false, type, error: "Missing radio sheet" });
    }

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return jsonOut({ success: false, type, sheet: RADIO_SHEET_NAME, error: "No radio rows" });
    }

    const rows = sheet.getRange(2, 1, lastRow - 1, Math.max(RADIO_FULL_PLAYS_COL, RADIO_WAV_LINK_COL)).getValues();
    const title = String(data.title || "").trim();
    const artist = String(data.artist || "").trim();
    const audioUrl = String(data.audioUrl || "").trim();

    let rowOffset = -1;
    let matchMethod = "";

    if (audioUrl) {
      for (let i = 0; i < rows.length; i++) {
        if (String(rows[i][RADIO_WAV_LINK_COL - 1] || "").trim() === audioUrl) {
          rowOffset = i;
          matchMethod = "wavLink";
          break;
        }
      }
    }

    if (rowOffset === -1 && title && artist) {
      for (let i = 0; i < rows.length; i++) {
        if (
          String(rows[i][RADIO_SONG_NAME_COL - 1] || "").trim() === title &&
          String(rows[i][RADIO_ARTIST_COL - 1] || "").trim() === artist
        ) {
          rowOffset = i;
          matchMethod = "songArtist";
          break;
        }
      }
    }

    if (rowOffset === -1) {
      return jsonOut({ success: false, type, sheet: RADIO_SHEET_NAME, error: "Radio track not found" });
    }

    const row = rowOffset + 2;
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
      matchMethod,
      [colKey]: countCol
    });
  } catch (err) {
    return jsonOut({ success: false, type, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}
