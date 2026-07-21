(() => {
  const STYLE_ID = 'stashbox-account-playlist-ui';
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .radio-playlist-detail {
      display: grid;
      gap: 14px;
      margin-top: 6px;
    }

    .radio-playlist-detail-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
      padding: 16px;
      border: 1px solid rgba(240, 165, 0, .28);
      border-radius: 14px;
      background: linear-gradient(135deg, rgba(240, 165, 0, .09), rgba(255, 255, 255, .025));
    }

    .radio-playlist-detail-header > div:first-child {
      min-width: 0;
    }

    .radio-playlist-detail-kicker {
      margin: 0 0 5px;
      color: #f0a500;
      font: 800 11px/1 Karla, Arial, sans-serif;
      letter-spacing: .12em;
      text-transform: uppercase;
    }

    .radio-playlist-detail-header .radio-account-section-title {
      margin: 0;
      color: #fff;
      font-size: 22px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .radio-playlist-detail-count {
      display: block;
      margin-top: 5px;
      color: #aaa;
      font: 600 13px/1.2 Karla, Arial, sans-serif;
    }

    .radio-playlist-playback-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 9px;
      flex: 0 0 auto;
    }

    .radio-playlist-playback-actions button {
      min-width: 94px;
      height: 40px;
      min-height: 40px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      padding: 0 15px;
    }

    .radio-playlist-shuffle-button {
      border-color: rgba(240, 165, 0, .5) !important;
      color: #ffd064 !important;
      background: rgba(240, 165, 0, .08) !important;
    }

    .radio-playlist-track-list {
      display: grid;
      gap: 9px;
    }

    .radio-playlist-track {
      display: grid;
      grid-template-columns: 64px minmax(0, 1fr);
      align-items: center;
      gap: 13px;
      min-width: 0;
      padding: 9px 13px 9px 9px;
      border: 1px solid rgba(255, 255, 255, .13);
      border-radius: 13px;
      background: linear-gradient(135deg, rgba(255, 255, 255, .045), rgba(255, 255, 255, .018));
      transition: border-color .16s ease, background .16s ease, transform .16s ease;
    }

    .radio-playlist-track:hover {
      border-color: rgba(240, 165, 0, .38);
      background: linear-gradient(135deg, rgba(240, 165, 0, .065), rgba(255, 255, 255, .025));
      transform: translateY(-1px);
    }

    .radio-playlist-track-artwork {
      position: relative;
      width: 64px;
      height: 64px;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, .14);
      border-radius: 10px;
      background: #090909;
    }

    .radio-playlist-track-artwork img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .radio-playlist-track-artwork span {
      position: absolute;
      left: 5px;
      bottom: 5px;
      display: inline-grid;
      place-items: center;
      min-width: 20px;
      height: 20px;
      padding: 0 5px;
      border-radius: 999px;
      color: #111;
      background: #f0a500;
      font: 900 10px/1 Karla, Arial, sans-serif;
      box-shadow: 0 2px 7px rgba(0, 0, 0, .45);
    }

    .radio-playlist-track-copy {
      min-width: 0;
    }

    .radio-playlist-track-copy strong,
    .radio-playlist-track-copy span {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .radio-playlist-track-copy strong {
      color: #fff;
      font: 800 16px/1.2 Karla, Arial, sans-serif;
    }

    .radio-playlist-track-copy span {
      margin-top: 6px;
      color: #aeb5bd;
      font: 600 13px/1.2 Karla, Arial, sans-serif;
    }

    @media (max-width: 620px) {
      .radio-playlist-detail-header {
        align-items: flex-start;
        flex-direction: column;
        padding: 14px;
      }

      .radio-playlist-playback-actions {
        width: 100%;
        justify-content: stretch;
      }

      .radio-playlist-playback-actions button {
        flex: 1 1 0;
        min-width: 0;
      }

      .radio-playlist-track {
        grid-template-columns: 56px minmax(0, 1fr);
        gap: 11px;
      }

      .radio-playlist-track-artwork {
        width: 56px;
        height: 56px;
      }
    }
  `;
  document.head.appendChild(style);
})();
