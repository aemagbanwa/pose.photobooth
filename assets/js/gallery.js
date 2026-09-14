(() => {
  const cfg = window.POSE_GALLERY || {};
  const grid = document.getElementById('driveGallery');
  const status = document.getElementById('galleryStatus');
  const toolbar = document.getElementById('galleryToolbar');
  const filters = document.getElementById('galleryFilters');
  const driveLink = document.getElementById('galleryDriveLink');
  if (!grid) return;
  if (cfg.folderUrl && driveLink) driveLink.href = cfg.folderUrl;

  const esc = (v='') => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const normalize = data => Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : []);
  let all = [];

  function showStatus(message, owner=false) {
    if (!status) return;
    status.hidden = false;
    status.className = 'wrap gallery-status' + (owner ? ' owner-note' : '');
    status.innerHTML = message;
  }

  function cleanCategory(value) {
    const v = String(value || '').trim();
    // "Originals" is an internal Drive folder name, not a useful visitor-facing label.
    return /^originals$/i.test(v) ? 'Events' : (v || 'Events');
  }

  function render(items) {
    grid.innerHTML = '';
    if (!items.length) {
      showStatus('No gallery photos are available yet.');
      return;
    }
    if (status) status.hidden = true;
    items.slice(0, cfg.maxItems || 18).forEach((item) => {
      const fig = document.createElement('figure');
      fig.className = 'gallery-item';
      fig.tabIndex = 0;
      const category = cleanCategory(item.category);
      const img = document.createElement('img');
      img.src = item.url;
      img.alt = item.alt || 'POSE Photobooth event photo';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.referrerPolicy = 'no-referrer';
      img.addEventListener('error', () => fig.remove(), { once: true });
      const cap = document.createElement('figcaption');
      cap.textContent = category;
      fig.append(img, cap);
      fig.addEventListener('click', () => openLightbox({...item, category}));
      fig.addEventListener('keydown', e => { if (e.key === 'Enter') openLightbox({...item, category}); });
      grid.appendChild(fig);
    });
  }

  function buildFilters(items) {
    if (!toolbar || !filters) return;
    const cats = [...new Set(items.map(x => cleanCategory(x.category)).filter(Boolean))].sort();
    // Don't show a filter toolbar when everything belongs to a single generic category.
    if (cats.length <= 1) {
      toolbar.hidden = true;
      return;
    }
    toolbar.hidden = false;
    filters.innerHTML = '';
    ['All', ...cats].forEach(cat => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'gallery-filter' + (cat === 'All' ? ' active' : '');
      b.textContent = cat;
      b.addEventListener('click', () => {
        filters.querySelectorAll('button').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        render(cat === 'All' ? all : all.filter(x => cleanCategory(x.category) === cat));
      });
      filters.appendChild(b);
    });
  }

  function openLightbox(item) {
    let box = document.querySelector('.gallery-lightbox');
    if (!box) {
      box = document.createElement('div');
      box.className = 'gallery-lightbox';
      box.setAttribute('role','dialog');
      box.setAttribute('aria-modal','true');
      box.innerHTML = '<button type="button" aria-label="Close">×</button><img alt=""><p></p>';
      box.querySelector('button').onclick = () => box.classList.remove('open');
      box.addEventListener('click', e => { if (e.target === box) box.classList.remove('open'); });
      document.addEventListener('keydown', e => { if (e.key === 'Escape') box.classList.remove('open'); });
      document.body.appendChild(box);
    }
    const image = box.querySelector('img');
    image.src = item.url;
    image.alt = item.alt || 'POSE Photobooth event photo';
    image.referrerPolicy = 'no-referrer';
    box.querySelector('p').textContent = cleanCategory(item.category);
    box.classList.add('open');
  }

  function receive(data) {
    all = normalize(data).filter(x => x && x.url);
    render(all);
    buildFilters(all);
  }

  async function loadFetch(endpoint) {
    const separator = endpoint.includes('?') ? '&' : '?';
    const url = endpoint + separator + 't=' + Date.now();
    const response = await fetch(url, { method: 'GET', cache: 'no-store', redirect: 'follow' });
    if (!response.ok) throw new Error('Gallery endpoint returned HTTP ' + response.status);
    const data = await response.json();
    receive(data);
  }

  function loadJsonp(endpoint) {
    return new Promise((resolve, reject) => {
      const cbName = '__poseGalleryCallback_' + Date.now();
      const script = document.createElement('script');
      const separator = endpoint.includes('?') ? '&' : '?';
      let done = false;
      const cleanup = () => {
        try { delete window[cbName]; } catch (_) { window[cbName] = undefined; }
        script.remove();
      };
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        cleanup();
        reject(new Error('Gallery request timed out'));
      }, 12000);
      window[cbName] = data => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        cleanup();
        receive(data);
        resolve();
      };
      script.onerror = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        cleanup();
        reject(new Error('JSONP fallback failed'));
      };
      script.src = endpoint + separator + 'callback=' + encodeURIComponent(cbName) + '&t=' + Date.now();
      document.head.appendChild(script);
    });
  }

  async function start() {
    if (!cfg.endpoint) {
      grid.innerHTML = '';
      showStatus('<strong>Google Drive gallery is ready to connect.</strong> Add your Apps Script <code>/exec</code> URL in <code>assets/js/gallery-config.js</code>.', true);
      return;
    }

    showStatus('Loading recent event photos…');
    try {
      // Preferred for normal HTTP/HTTPS hosting and localhost preview.
      await loadFetch(cfg.endpoint);
    } catch (fetchError) {
      // Fallback supports Apps Script deployments that include the callback parameter.
      try {
        await loadJsonp(cfg.endpoint);
      } catch (jsonpError) {
        console.error('POSE gallery load failed:', { fetchError, jsonpError });
        grid.innerHTML = '';
        showStatus('The gallery is temporarily unavailable. <a href="' + esc(cfg.folderUrl || '#') + '" target="_blank" rel="noopener">View photos on Google Drive</a>.');
      }
    }
  }

  start();
})();
