/* =========================================================
   PANEL ADMIN — Gestion des photos (version sécurisée)
   
   Toutes les opérations sensibles passent par un proxy
   Cloudflare Worker. Aucune clé secrète n'est ici.
   
   Pour la configuration : voir worker.js et README.md
   ========================================================= */

const ADMIN_CONFIG = {
  // URL de votre Cloudflare Worker (publique, pas un secret)
  // Format : https://laplace-admin.VOTRE-SUBDOMAIN.workers.dev
  PROXY_URL: 'https://laplace-admin.n3vrm1nd-decoy.workers.dev',

  // Cloudinary — par design, ces deux valeurs sont publiques.
  // Un "upload preset" non signé est CONÇU pour être visible
  // (c'est documenté par Cloudinary). Limitez les abus via
  // les paramètres du preset : taille max, formats autorisés,
  // limites de débit dans Settings → Upload → votre preset.
  CLOUDINARY_CLOUD_NAME: 'durerofku',
  CLOUDINARY_UPLOAD_PRESET: 'LaPlace',
};

let imageStore = { hero: [], gallery: [], menu: [] };
let currentFilter = 'all';
let authToken = null;

const $ = (id) => document.getElementById(id);
const gate = $('gate');
const app = $('app');
const pwInput = $('pwInput');
const pwBtn = $('pwBtn');
const pwErr = $('pwErr');
const logoutBtn = $('logoutBtn');
const fileInput = $('fileInput');
const uploader = $('uploader');
const status = $('status');
const imageList = $('imageList');
const filterTabs = $('filterTabs');
const configWarn = $('configWarn');

/* ==================== AUTH ==================== */

function setError(msg) {
  pwErr.textContent = msg;
  pwErr.style.display = 'block';
}

async function login() {
  if (!ADMIN_CONFIG.PROXY_URL) {
    setError('Proxy non configuré. Voir worker.js pour la configuration.');
    return;
  }
  pwErr.style.display = 'none';
  pwBtn.disabled = true;
  pwBtn.textContent = 'Vérification...';
  
  try {
    const res = await fetch(`${ADMIN_CONFIG.PROXY_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pwInput.value }),
    });
    const data = await res.json();
    
    if (!res.ok) {
      setError(data.error || 'Mot de passe incorrect.');
      pwInput.value = '';
      return;
    }
    
    authToken = data.token;
    sessionStorage.setItem('admin_token', data.token);
    pwErr.style.display = 'none';
    showApp();
  } catch (e) {
    setError('Erreur réseau. Réessayez.');
  } finally {
    pwBtn.disabled = false;
    pwBtn.textContent = 'Entrer';
  }
}

function showApp() {
  gate.style.display = 'none';
  app.style.display = 'block';
  if (!ADMIN_CONFIG.CLOUDINARY_CLOUD_NAME || !ADMIN_CONFIG.PROXY_URL) {
    configWarn.style.display = 'block';
  }
  loadImages();
}

function logout() {
  sessionStorage.removeItem('admin_token');
  authToken = null;
  location.reload();
}

// Restore session if a valid-looking token exists
const saved = sessionStorage.getItem('admin_token');
if (saved) {
  authToken = saved;
  showApp();
}

pwBtn.addEventListener('click', login);
pwInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });
logoutBtn.addEventListener('click', logout);

/* ==================== API CALLS ==================== */

async function apiCall(path, options = {}) {
  const res = await fetch(`${ADMIN_CONFIG.PROXY_URL}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      'X-Auth-Token': authToken,
    },
  });
  if (res.status === 401) {
    // Token expired or invalid
    logout();
    throw new Error('Session expirée. Reconnectez-vous.');
  }
  return res;
}

function showStatus(msg, type = 'info', autoHide = true) {
  status.textContent = msg;
  status.className = `status show ${type}`;
  if (autoHide) {
    setTimeout(() => { status.className = 'status'; }, 4000);
  }
}

/* ==================== LOAD / SAVE IMAGES ==================== */

async function loadImages() {
  if (!ADMIN_CONFIG.PROXY_URL) {
    imageList.innerHTML = '<p style="color:#6e5847; grid-column:1/-1;">Proxy non configuré. Voir worker.js.</p>';
    return;
  }
  try {
    const res = await apiCall('/images');
    if (!res.ok) throw new Error('Erreur ' + res.status);
    const record = await res.json();
    imageStore = {
      hero: record.hero || [],
      gallery: record.gallery || [],
      menu: record.menu || [],
    };
    renderImages();
  } catch (e) {
    console.error(e);
    imageList.innerHTML = `<p style="color:#a0522d; grid-column:1/-1;">Erreur de chargement : ${e.message}</p>`;
  }
}

async function saveImages() {
  try {
    const res = await apiCall('/images', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(imageStore),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Erreur ' + res.status);
    }
    return true;
  } catch (e) {
    console.error(e);
    showStatus('Échec de la sauvegarde : ' + e.message, 'error', false);
    return false;
  }
}

function renderImages() {
  imageList.innerHTML = '';
  const all = [];
  Object.keys(imageStore).forEach(cat => {
    imageStore[cat].forEach(url => all.push({ url, category: cat }));
  });

  const filtered = currentFilter === 'all' ? all : all.filter(i => i.category === currentFilter);

  if (!filtered.length) {
    imageList.innerHTML = '<p style="color:#6e5847; grid-column:1/-1;">Aucune photo pour le moment. Utilisez le formulaire ci-dessus.</p>';
    return;
  }

  const labels = { hero: 'Principale', gallery: 'Galerie', menu: 'Plat' };

  filtered.forEach(item => {
    const div = document.createElement('div');
    div.className = 'image-item';
    const img = document.createElement('img');
    img.src = item.url;
    img.alt = '';
    img.loading = 'lazy';
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = labels[item.category] || item.category;
    const del = document.createElement('button');
    del.className = 'del-btn';
    del.title = 'Supprimer';
    del.textContent = '×';
    del.addEventListener('click', () => deleteImage(item.category, item.url));
    div.append(img, meta, del);
    imageList.appendChild(div);
  });
}

/* ==================== UPLOAD ==================== */

async function uploadFile(file) {
  if (!ADMIN_CONFIG.CLOUDINARY_CLOUD_NAME || !ADMIN_CONFIG.CLOUDINARY_UPLOAD_PRESET) {
    showStatus('Cloudinary non configuré. Voir admin.js.', 'error', false);
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    showStatus('Fichier trop volumineux. Max 10 Mo.', 'error');
    return;
  }
  if (!file.type.startsWith('image/')) {
    showStatus('Veuillez choisir un fichier image.', 'error');
    return;
  }

  const category = $('category').value;

  showStatus('Téléchargement...', 'info', false);

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', ADMIN_CONFIG.CLOUDINARY_UPLOAD_PRESET);
  formData.append('folder', `laplace/${category}`);

  try {
    const res = await fetch(`https://api.cloudinary.com/v1_1/${ADMIN_CONFIG.CLOUDINARY_CLOUD_NAME}/image/upload`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) throw new Error('Échec ' + res.status);
    const data = await res.json();

    const optimizedUrl = data.secure_url.replace('/upload/', '/upload/q_auto,f_auto/');

    imageStore[category].push(optimizedUrl);
    const saved = await saveImages();

    if (saved) {
      showStatus('Photo en ligne ! Visible sur le site dans quelques secondes.', 'success');
      renderImages();
    } else {
      imageStore[category].pop();
    }
  } catch (e) {
    console.error(e);
    showStatus('Échec : ' + e.message, 'error', false);
  }
}

async function deleteImage(category, url) {
  if (!confirm('Supprimer cette photo du site ?')) return;
  const idx = imageStore[category].indexOf(url);
  if (idx === -1) return;
  imageStore[category].splice(idx, 1);
  const saved = await saveImages();
  if (saved) {
    showStatus('Photo supprimée.', 'success');
    renderImages();
  } else {
    imageStore[category].splice(idx, 0, url);
  }
}

/* ==================== EVENT HANDLERS ==================== */

fileInput.addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (f) uploadFile(f);
  fileInput.value = '';
});

;['dragenter', 'dragover'].forEach(ev => {
  uploader.addEventListener(ev, (e) => {
    e.preventDefault();
    uploader.classList.add('drag');
  });
});
;['dragleave', 'drop'].forEach(ev => {
  uploader.addEventListener(ev, (e) => {
    e.preventDefault();
    uploader.classList.remove('drag');
  });
});
uploader.addEventListener('drop', (e) => {
  e.preventDefault();
  const f = e.dataTransfer.files[0];
  if (f) uploadFile(f);
});

filterTabs.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  filterTabs.querySelectorAll('button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  currentFilter = btn.dataset.cat;
  renderImages();
});
