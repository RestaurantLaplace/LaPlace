/* =========================================================
   LA PLACE — Script principal
   - Menu mobile
   - Année dans le footer
   - Galerie (avec fallback vers les images existantes du repo)
   - Sélecteur de plats + calcul du total
   - Envoi de la réservation par WhatsApp
   ========================================================= */

/* ==================== CONFIG ==================== */
const CONFIG = {
  // Numéro WhatsApp en format international, sans + ni espaces
  WHATSAPP_NUMBER: '212661560086',

  // JSONBin (optionnel) — voir README pour la configuration
  JSONBIN_ID: '6a140eceee5a733b1217854e',
  JSONBIN_READ_KEY: '$2a$10$afkCtW9z9F6DKezv/wIti.Fvw6E8.37zIkl1Tit8AuzIg1R3590im',

  // Nom du restaurant (utilisé dans le message WhatsApp)
  RESTAURANT_NAME: 'Restaurant La Place',
};

/* ==================== IMAGES PAR DÉFAUT ==================== */
const DEFAULT_IMAGES = {
  hero: ['images/PLACE3.jpg'],
  gallery: [
    'images/PLACE3.jpg',
    'images/PLACE2.jpg',
  ],
  menu: []
};

/* ==================== 1. MENU MOBILE ==================== */
(() => {
  const toggle = document.querySelector('.nav-toggle');
  const links = document.getElementById('navLinks');
  if (!toggle || !links) return;

  toggle.addEventListener('click', () => {
    const open = links.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
  });

  links.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => {
      links.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    });
  });
})();

/* ==================== 2. ANNÉE FOOTER ==================== */
(() => {
  const y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();
})();

/* ==================== 3. SCROLL REVEAL ==================== */
(() => {
  if (!('IntersectionObserver' in window)) return;
  const targets = document.querySelectorAll('.about, .menu, .gallery, .visit, .booking-cta');
  targets.forEach(t => t.classList.add('reveal'));
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('in');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
  targets.forEach(t => io.observe(t));
})();

/* ==================== 4. IMAGE STORE (CORS FIXED) ==================== */
async function loadImageStore() {
  if (CONFIG.JSONBIN_ID) {
    try {

      // ✅ CORS FIX: no custom headers → avoids OPTIONS preflight
      const url = CONFIG.JSONBIN_READ_KEY
        ? `https://api.jsonbin.io/v3/b/${CONFIG.JSONBIN_ID}/latest?X-Access-Key=${CONFIG.JSONBIN_READ_KEY}`
        : `https://api.jsonbin.io/v3/b/${CONFIG.JSONBIN_ID}/latest`;

      const res = await fetch(url);

      if (res.ok) {
        const data = await res.json();
        const record = data.record || data;

        return {
          hero: (record.hero && record.hero.length) ? record.hero : DEFAULT_IMAGES.hero,
          gallery: (record.gallery && record.gallery.length) ? record.gallery : DEFAULT_IMAGES.gallery,
          menu: record.menu || DEFAULT_IMAGES.menu,
        };
      }
    } catch (e) {
      console.warn('Image store fetch failed, using defaults', e);
    }
  }
  return DEFAULT_IMAGES;
}

/* ==================== 5. RENDER HERO + GALERIE ==================== */
(async () => {
  const grid = document.getElementById('galleryGrid');
  const heroImg = document.getElementById('heroImg');
  if (!grid && !heroImg) return;

  const store = await loadImageStore();

  if (heroImg && store.hero && store.hero.length) {
    heroImg.src = store.hero[0];
  }

  if (grid) {
    grid.innerHTML = '';
    const images = (store.gallery && store.gallery.length) ? store.gallery : [];

    if (images.length === 0) {
      for (let i = 0; i < 6; i++) {
        const div = document.createElement('div');
        div.className = 'gallery-item gallery-placeholder';
        div.textContent = `photo ${i + 1}`;
        grid.appendChild(div);
      }
      return;
    }

    const slots = 6;
    for (let i = 0; i < slots; i++) {
      const url = images[i % images.length];
      const div = document.createElement('div');
      div.className = 'gallery-item';
      const img = document.createElement('img');
      img.src = url;
      img.alt = `Restaurant La Place — photo ${i + 1}`;
      img.loading = i < 2 ? 'eager' : 'lazy';
      img.onerror = () => {
        div.classList.add('gallery-placeholder');
        div.textContent = `photo ${i + 1}`;
        img.remove();
      };
      div.appendChild(img);
      grid.appendChild(div);
    }
  }
})();

/* ==================== 6. RÉSERVATION ==================== */
(() => {
  const form = document.getElementById('bookingForm');
  if (!form) return;

  const dateInput = document.getElementById('date');
  if (dateInput) {
    const today = new Date().toISOString().split('T')[0];
    dateInput.min = today;
    dateInput.value = today;
  }

  const guestsInput = document.getElementById('guests');
  document.querySelectorAll('.counter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      let v = parseInt(guestsInput.value, 10) || 1;
      const act = btn.dataset.act;
      if (act === 'inc' && v < 30) v++;
      if (act === 'dec' && v > 1) v--;
      guestsInput.value = v;
    });
  });

  const cartTotalEl = document.getElementById('cartTotal');
  const dishCheckboxes = document.querySelectorAll('.dish-item input[type=checkbox]');

  function updateTotal() {
    let total = 0;
    dishCheckboxes.forEach(cb => {
      if (cb.checked) {
        total += parseInt(cb.dataset.price, 10) || 0;
      }
    });
    if (cartTotalEl) cartTotalEl.textContent = total;
    return total;
  }

  dishCheckboxes.forEach(cb => cb.addEventListener('change', updateTotal));

  function showError(name, msg) {
    const el = form.querySelector(`.field-error[data-for="${name}"]`);
    if (el) el.textContent = msg || '';
  }

  function validate(data) {
    let ok = true;
    ['name','date','time','guests'].forEach(f => showError(f, ''));

    if (!data.name || data.name.trim().length < 2) {
      showError('name', 'Veuillez entrer votre nom.');
      ok = false;
    }
    if (!data.date) {
      showError('date', 'Veuillez choisir une date.');
      ok = false;
    } else {
      const today = new Date(); today.setHours(0,0,0,0);
      const picked = new Date(data.date);
      if (picked < today) {
        showError('date', "La date doit être aujourd'hui ou plus tard.");
        ok = false;
      }
    }
    if (!data.time) {
      showError('time', 'Veuillez choisir une heure.');
      ok = false;
    }
    const g = parseInt(data.guests, 10);
    if (!g || g < 1 || g > 30) {
      showError('guests', 'Entre 1 et 30 personnes.');
      ok = false;
    }
    return ok;
  }

  function formatDate(iso) {
    try {
      return new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
      });
    } catch { return iso; }
  }

  function getSelectedDishes() {
    const items = [];
    dishCheckboxes.forEach(cb => {
      if (cb.checked) {
        items.push({
          name: cb.dataset.name,
          price: parseInt(cb.dataset.price, 10) || 0,
        });
      }
    });
    return items;
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const data = {
      name: document.getElementById('name').value.trim(),
      date: document.getElementById('date').value,
      time: document.getElementById('time').value,
      guests: document.getElementById('guests').value,
      notes: document.getElementById('notes') ? document.getElementById('notes').value.trim() : '',
    };

    if (!validate(data)) return;

    const dishes = getSelectedDishes();
    const total = updateTotal();

    let msg = `*Nouvelle demande de réservation*\n\n`;
    msg += `🏛️ ${CONFIG.RESTAURANT_NAME}\n\n`;
    msg += `👤 Nom : ${data.name}\n`;
    msg += `📅 Date : ${formatDate(data.date)}\n`;
    msg += `🕐 Heure : ${data.time}\n`;
    msg += `👥 Personnes : ${data.guests}\n`;

    if (dishes.length) {
      msg += `\n*Plats sélectionnés :*\n`;
      dishes.forEach(d => {
        msg += `• ${d.name} — ${d.price} DH\n`;
      });
      msg += `\n💰 *Total estimé : ${total} DH*\n`;
    }

    if (data.notes) {
      msg += `\n📝 Précisions :\n${data.notes}\n`;
    }

    msg += `\n_Envoyé depuis le site._`;

    const url = `https://wa.me/${CONFIG.WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;

    const btn = document.getElementById('submitBtn');
    if (btn) {
      btn.disabled = true;
      btn.style.opacity = '0.7';
      const span = btn.querySelector('span:last-child');
      if (span) span.textContent = 'Redirection...';
    }

    window.location.href = url;
  });
})();