const filterToggle = document.querySelector('.filter-toggle');
const filterDrawer = document.querySelector('#filter-drawer');
const searchInput = document.querySelector('#song-search');
const videoButton = document.querySelector('.btn.video');
const shuffleButton = document.querySelector('.btn.shuffle');
const resetButton = document.querySelector('.btn.utility');
const toast = document.querySelector('.toast');
let toastTimer;

function setFiltersOpen(isOpen) {
  filterToggle.setAttribute('aria-expanded', String(isOpen));
  filterToggle.textContent = isOpen ? 'FILTERS ▴' : 'FILTERS ▾';
  filterDrawer.dataset.state = isOpen ? 'open' : 'closed';
  filterDrawer.setAttribute('aria-hidden', String(!isOpen));
  filterDrawer.inert = !isOpen;
}

function setActivePill(row, selectedPill) {
  row.querySelectorAll('.pill').forEach((pill) => {
    const isSelected = pill === selectedPill;
    pill.classList.toggle('active', isSelected);
    pill.setAttribute('aria-pressed', String(isSelected));
  });
}

function resetFilters() {
  searchInput.value = '';
  videoButton.classList.remove('active');
  videoButton.setAttribute('aria-pressed', 'false');

  document.querySelectorAll('.filter-row').forEach((row) => {
    const allPill = Array.from(row.querySelectorAll('.pill')).find((pill) => pill.textContent.trim() === 'All');
    if (allPill) {
      setActivePill(row, allPill);
    }
  });
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add('show');
  toastTimer = window.setTimeout(() => {
    toast.classList.remove('show');
  }, 1600);
}

filterToggle.addEventListener('click', () => {
  const isOpen = filterToggle.getAttribute('aria-expanded') === 'true';
  setFiltersOpen(!isOpen);
});

filterDrawer.addEventListener('click', (event) => {
  const pill = event.target.closest('.pill');
  if (!pill) return;

  const row = pill.closest('.filter-row');
  setActivePill(row, pill);
});

videoButton.addEventListener('click', () => {
  const isActive = videoButton.classList.toggle('active');
  videoButton.setAttribute('aria-pressed', String(isActive));
});

resetButton.addEventListener('click', resetFilters);

shuffleButton.addEventListener('click', () => {
  showToast('Shuffle All clicked');
});

setFiltersOpen(false);
