const IMG_DIR = 'imgs/';
const STORAGE_KEY = 'cigar-log-v2';
const VIEW_KEY = 'cigar-log-view';
const TOOLBAR_KEY = 'cigar-log-toolbar-collapsed';
const GALLERY_STORAGE_KEY = 'cigar-log-gallery-v1';
const MAX_AUTO_IMAGES_PER_CIGAR = 8;
const SUPABASE_CONFIG = window.CIGAR_LOG_SUPABASE || { enabled: false };

let supabaseClient = null;
let currentUser = null;
let currentAccess = { accessLevel: 'local', ownerId: null };
let appReady = false;
let appLoading = true;
let selectedImageFiles = [];
let formPhotos = [];
let deletedPhotoIds = [];
let deletedPhotoPaths = [];
let pendingWebshopCigar = null;
let pendingWebshopHandled = false;
let cropPointers = new Map();
let cropDrag = null;
let cropPinchStart = null;
const SORT_DEFAULT_DIR = { history: 'asc', recent: 'desc', name: 'asc', rating: 'desc', strength: 'desc' };
let sortDir = 'asc';
let currentSection = 'cigars';
let galleryPhotos = [];
let galleryLoaded = false;
let galleryLoading = false;

const els = {
  results: document.getElementById('results'),
  empty: document.getElementById('empty'),
  loadingState: document.getElementById('loadingState'),
  stats: document.getElementById('stats'),
  search: document.getElementById('search'),
  statusFilter: document.getElementById('statusFilter'),
  sortBy: document.getElementById('sortBy'),
  sortDirBtn: document.getElementById('sortDirBtn'),
  toolbar: document.querySelector('.toolbar'),
  toolbarBody: document.getElementById('toolbarBody'),
  toolbarToggleBtn: document.getElementById('toolbarToggleBtn'),
  cardViewBtn: document.getElementById('cardViewBtn'),
  listViewBtn: document.getElementById('listViewBtn'),
  addBtn: document.getElementById('addBtn'),
  exportBtn: document.getElementById('exportBtn'),
  importBtn: document.getElementById('importBtn'),
  moreMenuBtn: document.getElementById('moreMenuBtn'),
  moreMenu: document.getElementById('moreMenu'),
  appHeader: document.querySelector('.app-header'),
  importFile: document.getElementById('importFile'),
  webshopBtn: document.getElementById('webshopBtn'),
  webshopModal: document.getElementById('webshopModal'),
  webshopClose: document.getElementById('webshopClose'),
  bookmarkletLink: document.getElementById('bookmarkletLink'),
  webshopJson: document.getElementById('webshopJson'),
  importWebshopJsonBtn: document.getElementById('importWebshopJsonBtn'),
  webshopUrlInput: document.getElementById('webshopUrlInput'),
  fetchWebshopBtn: document.getElementById('fetchWebshopBtn'),
  webshopImportMessage: document.getElementById('webshopImportMessage'),
  detailModal: document.getElementById('detailModal'),
  detailClose: document.getElementById('detailClose'),
  detailBody: document.getElementById('detailBody'),
  galleryModal: document.getElementById('galleryModal'),
  galleryClose: document.getElementById('galleryClose'),
  galleryBody: document.getElementById('galleryBody'),
  galleryPrev: document.getElementById('galleryPrev'),
  galleryNext: document.getElementById('galleryNext'),
  galleryCounter: document.getElementById('galleryCounter'),
  formModal: document.getElementById('formModal'),
  cigarForm: document.getElementById('cigarForm'),
  formClose: document.getElementById('formClose'),
  cancelFormBtn: document.getElementById('cancelFormBtn'),
  formTitle: document.getElementById('formTitle'),
  deleteBtn: document.getElementById('deleteBtn'),
  imageUpload: document.getElementById('imageUpload'),
  uploadDrop: document.getElementById('uploadDrop'),
  imageCropPreview: document.getElementById('imageCropPreview'),
  cropEditor: document.querySelector('.crop-editor'),
  cropEditToggle: document.getElementById('cropEditToggle'),
  photoManager: document.getElementById('photoManager'),
  resetCropBtn: document.getElementById('resetCropBtn'),
  cropZoomValue: document.getElementById('cropZoomValue'),
  cropZoomInBtn: document.getElementById('cropZoomInBtn'),
  cropZoomOutBtn: document.getElementById('cropZoomOutBtn'),
  syncStatus: document.getElementById('syncStatus'),
  accessBadge: document.getElementById('accessBadge'),
  signOutBtn: document.getElementById('signOutBtn'),
  authPanel: document.getElementById('authPanel'),
  appShell: document.getElementById('appShell'),
  authForm: document.getElementById('authForm'),
  authEmail: document.getElementById('authEmail'),
  authPassword: document.getElementById('authPassword'),
  authMessage: document.getElementById('authMessage'),
  sectionTabs: document.getElementById('sectionTabs'),
  cigarsTabBtn: document.getElementById('cigarsTabBtn'),
  galleryTabBtn: document.getElementById('galleryTabBtn'),
  galleryShell: document.getElementById('galleryShell'),
  galleryGrid: document.getElementById('galleryGrid'),
  galleryEmpty: document.getElementById('galleryEmpty'),
  galleryLoadingState: document.getElementById('galleryLoadingState'),
  galleryUpload: document.getElementById('galleryUpload'),
  galleryUploadDrop: document.getElementById('galleryUploadDrop')
};

const formFields = [
  'cigarId', 'name', 'status', 'quantity', 'logOrder', 'brand', 'company', 'madeIn', 'vitola',
  'strength', 'rating', 'boughtDate', 'smokedDate', 'price', 'wrapperLeaf', 'wrapperOrigin',
  'binderLeaf', 'binderOrigin', 'fillerLeaf', 'fillerOrigin', 'taste', 'draw', 'burn', 'nicotine',
  'pairing', 'link', 'notes', 'imageFile', 'imageCropX', 'imageCropY', 'imageZoom'
];

let cigars = [];
let viewMode = localStorage.getItem(VIEW_KEY) || 'cards';
let selectedImageData = ''; // legacy single-photo/local preview fallback
let galleryImages = [];
let galleryIndex = 0;
let galleryTitle = '';
let galleryCaptions = [];

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalise(value = '') {
  return String(value).trim().toLowerCase();
}

function slugify(value) {
  const slug = normalise(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || `cigar-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function newId(name = 'cigar') {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `${slugify(name)}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function todayIso() {
  return new Date().toISOString();
}

function displayDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function statusIcon(status) {
  return {
    owned: '☘',
    smoked: '◉',
    wishlist: '☆'
  }[status] || '•';
}

function statusLabel(status) {
  return {
    owned: 'In humidor',
    smoked: 'Smoked',
    wishlist: 'Wishlist'
  }[status] || 'Not set';
}

function statusPill(status) {
  return `<span class="status-pill ${escapeHtml(status || '')}"><span class="status-icon" aria-hidden="true">${statusIcon(status)}</span>${statusLabel(status)}</span>`;
}

function strengthLabel(value) {
  const labels = {
    '1': 'Very mild',
    '2': 'Mild to medium',
    '3': 'Medium',
    '4': 'Medium to full',
    '5': 'Full'
  };
  const key = String(value || '');
  return labels[key] ? `${key}/5 · ${labels[key]}` : '';
}

function strengthTagInner(value, fallback = '') {
  const label = strengthLabel(value);
  const icon = '<svg class="icon" aria-hidden="true"><use href="#icon-flame"></use></svg>';
  return label ? `${icon}${escapeHtml(label)}` : escapeHtml(fallback);
}

function stars(value) {
  const rating = Number(value);
  if (!rating) return '<span class="muted"></span>';
  return `<span class="stars" title="${rating}/5">${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}</span>`;
}

function encodeImagePath(fileName = '') {
  return fileName.split('/').map(encodeURIComponent).join('/');
}

function numeric(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

const IMAGE_ZOOM_MIN = 0.25;
const IMAGE_ZOOM_MAX = 4;
// The photo can always be dragged this many % of the frame size in any
// direction, at any zoom — including past the point where it stops fully
// covering the frame. Constant on purpose: panning should never feel "stuck"
// at an edge just because you haven't zoomed in yet.
const IMAGE_MAX_TRAVEL = 60;

function imageCrop(cigar = {}) {
  return {
    x: Math.min(100, Math.max(0, numeric(cigar.imageCropX, 50))),
    y: Math.min(100, Math.max(0, numeric(cigar.imageCropY, 50))),
    zoom: Math.min(IMAGE_ZOOM_MAX, Math.max(IMAGE_ZOOM_MIN, numeric(cigar.imageZoom, 1)))
  };
}

// Pan is stored as a 0-100 position (50 = centered) within IMAGE_MAX_TRAVEL.
function cropPercentToShift(pct, zoom) {
  return (((pct - 50) / 50) * IMAGE_MAX_TRAVEL) / zoom;
}
function cropShiftToPercent(shift, zoom) {
  return Math.min(100, Math.max(0, 50 + (shift * zoom * 50) / IMAGE_MAX_TRAVEL));
}
function cropMaxShift(zoom) {
  return IMAGE_MAX_TRAVEL / zoom;
}

function imageCropStyle(cigar = {}) {
  const crop = imageCrop(cigar);
  const shiftX = cropPercentToShift(crop.x, crop.zoom).toFixed(2);
  const shiftY = cropPercentToShift(crop.y, crop.zoom).toFixed(2);
  return `--img-shift-x:${shiftX}%; --img-shift-y:${shiftY}%; --img-zoom:${crop.zoom.toFixed(3)};`;
}

function imageExists(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = src;
  });
}

async function findAutoImages(name) {
  const found = [];
  const base = `${IMG_DIR}${encodeURIComponent(name)}.png`;
  if (await imageExists(base)) found.push(base);

  for (let i = 2; i <= MAX_AUTO_IMAGES_PER_CIGAR; i += 1) {
    const src = `${IMG_DIR}${encodeURIComponent(name)} ${i}.png`;
    if (await imageExists(src)) found.push(src);
    else break;
  }
  return found;
}

function photoSrc(photo = {}) {
  return photo.signedUrl || photo.dataUrl || photo.src || '';
}

function sortPhotos(photos = []) {
  return [...photos].sort((a, b) => {
    if (Boolean(a.isProfile) !== Boolean(b.isProfile)) return a.isProfile ? -1 : 1;
    return Number(a.sortOrder || 0) - Number(b.sortOrder || 0);
  });
}

function getProfilePhoto(cigar = {}) {
  const photos = sortPhotos(cigar.photos || []);
  return photos.find((photo) => photo.isProfile) || photos[0] || null;
}

async function resolvePhotos(cigar) {
  const photos = [];

  for (const photo of cigar.photos || []) {
    const resolved = { ...photo };
    if (resolved.imagePath && !resolved.signedUrl) {
      resolved.signedUrl = await signedImageUrl(resolved.imagePath);
    }
    resolved.src = photoSrc(resolved);
    if (resolved.src) photos.push(resolved);
  }

  if (!photos.length && cigar.imagePath) {
    const signedUrl = await signedImageUrl(cigar.imagePath);
    if (signedUrl) {
      photos.push({
        id: `legacy-${cigar.id}`,
        cigarId: cigar.id,
        ownerId: cigar.ownerId,
        imagePath: cigar.imagePath,
        signedUrl,
        src: signedUrl,
        isProfile: true,
        sortOrder: 0,
        legacy: true
      });
    }
  }

  if (!photos.length && cigar.imageData) {
    photos.push({
      id: `local-${cigar.id}`,
      cigarId: cigar.id,
      dataUrl: cigar.imageData,
      src: cigar.imageData,
      isProfile: true,
      sortOrder: 0,
      localOnly: true
    });
  }

  if (!photos.length && cigar.imageFile) {
    const src = `${IMG_DIR}${encodeImagePath(cigar.imageFile)}`;
    photos.push({
      id: `file-${cigar.id}`,
      cigarId: cigar.id,
      src,
      isProfile: true,
      sortOrder: 0,
      localOnly: true
    });
  }

  if (!photos.length) {
    const autoImages = await findAutoImages(cigar.name);
    autoImages.forEach((src, index) => {
      photos.push({
        id: `auto-${cigar.id}-${index}`,
        cigarId: cigar.id,
        src,
        isProfile: index === 0,
        sortOrder: index,
        localOnly: true
      });
    });
  }

  const sorted = sortPhotos(photos);
  if (sorted.length && !sorted.some((photo) => photo.isProfile)) sorted[0].isProfile = true;
  return sorted;
}

async function resolveImages(cigar) {
  const photos = await resolvePhotos(cigar);
  return photos.map(photoSrc).filter(Boolean);
}

function normalizeCigar(cigar = {}, index = 0) {
  return {
    id: cigar.id || slugify(cigar.name || `Cigar ${index + 1}`),
    ownerId: cigar.ownerId || cigar.user_id || '',
    name: cigar.name || 'Untitled cigar',
    status: cigar.status || 'owned',
    quantity: cigar.quantity ?? (cigar.status === 'smoked' ? 0 : 1),
    logOrder: cigar.logOrder ?? '',
    brand: cigar.brand || '',
    company: cigar.company || '',
    madeIn: cigar.madeIn || '',
    vitola: cigar.vitola || '',
    strength: cigar.strength || '',
    rating: cigar.rating || '',
    boughtDate: cigar.boughtDate || '',
    smokedDate: cigar.smokedDate || '',
    price: cigar.price || '',
    wrapperLeaf: cigar.wrapperLeaf || '',
    wrapperOrigin: cigar.wrapperOrigin || '',
    binderLeaf: cigar.binderLeaf || '',
    binderOrigin: cigar.binderOrigin || '',
    fillerLeaf: cigar.fillerLeaf || '',
    fillerOrigin: cigar.fillerOrigin || '',
    taste: cigar.taste || '',
    draw: cigar.draw || '',
    burn: cigar.burn || '',
    nicotine: cigar.nicotine || '',
    pairing: cigar.pairing || '',
    notes: cigar.notes || '',
    link: cigar.link || '',
    imageFile: cigar.imageFile || '',
    imagePath: cigar.imagePath || '', // legacy single-photo path
    imageData: cigar.imageData || '', // legacy local data URL
    photos: Array.isArray(cigar.photos) ? cigar.photos : [],
    imageCropX: cigar.imageCropX ?? 50,
    imageCropY: cigar.imageCropY ?? 50,
    imageZoom: cigar.imageZoom ?? 1,
    createdAt: cigar.createdAt || todayIso(),
    updatedAt: cigar.updatedAt || '',
    source: cigar.source || ''
  };
}

function seedData() {
  return CIGARS.map((cigar, index) => normalizeCigar({ ...cigar, source: 'seed' }, index));
}

function loadData() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return seedData();

  try {
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return seedData();
    return parsed.map(normalizeCigar);
  } catch (error) {
    console.warn('Could not read saved cigar log. Loading starter data.', error);
    return seedData();
  }
}

function saveData() {
  const storable = cigars.map(({ images, ...rest }) => rest);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(storable, null, 2));
}

function isSupabaseEnabled() {
  return Boolean(SUPABASE_CONFIG.enabled && SUPABASE_CONFIG.url && SUPABASE_CONFIG.publishableKey && window.supabase);
}

function setAuthMessage(message = '', type = '') {
  if (!els.authMessage) return;
  els.authMessage.textContent = message;
  els.authMessage.className = `auth-message ${type}`.trim();
}

function setSyncStatus(message, state = 'local') {
  if (!els.syncStatus) return;
  els.syncStatus.textContent = message;
  els.syncStatus.dataset.state = state;
}

function isReadOnlyUser() {
  return Boolean(supabaseClient && currentUser && currentAccess.accessLevel === 'read');
}

function canWrite() {
  if (!supabaseClient || !currentUser) return true;
  return currentAccess.accessLevel === 'owner';
}

function canEditCigar(cigar = {}) {
  if (!canWrite()) return false;
  if (!supabaseClient || !currentUser) return true;
  return !cigar.ownerId || cigar.ownerId === currentUser.id;
}

function setAccessUi() {
  const readOnly = isReadOnlyUser();
  const loggedOut = Boolean(supabaseClient && !currentUser);
  document.body.dataset.accessLevel = currentAccess.accessLevel || 'local';
  updateAddBtnVisibility();
  els.importBtn?.classList.toggle('hidden', loggedOut || readOnly || (supabaseClient && currentUser && !canWrite()));
  els.webshopBtn?.classList.toggle('hidden', loggedOut || readOnly || (supabaseClient && currentUser && !canWrite()));
  els.exportBtn?.classList.toggle('hidden', loggedOut || readOnly);
  els.accessBadge?.classList.toggle('hidden', !readOnly);
  els.galleryUploadDrop?.classList.toggle('hidden', !canWrite());
}

function updateAddBtnVisibility() {
  const readOnly = isReadOnlyUser();
  const loggedOut = Boolean(supabaseClient && !currentUser);
  const hidden = currentSection !== 'cigars' || loggedOut || readOnly || (supabaseClient && currentUser && !canWrite());
  els.addBtn?.classList.toggle('hidden', hidden);
}

function updateSectionVisibility() {
  const authGated = Boolean(supabaseClient && !currentUser);
  els.sectionTabs?.classList.toggle('hidden', authGated);
  els.appShell?.classList.toggle('hidden', authGated || currentSection !== 'cigars');
  els.galleryShell?.classList.toggle('hidden', authGated || currentSection !== 'gallery');
  els.cigarsTabBtn?.classList.toggle('active', currentSection === 'cigars');
  els.galleryTabBtn?.classList.toggle('active', currentSection === 'gallery');
  updateAddBtnVisibility();
}

function setSection(section) {
  currentSection = section === 'gallery' ? 'gallery' : 'cigars';
  updateSectionVisibility();
  if (currentSection === 'gallery') ensureGalleryLoaded();
}

async function loadAccess() {
  if (!supabaseClient || !currentUser) {
    currentAccess = { accessLevel: 'local', ownerId: null };
    setAccessUi();
    return currentAccess;
  }

  const { data, error } = await supabaseClient
    .from('cigar_access')
    .select('owner_id, access_level')
    .eq('user_id', currentUser.id);

  if (error) {
    console.warn('Could not read cigar_access. Falling back to owner mode for older setups.', error);
    currentAccess = { accessLevel: 'owner', ownerId: currentUser.id, fallback: true };
    setAccessUi();
    return currentAccess;
  }

  const rows = data || [];
  const ownerRow = rows.find((row) => row.owner_id === currentUser.id && row.access_level === 'owner');
  const readRow = rows.find((row) => row.access_level === 'read');
  const chosen = ownerRow || readRow || rows[0];

  if (!chosen) {
    currentAccess = { accessLevel: 'none', ownerId: null };
  } else {
    currentAccess = { accessLevel: chosen.access_level, ownerId: chosen.owner_id };
  }

  setAccessUi();
  return currentAccess;
}

function rowToCigar(row = {}) {
  return normalizeCigar({
    id: row.id,
    ownerId: row.user_id,
    name: row.name,
    status: row.status,
    quantity: row.quantity,
    logOrder: row.log_order ?? '',
    brand: row.brand,
    company: row.company,
    madeIn: row.made_in,
    vitola: row.vitola,
    strength: row.strength ?? '',
    rating: row.rating ?? '',
    boughtDate: row.bought_date || '',
    smokedDate: row.smoked_date || '',
    price: row.price || '',
    wrapperLeaf: row.wrapper_leaf,
    wrapperOrigin: row.wrapper_origin,
    binderLeaf: row.binder_leaf,
    binderOrigin: row.binder_origin,
    fillerLeaf: row.filler_leaf,
    fillerOrigin: row.filler_origin,
    taste: row.taste,
    draw: row.draw,
    burn: row.burn,
    nicotine: row.nicotine,
    pairing: row.pairing,
    link: row.link,
    notes: row.notes,
    imageFile: row.image_file,
    imagePath: row.image_path,
    imageCropX: row.image_crop_x ?? 50,
    imageCropY: row.image_crop_y ?? 50,
    imageZoom: row.image_zoom ?? 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    source: 'supabase'
  });
}

function cigarToRow(cigar) {
  return {
    id: cigar.id,
    user_id: currentUser.id,
    name: cigar.name,
    status: cigar.status || 'owned',
    quantity: Number(cigar.quantity || 0),
    log_order: cigar.logOrder ? Number(cigar.logOrder) : null,
    brand: cigar.brand || null,
    company: cigar.company || null,
    made_in: cigar.madeIn || null,
    vitola: cigar.vitola || null,
    strength: cigar.strength ? Number(cigar.strength) : null,
    rating: cigar.rating ? Number(cigar.rating) : null,
    bought_date: cigar.boughtDate || null,
    smoked_date: cigar.smokedDate || null,
    price: cigar.price || null,
    wrapper_leaf: cigar.wrapperLeaf || null,
    wrapper_origin: cigar.wrapperOrigin || null,
    binder_leaf: cigar.binderLeaf || null,
    binder_origin: cigar.binderOrigin || null,
    filler_leaf: cigar.fillerLeaf || null,
    filler_origin: cigar.fillerOrigin || null,
    taste: cigar.taste || null,
    draw: cigar.draw || null,
    burn: cigar.burn || null,
    nicotine: cigar.nicotine || null,
    pairing: cigar.pairing || null,
    link: cigar.link || null,
    notes: cigar.notes || null,
    image_file: cigar.imageFile || null,
    image_url: null,
    image_path: cigar.imagePath || null,
    image_crop_x: Number(cigar.imageCropX || 50),
    image_crop_y: Number(cigar.imageCropY || 50),
    image_zoom: Number(cigar.imageZoom || 1),
    created_at: cigar.createdAt || todayIso()
  };
}

function photoRowToPhoto(row = {}) {
  return {
    id: row.id,
    cigarId: row.cigar_id,
    ownerId: row.user_id,
    imagePath: row.image_path,
    caption: row.caption || '',
    sortOrder: row.sort_order ?? 0,
    isProfile: Boolean(row.is_profile),
    createdAt: row.created_at
  };
}

function photoToRow(photo, cigarId, ownerId) {
  return {
    id: photo.id,
    cigar_id: cigarId,
    user_id: ownerId,
    image_path: photo.imagePath,
    caption: photo.caption || null,
    sort_order: Number(photo.sortOrder || 0),
    is_profile: Boolean(photo.isProfile)
  };
}

async function signedImageUrl(path) {
  if (!supabaseClient || !path) return '';
  const { data, error } = await supabaseClient.storage
    .from(SUPABASE_CONFIG.bucket || 'cigar-photos')
    .createSignedUrl(path, 60 * 60 * 24);
  if (error) {
    console.warn('Could not create signed image URL', error);
    return '';
  }
  return data?.signedUrl || '';
}

function dataUrlToBlob(dataUrl) {
  const [header, base64] = dataUrl.split(',');
  const contentType = header.match(/data:(.*?);base64/)?.[1] || 'image/jpeg';
  const bytes = atob(base64);
  const array = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 1) array[i] = bytes.charCodeAt(i);
  return new Blob([array], { type: contentType });
}

function compressImage(fileOrBlob, maxSize = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(fileOrBlob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (blob) resolve({ blob, contentType: 'image/webp', extension: 'webp' });
        else reject(new Error('Could not compress image.'));
      }, 'image/webp', quality);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read image.'));
    };
    img.src = url;
  });
}

async function uploadCigarImage(cigar, fileOrBlob) {
  if (!supabaseClient || !currentUser || !fileOrBlob) return cigar.imagePath || '';
  const compressed = await compressImage(fileOrBlob);
  const path = `${currentUser.id}/${cigar.id}/${Date.now()}-${slugify(cigar.name)}.${compressed.extension}`;
  const { error } = await supabaseClient.storage
    .from(SUPABASE_CONFIG.bucket || 'cigar-photos')
    .upload(path, compressed.blob, { contentType: compressed.contentType, upsert: false });

  if (error) throw error;
  return path;
}

async function loadRemoteData() {
  if (!supabaseClient || !currentUser) return;
  if (!currentAccess.ownerId && currentAccess.accessLevel !== 'owner') await loadAccess();

  if (currentAccess.accessLevel === 'none') {
    cigars = [];
    setSyncStatus('No cigar access', 'error');
    appLoading = false;
    render();
    return;
  }

  setSyncStatus('Syncing…', 'syncing');
  const { data, error } = await supabaseClient
    .from('cigars')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    setSyncStatus('Sync error', 'error');
    alert(`Could not load Supabase cigars: ${error.message}`);
    appLoading = false;
    render();
    return;
  }

  cigars = (data || []).map(rowToCigar);
  await loadRemotePhotos();
  await hydrateImages();
  saveData();
  setSyncStatus(currentUser.email, 'cloud');
  setAccessUi();
  appLoading = false;
  render();
  maybeOpenPendingWebshopImport();
}

async function loadRemotePhotos() {
  if (!supabaseClient || !currentUser || !cigars.length) return;
  const ids = cigars.map((cigar) => cigar.id);
  const { data, error } = await supabaseClient
    .from('cigar_photos')
    .select('*')
    .in('cigar_id', ids)
    .order('sort_order', { ascending: true });

  if (error) {
    console.warn('Could not load cigar_photos. Using legacy single-photo data if available.', error);
    return;
  }

  const byCigar = new Map();
  for (const row of data || []) {
    const photo = photoRowToPhoto(row);
    if (!byCigar.has(photo.cigarId)) byCigar.set(photo.cigarId, []);
    byCigar.get(photo.cigarId).push(photo);
  }

  cigars = cigars.map((cigar) => ({
    ...cigar,
    photos: byCigar.get(cigar.id) || cigar.photos || []
  }));
}

async function saveRemoteCigar(cigar) {
  if (!supabaseClient || !currentUser) return cigar;
  if (!canWrite()) throw new Error('This account has read-only access.');
  const result = { ...cigar, source: 'supabase', imageData: '', ownerId: currentUser.id };

  const profileCandidate = formPhotos.find((photo) => photo.isProfile) || formPhotos[0] || null;
  if (profileCandidate?.imagePath) result.imagePath = profileCandidate.imagePath;

  const { error } = await supabaseClient
    .from('cigars')
    .upsert(cigarToRow(result), { onConflict: 'id,user_id' });

  if (error) throw error;

  await saveRemotePhotos(result);
  return result;
}

async function saveRemotePhotos(cigar) {
  if (!supabaseClient || !currentUser) return;

  if (deletedPhotoIds.length) {
    const { error } = await supabaseClient
      .from('cigar_photos')
      .delete()
      .in('id', deletedPhotoIds);
    if (error) throw error;
  }

  if (deletedPhotoPaths.length) await deleteRemoteImages(deletedPhotoPaths);

  const usablePhotos = formPhotos.filter((photo) => !photo.deleted);
  if (usablePhotos.length && !usablePhotos.some((photo) => photo.isProfile)) usablePhotos[0].isProfile = true;

  const rows = [];
  for (let index = 0; index < usablePhotos.length; index += 1) {
    const photo = usablePhotos[index];
    let imagePath = photo.imagePath || '';

    if (!imagePath && photo.file) {
      imagePath = await uploadCigarImage(cigar, photo.file);
    } else if (!imagePath && photo.dataUrl?.startsWith('data:image/')) {
      imagePath = await uploadCigarImage(cigar, dataUrlToBlob(photo.dataUrl));
    }

    if (!imagePath) continue;

    const id = photo.id && !String(photo.id).startsWith('temp-') && !photo.legacy
      ? photo.id
      : newId('photo');

    rows.push(photoToRow({
      ...photo,
      id,
      imagePath,
      sortOrder: index,
      isProfile: Boolean(photo.isProfile)
    }, cigar.id, currentUser.id));
  }

  if (rows.length) {
    const { error } = await supabaseClient
      .from('cigar_photos')
      .upsert(rows, { onConflict: 'id' });
    if (error) throw error;

    const profileRow = rows.find((row) => row.is_profile) || rows[0];
    if (profileRow) {
      await supabaseClient
        .from('cigar_photos')
        .update({ is_profile: false })
        .eq('cigar_id', cigar.id)
        .eq('user_id', currentUser.id)
        .neq('id', profileRow.id);

      const { error: profileError } = await supabaseClient
        .from('cigars')
        .update({ image_path: profileRow.image_path, image_url: null })
        .eq('id', cigar.id)
        .eq('user_id', currentUser.id);
      if (profileError) console.warn('Could not update legacy profile image path', profileError);
    }
  } else {
    await supabaseClient
      .from('cigars')
      .update({ image_path: null, image_url: null })
      .eq('id', cigar.id)
      .eq('user_id', currentUser.id);
  }
}

async function deleteRemoteImages(paths = []) {
  if (!supabaseClient) return;
  const uniquePaths = [...new Set(paths.filter(Boolean))];
  if (!uniquePaths.length) return;
  const { error } = await supabaseClient.storage
    .from(SUPABASE_CONFIG.bucket || 'cigar-photos')
    .remove(uniquePaths);
  if (error) console.warn('Could not delete remote image(s)', error);
}

async function deleteRemoteImage(path) {
  await deleteRemoteImages([path]);
}

async function deleteRemoteCigar(cigar) {
  if (!canWrite()) throw new Error('This account has read-only access.');
  const paths = (cigar.photos || []).map((photo) => photo.imagePath).filter(Boolean);
  if (cigar.imagePath) paths.push(cigar.imagePath);

  const { error } = await supabaseClient
    .from('cigars')
    .delete()
    .eq('id', cigar.id)
    .eq('user_id', currentUser.id);
  if (error) throw error;
  await deleteRemoteImages(paths);
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Could not read image file.'));
    reader.readAsDataURL(blob);
  });
}

function galleryPhotoRowToPhoto(row = {}) {
  return {
    id: row.id,
    imagePath: row.image_path,
    note: row.note || '',
    sortOrder: row.sort_order ?? 0
  };
}

function galleryPhotoToRow(photo, ownerId) {
  return {
    id: photo.id,
    user_id: ownerId,
    image_path: photo.imagePath,
    note: photo.note || null,
    sort_order: Number(photo.sortOrder || 0)
  };
}

function loadGalleryPhotosLocal() {
  const saved = localStorage.getItem(GALLERY_STORAGE_KEY);
  if (!saved) return [];
  try {
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('Could not read saved gallery photos.', error);
    return [];
  }
}

function saveGalleryPhotosLocal() {
  localStorage.setItem(GALLERY_STORAGE_KEY, JSON.stringify(galleryPhotos, null, 2));
}

async function loadRemoteGalleryPhotos() {
  if (!supabaseClient || !currentUser) return;
  const { data, error } = await supabaseClient
    .from('gallery_photos')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) {
    console.warn('Could not load gallery_photos.', error);
    return;
  }

  const photos = (data || []).map(galleryPhotoRowToPhoto);
  for (const photo of photos) {
    photo.signedUrl = await signedImageUrl(photo.imagePath);
  }
  galleryPhotos = photos;
}

async function ensureGalleryLoaded() {
  if (galleryLoaded || galleryLoading) return;
  galleryLoading = true;
  renderGalleryGrid();

  if (supabaseClient && currentUser) {
    await loadRemoteGalleryPhotos();
  } else {
    galleryPhotos = loadGalleryPhotosLocal();
  }

  galleryLoaded = true;
  galleryLoading = false;
  renderGalleryGrid();
}

async function addGalleryPhotos(files) {
  const fileList = Array.from(files || []).filter(Boolean);
  if (!fileList.length || !canWrite()) return;

  if (supabaseClient && currentUser) {
    for (const file of fileList) {
      try {
        const compressed = await compressImage(file);
        const path = `${currentUser.id}/gallery/${Date.now()}-${slugify(file.name || 'photo')}.${compressed.extension}`;
        const { error: uploadError } = await supabaseClient.storage
          .from(SUPABASE_CONFIG.bucket || 'cigar-photos')
          .upload(path, compressed.blob, { contentType: compressed.contentType, upsert: false });
        if (uploadError) throw uploadError;

        const photo = { id: newId('gallery'), imagePath: path, note: '', sortOrder: galleryPhotos.length };
        const { error: insertError } = await supabaseClient
          .from('gallery_photos')
          .insert(galleryPhotoToRow(photo, currentUser.id));
        if (insertError) throw insertError;

        photo.signedUrl = await signedImageUrl(path);
        galleryPhotos.push(photo);
      } catch (error) {
        console.error(error);
        alert(`Could not upload photo: ${error.message}`);
      }
    }
  } else {
    for (const file of fileList) {
      try {
        const compressed = await compressImage(file);
        const dataUrl = await blobToDataUrl(compressed.blob);
        galleryPhotos.push({ id: newId('gallery'), dataUrl, note: '', sortOrder: galleryPhotos.length });
      } catch (error) {
        console.error(error);
      }
    }
    saveGalleryPhotosLocal();
  }

  galleryLoaded = true;
  renderGalleryGrid();
}

async function updateGalleryNote(id, note) {
  if (!canWrite()) return;
  const photo = galleryPhotos.find((item) => String(item.id) === String(id));
  if (!photo) return;
  photo.note = note;

  if (supabaseClient && currentUser) {
    const { error } = await supabaseClient
      .from('gallery_photos')
      .update({ note: note || null })
      .eq('id', id)
      .eq('user_id', currentUser.id);
    if (error) {
      console.error(error);
      alert(`Could not save note: ${error.message}`);
    }
  } else {
    saveGalleryPhotosLocal();
  }
}

async function deleteGalleryPhotoById(id) {
  if (!canWrite()) return;
  const photo = galleryPhotos.find((item) => String(item.id) === String(id));
  if (!photo) return;
  if (!confirm('Delete this photo?')) return;

  if (supabaseClient && currentUser) {
    const { error } = await supabaseClient
      .from('gallery_photos')
      .delete()
      .eq('id', id)
      .eq('user_id', currentUser.id);
    if (error) {
      console.error(error);
      alert(`Could not delete photo: ${error.message}`);
      return;
    }
    if (photo.imagePath) await deleteRemoteImage(photo.imagePath);
  }

  galleryPhotos = galleryPhotos.filter((item) => String(item.id) !== String(id));
  if (!supabaseClient || !currentUser) saveGalleryPhotosLocal();
  renderGalleryGrid();
}

function renderGalleryGrid() {
  if (!els.galleryGrid) return;
  const writable = canWrite();

  if (galleryLoading) {
    els.galleryGrid.innerHTML = '';
    els.galleryEmpty?.classList.add('hidden');
    els.galleryLoadingState?.classList.remove('hidden');
    return;
  }
  els.galleryLoadingState?.classList.add('hidden');

  if (!galleryPhotos.length) {
    els.galleryGrid.innerHTML = '';
    els.galleryEmpty?.classList.remove('hidden');
    return;
  }
  els.galleryEmpty?.classList.add('hidden');

  els.galleryGrid.innerHTML = galleryPhotos.map((photo, index) => {
    const src = photoSrc(photo);
    const note = escapeHtml(photo.note || '');
    const noteField = writable
      ? `<input class="gallery-note-input" type="text" value="${note}" placeholder="Add a note…" data-note-id="${escapeHtml(photo.id)}">`
      : `<span class="gallery-note-text">${note}</span>`;
    const deleteBtn = writable
      ? `<button class="text-btn gallery-delete-btn" type="button" data-delete-id="${escapeHtml(photo.id)}">Delete</button>`
      : '';
    return `
      <article class="gallery-tile" data-id="${escapeHtml(photo.id)}">
        <button class="gallery-tile-photo" type="button" data-gallery-photo-index="${index}" aria-label="Open photo">
          <img src="${escapeHtml(src)}" alt="${note || 'Gallery photo'}">
        </button>
        <div class="gallery-tile-footer">
          ${noteField}
          ${deleteBtn}
        </div>
      </article>
    `;
  }).join('');
}

function setAuthUi() {
  const cloud = Boolean(supabaseClient && currentUser);
  const loggedOut = Boolean(supabaseClient && !currentUser);
  els.signOutBtn?.classList.toggle('hidden', !cloud);
  els.moreMenuBtn?.classList.toggle('hidden', loggedOut);
  els.authPanel?.classList.toggle('hidden', !supabaseClient || cloud);
  updateSectionVisibility();

  if (cloud) {
    if (currentAccess.accessLevel === 'none') setSyncStatus('No cigar access', 'error');
    else setSyncStatus(currentUser.email, 'cloud');
  } else if (supabaseClient) {
    setSyncStatus('Sign in required', 'error');
  } else {
    setSyncStatus('Local mode', 'local');
  }

  setAccessUi();
}

async function setupSupabase() {
  if (!isSupabaseEnabled()) {
    setSyncStatus('Local mode', 'local');
    return false;
  }

  supabaseClient = window.supabase.createClient(
    SUPABASE_CONFIG.url,
    SUPABASE_CONFIG.publishableKey
  );

  const { data } = await supabaseClient.auth.getSession();
  currentUser = data.session?.user || null;

  supabaseClient.auth.onAuthStateChange(async (_event, session) => {
    currentUser = session?.user || null;
    if (currentUser) await loadAccess();
    else currentAccess = { accessLevel: 'local', ownerId: null };
    setAuthUi();
    if (appReady && currentUser) await loadRemoteData();
  });

  setAuthUi();
  return true;
}

async function signIn(event) {
  event.preventDefault();
  setAuthMessage('Signing in…');
  const { error } = await supabaseClient.auth.signInWithPassword({
    email: els.authEmail.value.trim(),
    password: els.authPassword.value
  });
  if (error) setAuthMessage(error.message, 'error');
  else setAuthMessage('Signed in.', 'success');
}

async function signOut() {
  if (!supabaseClient) return;
  await supabaseClient.auth.signOut();
  currentUser = null;
  currentAccess = { accessLevel: 'local', ownerId: null };
  cigars = [];
  render();
  setAuthUi();
}

async function hydrateImages() {
  cigars = await Promise.all(cigars.map(async (cigar, index) => {
    const normalized = normalizeCigar(cigar, index);
    const photos = await resolvePhotos(normalized);
    return {
      ...normalized,
      photos,
      images: photos.map(photoSrc).filter(Boolean)
    };
  }));
}

function getSearchBlob(cigar) {
  return [
    cigar.name, cigar.status, cigar.brand, cigar.company, cigar.madeIn, cigar.vitola,
    cigar.wrapperLeaf, cigar.wrapperOrigin, cigar.binderLeaf, cigar.binderOrigin,
    cigar.fillerLeaf, cigar.fillerOrigin, cigar.taste, cigar.notes, cigar.logOrder
  ].filter(Boolean).join(' ').toLowerCase();
}

function orderDateValue(value) {
  if (!value) return Number.POSITIVE_INFINITY;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? Number.POSITIVE_INFINITY : date.getTime();
}

function createdDateValue(value) {
  const date = new Date(value || 0);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function compareCigars(sort, a, b) {
  if (sort === 'history') {
    const orderA = a.logOrder ? Number(a.logOrder) : Number.POSITIVE_INFINITY;
    const orderB = b.logOrder ? Number(b.logOrder) : Number.POSITIVE_INFINITY;
    if (orderA !== orderB) return orderA - orderB;

    const smokedA = orderDateValue(a.smokedDate);
    const smokedB = orderDateValue(b.smokedDate);
    if (smokedA !== smokedB) return smokedA - smokedB;

    return createdDateValue(a.createdAt) - createdDateValue(b.createdAt);
  }
  if (sort === 'name') return a.name.localeCompare(b.name);
  if (sort === 'rating') return Number(a.rating || 0) - Number(b.rating || 0);
  if (sort === 'strength') return Number(a.strength || 0) - Number(b.strength || 0);
  return createdDateValue(a.createdAt) - createdDateValue(b.createdAt);
}

function visibleCigars() {
  const query = normalise(els.search.value);
  const status = els.statusFilter.value;
  const sort = els.sortBy.value;
  const dirMul = sortDir === 'desc' ? -1 : 1;

  const filtered = cigars.filter((cigar) => {
    const statusOk = status === 'all' || cigar.status === status;
    const searchOk = !query || getSearchBlob(cigar).includes(query);
    return statusOk && searchOk;
  });

  return filtered.sort((a, b) => compareCigars(sort, a, b) * dirMul);
}

function updateSortDirBtn() {
  if (!els.sortDirBtn) return;
  const asc = sortDir === 'asc';
  els.sortDirBtn.classList.toggle('is-desc', !asc);
  const label = asc ? 'Sort ascending — click to reverse' : 'Sort descending — click to reverse';
  els.sortDirBtn.setAttribute('aria-label', label);
  els.sortDirBtn.title = label;
}

function setToolbarCollapsed(collapsed) {
  if (!els.toolbar || !els.toolbarToggleBtn) return;
  els.toolbar.classList.toggle('collapsed', collapsed);
  const label = collapsed ? 'Expand filters' : 'Collapse filters';
  els.toolbarToggleBtn.setAttribute('aria-label', label);
  els.toolbarToggleBtn.setAttribute('aria-expanded', String(!collapsed));
  localStorage.setItem(TOOLBAR_KEY, collapsed ? '1' : '0');
}

function renderStats() {
  const total = cigars.length;
  const owned = cigars
    .filter((c) => c.status === 'owned')
    .reduce((sum, c) => sum + Number(c.quantity || 1), 0);
  const smoked = cigars.filter((c) => c.status === 'smoked').length;
  const ratings = cigars.map((c) => Number(c.rating)).filter(Boolean);
  const avg = ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : '—';

  els.stats.innerHTML = `
    <article><strong>${total}</strong><span>☰ Total</span></article>
    <article><strong>${owned}</strong><span>☘ Humidor</span></article>
    <article><strong>${smoked}</strong><span>◉ Smoked</span></article>
    <article><strong>${avg}</strong><span>★ Avg</span></article>
  `;
}

function blendLine(cigar) {
  const wrapper = [cigar.wrapperLeaf, cigar.wrapperOrigin].filter(Boolean).join(' · ');
  const binder = [cigar.binderLeaf, cigar.binderOrigin].filter(Boolean).join(' · ');
  const filler = [cigar.fillerLeaf, cigar.fillerOrigin].filter(Boolean).join(' · ');

  return [
    cigar.madeIn ? `<span class="made-in-chip" title="Made in ${escapeHtml(cigar.madeIn)}"><b>Made in</b> ${escapeHtml(cigar.madeIn)}</span>` : '',
    wrapper ? `<span title="Wrapper ${escapeHtml(wrapper)}"><b>Wrapper</b> ${escapeHtml(wrapper)}</span>` : '',
    binder ? `<span title="Binder ${escapeHtml(binder)}"><b>Binder</b> ${escapeHtml(binder)}</span>` : '',
    filler ? `<span title="Filler ${escapeHtml(filler)}"><b>Filler</b> ${escapeHtml(filler)}</span>` : ''
  ].filter(Boolean).join('');
}

function historyBadge(cigar) {
  if (!cigar.logOrder) return '';
  return `<span class="history-badge">#${escapeHtml(cigar.logOrder)}</span>`;
}

function photoFrameHtml(cigar, className = 'thumb', index = 0) {
  const src = cigar.images?.[index] || cigar.images?.[0];
  if (!src) return `<div class="${className} no-photo">No photo</div>`;
  return `
    <button class="${className} photo-frame" type="button" data-gallery-id="${escapeHtml(cigar.id)}" data-gallery-index="${index}" aria-label="Open ${escapeHtml(cigar.name)} image gallery">
      <img class="cigar-photo" src="${escapeHtml(src)}" alt="${escapeHtml(cigar.name)}" style="${imageCropStyle(cigar)}">
    </button>
  `;
}

function cardHtml(cigar) {
  return `
    <article class="cigar-card" data-id="${escapeHtml(cigar.id)}">
      ${photoFrameHtml(cigar)}
      <div class="card-body">
        <div class="card-topline">
          ${statusPill(cigar.status)}
          <span>${stars(cigar.rating)} ${historyBadge(cigar)}</span>
        </div>
        <h3>${escapeHtml(cigar.name)}</h3>
        <p class="meta-line">${escapeHtml([cigar.brand].filter(Boolean).join(' · '))}</p>
        <div class="blend-chips blend-chips-card">${blendLine(cigar)}</div>
        <div class="card-footer">
          <span class="strength-tag">${strengthTagInner(cigar.strength, 'Strength not set')}</span>
          ${canEditCigar(cigar) ? `<button class="text-btn edit-btn" type="button" data-edit="${escapeHtml(cigar.id)}">Edit</button>` : '<span class="read-only-text">Read-only</span>'}
        </div>
      </div>
    </article>
  `;
}

function listHtml(cigar) {
  return `
    <article class="cigar-row" data-id="${escapeHtml(cigar.id)}">
      ${photoFrameHtml(cigar)}
      <div class="row-main">
        <div class="row-title">
          <h3>${historyBadge(cigar)}${escapeHtml(cigar.name)}</h3>
          </div>
          <p class="meta-line">${escapeHtml([cigar.brand, cigar.company, cigar.madeIn, cigar.vitola].filter(Boolean).join(' · '))}</p>
          <div class="blend-chips compact">${blendLine(cigar)}</div>
          </div>
          <div class="row-side">

        <div>${stars(cigar.rating)} ${statusPill(cigar.status)}</div>
        <div class="subtle strength-tag">${strengthTagInner(cigar.strength, 'No strength')}</div>
        ${canEditCigar(cigar) ? `<button class="text-btn edit-btn" type="button" data-edit="${escapeHtml(cigar.id)}">Edit</button>` : '<span class="read-only-text">Read-only</span>'}
      </div>
    </article>
  `;
}

function render() {
  renderStats();
  syncHeaderHeight();

  const list = visibleCigars();
  els.results.className = `results ${viewMode === 'cards' ? 'cards-view' : 'list-view'}`;
  els.cardViewBtn.classList.toggle('active', viewMode === 'cards');
  els.listViewBtn.classList.toggle('active', viewMode === 'list');
  els.loadingState?.classList.toggle('hidden', !appLoading);
  els.empty.classList.toggle('hidden', appLoading || list.length > 0);

  els.results.innerHTML = list.map(viewMode === 'cards' ? cardHtml : listHtml).join('');
}

function field(label, value) {
  if (!value) return '';
  return `<div class="detail-field"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

function detailHtml(cigar) {
  const images = cigar.images?.length ? cigar.images : [];
  const mainImage = images[0]
    ? photoFrameHtml(cigar, 'detail-main-img', 0)
    : '<div class="detail-main-img no-photo">No photo yet</div>';

  const thumbs = images.length > 1
    ? `<div class="detail-thumbs">${images.map((src, i) => `<button class="detail-thumb ${i === 0 ? 'active' : ''}" type="button" data-src="${escapeHtml(src)}" data-index="${i}" aria-label="Show photo ${i + 1}"><img src="${escapeHtml(src)}" alt="${escapeHtml(cigar.name)} photo ${i + 1}"></button>`).join('')}</div>`
    : '';

  return `
    <div class="detail-layout" data-id="${escapeHtml(cigar.id)}">
      <section class="detail-images">
        ${mainImage}
        ${thumbs}
      </section>
      <section class="detail-info">
        <div class="detail-heading">
          ${statusPill(cigar.status)}
          ${historyBadge(cigar)}
          <h2 id="detailTitle">${escapeHtml(cigar.name)}</h2>
          <p>${escapeHtml([cigar.brand, cigar.company, cigar.madeIn].filter(Boolean).join(' · '))}</p>
        </div>

        <div class="detail-actions">
          ${canEditCigar(cigar) ? `<button class="primary-btn edit-btn" type="button" data-edit="${escapeHtml(cigar.id)}">Edit cigar</button>` : '<span class="readonly-banner">Read-only view</span>'}
          ${cigar.link ? `<a class="ghost-link" href="${escapeHtml(cigar.link)}" target="_blank" rel="noopener">Product page ↗</a>` : ''}
        </div>

        <dl class="detail-list">
          ${field('Smoking order', cigar.logOrder ? `#${cigar.logOrder}` : '')}
          ${field('Made in', cigar.madeIn)}
          ${field('Vitola / size', cigar.vitola)}
          ${field('Strength', strengthLabel(cigar.strength))}
          ${field('Rating', cigar.rating ? `${cigar.rating} / 5` : '')}
          ${field('Quantity', cigar.status === 'owned' ? String(cigar.quantity || 1) : '')}
          ${field('Bought', displayDate(cigar.boughtDate))}
          ${field('Smoked', displayDate(cigar.smokedDate))}
          ${field('Price', cigar.price)}
          ${field('Draw', cigar.draw)}
          ${field('Burn', cigar.burn)}
          ${field('Nicotine feel', cigar.nicotine)}
          ${field('Pairing', cigar.pairing)}
        </dl>

        <h3>Blend</h3>
        <div class="blend-table">
          <div><b>Wrapper</b><span>${escapeHtml([cigar.wrapperLeaf, cigar.wrapperOrigin].filter(Boolean).join(' · ') || '—')}</span></div>
          <div><b>Binder</b><span>${escapeHtml([cigar.binderLeaf, cigar.binderOrigin].filter(Boolean).join(' · ') || '—')}</span></div>
          <div><b>Filler</b><span>${escapeHtml([cigar.fillerLeaf, cigar.fillerOrigin].filter(Boolean).join(' · ') || '—')}</span></div>
        </div>

        ${cigar.taste ? `<h3>Taste</h3><p>${escapeHtml(cigar.taste)}</p>` : ''}
        ${cigar.notes ? `<h3>Personal notes</h3><p class="note-text">${escapeHtml(cigar.notes)}</p>` : ''}
      </section>
    </div>
  `;
}

function openDetail(id) {
  const cigar = cigars.find((item) => item.id === id);
  if (!cigar) return;
  els.detailBody.innerHTML = detailHtml(cigar);
  els.detailModal.classList.remove('hidden');
}

function closeDetail() {
  els.detailModal.classList.add('hidden');
}

function activeFormProfilePhoto() {
  return formPhotos.find((photo) => photo.isProfile && !photo.deleted)
    || formPhotos.find((photo) => !photo.deleted)
    || null;
}

function formPhotoPreviewSrc(photo = {}) {
  return photo.dataUrl || photo.signedUrl || photo.src || '';
}

function getCurrentFormImageSrc() {
  const profile = activeFormProfilePhoto();
  if (profile) return formPhotoPreviewSrc(profile);
  const imageFile = document.getElementById('imageFile').value.trim();
  if (selectedImageData) return selectedImageData;
  if (imageFile) return `${IMG_DIR}${encodeImagePath(imageFile)}`;
  return '';
}

function getFormCrop() {
  return {
    imageCropX: document.getElementById('imageCropX').value || 50,
    imageCropY: document.getElementById('imageCropY').value || 50,
    imageZoom: document.getElementById('imageZoom').value || 1
  };
}

function updateImageCropPreview() {
  const src = getCurrentFormImageSrc();
  const crop = getFormCrop();
  if (!src) {
    els.imageCropPreview.className = 'crop-preview no-photo';
    els.imageCropPreview.innerHTML = 'No profile photo yet';
    renderPhotoManager();
    updateZoomBadge();
    return;
  }

  els.imageCropPreview.className = 'crop-preview photo-frame';
  els.imageCropPreview.innerHTML = `<img class="cigar-photo" src="${escapeHtml(src)}" alt="Profile preview" style="${imageCropStyle(crop)}">`;
  renderPhotoManager();
  updateZoomBadge();
}

function currentFormCropImg() {
  return els.imageCropPreview?.querySelector('img.cigar-photo') || null;
}

function applyCropTransform() {
  const img = currentFormCropImg();
  if (img) img.style.cssText = imageCropStyle(getFormCrop());
}

function updateZoomBadge() {
  if (!els.cropZoomValue) return;
  const zoom = Number(document.getElementById('imageZoom').value || 1);
  els.cropZoomValue.textContent = `${zoom.toFixed(2)}×`;
}

function setCropValues({ x, y, zoom } = {}) {
  const xEl = document.getElementById('imageCropX');
  const yEl = document.getElementById('imageCropY');
  const zEl = document.getElementById('imageZoom');
  if (zoom !== undefined) zEl.value = Math.min(IMAGE_ZOOM_MAX, Math.max(IMAGE_ZOOM_MIN, zoom)).toFixed(3);
  if (x !== undefined) xEl.value = Math.min(100, Math.max(0, x)).toFixed(2);
  if (y !== undefined) yEl.value = Math.min(100, Math.max(0, y)).toFixed(2);
  applyCropTransform();
  updateZoomBadge();
}

function endCropPointer(event) {
  cropPointers.delete(event.pointerId);
  if (cropDrag && event.pointerId === cropDrag.pointerId) cropDrag = null;
  if (cropPointers.size < 2) cropPinchStart = null;
  if (!cropPointers.size) els.imageCropPreview?.classList.remove('dragging');
}

function attachCropInteractions() {
  const el = els.imageCropPreview;
  if (!el) return;

  els.cropEditToggle?.addEventListener('change', () => {
    els.cropEditor?.classList.toggle('crop-edit-enabled', els.cropEditToggle.checked);
  });

  el.addEventListener('pointerdown', (event) => {
    if (!els.cropEditToggle?.checked) return;
    if (!currentFormCropImg()) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    cropPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    el.setPointerCapture(event.pointerId);

    if (cropPointers.size === 2) {
      const pts = Array.from(cropPointers.values());
      cropPinchStart = {
        dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
        zoom: Number(document.getElementById('imageZoom').value || 1)
      };
      cropDrag = null;
    } else if (cropPointers.size === 1) {
      const zoom = Number(document.getElementById('imageZoom').value || 1);
      const x = Number(document.getElementById('imageCropX').value || 50);
      const y = Number(document.getElementById('imageCropY').value || 50);
      cropDrag = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startShiftX: cropPercentToShift(x, zoom),
        startShiftY: cropPercentToShift(y, zoom),
        zoom
      };
    }
    el.classList.add('dragging');
  });

  el.addEventListener('pointermove', (event) => {
    if (!cropPointers.has(event.pointerId)) return;
    cropPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (cropPointers.size === 2 && cropPinchStart) {
      const pts = Array.from(cropPointers.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (cropPinchStart.dist > 0) {
        setCropValues({ zoom: cropPinchStart.zoom * (dist / cropPinchStart.dist) });
      }
      return;
    }

    if (cropDrag && event.pointerId === cropDrag.pointerId) {
      const rect = el.getBoundingClientRect();
      const zoom = cropDrag.zoom;
      const deltaShiftX = ((event.clientX - cropDrag.startClientX) / (rect.width * zoom)) * 100;
      const deltaShiftY = ((event.clientY - cropDrag.startClientY) / (rect.height * zoom)) * 100;
      const bound = cropMaxShift(zoom);
      const newShiftX = Math.min(bound, Math.max(-bound, cropDrag.startShiftX + deltaShiftX));
      const newShiftY = Math.min(bound, Math.max(-bound, cropDrag.startShiftY + deltaShiftY));
      setCropValues({
        x: cropShiftToPercent(newShiftX, zoom),
        y: cropShiftToPercent(newShiftY, zoom)
      });
    }
  });

  el.addEventListener('pointerup', endCropPointer);
  el.addEventListener('pointercancel', endCropPointer);

  el.addEventListener('wheel', (event) => {
    if (!els.cropEditToggle?.checked) return;
    if (!currentFormCropImg()) return;
    event.preventDefault();
    const zoom = Number(document.getElementById('imageZoom').value || 1);
    setCropValues({ zoom: zoom * (1 - Math.sign(event.deltaY) * 0.08) });
  }, { passive: false });

  els.cropZoomInBtn?.addEventListener('click', () => {
    setCropValues({ zoom: Number(document.getElementById('imageZoom').value || 1) + 0.25 });
  });
  els.cropZoomOutBtn?.addEventListener('click', () => {
    setCropValues({ zoom: Number(document.getElementById('imageZoom').value || 1) - 0.25 });
  });
}

function renderPhotoManager() {
  if (!els.photoManager) return;
  const photos = formPhotos.filter((photo) => !photo.deleted);

  if (!photos.length) {
    els.photoManager.innerHTML = '<p class="hint no-photo-manager">No photos yet. Upload one or more photos, then choose a profile photo.</p>';
    return;
  }

  els.photoManager.innerHTML = photos.map((photo, index) => {
    const src = formPhotoPreviewSrc(photo);
    const id = escapeHtml(photo.id);
    return `
      <article class="photo-manager-item ${photo.isProfile ? 'is-profile' : ''}" data-photo-id="${id}">
        <button class="photo-manager-thumb" type="button" data-preview-photo="${id}" aria-label="Preview photo ${index + 1}">
          ${src ? `<img src="${escapeHtml(src)}" alt="Cigar photo ${index + 1}">` : 'Photo'}
        </button>
        <div class="photo-manager-actions">
          <button class="small-btn ${photo.isProfile ? 'primary-chip' : 'ghost-btn'}" type="button" data-profile-photo="${id}">${photo.isProfile ? '✓ Profile' : 'Set profile'}</button>
          <button class="small-btn ghost-btn" type="button" data-remove-photo="${id}">Remove</button>
        </div>
      </article>
    `;
  }).join('');
}

function setFormProfilePhoto(photoId) {
  const photo = formPhotos.find((item) => String(item.id) === String(photoId));
  if (!photo) return;
  formPhotos = formPhotos.map((item) => ({ ...item, isProfile: String(item.id) === String(photoId) }));
  updateImageCropPreview();
}

function removeFormPhoto(photoId) {
  const photo = formPhotos.find((item) => String(item.id) === String(photoId));
  if (!photo) return;

  if (!confirm('Remove this photo?')) return;

  if (photo.imagePath && !photo.localOnly) deletedPhotoPaths.push(photo.imagePath);
  if (photo.id && !String(photo.id).startsWith('temp-') && !photo.legacy && !photo.localOnly) {
    deletedPhotoIds.push(photo.id);
  }

  const wasProfile = photo.isProfile;
  formPhotos = formPhotos.filter((item) => String(item.id) !== String(photoId));
  if (wasProfile && formPhotos.length) formPhotos[0].isProfile = true;
  updateImageCropPreview();
}

async function addFilesToFormPhotos(files = []) {
  const fileList = Array.from(files).filter(Boolean);
  for (const file of fileList) {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('Could not read image file.'));
      reader.readAsDataURL(file);
    });

    formPhotos.push({
      id: `temp-${newId(file.name || 'photo')}`,
      file,
      dataUrl,
      src: dataUrl,
      isProfile: !formPhotos.some((photo) => photo.isProfile),
      sortOrder: formPhotos.length,
      isNew: true
    });
  }
  selectedImageFiles = selectedImageFiles.concat(fileList);
  updateImageCropPreview();
}

function fillFormFromCigar(cigar = {}) {
  for (const fieldName of formFields) {
    const field = document.getElementById(fieldName);
    if (!field || fieldName === 'cigarId') continue;
    field.value = cigar[fieldName] ?? '';
  }
  selectedImageData = cigar.imageData || '';
}

function prefillImportedCigar(imported = {}) {
  const cigar = normalizeCigar({
    status: 'owned',
    quantity: 1,
    imageCropX: 50,
    imageCropY: 50,
    imageZoom: 1,
    source: 'webshop',
    ...imported,
    id: ''
  });
  openForm('', cigar);
}

function openForm(id = '', prefill = null) {
  const existingCigar = id ? cigars.find((item) => item.id === id) : null;
  if ((id && !canEditCigar(existingCigar)) || (!id && !canWrite())) {
    alert('This account has read-only access.');
    return;
  }

  selectedImageData = '';
  selectedImageFiles = [];
  formPhotos = [];
  deletedPhotoIds = [];
  deletedPhotoPaths = [];
  els.cigarForm.reset();
  els.cropEditor?.classList.remove('crop-edit-enabled');
  if (els.imageUpload) els.imageUpload.value = '';
  if (els.webshopUrlInput) els.webshopUrlInput.value = '';
  setWebshopImportMessage('');
  document.getElementById('cigarId').value = id;
  document.getElementById('imageCropX').value = 50;
  document.getElementById('imageCropY').value = 50;
  document.getElementById('imageZoom').value = 1;
  els.deleteBtn.classList.toggle('hidden', !id);

  if (id) {
    const cigar = cigars.find((item) => item.id === id);
    if (!cigar) return;
    els.formTitle.textContent = 'Edit cigar';
    for (const fieldName of formFields) {
      const field = document.getElementById(fieldName);
      if (!field || fieldName === 'cigarId') continue;
      field.value = cigar[fieldName] ?? '';
    }
    selectedImageData = cigar.imageData || '';
    formPhotos = sortPhotos(cigar.photos || []).map((photo, index) => ({
      ...photo,
      sortOrder: index,
      src: photoSrc(photo)
    }));
  } else if (prefill) {
    els.formTitle.textContent = 'Add from webshop';
    fillFormFromCigar(prefill);
    document.getElementById('status').value = prefill.status || 'owned';
    document.getElementById('quantity').value = prefill.quantity || '1';
    formPhotos = sortPhotos(prefill.photos || []).map((photo, index) => ({ ...photo, sortOrder: index, src: photoSrc(photo) }));
  } else {
    els.formTitle.textContent = 'Add cigar';
    document.getElementById('status').value = 'owned';
    document.getElementById('quantity').value = '1';
  }

  updateImageCropPreview();
  els.formModal.classList.remove('hidden');
}

function closeForm() {
  els.formModal.classList.add('hidden');
}

function readForm() {
  const data = {};
  for (const fieldName of formFields) {
    const field = document.getElementById(fieldName);
    if (!field) continue;
    data[fieldName] = field.value.trim();
  }

  const id = data.cigarId || newId(data.name);
  delete data.cigarId;

  return normalizeCigar({
    id,
    ...data,
    quantity: data.quantity ? Number(data.quantity) : 0,
    logOrder: data.logOrder ? Number(data.logOrder) : '',
    imageCropX: Number(data.imageCropX || 50),
    imageCropY: Number(data.imageCropY || 50),
    imageZoom: Number(data.imageZoom || 1),
    imageData: selectedImageData,
    photos: formPhotos.filter((photo) => !photo.deleted).map((photo, index) => ({ ...photo, sortOrder: index })),
    createdAt: cigars.find((c) => c.id === id)?.createdAt || todayIso(),
    updatedAt: todayIso()
  });
}

async function upsertCigar(event) {
  event.preventDefault();
  if (!canWrite()) {
    alert('This account has read-only access.');
    return;
  }
  const cigar = readForm();
  const existingIndex = cigars.findIndex((item) => item.id === cigar.id);

  try {
    if (supabaseClient && currentUser) {
      const existing = cigars[existingIndex] || {};
      const saved = await saveRemoteCigar({ ...existing, ...cigar });
      if (existingIndex >= 0) cigars[existingIndex] = { ...existing, ...saved };
      else cigars.unshift(saved);
      await loadRemoteData();
    } else {
      if (existingIndex >= 0) cigars[existingIndex] = { ...cigars[existingIndex], ...cigar };
      else cigars.unshift(cigar);
      saveData();
      await hydrateImages();
      render();
    }

    closeForm();
    closeDetail();
  } catch (error) {
    console.error(error);
    alert(`Could not save cigar: ${error.message}`);
  }
}

async function deleteCurrentCigar() {
  if (!canWrite()) {
    alert('This account has read-only access.');
    return;
  }
  const id = document.getElementById('cigarId').value;
  if (!id) return;
  const cigar = cigars.find((item) => item.id === id);
  if (!cigar) return;

  const ok = confirm(`Delete "${cigar.name}" from the log?`);
  if (!ok) return;

  try {
    if (supabaseClient && currentUser) await deleteRemoteCigar(cigar);
    cigars = cigars.filter((item) => item.id !== id);
    saveData();
    await hydrateImages();
    closeForm();
    closeDetail();
    render();
  } catch (error) {
    console.error(error);
    alert(`Could not delete cigar: ${error.message}`);
  }
}

function exportLog() {
  const storable = cigars.map(({ images, ...rest }) => rest);
  const blob = new Blob([JSON.stringify(storable, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cigar-log-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importLog(file) {
  if (!canWrite()) {
    alert('This account has read-only access.');
    return;
  }
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!Array.isArray(parsed)) throw new Error('JSON must be an array of cigars.');
      const imported = parsed.map(normalizeCigar);

      if (supabaseClient && currentUser) {
        setSyncStatus('Importing…', 'syncing');
        for (const cigar of imported) {
          formPhotos = cigar.photos || [];
          deletedPhotoIds = [];
          deletedPhotoPaths = [];
          await saveRemoteCigar(cigar);
        }
        await loadRemoteData();
      } else {
        cigars = imported;
        saveData();
        await hydrateImages();
        render();
      }
    } catch (error) {
      alert(`Could not import cigar log: ${error.message}`);
    } finally {
      els.importFile.value = '';
    }
  };
  reader.readAsText(file);
}

function openGallery(images, index, title, captions = []) {
  if (!images?.length) return;
  galleryImages = images;
  galleryIndex = Math.min(Math.max(Number(index) || 0, 0), galleryImages.length - 1);
  galleryTitle = title;
  galleryCaptions = captions;
  renderGallery();
  els.galleryModal.classList.remove('hidden');
}

function openCigarGallery(id, index = 0) {
  const cigar = cigars.find((item) => item.id === id);
  if (!cigar || !cigar.images?.length) return;
  openGallery(cigar.images, index, cigar.name);
}

function openGeneralGallery(index = 0) {
  if (!galleryPhotos.length) return;
  openGallery(
    galleryPhotos.map((photo) => photoSrc(photo)),
    index,
    'Gallery',
    galleryPhotos.map((photo) => photo.note || '')
  );
}

function renderGallery() {
  const src = galleryImages[galleryIndex];
  const caption = galleryCaptions[galleryIndex] || galleryTitle;
  els.galleryBody.innerHTML = `<img src="${escapeHtml(src)}" alt="${escapeHtml(caption)} full image">`;
  els.galleryCounter.textContent = `${caption} · ${galleryIndex + 1} / ${galleryImages.length}`;
  const multiple = galleryImages.length > 1;
  els.galleryPrev.classList.toggle('hidden', !multiple);
  els.galleryNext.classList.toggle('hidden', !multiple);
}

function closeGallery() {
  els.galleryModal.classList.add('hidden');
}

function moveGallery(delta) {
  if (!galleryImages.length) return;
  galleryIndex = (galleryIndex + delta + galleryImages.length) % galleryImages.length;
  renderGallery();
}


function encodeBase64Url(value) {
  return btoa(unescape(encodeURIComponent(value))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64Url(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return decodeURIComponent(escape(atob(padded)));
}


function setWebshopImportMessage(message = '', type = '') {
  if (!els.webshopImportMessage) return;
  els.webshopImportMessage.textContent = message;
  els.webshopImportMessage.className = `webshop-import-message ${type}`.trim();
}

function cleanImportedText(value = '') {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\*\*/g, '')
    .replace(/(?<!!)\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function textLines(value = '') {
  return String(value || '')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(cleanImportedText)
    .filter(Boolean);
}

function htmlToPlainText(raw = '') {
  if (!/<(?:html|body|div|section|h1|p|meta|img)\b/i.test(raw)) return raw;
  try {
    const doc = new DOMParser().parseFromString(raw, 'text/html');
    doc.querySelectorAll('script, style, noscript, svg').forEach((node) => node.remove());
    return doc.body?.innerText || raw;
  } catch (_error) {
    return raw;
  }
}

function documentFromHtml(raw = '') {
  if (!/<(?:html|body|div|section|h1|p|meta|img)\b/i.test(raw)) return null;
  try {
    return new DOMParser().parseFromString(raw, 'text/html');
  } catch (_error) {
    return null;
  }
}

function normalizeLabel(value = '') {
  return cleanImportedText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function lineValueAfterLabel(lines, labels) {
  const wanted = labels.map(normalizeLabel);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const tableRow = /^\|\s*(.+?)\s*\|\s*(.+?)\s*\|$/.exec(line);
    if (tableRow) {
      if (wanted.includes(normalizeLabel(tableRow[1]))) {
        const cellValue = cleanImportedText(tableRow[2]);
        if (cellValue) return cellValue;
      }
      continue;
    }
    const normalized = normalizeLabel(line);
    for (const label of wanted) {
      if (normalized === label || normalized.startsWith(`${label} `)) {
        const colonMatch = new RegExp(`${labels.find((item) => normalizeLabel(item) === label) || label}\\s*[:：]\\s*(.+)$`, 'i').exec(line);
        if (colonMatch?.[1]) return cleanImportedText(colonMatch[1]);
        const withoutLabel = cleanImportedText(line.replace(new RegExp(`^${labels.find((item) => normalizeLabel(item) === label) || ''}\\s*[:：]?`, 'i'), ''));
        if (withoutLabel && normalizeLabel(withoutLabel) !== label) return withoutLabel;
        for (let j = i + 1; j < Math.min(lines.length, i + 5); j += 1) {
          const next = cleanImportedText(lines[j]);
          if (!next) continue;
          if (/^(popis|informácie o produkte|informacie o produkte|rozmery)$/i.test(next)) continue;
          return next;
        }
      }
    }
  }
  return '';
}

function lineValueAfterColon(text, labels) {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = new RegExp(`${escaped}\\s*[:：]\\s*([^\\n]+)`, 'i').exec(text);
    if (match?.[1]) return cleanImportedText(match[1]);
  }
  return '';
}

function firstPriceFromText(text = '') {
  const prices = Array.from(String(text).matchAll(/\b\d{1,4}(?:[,.]\d{2})?\s*€/g)).map((match) => cleanImportedText(match[0]));
  if (!prices.length) return '';
  return prices.slice(0, 2).join(prices.length > 1 ? ' – ' : '');
}

function guessVitolaFromName(name = '') {
  const known = ['Robusto', 'Toro', 'Churchill', 'Corona', 'Gordo', 'Torpedo', 'Belicoso', 'Lancero', 'Panetela', 'Petit Corona', 'Short Robusto', 'Perfecto'];
  const upperName = name.toUpperCase();
  return known.find((item) => upperName.includes(item.toUpperCase())) || '';
}

const BRAND_COMPANY_MAP = {
  [normalizeLabel('C.L.E.')]: 'CLE Cigar Co.',
  [normalizeLabel('Cohiba')]: 'Habanos, S.A.',
  [normalizeLabel('Montecristo')]: 'Habanos, S.A.',
  [normalizeLabel('Partagás')]: 'Habanos, S.A.',
  [normalizeLabel('Romeo y Julieta')]: 'Habanos, S.A.',
  [normalizeLabel('Hoyo de Monterrey')]: 'Habanos, S.A.',
  [normalizeLabel('H. Upmann')]: 'Habanos, S.A.',
  [normalizeLabel('Trinidad')]: 'Habanos, S.A.',
  [normalizeLabel('Bolívar')]: 'Habanos, S.A.',
  [normalizeLabel('Ramón Allones')]: 'Habanos, S.A.'
};

function guessCompanyFromBrand(brand = '') {
  return BRAND_COMPANY_MAP[normalizeLabel(brand)] || '';
}

function imageFromRawProduct(raw = '', doc = null, sourceUrl = '') {
  const fromDoc = doc?.querySelector('meta[property="og:image"], meta[name="twitter:image"]')?.content
    || doc?.querySelector('.woocommerce-product-gallery__image img, img.wp-post-image, .product img')?.getAttribute('src')
    || doc?.querySelector('.woocommerce-product-gallery__image img, img.wp-post-image, .product img')?.getAttribute('data-src');
  if (fromDoc) return new URL(fromDoc, sourceUrl).href;

  const markdownImage = String(raw).match(/!\[[^\]]*(?:cigar|cigara|simon|beltre|toro|robusto)[^\]]*\]\((https?:\/\/[^)]+)\)/i)
    || String(raw).match(/!\[[^\]]*\]\((https?:\/\/[^)]+)\)/i);
  if (markdownImage?.[1]) return markdownImage[1];

  const htmlImage = String(raw).match(/https?:\/\/[^\s"')]+\.(?:png|jpe?g|webp)(?:\?[^\s"')]+)?/i);
  return htmlImage?.[0] || '';
}

function descriptionFromProduct(raw = '', doc = null, lines = [], title = '') {
  const fromDoc = cleanImportedText(
    doc?.querySelector('#tab-description, .woocommerce-Tabs-panel--description, .woocommerce-product-details__short-description')?.innerText || ''
  );
  if (fromDoc) return fromDoc;

  const start = lines.findIndex((line) => normalizeLabel(line) === 'popis' || normalizeLabel(line).startsWith('popis '));
  if (start < 0) return '';
  const stopLabels = ['chut', 'kryci list', 'viazaci list', 'plnivo', 'rozmery', 'informacie o produkte'];
  const collected = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    const normalized = normalizeLabel(line);
    if (stopLabels.some((label) => normalized === label || normalized.startsWith(`${label} `))) break;
    if (line === title || normalizeLabel(line) === normalizeLabel(title)) continue;
    if (/^#+\s*/.test(line)) continue;
    collected.push(line.replace(/^#+\s*/, ''));
  }
  return cleanImportedText(collected.join(' '));
}

function companyFromDescription(doc = null, text = '', title = '') {
  const panel = doc?.querySelector('#tab-description, .woocommerce-Tabs-panel--description, .woocommerce-product-details__short-description');
  const heading = panel?.querySelector('h1, h2, h3, h4, strong, b');
  const fromDoc = cleanImportedText(heading?.innerText || heading?.textContent || '');
  if (fromDoc && normalizeLabel(fromDoc) !== normalizeLabel(title)) return fromDoc;

  const rawLines = String(text).replace(/\r/g, '\n').split('\n');
  const popisIndex = rawLines.findIndex((line) => {
    const normalized = normalizeLabel(line);
    return normalized === 'popis' || normalized.startsWith('popis ');
  });
  if (popisIndex < 0) return '';
  for (let i = popisIndex + 1; i < Math.min(rawLines.length, popisIndex + 8); i += 1) {
    const boldOnly = /^\s*\*\*(.+?)\*\*\s*$/.exec(rawLines[i]);
    if (!boldOnly) continue;
    const value = cleanImportedText(boldOnly[1]);
    return value && normalizeLabel(value) !== normalizeLabel(title) ? value : '';
  }
  return '';
}

function parseWebshopProduct(raw = '', sourceUrl = '') {
  const doc = documentFromHtml(raw);
  const text = htmlToPlainText(raw);
  const lines = textLines(text);
  const rawLines = textLines(raw.replace(/[#*`>]+/g, ''));
  const allLines = [...lines, ...rawLines];

  const titleFromDoc = cleanImportedText(doc?.querySelector('h1.product_title, h1')?.innerText || '');
  const titleLine = allLines.find((line) => /^#\s+/.test(line))?.replace(/^#+\s*/, '')
    || allLines.find((line) => normalizeLabel(line).startsWith('title '))?.replace(/^title\s*[:：]?\s*/i, '');
  const urlName = (() => {
    try {
      return decodeURIComponent(new URL(sourceUrl).pathname.split('/').filter(Boolean).pop() || '')
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());
    } catch (_error) {
      return '';
    }
  })();

  const name = cleanImportedText(titleFromDoc || titleLine || urlName);
  const length = lineValueAfterColon(text, ['Dĺžka', 'Dlzka']) || lineValueAfterLabel(allLines, ['Dĺžka', 'Dlzka']);
  const diameter = lineValueAfterColon(text, ['Priemer']) || lineValueAfterLabel(allLines, ['Priemer']);
  const vitolaName = guessVitolaFromName(name);
  const dimensions = [length, diameter].filter(Boolean).join(' × ');
  const strengthText = lineValueAfterLabel(allLines, ['Sila cigary', 'Sila']);
  const strength = (strengthText.match(/[1-5]/) || [''])[0];
  const taste = lineValueAfterColon(text, ['Chuť', 'Chut'])
    || lineValueAfterLabel(allLines, ['Chuťový profil', 'Chutovy profil', 'Chuť', 'Chut']);
  const brand = lineValueAfterLabel(allLines, ['Značky', 'Znacky', 'Značka', 'Znacka']);
  const company = companyFromDescription(doc, text, name) || guessCompanyFromBrand(brand);

  return normalizeCigar({
    name,
    status: 'owned',
    quantity: 1,
    brand,
    company,
    madeIn: lineValueAfterLabel(allLines, ['Krajina vyroby', 'Krajina výroby', 'Krajina povodu', 'Krajina pôvodu']),
    vitola: vitolaName || dimensions,
    strength,
    price: cleanImportedText(doc?.querySelector('.price')?.innerText || '') || firstPriceFromText(text),
    wrapperLeaf: lineValueAfterColon(text, ['Krycí list', 'Kryci list']),
    binderLeaf: lineValueAfterColon(text, ['Viazací list', 'Viazaci list']),
    fillerLeaf: lineValueAfterColon(text, ['Plnivo']),
    taste,
    notes: descriptionFromProduct(raw, doc, allLines, name),
    link: sourceUrl,
    imageCropX: 50,
    imageCropY: 50,
    imageZoom: 1,
    source: 'webshop'
  });
}

function validWebshopUrl(value = '') {
  try {
    const url = new URL(value.trim());
    if (!/^https?:$/.test(url.protocol)) return null;
    if (!url.hostname.includes('cigarovysvet.sk')) return null;
    return url.href;
  } catch (_error) {
    return null;
  }
}

async function tryFetchText(fetchUrl, options = {}) {
  const response = await fetch(fetchUrl, options);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.text();
}

async function fetchWebshopProductText(productUrl) {
  const attempts = [
    { name: 'direct webshop fetch', url: productUrl, options: { credentials: 'omit' } },
    { name: 'Jina Reader', url: `https://r.jina.ai/${productUrl}`, options: { credentials: 'omit' } },
    { name: 'AllOrigins', url: `https://api.allorigins.win/raw?url=${encodeURIComponent(productUrl)}`, options: { credentials: 'omit' } }
  ];
  const errors = [];

  for (const attempt of attempts) {
    try {
      const text = await tryFetchText(attempt.url, attempt.options);
      if (text && text.length > 100) return { text, source: attempt.name };
      errors.push(`${attempt.name}: empty response`);
    } catch (error) {
      errors.push(`${attempt.name}: ${error.message}`);
    }
  }

  throw new Error(`Could not read the product page. ${errors.join(' | ')}`);
}

function applyImportedCigarToOpenForm(imported = {}) {
  const cigar = normalizeCigar({ status: 'owned', quantity: 1, ...imported, id: document.getElementById('cigarId').value || '' });
  const fieldsToFill = [
    'name', 'status', 'quantity', 'brand', 'company', 'madeIn', 'vitola', 'strength', 'price',
    'wrapperLeaf', 'wrapperOrigin', 'binderLeaf', 'binderOrigin', 'fillerLeaf', 'fillerOrigin',
    'taste', 'link', 'notes', 'imageCropX', 'imageCropY', 'imageZoom'
  ];

  for (const fieldName of fieldsToFill) {
    const field = document.getElementById(fieldName);
    const value = cigar[fieldName];
    if (!field || value === undefined || value === null || value === '') continue;
    field.value = value;
  }

  if (!document.getElementById('quantity').value) document.getElementById('quantity').value = '1';
  if (!document.getElementById('status').value) document.getElementById('status').value = 'owned';
  selectedImageData = cigar.imageData || '';
  updateImageCropPreview();
  if (!document.getElementById('cigarId').value) els.formTitle.textContent = 'Add from webshop';
}

async function importFromWebshopLink() {
  if (!canWrite()) {
    alert('This account has read-only access.');
    return;
  }

  const productUrl = validWebshopUrl(els.webshopUrlInput?.value || '');
  if (!productUrl) {
    setWebshopImportMessage('Paste a valid Cigarový svet product link.', 'error');
    return;
  }

  const button = els.fetchWebshopBtn;
  if (button) button.disabled = true;
  setWebshopImportMessage('Reading webshop page…', 'loading');

  try {
    const { text, source } = await fetchWebshopProductText(productUrl);
    const imported = parseWebshopProduct(text, productUrl);
    if (!imported.name || imported.name === 'Untitled cigar') throw new Error('The page was loaded, but no product name was found.');
    applyImportedCigarToOpenForm(imported);
    setWebshopImportMessage(`Filled from webshop using ${source}. Check the fields before saving.`, 'success');
  } catch (error) {
    console.error(error);
    setWebshopImportMessage(`${error.message} You can still paste the details manually.`, 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

function buildWebshopBookmarklet() {
  const appUrl = window.location.href.split('#')[0].split('?')[0];
  const script = `(()=>{const A=${JSON.stringify(appUrl)};const T=s=>(s||'').replace(/\\s+/g,' ').trim();const lines=document.body.innerText.split('\\n').map(T).filter(Boolean);const afterColon=l=>{const r=new RegExp(l+'\\\\s*:\\s*([^\\\\n]+)','i').exec(document.body.innerText);return T(r&&r[1]);};const nextAfter=l=>{const i=lines.findIndex(x=>x.toLowerCase()===l.toLowerCase()||x.toLowerCase().includes(l.toLowerCase()));return i>=0?T(lines[i+1]):''};const desc=()=>{const el=document.querySelector('#tab-description,.woocommerce-Tabs-panel--description,.woocommerce-product-details__short-description');return T(el?el.innerText:'')};const title=T(document.querySelector('h1')?.innerText||document.title);const strength=nextAfter('Sila cigary');const length=afterColon('Dĺžka');const diameter=afterColon('Priemer');const cigar={name:title,status:'owned',quantity:1,brand:nextAfter('Značky'),madeIn:nextAfter('Krajina vyroby'),vitola:T([title.split(' ').slice(-1)[0],length&&diameter?length+' × '+diameter:''].filter(Boolean).join(' · ')),strength:(strength.match(/[1-5]/)||[''])[0],price:T(document.querySelector('.price')?.innerText||((document.body.innerText.match(/\\d+[,.]\\d+\\s*€/)||[])[0])),wrapperLeaf:afterColon('Krycí list'),binderLeaf:afterColon('Viazací list'),fillerLeaf:afterColon('Plnivo'),taste:afterColon('Chuť')||nextAfter('Chuťový profil'),notes:desc(),link:location.href,imageCropX:50,imageCropY:50,imageZoom:1};const json=JSON.stringify(cigar);const enc=btoa(unescape(encodeURIComponent(json))).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'');window.open(A+'#webshopCigar='+enc,'_blank');})()`;
  return `javascript:${script}`;
}

function updateBookmarkletLink() {
  if (!els.bookmarkletLink) return;
  els.bookmarkletLink.href = buildWebshopBookmarklet();
}

function parseIncomingWebshopCigar() {
  const hash = new URLSearchParams(window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash);
  const encoded = hash.get('webshopCigar');
  if (!encoded) return null;
  try {
    return normalizeCigar(JSON.parse(decodeBase64Url(encoded)));
  } catch (error) {
    console.error(error);
    alert('Could not read the webshop export data.');
    return null;
  }
}

function maybeOpenPendingWebshopImport() {
  if (!pendingWebshopCigar || pendingWebshopHandled) return;
  if (supabaseClient && !currentUser) return;
  if (!canWrite()) {
    alert('This account has read-only access, so it cannot import a webshop cigar.');
    pendingWebshopHandled = true;
    return;
  }
  pendingWebshopHandled = true;
  prefillImportedCigar(pendingWebshopCigar);
  history.replaceState(null, document.title, window.location.pathname + window.location.search);
}

function openWebshopModal() {
  updateBookmarkletLink();
  els.webshopModal?.classList.remove('hidden');
}

function closeWebshopModal() {
  els.webshopModal?.classList.add('hidden');
}

function importWebshopJson() {
  if (!canWrite()) {
    alert('This account has read-only access.');
    return;
  }
  try {
    const parsed = JSON.parse(els.webshopJson.value);
    prefillImportedCigar(parsed);
    closeWebshopModal();
  } catch (error) {
    alert(`Could not read webshop JSON: ${error.message}`);
  }
}

function syncHeaderHeight() {
  if (!els.appHeader) return;
  document.documentElement.style.setProperty('--header-h', `${els.appHeader.offsetHeight}px`);
}

function closeMoreMenu() {
  els.moreMenu?.classList.add('hidden');
  els.moreMenuBtn?.setAttribute('aria-expanded', 'false');
}

function toggleMoreMenu() {
  const willOpen = els.moreMenu?.classList.contains('hidden');
  els.moreMenu?.classList.toggle('hidden', !willOpen);
  els.moreMenuBtn?.setAttribute('aria-expanded', String(Boolean(willOpen)));
}

function attachEvents() {
  window.addEventListener('resize', syncHeaderHeight);
  syncHeaderHeight();

  els.moreMenuBtn?.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleMoreMenu();
  });
  els.moreMenu?.addEventListener('click', (event) => {
    if (event.target.closest('.menu-item')) closeMoreMenu();
  });
  document.addEventListener('click', (event) => {
    if (!els.moreMenu || els.moreMenu.classList.contains('hidden')) return;
    if (event.target.closest('.menu-wrap')) return;
    closeMoreMenu();
  });

  els.search.addEventListener('input', render);
  els.statusFilter.addEventListener('change', render);
  els.sortBy.addEventListener('change', () => {
    sortDir = SORT_DEFAULT_DIR[els.sortBy.value] || 'asc';
    updateSortDirBtn();
    render();
  });
  els.sortDirBtn?.addEventListener('click', () => {
    sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    updateSortDirBtn();
    render();
  });
  updateSortDirBtn();

  els.toolbarToggleBtn?.addEventListener('click', () => {
    setToolbarCollapsed(!els.toolbar.classList.contains('collapsed'));
  });
  setToolbarCollapsed(localStorage.getItem(TOOLBAR_KEY) === '1');

  els.cardViewBtn.addEventListener('click', () => {
    viewMode = 'cards';
    localStorage.setItem(VIEW_KEY, viewMode);
    render();
  });

  els.listViewBtn.addEventListener('click', () => {
    viewMode = 'list';
    localStorage.setItem(VIEW_KEY, viewMode);
    render();
  });

  els.addBtn.addEventListener('click', () => openForm());
  els.webshopBtn?.addEventListener('click', openWebshopModal);
  els.webshopClose?.addEventListener('click', closeWebshopModal);
  els.importWebshopJsonBtn?.addEventListener('click', importWebshopJson);
  els.fetchWebshopBtn?.addEventListener('click', importFromWebshopLink);
  els.webshopUrlInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      importFromWebshopLink();
    }
  });
  els.exportBtn.addEventListener('click', exportLog);
  els.importBtn.addEventListener('click', () => els.importFile.click());
  els.importFile.addEventListener('change', (event) => importLog(event.target.files[0]));
  els.authForm?.addEventListener('submit', signIn);
  els.signOutBtn?.addEventListener('click', signOut);

  els.cigarsTabBtn?.addEventListener('click', () => setSection('cigars'));
  els.galleryTabBtn?.addEventListener('click', () => setSection('gallery'));

  els.galleryUpload?.addEventListener('change', async (event) => {
    await addGalleryPhotos(event.target.files);
    event.target.value = '';
  });

  els.galleryGrid?.addEventListener('click', (event) => {
    const deleteBtn = event.target.closest('[data-delete-id]');
    if (deleteBtn) {
      deleteGalleryPhotoById(deleteBtn.dataset.deleteId);
      return;
    }
    const photoBtn = event.target.closest('[data-gallery-photo-index]');
    if (photoBtn) openGeneralGallery(Number(photoBtn.dataset.galleryPhotoIndex));
  });

  els.galleryGrid?.addEventListener('change', (event) => {
    const noteInput = event.target.closest('[data-note-id]');
    if (noteInput) updateGalleryNote(noteInput.dataset.noteId, noteInput.value.trim());
  });

  els.results.addEventListener('click', (event) => {
    const galleryBtn = event.target.closest('[data-gallery-id]');
    if (galleryBtn) {
      event.stopPropagation();
      openCigarGallery(galleryBtn.dataset.galleryId, galleryBtn.dataset.galleryIndex);
      return;
    }

    const editBtn = event.target.closest('[data-edit]');
    if (editBtn) {
      event.stopPropagation();
      openForm(editBtn.dataset.edit);
      return;
    }

    const item = event.target.closest('[data-id]');
    if (item) openDetail(item.dataset.id);
  });

  els.detailBody.addEventListener('click', (event) => {
    const galleryBtn = event.target.closest('[data-gallery-id]');
    if (galleryBtn) {
      event.stopPropagation();
      openCigarGallery(galleryBtn.dataset.galleryId, galleryBtn.dataset.galleryIndex);
      return;
    }

    const editBtn = event.target.closest('[data-edit]');
    if (editBtn) openForm(editBtn.dataset.edit);

    const thumb = event.target.closest('.detail-thumb');
    if (thumb) {
      const mainFrame = els.detailBody.querySelector('.detail-main-img.photo-frame');
      const mainImg = mainFrame?.querySelector('img');
      if (mainImg) mainImg.src = thumb.dataset.src;
      if (mainFrame) mainFrame.dataset.galleryIndex = thumb.dataset.index;
      els.detailBody.querySelectorAll('.detail-thumb').forEach((img) => img.classList.remove('active'));
      thumb.classList.add('active');
    }
  });

  els.detailClose.addEventListener('click', closeDetail);
  els.galleryClose.addEventListener('click', closeGallery);
  els.galleryPrev.addEventListener('click', () => moveGallery(-1));
  els.galleryNext.addEventListener('click', () => moveGallery(1));
  els.formClose.addEventListener('click', closeForm);
  els.cancelFormBtn.addEventListener('click', closeForm);
  els.cigarForm.addEventListener('submit', upsertCigar);
  els.deleteBtn.addEventListener('click', deleteCurrentCigar);

  els.imageUpload.addEventListener('change', async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    try {
      await addFilesToFormPhotos(files);
    } catch (error) {
      alert(`Could not read image: ${error.message}`);
    } finally {
      event.target.value = '';
    }
  });

  if (els.uploadDrop) {
    let dragDepth = 0;
    els.uploadDrop.addEventListener('dragenter', (event) => {
      event.preventDefault();
      dragDepth += 1;
      els.uploadDrop.classList.add('drag-over');
    });
    els.uploadDrop.addEventListener('dragover', (event) => {
      event.preventDefault();
    });
    els.uploadDrop.addEventListener('dragleave', (event) => {
      event.preventDefault();
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) els.uploadDrop.classList.remove('drag-over');
    });
    els.uploadDrop.addEventListener('drop', async (event) => {
      event.preventDefault();
      dragDepth = 0;
      els.uploadDrop.classList.remove('drag-over');
      const files = Array.from(event.dataTransfer?.files || []).filter((file) => file.type.startsWith('image/'));
      if (!files.length) return;
      try {
        await addFilesToFormPhotos(files);
      } catch (error) {
        alert(`Could not read image: ${error.message}`);
      }
    });
  }

  if (els.galleryUploadDrop) {
    let galleryDragDepth = 0;
    els.galleryUploadDrop.addEventListener('dragenter', (event) => {
      event.preventDefault();
      galleryDragDepth += 1;
      els.galleryUploadDrop.classList.add('drag-over');
    });
    els.galleryUploadDrop.addEventListener('dragover', (event) => {
      event.preventDefault();
    });
    els.galleryUploadDrop.addEventListener('dragleave', (event) => {
      event.preventDefault();
      galleryDragDepth = Math.max(0, galleryDragDepth - 1);
      if (galleryDragDepth === 0) els.galleryUploadDrop.classList.remove('drag-over');
    });
    els.galleryUploadDrop.addEventListener('drop', async (event) => {
      event.preventDefault();
      galleryDragDepth = 0;
      els.galleryUploadDrop.classList.remove('drag-over');
      const files = Array.from(event.dataTransfer?.files || []).filter((file) => file.type.startsWith('image/'));
      if (files.length) await addGalleryPhotos(files);
    });
  }

  els.photoManager?.addEventListener('click', (event) => {
    const profileBtn = event.target.closest('[data-profile-photo]');
    if (profileBtn) {
      setFormProfilePhoto(profileBtn.dataset.profilePhoto);
      return;
    }

    const removeBtn = event.target.closest('[data-remove-photo]');
    if (removeBtn) {
      removeFormPhoto(removeBtn.dataset.removePhoto);
      return;
    }

    const previewBtn = event.target.closest('[data-preview-photo]');
    if (previewBtn) {
      setFormProfilePhoto(previewBtn.dataset.previewPhoto);
    }
  });

  const imageFileField = document.getElementById('imageFile');
  if (imageFileField) imageFileField.addEventListener('input', updateImageCropPreview);
  attachCropInteractions();

  els.resetCropBtn.addEventListener('click', () => {
    setCropValues({ x: 50, y: 50, zoom: 1 });
  });

  [els.detailModal, els.formModal, els.galleryModal, els.webshopModal].forEach((modal) => {
    modal.addEventListener('click', (event) => {
      if (event.target === modal) modal.classList.add('hidden');
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeGallery();
      closeDetail();
      closeForm();
      closeWebshopModal();
      closeMoreMenu();
    }
    if (!els.galleryModal.classList.contains('hidden')) {
      if (event.key === 'ArrowLeft') moveGallery(-1);
      if (event.key === 'ArrowRight') moveGallery(1);
    }
  });
}

async function init() {
  pendingWebshopCigar = parseIncomingWebshopCigar();
  attachEvents();
  updateBookmarkletLink();
  const cloudConfigured = await setupSupabase();

  if (cloudConfigured && currentUser) {
    await loadAccess();
    await loadRemoteData();
  } else if (!cloudConfigured) {
    cigars = loadData();
    await hydrateImages();
    appLoading = false;
    render();
    maybeOpenPendingWebshopImport();
  } else {
    cigars = [];
    appLoading = false;
    render();
  }
  maybeOpenPendingWebshopImport();

  appReady = true;
}

init();
