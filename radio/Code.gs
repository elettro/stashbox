const SPREADSHEET_ID = "1_cQl2Bp3-ipitgOkvgMIoTno6cbLPSLIZCjp77viSjE";

const VIDEO_SHEET_NAME = "videos";
const RADIO_SHEET_NAMES = ["radio", "Radio"];
const PRODUCT_MAP_SHEET_NAMES = ["productMap", "ProductMap", "productmap", "products", "Products"];

const RADIO_CLICKS_COL = 12;
const RADIO_FULL_PLAYS_COL = 13;
const RADIO_TOTAL_SECONDS_COL = 14;
const RADIO_AVG_SECONDS_COL = 15;
const RADIO_SONG_SHARES_COL = 16;

const PRODUCT_MAP_VIEWS_COL  = 11;  // ← NEW — column K
const PRODUCT_MAP_CLICKS_COL = 12;  // ← NEW — column L

const PUBLIC_STASHBOX_RADIO_URL = "https://elettro.github.io/stashbox/radio/";

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const key = String(params.key || "").trim();
  const requestedType = String(params.type || "").trim().toLowerCase();

  const productMapRequested =
    (!requestedType && !key) ||        // ← FIXED — default when redirect strips params
    requestedType === "productmap" ||
    requestedType === "product_map" ||
    requestedType === "products" ||
    requestedType === "merch" ||
    String(params.productMap || "").trim() === "1";

  const dashboardRequested =
    String(params.dashboard || "").trim() === "1" ||
    String(params.mode || "").trim().toLowerCase() === "dashboard" ||
    String(params.read || "").trim().toLowerCase() === "dashboard" ||
    ["radio", "videos", "video", "all", "productmap", "product_map", "products", "merch"].includes(requestedType);

  if (productMapRequested && !key) {
    return handleProductMapApi(e);
  }

  if (dashboardRequested && !key) {
    return handleDashboardApi(e);
  }

  return handleVideoTracking(e);
}

function doPost(e) {
  try {
    const data = parsePostData(e);
    const type = String(data.type || "").trim();

    if (type === "radio_play")         return handleRadioPlay(data);
    if (type === "radio_full_play")    return handleRadioFullPlay(data);
    if (type === "radio_listen_time")  return handleRadioListenTime(data);
    if (type === "radio_song_share")   return handleRadioSongShare(data);
    if (type === "product_view")       return handleProductView(data);   // ← NEW
    if (type === "product_click")      return handleProductClick(data);  // ← NEW

    return jsonResponse({
      success: false,
      ok: false,
      error: "Unknown POST type",
      type: type
    });
  } catch (err) {
    return jsonResponse({
      success: false,
      ok: false,
      error: String(err),
      stack: err && err.stack ? err.stack : ""
    });
  }
}

function doOptions(e) {
  return jsonResponse({
    ok: true,
    success: true,
    message: "OPTIONS acknowledged. Google Apps Script does not allow custom CORS headers through ContentService, but simple GET requests from GitHub Pages usually work when deployed to Anyone."
  });
}

function parsePostData(e) {
  const raw = e && e.postData && e.postData.contents ? e.postData.contents : "{}";
  try {
    return JSON.parse(raw);
  } catch (err) {
    return {};
  }
}

/* =========================================================
   PRODUCT MAP TRACKING  ← NEW
========================================================= */

function handleProductView(data) {
  return handleProductMapTracking(data, "product_view", PRODUCT_MAP_VIEWS_COL, "views");
}

function handleProductClick(data) {
  return handleProductMapTracking(data, "product_click", PRODUCT_MAP_CLICKS_COL, "clicks");
}

function handleProductMapTracking(data, eventType, col, colLabel) {
  try {
    const rowNumber = parseInt(data.rowNumber, 10);
    if (!rowNumber || rowNumber < 2) {
      return jsonResponse({ success: false, ok: false, error: "Invalid or missing rowNumber", data: data });
    }

    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = getProductMapSheet(spreadsheet);

    if (!sheet) {
      return jsonResponse({ success: false, ok: false, error: "productMap sheet not found. Tried: " + PRODUCT_MAP_SHEET_NAMES.join(", ") });
    }

    ensureHeader(sheet, col, colLabel);

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);

    try {
      const cell    = sheet.getRange(rowNumber, col);
      const newVal  = (Number(cell.getValue()) || 0) + 1;
      cell.setValue(newVal);

      return jsonResponse({
        success:   true,
        ok:        true,
        type:      eventType,
        sheet:     sheet.getName(),
        rowNumber: rowNumber,
        column:    columnToLetter(col),
        newValue:  newVal
      });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return jsonResponse({ success: false, ok: false, error: String(err), stack: err && err.stack ? err.stack : "" });
  }
}

/* =========================================================
   DASHBOARD READ-ONLY JSON API
========================================================= */

function handleDashboardApi(e) {
  try {
    const params = e && e.parameter ? e.parameter : {};
    const requestedType = String(params.type || "all").trim().toLowerCase();
    const debug = String(params.debug || "").trim() === "1";

    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);

    const radioSheet = getRadioSheet(spreadsheet);
    const videoSheet = spreadsheet.getSheetByName(VIDEO_SHEET_NAME);
    const productMapSheet = getProductMapSheet(spreadsheet);

    const includeRadio = requestedType === "all" || requestedType === "radio" || requestedType === "";
    const includeVideos = requestedType === "all" || requestedType === "videos" || requestedType === "video" || requestedType === "";
    const includeProductMap =
      requestedType === "all" ||
      requestedType === "productmap" ||
      requestedType === "product_map" ||
      requestedType === "products" ||
      requestedType === "merch" ||
      requestedType === "";

    const output = {
      ok: true,
      success: true,
      updatedAt: new Date().toISOString(),
      radio: [],
      videos: [],
      productMap: [],
      meta: {
        radioCount: 0,
        videoCount: 0,
        productMapCount: 0
      }
    };

    if (includeRadio) {
      if (!radioSheet) {
        return jsonResponse({ ok: false, success: false, error: "Radio sheet not found. Tried: " + RADIO_SHEET_NAMES.join(", "), updatedAt: new Date().toISOString() });
      }
      const radioResult = readRadioDashboardRows(radioSheet, debug);
      output.radio = radioResult.rows;
      output.meta.radioCount = radioResult.rows.length;
      if (debug) { output.debug = output.debug || {}; output.debug.radio = radioResult.debug; }
    }

    if (includeVideos) {
      if (!videoSheet) {
        return jsonResponse({ ok: false, success: false, error: "Videos sheet not found: " + VIDEO_SHEET_NAME, updatedAt: new Date().toISOString() });
      }
      const videoResult = readVideoDashboardRows(videoSheet, debug);
      output.videos = videoResult.rows;
      output.meta.videoCount = videoResult.rows.length;
      if (debug) { output.debug = output.debug || {}; output.debug.videos = videoResult.debug; }
    }

    if (includeProductMap) {
      if (!productMapSheet) {
        if (["productmap","product_map","products","merch"].includes(requestedType)) {
          return jsonResponse({ ok: false, success: false, error: "productMap sheet not found. Tried: " + PRODUCT_MAP_SHEET_NAMES.join(", "), updatedAt: new Date().toISOString() });
        }
      } else {
        const productMapResult = readProductMapRows(productMapSheet, debug);
        output.productMap = productMapResult.rows;
        output.meta.productMapCount = productMapResult.rows.length;
        if (debug) { output.debug = output.debug || {}; output.debug.productMap = productMapResult.debug; }
      }
    }

    output.meta.radioTotals = getRadioTotals(output.radio);
    output.meta.videoTotals = getVideoTotals(output.videos);

    return jsonResponse(output);
  } catch (err) {
    return jsonResponse({ ok: false, success: false, error: String(err), stack: err && err.stack ? err.stack : "", updatedAt: new Date().toISOString() });
  }
}

function readRadioDashboardRows(sheet, debug) {
  const data = getSheetObjects(sheet);

  const rows = data.objects
    .filter(function (row) { return !isObjectRowEmpty(row); })
    .map(function (row, index) {
      const title = firstValue(row, ["title","song","songtitle","songname","name","track","tracktitle"]);
      const artist = firstValue(row, ["artist","artistname","songby","performedby","creator"]);
      const artwork = firstValue(row, ["artwork","artworklink","artworkurl","artworkimage","artworksrc","thumbnail","thumb","image","imageurl","imagelink","cover","coverimage","coverlink","coverurl","photo","picture","column9"]);
      const thumbnail = artwork;
      const audioUrl = firstValue(row, ["audiourl","audio","audiolink","wavlink","wavurl","mp3","mp3url","file","fileurl"]);
      const sheetSongUrl = firstValue(row, ["songurl","url","link","shareurl","playerurl","radioUrl"]);
      const videoLink = firstValue(row, ["videolink","videourl","musicvideo","musicvideolink","youtube","youtubeurl","youtubelink","youtubevideo","youtubevideolink","video","column10"]);
      const plays = firstNumber(row, ["plays","playcount","totalplays","songplays","clicks","clickcount","totalclicks"]);
      const fullPlays = firstNumber(row, ["fullplays","fullsongplays","completedplays","completeplays","completioncount","fullplaycount"]);
      const playSeconds = firstNumber(row, ["playseconds","totalplayseconds","totalseconds","seconds","listenseconds","totallistenseconds","listeningseconds"]);
      let averageSeconds = firstNumber(row, ["averageseconds","avgseconds","avgplayseconds","averagelistenseconds","avglistenseconds","averageplayseconds"]);
      if (!averageSeconds && playSeconds && plays) { averageSeconds = Math.round(playSeconds / plays); }
      const shares = firstNumber(row, ["shares","sharecount","totalshares","songshares","songsHaRes","radioShares"]);
      const shareClicks = firstNumber(row, ["shareclicks","totalshareclicks","sharelinkclicks","shareurlclicks","sharedclicks"]);
      const likes = firstNumber(row, ["likes","likecount","totallikes"]);
      const skips = firstNumber(row, ["skips","skipcount","totalskips"]);
      const lastPlayed = firstValue(row, ["lastplayed","lastplay","lastlistened","lastupdated","updatedat"]);
      const album = firstValue(row, ["album","albumname","release"]);
      const genre = firstValue(row, ["genre","style"]);

      return {
        rowNumber: index + 2,
        title, artist, album, genre,
        artwork: normalizeDashboardUrl(artwork),
        thumbnail: normalizeDashboardUrl(thumbnail),
        audioUrl: normalizeDashboardUrl(audioUrl),
        videoLink: normalizeDashboardUrl(videoLink),
        videoUrl: normalizeDashboardUrl(videoLink),
        youtubeUrl: normalizeDashboardUrl(videoLink),
        songUrl: sheetSongUrl || buildRadioSongUrl(title, artist),
        plays, fullPlays, playSeconds, averageSeconds,
        shares, shareClicks, likes, skips, lastPlayed
      };
    })
    .filter(function (row) { return row.title || row.artist || row.audioUrl; });

  return {
    rows: rows,
    debug: debug ? { sheetName: sheet.getName(), originalHeaders: data.headers, normalizedHeaders: data.normalizedHeaders, rawRowCount: data.rawRowCount, outputRowCount: rows.length } : null
  };
}

function readVideoDashboardRows(sheet, debug) {
  const data = getSheetObjects(sheet);

  const rows = data.objects
    .filter(function (row) { return !isObjectRowEmpty(row); })
    .map(function (row, index) {
      const title = firstValue(row, ["title","videotitle","song","songtitle","name","track"]);
      const artist = firstValue(row, ["artist","artistname","songby","performedby","creator"]);
      const url = firstValue(row, ["url","videourl","youtubeurl","youtubelink","link"]);
      let videoKey = firstValue(row, ["videokey","youtubeid","youtubevideoid","videoid","key","id"]);
      if (!videoKey && url) { videoKey = extractYouTubeId(url); }
      const thumbnail = firstValue(row, ["thumbnail","thumb","image","imageurl","cover","coverimage","artwork","photo","picture"]) || buildYouTubeThumbnail(videoKey);
      const likes = firstNumber(row, ["likes","likecount","totallikes"]);
      const clicks = firstNumber(row, ["clicks","clickcount","playcount","plays","totalclicks","totalplays"]);
      const shares = firstNumber(row, ["shares","sharecount","totalshares"]);
      const views = firstNumber(row, ["views","viewcount","totalviews","youtubeviews"]);

      return { rowNumber: index + 2, title, artist, thumbnail: normalizeDashboardUrl(thumbnail), url, videoKey, likes, clicks, shares, views };
    })
    .filter(function (row) { return row.title || row.url || row.videoKey; });

  return {
    rows: rows,
    debug: debug ? { sheetName: sheet.getName(), originalHeaders: data.headers, normalizedHeaders: data.normalizedHeaders, rawRowCount: data.rawRowCount, outputRowCount: rows.length } : null
  };
}

/* =========================================================
   PRODUCT MAP READ-ONLY JSON API
========================================================= */

function handleProductMapApi(e) {
  try {
    const params = e && e.parameter ? e.parameter : {};
    const debug = String(params.debug || "").trim() === "1";

    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = getProductMapSheet(spreadsheet);

    if (!sheet) {
      return jsonResponse({ ok: false, success: false, error: "productMap sheet not found. Tried: " + PRODUCT_MAP_SHEET_NAMES.join(", "), updatedAt: new Date().toISOString() });
    }

    const result = readProductMapRows(sheet, debug);

    const output = {
      ok: true,
      success: true,
      updatedAt: new Date().toISOString(),
      items: result.rows,
      meta: { sheetName: sheet.getName(), count: result.rows.length }
    };

    if (debug) { output.debug = result.debug; }

    return jsonResponse(output);
  } catch (err) {
    return jsonResponse({ ok: false, success: false, error: String(err), stack: err && err.stack ? err.stack : "", updatedAt: new Date().toISOString() });
  }
}

function readProductMapRows(sheet, debug) {
  const data = getSheetObjects(sheet);

  const rows = data.objects
    .filter(function (row) { return !isObjectRowEmpty(row); })
    .map(function (row, index) {
      const mapType = normalizeProductMapValue(firstValue(row, ["mapType","map type","type","relationshipType","relationship type"]));
      const mapKey = normalizeProductMapKey(firstValue(row, ["mapKey","map key","key","contentKey","content key","slug","handle"]));
      const rawProductLinks = firstValue(row, ["productLinks","product links","products","shopifyLinks","shopify links","merchLinks","merch links"]);
      const rawProductTags = firstValue(row, ["productTags","product tags","shopifyTags","shopify tags","merchTags","merch tags","tags"]);
      const fallbackGenre = normalizeProductMapKey(firstValue(row, ["fallbackGenre","fallback genre","genre","merchGenre","merch genre"]));
      const merchHeadline = firstValue(row, ["merchHeadline","merch headline","headline","shopHeadline","shop headline"]);
      const merchCtaText = firstValue(row, ["merchCtaText","merch cta text","ctaText","cta text","buttonText","button text"]);
      const priority = firstNumber(row, ["priority","sort","sortOrder","sort order","rank","order"]);
      const activeValue = firstValue(row, ["active","enabled","live","published","visible"]);
      const active = parseProductMapActive(activeValue);
      const productLinks = splitProductMapList(rawProductLinks);
      const productTags = splitProductMapList(rawProductTags).map(normalizeProductMapKey).filter(Boolean);

      return {
        rowNumber: index + 2,
        mapType, mapKey,
        productLinks,
        productHandles: productLinks.map(extractShopifyProductHandle).filter(Boolean),
        productTags,
        fallbackGenre,
        merchHeadline,
        merchCtaText,
        priority: priority || 0,
        active
      };
    })
    .filter(function (row) {
      return row.active && row.mapType && row.mapKey && (row.productLinks.length || row.productTags.length || row.fallbackGenre);
    })
    .sort(function (a, b) {
      return (Number(a.priority) || 0) - (Number(b.priority) || 0);
    });

  return {
    rows: rows,
    debug: debug ? { sheetName: sheet.getName(), originalHeaders: data.headers, normalizedHeaders: data.normalizedHeaders, rawRowCount: data.rawRowCount, outputRowCount: rows.length, acceptedSheetNames: PRODUCT_MAP_SHEET_NAMES } : null
  };
}

function getProductMapSheet(spreadsheet) {
  for (let i = 0; i < PRODUCT_MAP_SHEET_NAMES.length; i++) {
    const sheet = spreadsheet.getSheetByName(PRODUCT_MAP_SHEET_NAMES[i]);
    if (sheet) return sheet;
  }
  return null;
}

function splitProductMapList(value) {
  return String(value || "").split(/\s*\|\s*|\n|,/).map(function (item) { return String(item || "").trim(); }).filter(Boolean);
}

function normalizeProductMapValue(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "-");
}

function normalizeProductMapKey(value) {
  return String(value || "").trim().toLowerCase().replace(/['"]/g, "").replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function parseProductMapActive(value) {
  const raw = String(value || "").trim();
  if (!raw) return true;
  if (["no","n","false","0","off","inactive","disabled"].includes(raw.toLowerCase())) return false;
  return true;
}

function extractShopifyProductHandle(url) {
  const value = String(url || "").trim();
  if (!value) return "";
  const match = value.match(/\/products\/([^/?#]+)/i);
  if (match && match[1]) return decodeURIComponent(match[1]).trim();
  return "";
}

/* =========================================================
   EXISTING VIDEO TRACKING
========================================================= */

function handleVideoTracking(e) {
  try {
    const params = e.parameter || {};
    const key = String(params.key || "").trim();
    const type = String(params.type || "like").trim();
    const title = String(params.title || "").trim();
    const artist = String(params.artist || "").trim();

    if (!key) {
      return jsonResponse({ success: false, ok: false, error: "Missing key. For dashboard data use ?dashboard=1" });
    }

    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName(VIDEO_SHEET_NAME);

    if (!sheet) {
      return jsonResponse({ success: false, ok: false, error: "Sheet not found: " + VIDEO_SHEET_NAME });
    }

    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();

    if (lastRow < 2) {
      return jsonResponse({ success: false, ok: false, error: "No data rows found" });
    }

    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

    const keyCol = findOrCreateColumn(sheet, headers, ["videoKey","Video Key","Video key","video key","youtubeId","YouTube ID","YouTube Id","Video ID","Video Id","key","Key"]);
    const titleCol = findExistingColumn(headers, ["title","Title","song","Song","name","Name"]);
    const artistCol = findExistingColumn(headers, ["artist","Artist","songby","Song By","SongBy"]);
    const statColName = getStatColumnName(type);
    const statCol = findOrCreateColumn(sheet, headers, [statColName]);

    let row = findExistingRowByColumnValue(sheet, keyCol, key);
    let matchMethod = "videoKey column";

    if (!row) { row = findExistingRowAnywhere(sheet, key); matchMethod = "any cell exact key"; }
    if (!row && title && artist && titleCol && artistCol) { row = findExistingRowByTitleArtist(sheet, titleCol, artistCol, title, artist); matchMethod = "title + artist"; }

    if (!row) {
      return jsonResponse({ success: false, ok: false, error: "No matching existing row found. Vote not written.", key, title, artist, keyColumn: columnToLetter(keyCol), titleColumn: titleCol ? columnToLetter(titleCol) : null, artistColumn: artistCol ? columnToLetter(artistCol) : null });
    }

    const existingKey = String(sheet.getRange(row, keyCol).getValue() || "").trim();
    if (!existingKey) { sheet.getRange(row, keyCol).setValue(key); }

    const currentValue = Number(sheet.getRange(row, statCol).getValue()) || 0;
    const newValue = currentValue + 1;
    sheet.getRange(row, statCol).setValue(newValue);

    return jsonResponse({ success: true, ok: true, key, type, count: newValue, sheet: VIDEO_SHEET_NAME, row, matchMethod, keyColumn: columnToLetter(keyCol), statColumn: columnToLetter(statCol) });
  } catch (err) {
    return jsonResponse({ success: false, ok: false, error: String(err), stack: err && err.stack ? err.stack : "" });
  }
}

/* =========================================================
   RADIO TRACKING
========================================================= */

function handleRadioPlay(data) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = getRadioSheet(spreadsheet);
    if (!sheet) return jsonResponse({ success: false, ok: false, error: "Radio sheet not found. Tried: " + RADIO_SHEET_NAMES.join(", ") });

    ensureHeader(sheet, RADIO_CLICKS_COL, "Clicks");
    const found = findRadioRow(sheet, data);
    if (!found.row) return jsonResponse({ success: false, ok: false, error: "Radio song not found. Clicks not written.", title: found.title, artist: found.artist, album: found.album, genre: found.genre, audioUrl: found.audioUrl });

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const cell = sheet.getRange(found.row, RADIO_CLICKS_COL);
      const newValue = (Number(cell.getValue()) || 0) + 1;
      cell.setValue(newValue);
      return jsonResponse({ success: true, ok: true, type: "radio_play", sheet: sheet.getName(), row: found.row, title: found.title, artist: found.artist, album: found.album, genre: found.genre, count: newValue, matchMethod: found.matchMethod, clicksColumn: columnToLetter(RADIO_CLICKS_COL) });
    } finally { lock.releaseLock(); }
  } catch (err) {
    return jsonResponse({ success: false, ok: false, error: String(err), stack: err && err.stack ? err.stack : "" });
  }
}

function handleRadioFullPlay(data) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = getRadioSheet(spreadsheet);
    if (!sheet) return jsonResponse({ success: false, ok: false, error: "Radio sheet not found. Tried: " + RADIO_SHEET_NAMES.join(", ") });

    ensureHeader(sheet, RADIO_FULL_PLAYS_COL, "fullPlays");
    const found = findRadioRow(sheet, data);
    if (!found.row) return jsonResponse({ success: false, ok: false, error: "Radio song not found. fullPlays not written.", title: found.title, artist: found.artist, album: found.album, genre: found.genre, audioUrl: found.audioUrl });

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const cell = sheet.getRange(found.row, RADIO_FULL_PLAYS_COL);
      const newValue = (Number(cell.getValue()) || 0) + 1;
      cell.setValue(newValue);
      return jsonResponse({ success: true, ok: true, type: "radio_full_play", sheet: sheet.getName(), row: found.row, title: found.title, artist: found.artist, album: found.album, genre: found.genre, count: newValue, matchMethod: found.matchMethod, fullPlaysColumn: columnToLetter(RADIO_FULL_PLAYS_COL) });
    } finally { lock.releaseLock(); }
  } catch (err) {
    return jsonResponse({ success: false, ok: false, error: String(err), stack: err && err.stack ? err.stack : "" });
  }
}

function handleRadioListenTime(data) {
  try {
    const listenedSeconds = Math.round(Number(data.listenedSeconds) || 0);
    if (!listenedSeconds || listenedSeconds <= 0) return jsonResponse({ success: false, ok: false, error: "Missing or invalid listenedSeconds", listenedSeconds: data.listenedSeconds });

    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = getRadioSheet(spreadsheet);
    if (!sheet) return jsonResponse({ success: false, ok: false, error: "Radio sheet not found. Tried: " + RADIO_SHEET_NAMES.join(", ") });

    ensureHeader(sheet, RADIO_TOTAL_SECONDS_COL, "totalPlaySeconds");
    ensureHeader(sheet, RADIO_AVG_SECONDS_COL, "avgPlaySeconds");
    const found = findRadioRow(sheet, data);
    if (!found.row) return jsonResponse({ success: false, ok: false, error: "Radio song not found. Listen time not written.", title: found.title, artist: found.artist, album: found.album, genre: found.genre, audioUrl: found.audioUrl, listenedSeconds });

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const totalCell = sheet.getRange(found.row, RADIO_TOTAL_SECONDS_COL);
      const avgCell = sheet.getRange(found.row, RADIO_AVG_SECONDS_COL);
      const clicksCell = sheet.getRange(found.row, RADIO_CLICKS_COL);
      const newTotal = (Number(totalCell.getValue()) || 0) + listenedSeconds;
      const avgSeconds = Math.round(newTotal / (Number(clicksCell.getValue()) || 1));
      totalCell.setValue(newTotal);
      avgCell.setValue(avgSeconds);
      return jsonResponse({ success: true, ok: true, type: "radio_listen_time", sheet: sheet.getName(), row: found.row, title: found.title, artist: found.artist, album: found.album, genre: found.genre, listenedSeconds, totalPlaySeconds: newTotal, avgPlaySeconds: avgSeconds, matchMethod: found.matchMethod, totalSecondsColumn: columnToLetter(RADIO_TOTAL_SECONDS_COL), avgSecondsColumn: columnToLetter(RADIO_AVG_SECONDS_COL) });
    } finally { lock.releaseLock(); }
  } catch (err) {
    return jsonResponse({ success: false, ok: false, error: String(err), stack: err && err.stack ? err.stack : "" });
  }
}

function handleRadioSongShare(data) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = getRadioSheet(spreadsheet);
    if (!sheet) return jsonResponse({ success: false, ok: false, error: "Radio sheet not found. Tried: " + RADIO_SHEET_NAMES.join(", ") });

    ensureHeader(sheet, RADIO_SONG_SHARES_COL, "songShares");
    const found = findRadioRow(sheet, data);
    if (!found.row) return jsonResponse({ success: false, ok: false, error: "Radio song not found. songShares not written.", title: found.title, artist: found.artist, album: found.album, genre: found.genre, audioUrl: found.audioUrl, shareUrl: clean(data.shareUrl) });

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const cell = sheet.getRange(found.row, RADIO_SONG_SHARES_COL);
      const newValue = (Number(cell.getValue()) || 0) + 1;
      cell.setValue(newValue);
      return jsonResponse({ success: true, ok: true, type: "radio_song_share", sheet: sheet.getName(), row: found.row, title: found.title, artist: found.artist, album: found.album, genre: found.genre, count: newValue, matchMethod: found.matchMethod, songSharesColumn: columnToLetter(RADIO_SONG_SHARES_COL) });
    } finally { lock.releaseLock(); }
  } catch (err) {
    return jsonResponse({ success: false, ok: false, error: String(err), stack: err && err.stack ? err.stack : "" });
  }
}

/* =========================================================
   RADIO ROW MATCHING
========================================================= */

function findRadioRow(sheet, data) {
  const title = clean(data.title);
  const artist = clean(data.artist);
  const album = clean(data.album);
  const genre = clean(data.genre);
  const audioUrl = clean(data.audioUrl);

  const lastRow = sheet.getLastRow();
  const lastCol = Math.max(sheet.getLastColumn(), RADIO_SONG_SHARES_COL);

  if (lastRow < 2) return { row: null, matchMethod: null, title, artist, album, genre, audioUrl };

  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

  const titleCol  = findExistingColumn(headers, ["Song Name","song name","title","Title","song","Song","name","Name"]) || 1;
  const artistCol = findExistingColumn(headers, ["Artist","artist","Song By","songby","SongBy"]) || 3;
  const audioCol  = findExistingColumn(headers, ["WAV Link","wav link","Audio Link","audio link","audioUrl","Audio URL","WAV URL"]) || 7;

  const maxColNeeded = Math.max(titleCol, artistCol, audioCol, RADIO_SONG_SHARES_COL);
  const values = sheet.getRange(2, 1, lastRow - 1, maxColNeeded).getValues();

  if (audioUrl) {
    const targetAudio = normalizeUrl(audioUrl);
    for (let i = 0; i < values.length; i++) {
      const rowAudio = normalizeUrl(values[i][audioCol - 1]);
      if (rowAudio && rowAudio === targetAudio) return { row: i + 2, matchMethod: "WAV Link", title, artist, album, genre, audioUrl };
    }
  }

  if (title && artist) {
    const targetTitle = normalizeText(title);
    const targetArtist = normalizeText(artist);
    for (let i = 0; i < values.length; i++) {
      const rowTitle = normalizeText(values[i][titleCol - 1]);
      const rowArtist = normalizeText(values[i][artistCol - 1]);
      if (rowTitle === targetTitle && rowArtist === targetArtist) return { row: i + 2, matchMethod: "Song Name + Artist", title, artist, album, genre, audioUrl };
    }
  }

  return { row: null, matchMethod: null, title, artist, album, genre, audioUrl };
}

function getRadioSheet(spreadsheet) {
  for (let i = 0; i < RADIO_SHEET_NAMES.length; i++) {
    const sheet = spreadsheet.getSheetByName(RADIO_SHEET_NAMES[i]);
    if (sheet) return sheet;
  }
  return null;
}

function ensureHeader(sheet, col, headerName) {
  const current = String(sheet.getRange(1, col).getValue() || "").trim();
  if (current !== headerName) sheet.getRange(1, col).setValue(headerName);
}

/* =========================================================
   SHARED HELPERS
========================================================= */

function getSheetObjects(sheet) {
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  if (lastRow < 1 || lastCol < 1) return { headers: [], normalizedHeaders: [], objects: [], rawRowCount: 0 };

  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const normalizedHeaders = headers.map(function (header, index) {
    const normalized = normalizeHeader(header);
    return normalized || "column" + (index + 1);
  });

  if (lastRow < 2) return { headers, normalizedHeaders, objects: [], rawRowCount: 0 };

  const values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const objects = values.map(function (row) {
    const object = {};
    for (let i = 0; i < normalizedHeaders.length; i++) { object[normalizedHeaders[i]] = row[i]; }
    return object;
  });

  return { headers, normalizedHeaders, objects, rawRowCount: values.length };
}

function getRadioTotals(rows) {
  return {
    totalSongPlays: sumDashboardMetric(rows, "plays"),
    totalFullSongPlays: sumDashboardMetric(rows, "fullPlays"),
    totalPlaySeconds: sumDashboardMetric(rows, "playSeconds"),
    totalPlayTime: formatDashboardSeconds(sumDashboardMetric(rows, "playSeconds")),
    totalShares: sumDashboardMetric(rows, "shares"),
    totalShareClicks: sumDashboardMetric(rows, "shareClicks"),
    totalLikes: sumDashboardMetric(rows, "likes"),
    totalSkips: sumDashboardMetric(rows, "skips")
  };
}

function getVideoTotals(rows) {
  return {
    totalVideosTracked: rows.length,
    totalVideoLikes: sumDashboardMetric(rows, "likes"),
    totalVideoClicks: sumDashboardMetric(rows, "clicks"),
    totalVideoShares: sumDashboardMetric(rows, "shares"),
    totalVideoViews: sumDashboardMetric(rows, "views")
  };
}

function sumDashboardMetric(rows, key) {
  return rows.reduce(function (total, row) { return total + (Number(row[key]) || 0); }, 0);
}

function formatDashboardSeconds(totalSeconds) {
  const seconds = Math.max(0, Math.round(Number(totalSeconds) || 0));
  const hrs  = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return [String(hrs).padStart(2,"0"), String(mins).padStart(2,"0"), String(secs).padStart(2,"0")].join(":");
}

function firstValue(row, aliases) {
  for (let i = 0; i < aliases.length; i++) {
    const key = normalizeHeader(aliases[i]);
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      const value = row[key];
      if (value !== null && value !== undefined && String(value).trim() !== "") return String(value).trim();
    }
  }
  return "";
}

function firstNumber(row, aliases) {
  for (let i = 0; i < aliases.length; i++) {
    const key = normalizeHeader(aliases[i]);
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      const value = row[key];
      if (value !== null && value !== undefined && String(value).trim() !== "") return coerceNumber(value);
    }
  }
  return 0;
}

function coerceNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const cleaned = String(value || "").replace(/,/g, "").replace(/[^\d.-]/g, "").trim();
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : 0;
}

function isObjectRowEmpty(row) {
  const keys = Object.keys(row);
  for (let i = 0; i < keys.length; i++) {
    const value = row[keys[i]];
    if (value !== null && value !== undefined && String(value).trim() !== "") return false;
  }
  return true;
}

function buildRadioSongUrl(title, artist) {
  const params = [];
  if (title)  params.push("song="   + encodeURIComponent(title));
  if (artist) params.push("artist=" + encodeURIComponent(artist));
  return PUBLIC_STASHBOX_RADIO_URL + (params.length ? "?" + params.join("&") : "");
}

function extractYouTubeId(url) {
  const value = String(url || "").trim();
  if (!value) return "";
  const patterns = [/youtube\.com\/watch\?v=([^&]+)/i, /youtu\.be\/([^?&]+)/i, /youtube\.com\/embed\/([^?&]+)/i, /youtube\.com\/shorts\/([^?&]+)/i];
  for (let i = 0; i < patterns.length; i++) {
    const match = value.match(patterns[i]);
    if (match && match[1]) return match[1].trim();
  }
  return "";
}

function buildYouTubeThumbnail(videoKey) {
  const key = String(videoKey || "").trim();
  if (!key) return "";
  return "https://i.ytimg.com/vi/" + encodeURIComponent(key) + "/hqdefault.jpg";
}

function normalizeDashboardUrl(value) {
  const url = String(value || "").trim();
  if (!url) return "";
  if (url.indexOf("https://www.dropbox.com") === 0) {
    return url
      .replace("https://www.dropbox.com", "https://dl.dropboxusercontent.com")
      .replace("?dl=0","").replace("?dl=1","").replace("&dl=0","").replace("&dl=1","")
      .replace("?raw=1","").replace("&raw=1","");
  }
  return url;
}

function getStatColumnName(type) {
  if (type === "like")  return "likeCount";
  if (type === "play")  return "playCount";
  if (type === "share") return "shareCount";
  return type + "Count";
}

function findExistingColumn(headers, names) {
  const normalizedNames = names.map(normalizeHeader);
  for (let i = 0; i < headers.length; i++) {
    if (normalizedNames.includes(normalizeHeader(headers[i]))) return i + 1;
  }
  return null;
}

function findOrCreateColumn(sheet, headers, names) {
  const existingCol = findExistingColumn(headers, names);
  if (existingCol) return existingCol;
  const newCol = sheet.getLastColumn() + 1;
  sheet.getRange(1, newCol).setValue(names[0]);
  return newCol;
}

function findExistingRowByColumnValue(sheet, col, value) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  const values = sheet.getRange(2, col, lastRow - 1, 1).getValues();
  const target = String(value || "").trim();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0] || "").trim() === target) return i + 2;
  }
  return null;
}

function findExistingRowAnywhere(sheet, value) {
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  const target = String(value || "").trim();
  if (lastRow < 2 || !target) return null;
  const values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  for (let r = 0; r < values.length; r++) {
    for (let c = 0; c < values[r].length; c++) {
      if (String(values[r][c] || "").trim() === target) return r + 2;
    }
  }
  return null;
}

function findExistingRowByTitleArtist(sheet, titleCol, artistCol, title, artist) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  const titles  = sheet.getRange(2, titleCol,  lastRow - 1, 1).getValues();
  const artists = sheet.getRange(2, artistCol, lastRow - 1, 1).getValues();
  const targetTitle  = normalizeText(title);
  const targetArtist = normalizeText(artist);
  for (let i = 0; i < titles.length; i++) {
    if (normalizeText(titles[i][0]) === targetTitle && normalizeText(artists[i][0]) === targetArtist) return i + 2;
  }
  return null;
}

function clean(value) { return String(value || "").trim(); }

function normalizeHeader(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g,"").replace(/_/g,"").replace(/-/g,"");
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g," ");
}

function normalizeUrl(value) {
  return String(value || "").trim()
    .replace("https://www.dropbox.com","https://dl.dropboxusercontent.com")
    .replace(/\?dl=[01]/,"").replace(/\?raw=1/,"").replace(/&dl=[01]/,"").replace(/&raw=1/,"")
    .toLowerCase();
}

function columnToLetter(column) {
  let temp, letter = "";
  while (column > 0) { temp = (column - 1) % 26; letter = String.fromCharCode(temp + 65) + letter; column = (column - temp - 1) / 26; }
  return letter;
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data, null, 2)).setMimeType(ContentService.MimeType.JSON);
}
