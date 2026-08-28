(() => {
  'use strict';

  const keyInput = document.getElementById('field-song_key');
  if (!keyInput) return;

  const mediaIds = [
    'audioFileInput',
    'uploadAudioButton',
    'visualImageInput',
    'uploadVisualImagesButton',
    'visualClipInput',
    'uploadVisualClipsButton'
  ];
  const artworkRefresh = document.getElementById('refreshArtworkButton');
  let lastKey = '';
  let lastEditMode = false;

  function syncEditorDependents() {
    const key = String(keyInput.value || '').trim();
    const editMode = Boolean(key && keyInput.disabled);

    for (const id of mediaIds) {
      const control = document.getElementById(id);
      if (control) control.disabled = !editMode;
    }

    if (artworkRefresh) artworkRefresh.disabled = !editMode;

    if (editMode && (!lastEditMode || key !== lastKey)) {
      window.setTimeout(() => {
        if (artworkRefresh && !artworkRefresh.disabled) artworkRefresh.click();
      }, 0);
    }

    lastKey = key;
    lastEditMode = editMode;
  }

  const observer = new MutationObserver(syncEditorDependents);
  observer.observe(keyInput, { attributes: true, attributeFilter: ['disabled'] });

  document.getElementById('songsBody')?.addEventListener('click', event => {
    if (event.target.closest('.edit-song')) window.setTimeout(syncEditorDependents, 0);
  });
  document.getElementById('newSongButton')?.addEventListener('click', () => window.setTimeout(syncEditorDependents, 0));

  syncEditorDependents();
})();
