const SHEET_NAME = "videos";

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
