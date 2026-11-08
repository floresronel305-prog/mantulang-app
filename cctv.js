/* Barangay Mantulang: CCTV Command Center (v5)
   Camera links live in Firestore `cameras`. Officials see all cameras; residents see only access == "public".
   Official views and snapshots are written to `cctvlogs` (audit trail). No camera passwords are ever stored. */
const HLS_SRC = ['https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.5.13/hls.min.js', 'https://cdn.jsdelivr.net/npm/hls.js@1.5.13/dist/hls.min.js'];
const TYPES = { hls: 'Live stream (HLS .m3u8)', mjpeg: 'MJPEG stream', snap: 'Snapshot image (auto-refresh)', embed: 'Embed (YouTube / web player)', video: 'Video link (mp4, webm)' };
const clock = () => new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'medium', hour12: false });
const meters = (a, b) => { const R = 6371e3, r = x => x * Math.PI / 180, dp = r(b.lat - a.lat), dl = r(b.lng - a.lng), h = Math.sin(dp / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dl / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const fmtD = m => m < 1000 ? Math.round(m) + ' m' : (m / 1000).toFixed(1) + ' km';
const hasPos = c => typeof c.lat === 'number' && typeof c.lng === 'number' && isFinite(c.lat) && isFinite(c.lng);

let hlsP = null;
function loadHls() {
  if (window.Hls) return Promise.resolve(window.Hls);
  if (hlsP) return hlsP;
  const one = src => new Promise(res => { const s = document.createElement('script'); s.src = src; s.onload = () => res(window.Hls || null); s.onerror = () => { s.remove(); res(null); }; document.head.append(s); });
  return hlsP = (async () => { for (const s of HLS_SRC) { const H = await one(s); if (H) return H; } hlsP = null; return null; })();
}

function ytEmbed(u) {
  const h = u.hostname.replace(/^www\./, ''); let id = '';
  if (h === 'youtu.be') id = u.pathname.slice(1);
  else if (h === 'youtube.com' || h === 'm.youtube.com') { if (u.pathname === '/watch') id = u.searchParams.get('v') || ''; else { const m = u.pathname.match(/^\/(live|embed|shorts)\/([\w-]{6,})/); if (m) id = m[2]; } }
  return /^[\w-]{6,}$/.test(id) ? `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&playsinline=1` : '';
}
function cleanUrl(type, raw) {
  const s = String(raw || '').trim(); if (!s) throw new Error('Enter the stream link');
  let u; try { u = new URL(s); } catch (_) { throw new Error('That is not a valid link'); }
  if (u.protocol !== 'https:') throw new Error('Use a secure https:// link. Browsers block http streams on this https app.');
  if (u.username || u.password) throw new Error('Do not put the camera username or password in the link. Use a gateway (see CCTV-SETUP.txt).');
  if (type === 'embed') { const y = ytEmbed(u); if (y) return y; }
  return u.href;
}

/* One player per tile. Handles HLS / MJPEG / snapshot / embed / video, with automatic reconnect. */
function mount(box, cam, onState) {
  let dead = false, timer = 0, hls = null, tries = 0, el = null;
  const st = s => { if (!dead) onState(s); };
  const wipe = () => {
    clearTimeout(timer);
    if (hls) { try { hls.destroy(); } catch (_) { } hls = null; }
    if (el) { if (el.tagName === 'VIDEO') { el.removeAttribute('src'); try { el.load(); } catch (_) { } } el.remove(); el = null; }
  };
  const again = () => { if (dead) return; st('off'); wipe(); timer = setTimeout(start, Math.min(30000, 2500 * (++tries))); };
  async function start() {
    if (dead) return; st('load'); wipe();
    const u = cam.url;
    if (cam.type === 'embed') {
      el = document.createElement('iframe'); el.src = u; el.title = cam.name; el.referrerPolicy = 'no-referrer';
      el.allow = 'autoplay; fullscreen; picture-in-picture'; el.setAttribute('allowfullscreen', '');
      el.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation allow-popups');
      el.onload = () => { tries = 0; st('on'); }; box.append(el); return;
    }
    if (cam.type === 'mjpeg') {
      el = new Image(); el.alt = cam.name; el.referrerPolicy = 'no-referrer'; el.onload = () => { tries = 0; st('on'); }; el.onerror = again; box.append(el); el.src = u; return;
    }
    if (cam.type === 'snap') {
      const img = el = new Image(); img.alt = cam.name; box.append(img); const every = Math.max(2, +cam.every || 5) * 1000;
      const tick = () => {
        if (dead) return; const n = new Image(); n.referrerPolicy = 'no-referrer';
        n.onload = () => { if (dead) return; img.src = n.src; tries = 0; st('on'); timer = setTimeout(tick, every); };
        n.onerror = () => { if (dead) return; st('off'); timer = setTimeout(tick, Math.max(every, 4000)); };
        n.src = u + (u.includes('?') ? '&' : '?') + '_t=' + Date.now();
      };
      tick(); return;
    }
    const v = el = document.createElement('video');
    v.muted = true; v.autoplay = true; v.playsInline = true; v.controls = false; v.setAttribute('playsinline', '');
    v.onplaying = () => { tries = 0; st('on'); }; v.onerror = again; v.onended = again; box.append(v);
    if (cam.type === 'hls') {
      const H = await loadHls(); if (dead || el !== v) return;
      if (H && H.isSupported()) {
        hls = new H({ lowLatencyMode: true, backBufferLength: 10, maxBufferLength: 12 });
        hls.on(H.Events.ERROR, (_, d) => { if (d && d.fatal) again(); });
        hls.loadSource(u); hls.attachMedia(v);
      } else if (v.canPlayType('application/vnd.apple.mpegurl')) v.src = u;
      else return again();
    } else v.src = u;
    v.play().catch(() => { });
  }
  start();
  return { destroy() { dead = true; wipe(); }, restart() { if (dead) return; tries = 0; start(); } };
}

export function initCCTV(X) {
  const { db, F, $, esc, fmt, toast, ask, go, me, setCleanup } = X;
  const { collection, addDoc, doc, updateDoc, deleteDoc, query, where, orderBy, limit, onSnapshot, getDocs, serverTimestamp } = F;
  const isOff = () => me().role === 'official';
  const camsQuery = () => isOff() ? collection(db, 'cameras') : query(collection(db, 'cameras'), where('access', '==', 'public'));
  const logAct = (c, action) => { if (!isOff()) return; addDoc(collection(db, 'cctvlogs'), { uid: me().uid, name: me().name, camId: c.id, camName: c.name, action, createdAt: serverTimestamp() }).catch(() => { }); };

  /* shortcuts used from other pages (SOS alerts, map popups) */
  document.addEventListener('click', e => {
    const n = e.target.closest('[data-near]'), c = e.target.closest('[data-cam]');
    if (n && $('#view').contains(n)) { try { sessionStorage.cctvNear = n.dataset.near; } catch (_) { } go('cctv'); }
    else if (c && $('#view').contains(c)) { try { sessionStorage.cctvFocus = c.dataset.cam; } catch (_) { } go('cctv'); }
  });

  function view(el) {
    const off = isOff();
    const S = { cams: [], n: [1, 4, 9].includes(+localStorage.cctvN) ? +localStorage.cctvN : 4, page: 0, q: '', mons: [], near: null, logged: new Set(), tick: 0, sig: null, wl: null };
    let focus = '';
    try { const nr = sessionStorage.cctvNear; if (nr) { const [a, b] = nr.split(',').map(Number); if (isFinite(a) && isFinite(b)) S.near = { lat: a, lng: b }; sessionStorage.removeItem('cctvNear'); } focus = sessionStorage.cctvFocus || ''; sessionStorage.removeItem('cctvFocus'); } catch (_) { }

    el.innerHTML = `<h2>${off ? 'CCTV Command Center' : 'Barangay cameras'}</h2>
    <div class="card cc-bar"><div class="seg" id="ccl" role="group" aria-label="Layout">${[1, 4, 9].map(n => `<button type="button" data-n="${n}">${n === 1 ? 'Single' : n === 4 ? '2×2' : '3×3'}</button>`).join('')}</div>
      <input id="ccq" placeholder="Search camera or purok" aria-label="Search cameras" autocomplete="off">
      ${off ? '<button type="button" class="btn sm" id="cca">＋ Add camera</button><button type="button" class="btn sm gold" id="ccg">Access log</button>' : ''}</div>
    ${off ? '<label class="chk cc-keep"><input type="checkbox" id="cck"> Monitor mode: keep the screen on and do not auto sign out</label>' : ''}
    <div id="ccnote"></div><div class="cctv-wall" id="ccwall"></div><div class="cc-pager" id="ccpg"></div>`;

    const filtered = () => {
      let a = S.cams.filter(c => ((c.name || '') + ' ' + (c.purok || '')).toLowerCase().includes(S.q));
      if (S.near) a = a.map(c => ({ ...c, _d: hasPos(c) ? meters(S.near, c) : 9e9 })).sort((x, y) => x._d - y._d);
      return a;
    };
    const stopAll = () => { S.mons.forEach(x => x.m.destroy()); S.mons = []; };
    const tileHtml = c => `<figure class="cam" data-id="${esc(c.id)}"><div class="cam-box"></div>
      <figcaption class="cam-top"><span class="cam-name">📹 ${esc(c.name)}${c.purok ? ' · ' + esc(c.purok) : ''}</span><span class="cam-st" data-st="load">CONNECTING</span></figcaption>
      <div class="cam-msg">CONNECTING…</div>
      <div class="cam-bot"><span class="cam-ts">${clock()}</span>${off ? `<span class="cam-chip">${c.access === 'public' ? '🌐 PUBLIC' : '🔒 OFFICIALS'}</span>` : ''}${c._d < 9e8 ? `<span class="cam-chip">${fmtD(c._d)} away</span>` : ''}
      <span class="cam-act"><button type="button" data-a="re" title="Reload" aria-label="Reload camera">↻</button><button type="button" data-a="snap" title="Snapshot" aria-label="Save snapshot">📸</button><button type="button" data-a="max" title="Expand" aria-label="Expand">⤢</button><button type="button" data-a="open" title="Open source" aria-label="Open source in new tab">↗</button>${off ? `${hasPos(c) ? '<button type="button" data-a="map" title="Show on map" aria-label="Show on map">🗺️</button>' : ''}<button type="button" data-a="edit" title="Edit" aria-label="Edit camera">✎</button><button type="button" data-a="del" title="Delete" aria-label="Delete camera">🗑</button>` : ''}</span></div></figure>`;

    function draw() {
      stopAll();
      const list = filtered();
      if (focus && list.length) { const i = list.findIndex(c => c.id === focus); if (i >= 0) { S.n = 1; S.page = i; } focus = ''; }
      const n = S.n, pages = Math.max(1, Math.ceil(list.length / n)); S.page = Math.min(S.page, pages - 1);
      document.querySelectorAll('#ccl button').forEach(b => b.classList.toggle('on', +b.dataset.n === n));
      $('#ccnote').innerHTML = S.near ? '<div class="info row"><span>📍 Sorted by distance from the SOS location.</span><button type="button" class="btn sm gold" id="ccnn">Clear</button></div>' : '';
      const slice = list.slice(S.page * n, S.page * n + n), w = $('#ccwall'); w.className = 'cctv-wall n' + n;
      w.innerHTML = slice.length ? slice.map(tileHtml).join('') : `<div class="empty cc-empty">${S.cams.length ? 'No camera matches your search.' : off ? 'No cameras yet. Tap “＋ Add camera” to connect the first one.' : 'No public cameras are available yet.'}</div>`;
      $('#ccpg').innerHTML = list.length ? `${pages > 1 ? `<button type="button" class="btn sm gold" data-p="-1" ${S.page ? '' : 'disabled'}>‹ Prev</button>` : ''}<span class="muted">${list.length} camera${list.length === 1 ? '' : 's'}${pages > 1 ? ` · page ${S.page + 1} of ${pages}` : ''}</span>${pages > 1 ? `<button type="button" class="btn sm gold" data-p="1" ${S.page < pages - 1 ? '' : 'disabled'}>Next ›</button>` : ''}` : '';
      if (document.hidden) return;
      slice.forEach(c => {
        const f = w.querySelector(`[data-id="${CSS.escape(c.id)}"]`); if (!f) return;
        const box = f.querySelector('.cam-box'), se = f.querySelector('.cam-st'), msg = f.querySelector('.cam-msg');
        const m = mount(box, c, s => { se.dataset.st = s; se.textContent = s === 'on' ? 'LIVE' : s === 'off' ? 'OFFLINE' : 'CONNECTING'; msg.hidden = s === 'on'; msg.textContent = s === 'off' ? 'OFFLINE · RETRYING…' : 'CONNECTING…'; });
        S.mons.push({ id: c.id, m });
        if (!S.logged.has(c.id)) { S.logged.add(c.id); logAct(c, 'view'); }
      });
    }

    function snapshot(f, c) {
      const v = f.querySelector('.cam-box video, .cam-box img');
      if (!v) return toast('Snapshots work on video and image cameras only');
      const w = v.videoWidth || v.naturalWidth, h = v.videoHeight || v.naturalHeight; if (!w || !h) return toast('Camera is not ready yet');
      try {
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d'); g.drawImage(v, 0, 0, w, h);
        const fs = Math.max(14, Math.round(w / 55)), pad = 8; g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(0, h - fs - pad * 2, w, fs + pad * 2); g.fillStyle = '#fff'; g.font = fs + 'px monospace'; g.fillText(`${c.name} · ${clock()}`, pad, h - pad - 2);
        cv.toBlob(b => { if (!b) return toast('This camera blocks snapshots. Use a screenshot instead.'); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'cctv-' + String(c.name).replace(/[^\w-]+/g, '_') + '-' + Date.now() + '.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); logAct(c, 'snapshot'); toast('Snapshot saved'); }, 'image/png');
      } catch (_) { toast('This camera blocks snapshots. Use a screenshot instead.'); }
    }

    $('#ccl').onclick = e => { const b = e.target.closest('button'); if (!b) return; S.n = +b.dataset.n; try { localStorage.cctvN = S.n; } catch (_) { } S.page = 0; draw(); };
    let dt; $('#ccq').oninput = e => { clearTimeout(dt); dt = setTimeout(() => { S.q = e.target.value.trim().toLowerCase(); S.page = 0; draw(); }, 250); };
    $('#ccnote').onclick = e => { if (e.target.closest('#ccnn')) { S.near = null; draw(); } };
    $('#ccpg').onclick = e => { const b = e.target.closest('[data-p]'); if (b) { S.page += +b.dataset.p; draw(); } };
    $('#ccwall').onclick = async e => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      const f = b.closest('.cam'), c = S.cams.find(x => x.id === f.dataset.id); if (!c) return;
      const a = b.dataset.a;
      if (a === 'max') { const on = f.classList.toggle('max'); document.body.classList.toggle('cc-lock', on); b.textContent = on ? '✕' : '⤢'; b.title = on ? 'Close' : 'Expand'; }
      else if (a === 'snap') snapshot(f, c);
      else if (a === 're') S.mons.find(x => x.id === c.id)?.m.restart();
      else if (a === 'open') window.open(c.url, '_blank', 'noopener,noreferrer');
      else if (a === 'edit') form(c);
      else if (a === 'map') { try { sessionStorage.mapFocus = c.lat + ',' + c.lng; } catch (_) { } go('map'); }
      else if (a === 'del' && await ask(`Delete camera “${c.name}”?`)) { await deleteDoc(doc(db, 'cameras', c.id)); toast('Camera deleted'); }
    };
    if (off) {
      $('#cca').onclick = () => form(null); $('#ccg').onclick = showLog;
      $('#cck').onchange = async e => {
        window.mtKeep = e.target.checked;
        if (e.target.checked) { try { S.wl = await navigator.wakeLock?.request('screen'); } catch (_) { } toast('Monitor mode on. Turn it off when you leave this device.'); }
        else { try { S.wl?.release(); } catch (_) { } S.wl = null; }
      };
    }
    const kd = e => { if (e.key === 'Escape') { const m = document.querySelector('.cam.max'); if (m) { m.classList.remove('max'); document.body.classList.remove('cc-lock'); const x = m.querySelector('[data-a=max]'); if (x) x.textContent = '⤢'; } } };
    const vis = () => { if (document.hidden) stopAll(); else draw(); };
    document.addEventListener('keydown', kd); document.addEventListener('visibilitychange', vis);
    S.tick = setInterval(() => { const t = clock(); document.querySelectorAll('#ccwall .cam-ts').forEach(x => x.textContent = t); }, 1000);

    const un = onSnapshot(camsQuery(), s => {
      const rows = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
      const sig = JSON.stringify(rows.map(r => [r.id, r.name, r.url, r.type, r.every, r.access, r.lat, r.lng, r.purok]));
      if (sig === S.sig) return; S.sig = sig; S.cams = rows; draw();
    }, () => { const w = $('#ccwall'); if (w) w.innerHTML = '<div class="empty cc-empty">Cannot load cameras. Publish the CCTV Firestore rules first (see README).</div>'; });
    setCleanup(() => { un(); stopAll(); clearInterval(S.tick); document.removeEventListener('keydown', kd); document.removeEventListener('visibilitychange', vis); document.body.classList.remove('cc-lock'); window.mtKeep = false; try { S.wl?.release(); } catch (_) { } });
    draw();
  }

  function modal(html, cls) {
    const o = document.createElement('div'), prev = document.activeElement; o.className = 'modal';
    o.innerHTML = `<div class="dlg ${cls || ''}" role="dialog" aria-modal="true">${html}</div>`;
    const done = () => { document.removeEventListener('keydown', k); o.classList.add('bye'); setTimeout(() => o.remove(), 250); prev && prev.focus && prev.focus(); };
    const k = e => e.key === 'Escape' && done();
    o.addEventListener('click', e => { if (e.target === o || e.target.closest('[data-x]')) done(); });
    document.addEventListener('keydown', k); document.body.append(o); return { o, done };
  }

  function form(c) {
    const v = c || { type: 'hls', access: 'officials', every: 5 }, sel = (a, b) => a === b ? 'selected' : '';
    const { o, done } = modal(`<form id="ccf"><p>${c ? 'Edit camera' : 'Add camera'}</p>
      <input name="name" placeholder="Camera name (e.g. Barangay Hall entrance)" required maxlength="60" value="${esc(v.name || '')}">
      <input name="purok" placeholder="Purok / area" maxlength="40" value="${esc(v.purok || '')}">
      <select name="type" aria-label="Camera type">${Object.entries(TYPES).map(([k, t]) => `<option value="${k}" ${sel(v.type, k)}>${t}</option>`).join('')}</select>
      <input name="url" type="url" placeholder="https:// link of the stream or image" required value="${esc(v.url || '')}">
      <input name="every" type="number" min="2" max="60" placeholder="Refresh every N seconds (snapshot only)" value="${esc(v.every || 5)}">
      <select name="access" aria-label="Who can watch"><option value="officials" ${sel(v.access, 'officials')}>🔒 Officials only</option><option value="public" ${sel(v.access, 'public')}>🌐 Public (all signed-in residents)</option></select>
      <div class="row cc-ll"><input name="lat" type="number" step="any" placeholder="Latitude" value="${hasPos(v) ? v.lat : ''}"><input name="lng" type="number" step="any" placeholder="Longitude" value="${hasPos(v) ? v.lng : ''}"></div>
      <button type="button" class="btn sm gold" id="ccgps">📍 Use my current location</button>
      <small class="muted">Never put the camera username or password in the link. Use a gateway, see CCTV-SETUP.txt. Cover only public areas (RA 10173).</small>
      <div class="row" style="justify-content:flex-end;margin-top:12px"><button type="button" class="btn gold" data-x>Cancel</button><button class="btn">Save</button></div></form>`, 'cc-form');
    o.querySelector('[name=name]').focus();
    o.querySelector('#ccgps').onclick = () => navigator.geolocation ? navigator.geolocation.getCurrentPosition(p => { const f = o.querySelector('#ccf'); f.lat.value = p.coords.latitude.toFixed(6); f.lng.value = p.coords.longitude.toFixed(6); }, () => toast('Allow location access in your browser'), { timeout: 8000 }) : toast('GPS is not supported on this device');
    o.querySelector('#ccf').onsubmit = async e => {
      e.preventDefault(); const f = e.target, num = x => x === '' ? null : Number(x);
      try {
        const type = f.type.value, lat = num(f.lat.value), lng = num(f.lng.value);
        if ((lat === null) !== (lng === null)) throw new Error('Enter both latitude and longitude, or leave both empty');
        if (lat !== null && (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)) throw new Error('Latitude/longitude is not valid');
        const data = { name: f.name.value.trim(), purok: f.purok.value.trim(), type, url: cleanUrl(type, f.url.value), every: Math.min(60, Math.max(2, +f.every.value || 5)), access: f.access.value, lat, lng };
        if (!data.name) throw new Error('Enter a camera name');
        if (data.access === 'public' && !(c && c.access === 'public') && !await ask('Every signed-in resident will be able to watch this camera. Use Public only for open areas (plaza, road, flood marker), never for private homes or offices. Continue?')) return;
        if (c) await updateDoc(doc(db, 'cameras', c.id), { ...data, updatedAt: serverTimestamp() });
        else await addDoc(collection(db, 'cameras'), { ...data, uid: me().uid, createdAt: serverTimestamp() });
        done(); toast(c ? 'Camera updated' : 'Camera added');
      } catch (err) { toast(err.message || 'Could not save camera'); }
    };
  }

  async function showLog() {
    const { o } = modal('<p>CCTV access log</p><div id="cclog" class="cc-loglist"><div class="skl"></div></div><div class="row" style="justify-content:flex-end"><button type="button" class="btn" data-x>Close</button></div>', 'cc-log');
    try {
      const s = await getDocs(query(collection(db, 'cctvlogs'), orderBy('createdAt', 'desc'), limit(60)));
      o.querySelector('#cclog').innerHTML = s.docs.length ? s.docs.map(d => { const r = d.data(); return `<div class="cc-logrow"><b>${esc(r.name)}</b> ${r.action === 'snapshot' ? '📸 saved a snapshot of' : '👁 viewed'} <i>${esc(r.camName)}</i><small class="muted">${fmt(r.createdAt)}</small></div>`; }).join('') : '<div class="empty">No activity recorded yet.</div>';
    } catch (_) { o.querySelector('#cclog').innerHTML = '<div class="empty">Cannot load the log. Publish the CCTV Firestore rules first.</div>'; }
  }

  /* camera pins on the Live map */
  async function mapPins(m, Lf, focused) {
    try {
      const s = await getDocs(camsQuery()), icon = Lf.divIcon({ className: 'cc-pin', html: '📹', iconSize: [30, 30], iconAnchor: [15, 15] });
      s.docs.forEach(d => { const c = d.data(); if (hasPos(c)) Lf.marker([c.lat, c.lng], { icon }).addTo(m).bindPopup(`<b>${esc(c.name)}</b><br>${esc(c.purok || '')}<br><button type="button" class="btn sm" data-cam="${d.id}" style="margin-top:6px">Watch</button>`); });
      const mf = sessionStorage.mapFocus; if (mf) { sessionStorage.removeItem('mapFocus'); const [a, b] = mf.split(',').map(Number); if (isFinite(a) && isFinite(b)) { m.setView([a, b], 18); focused && focused(); } }
    } catch (_) { }
  }
  return { view, mapPins };
}
