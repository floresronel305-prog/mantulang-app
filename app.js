import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, addDoc, doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, query, where, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig), auth = getAuth(app), db = getFirestore(app), store = getStorage(app);
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = t => t?.toDate ? t.toDate().toLocaleString('en-PH', {dateStyle:'medium', timeStyle:'short'}) : '';
document.documentElement.dataset.theme = localStorage.theme || (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light');
$('#theme').onclick = () => { const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = localStorage.theme = t; };
let me = null, nUnsub = null, uUnsub = null, watchId = null, unsub = null, registering = false, signup = false;

function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(t.h); t.h = setTimeout(() => t.classList.remove('show'), 2600); }

/* ---------- Auth ---------- */
$('#authSwap').onclick = e => {
  e.preventDefault(); signup = !signup;
  $('#regFields').hidden = !signup;
  $('#authTitle').textContent = $('#authBtn').textContent = signup ? 'Create account' : 'Sign in';
  e.target.textContent = signup ? 'I already have an account' : 'Create a resident account';
};
$('#authForm').onsubmit = async e => {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  if (!f.email.includes('@')) f.email = f.email.trim().toLowerCase() + '@mantulang.ph';
  try {
    if (signup) {
      if (!f.name) return toast('Enter your full name');
      registering = true;
      const c = await createUserWithEmailAndPassword(auth, f.email, f.password);
      await setDoc(doc(db, 'users', c.user.uid), { name: f.name, purok: f.purok || '', email: f.email, role: 'resident', verified: false, createdAt: serverTimestamp() });
      registering = false; boot(c.user);
    } else await signInWithEmailAndPassword(auth, f.email, f.password);
  } catch (err) { registering = false; toast(err.code?.replace('auth/', '').replace(/-/g, ' ') || 'Something went wrong'); }
};
$('#logout').onclick = () => { if (watchId != null) { navigator.geolocation.clearWatch(watchId); watchId = null; deleteDoc(doc(db, 'locations', me.uid)); } signOut(auth); };
onAuthStateChanged(auth, u => { if (registering) return; u ? boot(u) : (me = null, unsub && unsub(), nUnsub && nUnsub(), uUnsub && uUnsub(), $('#app').hidden = true, $('#auth').hidden = false); });

async function boot(u) {
  const s = await getDoc(doc(db, 'users', u.uid));
  if (!s.exists()) { toast('Profile not found'); return signOut(auth); }
  me = { uid: u.uid, ...s.data() };
  $('#auth').hidden = true; $('#app').hidden = false;
  $('#whoName').textContent = me.name; setRole();
  const nav = me.role === 'official'
    ? [['dash','Dashboard'],['announcements','Announcements'],['requests','Requests'],['complaints','Complaints'],['alerts','Emergency alerts'],['map','Live map'],['chat','Chats'],['more','All services']]
    : [['home','Home'],['announcements','Announcements'],['requests','Certificates'],['sos','Emergency'],['chat','Chats'],['notes','Notifications'],['more','All services']];
  $('#nav').innerHTML = nav.map(n => `<button data-v="${n[0]}"><em>${IC[n[0]] || '•'}</em><span>${n[1]}</span></button>`).join('');
  $('#nav').onclick = e => { const b = e.target.closest('button'); b && go(b.dataset.v); };
  watchNotes(); go(nav[0][0]);
}

/* ---------- Views ---------- */
const IC = {about:'ℹ️',more:'🧩',programs:'🎯',jobs:'💼',ordinances:'⚖️',budget:'💰',evac:'🏫',health:'💉',garbage:'🗑️',relief:'📦',reports:'🛠️',idapps:'🪪',appointments:'🗓️',suggestions:'💡',registry:'♿',volunteers:'🙋',myid:'🆔',broadcast:'📣',backup:'💾',gobag:'🎒',settings:'⚙️',home:'🏠',dash:'📊',announcements:'📢',events:'📅',lostfound:'🔎',requests:'📄',complaints:'📝',alerts:'🚨',sos:'🆘',map:'🗺️',chat:'💬',residents:'👥',households:'🏘️',polls:'🗳️',notes:'🔔',officials:'🏛️',hotlines:'☎️',profile:'👤'};
const FORMS = {
  lostfound: { title:'Lost & found', post:'any', fields:'<select name="kind"><option>Lost</option><option>Found</option></select><input name="title" placeholder="Item (e.g. black wallet)" required><textarea name="body" placeholder="Where and when, and how to contact you" required></textarea>', btn:'Post item', head:r=>r.kind + ': ' + r.title, text:r=>r.body },
  households: { title:'Household records', post:'resident', private:true, fields:'<input name="title" placeholder="Household head" required><input name="members" type="number" min="1" placeholder="Number of members" required><textarea name="body" placeholder="Member names and ages, notes (PWD, senior, 4Ps)"></textarea>', btn:'Save household', head:r=>r.title, text:r=>r.members + ' members. ' + (r.body || ''), cols:[['Date',r=>fmt(r.createdAt)],['Head',r=>r.title],['Purok',r=>r.purok],['Members',r=>r.members],['Notes',r=>r.body]] },
  events: { title:'Events & activities', post:'official', fields:'<input name="title" placeholder="Event name" required><input name="date" type="date" required><textarea name="body" placeholder="Details and venue" required></textarea>', btn:'Add event', head:r=>r.title, text:r=>r.body },
  officials: { title:'Barangay officials', post:'official', fields:'<input name="title" placeholder="Name" required><input name="position" placeholder="Position (e.g. Kagawad)" required><input name="contact" placeholder="Contact number">', btn:'Add official', head:r=>r.title, text:r=>r.position + (r.contact ? ' · ' + r.contact : '') },
  announcements: { title:'Announcements', post:'official', fields:'<input name="title" placeholder="Title" required><textarea name="body" placeholder="Message to residents" required></textarea>', btn:'Publish', head:r=>r.title, text:r=>r.body },
  requests: { title:'Certificate requests', post:'resident', st:['Pending','Approved','Rejected','Released'], cert:true, fields:'<select name="title"><option>Barangay Clearance</option><option>Certificate of Indigency</option><option>Certificate of Residency</option><option>Business Permit</option></select><textarea name="body" placeholder="Purpose of request" required></textarea>', btn:'Send request', head:r=>r.title, text:r=>r.body },
  complaints: { title:'Complaints & blotter', post:'resident', st:['Open','Investigating','Resolved'], cols:[['Date',r=>fmt(r.createdAt)],['Complainant',r=>r.name],['Purok',r=>r.purok],['Subject',r=>r.title],['Details',r=>r.body],['Status',r=>r.status]], fields:'<input name="title" placeholder="Subject" required><textarea name="body" placeholder="What happened? Include date, place, and people involved." required></textarea>', btn:'File complaint', head:r=>r.title, text:r=>r.body }
};

const I = (n, ph, req = 'required') => `<input name="${n}" placeholder="${ph}" ${req}>`, T = (ph, req = 'required') => `<textarea name="body" placeholder="${ph}" ${req}></textarea>`;
Object.assign(FORMS, {
  programs: { title:'Programs & services', post:'official', fields:I('title','Program name')+T('Details, schedule, requirements'), btn:'Add program', head:r=>r.title, text:r=>r.body },
  jobs: { title:'Job board', post:'official', fields:I('title','Job title')+I('contact','Contact / where to apply')+T('Requirements'), btn:'Post job', head:r=>r.title, text:r=>r.body + ' · Apply: ' + (r.contact || 'barangay hall') },
  ordinances: { title:'Ordinances & resolutions', post:'official', fields:I('title','Title')+I('ref','Number (e.g. Ord. 2026-03)')+T('Summary'), btn:'Publish', head:r=>(r.ref ? r.ref + ': ' : '') + r.title, text:r=>r.body },
  budget: { title:'Budget transparency', post:'official', fields:I('title','Project / item')+'<input name="amount" type="number" min="0" placeholder="Amount (PHP)" required>'+T('Details', ''), btn:'Add record', head:r=>r.title, text:r=>'PHP ' + Number(r.amount || 0).toLocaleString() + ' · ' + (r.body || '') },
  evac: { title:'Evacuation centers', post:'official', fields:I('title','Center name')+'<input name="capacity" type="number" placeholder="Capacity">'+T('Address / directions'), btn:'Add center', head:r=>r.title, text:r=>'Capacity ' + (r.capacity || '?') + ' · ' + r.body },
  health: { title:'Health & vaccination', post:'official', fields:I('title','Activity')+'<input name="date" type="date" required>'+T('Venue and who can join'), btn:'Add schedule', head:r=>r.title, text:r=>r.body },
  garbage: { title:'Waste collection schedule', post:'official', fields:I('title','Purok / area')+T('Days and time'), btn:'Add schedule', head:r=>r.title, text:r=>r.body },
  relief: { title:'Relief distribution', post:'official', fields:I('title','Relief item / program')+'<input name="date" type="date" required>'+T('Who qualifies and where to claim'), btn:'Announce', head:r=>r.title, text:r=>r.body },
  reports: { title:'Report a problem', post:'resident', st:['Reported','Working','Fixed'], fields:I('title','Problem (e.g. broken streetlight)')+T('Exact location and details')+'<input type="file" name="file" accept="image/*">', btn:'Send report', head:r=>r.title, text:r=>r.body },
  idapps: { title:'Barangay ID', post:'resident', st:['Pending','Approved','Ready'], fields:'<input name="title" value="Barangay ID application" readonly>'+T('Birthdate, address, emergency contact')+'<input type="file" name="file" accept="image/*">', btn:'Apply', head:r=>r.title, text:r=>r.body },
  appointments: { title:'Appointments', post:'resident', st:['Requested','Confirmed','Done','Cancelled'], cols:[['Date',r=>r.date],['Name',r=>r.name],['Purok',r=>r.purok],['Reason',r=>r.title],['Status',r=>r.status]], fields:I('title','Reason (e.g. mediation, consultation)')+'<input name="date" type="date" required>'+T('Notes',''), btn:'Request appointment', head:r=>r.title, text:r=>r.body || '' },
  suggestions: { title:'Suggestion box', post:'resident', private:true, fields:T('Your idea or concern for the barangay'), btn:'Send', head:r=>'Suggestion', text:r=>r.body },
  registry: { title:'Senior / PWD registry', post:'resident', private:true, cols:[['Name',r=>r.name],['Purok',r=>r.purok],['Type',r=>r.title],['Notes',r=>r.body]], fields:'<select name="title"><option>Senior citizen</option><option>PWD</option><option>Solo parent</option><option>4Ps</option></select>'+T('Name of person and details',''), btn:'Register', head:r=>r.title, text:r=>r.body || '' },
  volunteers: { title:'Volunteer sign-up', post:'resident', private:true, fields:I('title','What can you help with?')+T('Skills and availability',''), btn:'Sign up', head:r=>r.title, text:r=>r.body || '' }
});
const MORE = [['events'],['lostfound'],['complaints'],['programs'],['jobs'],['ordinances'],['budget'],['evac'],['health'],['garbage'],['relief'],['reports'],['idapps'],['appointments'],['suggestions'],['registry'],['volunteers'],['polls'],['households'],['map'],['officials'],['hotlines'],['myid'],['gobag'],['residents'],['broadcast'],['backup'],['settings'],['about'],['profile']], OFFONLY = ['residents','broadcast','backup'];
const NAME = { about:'About this app', myid:'Digital ID', gobag:'Go-bag', settings:'Settings', broadcast:'Broadcast', backup:'Backup', residents:'Residents', map:'Live map', officials:'Directory', hotlines:'Hotlines', profile:'My profile', polls:'Polls' };
function more(el) {
  const off = me.role === 'official', nk = [...document.querySelectorAll('#nav button')].map(b => b.dataset.v);
  const L = MORE.map(m => m[0]).filter(k => !nk.includes(k) && !(k === 'myid' && off) && !(OFFONLY.includes(k) && !off));
  el.innerHTML = '<h2>All services</h2><input id="q" placeholder="Search services"><div class="quick big" id="g"></div>';
  const draw = () => { const k = $('#q').value.toLowerCase(); $('#g').innerHTML = L.filter(x => (NAME[x] || FORMS[x].title).toLowerCase().includes(k)).map(x => `<button data-v="${x}"><em>${IC[x] || '•'}</em>${NAME[x] || FORMS[x].title}</button>`).join(''); };
  $('#q').oninput = draw; draw(); $('#g').onclick = e => { const b = e.target.closest('button'); b && go(b.dataset.v); };
}
function myid(el) {
  el.innerHTML = `<h2>Digital ID</h2><div class="idcard"><div><small>BARANGAY MANTULANG · PASSI CITY</small><h2>${esc(me.name)}</h2><p>${esc(me.purok || 'No purok')} · ${me.verified ? '✔ Verified' : 'Not verified'}</p><small>ID ${me.uid.slice(0, 8).toUpperCase()}</small></div><div id="qr"></div></div><p class="muted">Show this QR at the barangay hall.</p>`;
  window.QRCode && new QRCode($('#qr'), { text: 'MANTULANG:' + me.uid, width: 110, height: 110 });
}
function broadcast(el) {
  el.innerHTML = '<h2>Broadcast</h2><form class="card" id="f"><input name="t" placeholder="Message to all residents" required><button class="btn">Send to everyone</button></form>';
  $('#f').onsubmit = async e => {
    e.preventDefault(); const t = e.target.t.value, rs = (await getDocs(collection(db, 'users'))).docs.filter(d => d.data().role === 'resident');
    if (!confirm('Send to ' + rs.length + ' residents?')) return;
    await Promise.all(rs.map(d => addDoc(collection(db, 'notifications'), { to: d.id, text: '📢 ' + t, read: false, createdAt: serverTimestamp() }))); e.target.reset(); toast('Sent to ' + rs.length);
  };
}
function backup(el) {
  el.innerHTML = '<h2>Backup</h2><div class="card"><p>Download all barangay data as one JSON file.</p><button class="btn" id="bk">Download backup</button></div>';
  $('#bk').onclick = async () => {
    const o = {}; for (const c of ['users','announcements','events','officials','polls','votes','lostfound','requests','complaints','alerts','households',...Object.keys(FORMS)]) { if (o[c]) continue; try { o[c] = (await getDocs(collection(db, c))).docs.map(d => ({ id: d.id, ...d.data() })); } catch (_) {} }
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(o)], { type: 'application/json' })); a.download = 'mantulang-backup-' + new Date().toISOString().slice(0, 10) + '.json'; a.click(); toast('Backup downloaded');
  };
}
function gobag(el) {
  const I2 = ['Water (3 days)','Canned food','Flashlight and batteries','First-aid kit','Medicines','Copies of documents','Power bank','Radio','Whistle','Cash','Clothes and blanket','Face masks']; let s = {}; try { s = JSON.parse(localStorage.gobag || '{}'); } catch (_) {}
  el.innerHTML = '<h2>Emergency go-bag</h2><div class="card" id="gb">' + I2.map((x, i) => `<label class="chk"><input type="checkbox" data-i="${i}" ${s[i] ? 'checked' : ''}> ${x}</label>`).join('') + '</div>';
  $('#gb').onchange = e => { s[e.target.dataset.i] = e.target.checked; localStorage.gobag = JSON.stringify(s); };
}
const PAL = [['Forest','#1f5e3b','#2f8a57'],['LGU Blue','#0b3d91','#1e6fe0'],['Royal','#5b2a8c','#8f5fd0'],['Crimson','#a02a2a','#e05050'],['Sunset','#b5521a','#ef8a3c'],['Teal','#0f6b6b','#25a8a8'],['Rose','#a8325e','#e0679a'],['Slate','#34495e','#5f7d99'],['Indigo','#2c3a9c','#5a6cf0'],['Olive','#5a6b1f','#8fa636']];
function settings(el) {
  const draw = () => {
    const cur = localStorage.acc2 || '#0b3d91,#1e6fe0', vm = localStorage.vm || 'auto', dk = document.documentElement.dataset.theme === 'dark', B = (on, v, t) => `<button class="${on ? 'on' : ''}" data-v="${v}">${t}</button>`;
    el.innerHTML = `<h2>Settings</h2>
    <div class="card"><h3>Display mode</h3><p class="muted">Auto adapts to your screen. Desktop shows the full website layout. Phone shows the compact app layout.</p><div class="seg" id="vm">${B(vm === 'auto', 'auto', 'Auto') + B(vm === 'desktop', 'desktop', '🖥 Desktop') + B(vm === 'phone', 'phone', '📱 Phone')}</div></div>
    <div class="card"><h3>Appearance</h3><div class="seg" id="th">${B(!dk, 'light', '☀️ Light') + B(dk, 'dark', '🌙 Dark')}</div></div>
    <div class="card"><h3>Text size</h3><input type="range" id="fs" min="14" max="22" value="${parseInt(localStorage.fs) || 16}"></div>
    <div class="card"><h3>Color theme</h3><div class="swatches" id="ac">${PAL.map(p => `<button class="sw ${cur === p[1] + ',' + p[2] ? 'on' : ''}" data-a="${p[1]},${p[2]}"><i style="background:linear-gradient(135deg,${p[1]},${p[2]})"></i>${p[0]}</button>`).join('')}</div></div>`;
    $('#vm').onclick = e => { const b = e.target.closest('button'); if (b) { localStorage.vm = b.dataset.v; applyPrefs(); draw(); } };
    $('#th').onclick = e => { const b = e.target.closest('button'); if (b) { document.documentElement.dataset.theme = localStorage.theme = b.dataset.v; draw(); } };
    $('#fs').oninput = e => { localStorage.fs = e.target.value; applyPrefs(); };
    $('#ac').onclick = e => { const b = e.target.closest('button'); if (b) { localStorage.acc2 = b.dataset.a; applyPrefs(); draw(); } };
  };
  draw();
}
function about(el) {
  el.innerHTML = `<div class="hero"><small>About this app</small><h1>Barangay Mantulang</h1><p>Version 3.1 · Passi City, Iloilo</p></div>
  <div class="card"><h3>What is this app?</h3><p>A community app that brings barangay services to residents' phones: announcements, certificate requests, complaints, emergency alerts, a live map, chat and more. Officials manage everything from one dashboard.</p></div>
  <div class="card"><h3>Key features</h3><p>Certificates and Barangay ID · Complaints and blotter · SOS alerts · Live map · Chats and polls · Programs, jobs, ordinances and budget transparency · Digital ID · Installable and offline-ready.</p></div>
  <div class="card dev"><span class="av">RF</span><div><small>DEVELOPER</small><h3>Ronel Sigaya Flores</h3><p>First Year College · BSIT<br>PHINMA University of Iloilo</p></div></div>
  <p class="muted" style="text-align:center">Built with Firebase, Leaflet and OpenStreetMap.</p>`;
}
function applyPrefs() {
  const r = document.documentElement, c = (localStorage.acc2 || '#0b3d91,#1e6fe0').split(','), vm = localStorage.vm || 'auto';
  r.style.fontSize = (parseInt(localStorage.fs) || 16) + 'px'; r.style.setProperty('--green', c[0]); r.style.setProperty('--green2', c[1]); r.dataset.view = vm === 'auto' ? (innerWidth <= 760 || (matchMedia('(pointer:coarse)').matches && screen.width <= 820) ? 'phone' : 'desktop') : vm;
  const mv = document.querySelector('meta[name=viewport]'); mv && (mv.content = vm === 'desktop' ? 'width=1100' : 'width=device-width, initial-scale=1');
  const tc = document.querySelector('meta[name=theme-color]'); tc && (tc.content = c[0]);
}
applyPrefs(); addEventListener('resize', applyPrefs);
$('#vw').onclick = () => { const o = ['auto','desktop','phone']; localStorage.vm = o[(o.indexOf(localStorage.vm || 'auto') + 1) % 3]; applyPrefs(); toast('View: ' + localStorage.vm); };

function live(col, mine, render) {
  unsub && unsub();
  const q = mine ? query(collection(db, col), where('uid', '==', me.uid)) : collection(db, col);
  unsub = onSnapshot(q, s => render(s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))), () => toast('Cannot load data. Check Firestore rules.'));
}

function go(v) {
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.v === v || (b.dataset.v === 'more' && !document.querySelector('#nav [data-v="' + v + '"]'))));
  const el = $('#view'); unsub && unsub(); el.innerHTML = '';
  ({ about, more, myid, broadcast, backup, gobag, settings, home, hotlines, dash, sos, alerts, residents, profile, polls, notes, map: livemap, chat }[v] || (() => page(v, el)))(el);
}

function printCert(r) {
  const w = window.open('', '_blank');
  w.document.write(`<body style="font-family:Georgia,serif;max-width:680px;margin:60px auto;text-align:center"><h3>Republic of the Philippines<br>Barangay Mantulang, Passi City, Iloilo</h3><h1>${esc(r.title).toUpperCase()}</h1><p style="text-align:left;line-height:2;margin-top:40px">TO WHOM IT MAY CONCERN:<br>This certifies that <b>${esc(r.name)}</b>, of ${esc(r.purok) || 'this barangay'}, is a resident of Barangay Mantulang, Passi City. This certification is issued upon request for: <i>${esc(r.body)}</i>.<br>Issued on ${new Date().toLocaleDateString('en-PH', {dateStyle:'long'})}.</p><p style="margin-top:100px">______________________<br><b>Punong Barangay</b></p><script>onload=()=>print()<\/script></body>`);
  w.document.close();
}

function page(col, el) {
  const F = FORMS[col], off = me.role === 'official', canPost = (F.post === 'any' || F.post === me.role) && !(col === 'requests' && !me.verified);
  el.innerHTML = `<h2>${F.title}</h2>${off && F.cols ? '<button class="btn sm gold" id="rep">Print report (PDF)</button> <button class="btn sm" id="csv">Export CSV</button>' : ''}${col === 'requests' && me.role === 'resident' && !me.verified ? '<div class="card">Your account must be verified by a barangay official before you can request certificates. Please bring a valid ID to the barangay hall.</div>' : ''}` + (canPost ? `<form class="card" id="f">${F.fields}<button class="btn">${F.btn}</button></form>` : '') + '<input id="q" placeholder="Search"><div id="list"></div>';
  if (canPost) $('#f').onsubmit = async e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    const fl = d.file; delete d.file;
    if (fl && fl.size) {
      if (fl.size > 5e6) return toast('File must be under 5 MB');
      try {
        const rf = ref(store, `uploads/${me.uid}/${Date.now()}_${fl.name.replace(/[^\w.-]/g, '_')}`);
        await uploadBytes(rf, fl); d.fileUrl = await getDownloadURL(rf); d.fileName = fl.name;
      } catch (err) { return toast('Upload failed. Check Storage rules.'); }
    }
    await addDoc(collection(db, col), { ...d, uid: me.uid, name: me.name, purok: me.purok || '', ...(F.st ? { status: F.st[0] } : {}), createdAt: serverTimestamp() });
    e.target.reset(); toast('Saved');
  };
  let all = [];
  const draw = () => {
    const k = $('#q').value.toLowerCase(), rows = all.filter(r => JSON.stringify(Object.values(r)).toLowerCase().includes(k));
    $('#list').innerHTML = rows.length ? rows.map((r, i) => `<div class="card" style="animation-delay:${Math.min(i, 8) * 40}ms">
      <div class="row"><h3>${esc(F.head(r))}</h3>${r.status ? `<span class="badge ${esc(r.status)}">${esc(r.status)}</span>` : ''}</div>
      <p>${esc(F.text(r))}</p>${r.fileUrl ? `<p><a href="${esc(r.fileUrl)}" target="_blank" rel="noopener">View attachment: ${esc(r.fileName)}</a></p>` : ''}<div class="muted">${r.date ? 'Date: ' + esc(r.date) + ' · ' : ''}${(off && F.st) || col === 'announcements' ? esc(r.name) + ' · ' : ''}${fmt(r.createdAt)}</div>
      <div class="row" style="justify-content:flex-start;margin-top:10px">
      ${off && F.st ? F.st.map(s => `<button class="btn sm ${s === r.status ? 'gold' : ''}" data-id="${r.id}" data-s="${s}">${s}</button>`).join('') : ''}
      ${F.cert && ['Approved', 'Released'].includes(r.status) ? `<button class="btn sm" data-p="${r.id}">Print certificate</button>` : ''}
      ${off && F.post === 'official' ? `<button class="btn sm" data-edit="${r.id}">Edit</button>` : ''}
      ${(off || r.uid === me.uid) && !F.st ? `<button class="btn sm red" data-del="${r.id}">Delete</button>` : ''}</div></div>`).join('') : '<div class="empty">Nothing here yet.</div>';
  };
  $('#q').oninput = draw; if ($('#rep')) { $('#rep').onclick = () => printReport(F, all); $('#csv').onclick = () => csv(F, all); }
  live(col, (F.st || F.private) && !off, rows => { all = rows; draw(); });
  $('#list').onclick = async e => {
    const b = e.target;
    if (b.dataset.s) { await updateDoc(doc(db, col, b.dataset.id), { status: b.dataset.s }); const r = all.find(x => x.id === b.dataset.id); await addDoc(collection(db, 'notifications'), { to: r.uid, text: 'Your ' + r.title + ' is now ' + b.dataset.s, read: false, createdAt: serverTimestamp() }); toast('Marked ' + b.dataset.s); }
    if (b.dataset.edit) { const r = all.find(x => x.id === b.dataset.edit), t = prompt('Title', r.title); if (t === null) return; const bd = prompt('Details', r.body ?? ''); await updateDoc(doc(db, col, r.id), { title: t, ...(bd !== null ? { body: bd } : {}) }); toast('Updated'); }
    if (b.dataset.p) printCert(all.find(r => r.id === b.dataset.p));
    if (b.dataset.del && confirm('Delete this entry?')) { await deleteDoc(doc(db, col, b.dataset.del)); toast('Deleted'); }
  };
}

function profile(el) {
  setTimeout(() => { bindInstall(); $('#t2').onclick = () => $('#theme').click(); $('#lo2').onclick = () => $('#logout').click(); }, 0);
  el.innerHTML = `<div class="card row"><button class="btn sm gold install" hidden>⬇️ Install app</button><button class="btn sm" id="t2">🌗 Dark / light</button><button class="btn sm red" id="lo2">Sign out</button></div><h2>My profile</h2><form class="card" id="f"><input name="name" value="${esc(me.name)}" placeholder="Full name" required><input name="purok" value="${esc(me.purok)}" placeholder="Purok / Sitio"><input name="phone" value="${esc(me.phone)}" placeholder="Mobile number"><button class="btn">Save changes</button></form>`;
  $('#f').onsubmit = async e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    await updateDoc(doc(db, 'users', me.uid), d); Object.assign(me, d); $('#whoName').textContent = me.name; toast('Profile saved');
  };
}

async function dash(el) {
  el.innerHTML = '<h2>Dashboard</h2><div class="stats" id="st"></div>';
  const defs = [['users','Residents'],['requests','Requests'],['complaints','Complaints'],['alerts','Alerts'],['households','Households']];
  const snaps = await Promise.all(defs.map(d => getDocs(collection(db, d[0]))));
  $('#st').innerHTML = defs.map((d, i) => `<div class="stat" style="animation-delay:${i * 80}ms"><b data-n="${snaps[i].size}">0</b>${d[1]}</div>`).join('');
  const pk = {}; snaps[0].docs.map(d => d.data()).filter(u => u.role === 'resident').forEach(u => { const p = u.purok || 'No purok'; pk[p] = (pk[p] || 0) + 1; }); const mx = Math.max(1, ...Object.values(pk));
  $('#view').insertAdjacentHTML('beforeend', '<h3 class="sec">Residents per purok</h3>' + Object.entries(pk).map(([p, n]) => `<div class="bar"><i style="width:${n * 100 / mx}%"></i><span>${esc(p)}: ${n}</span></div>`).join(''));
  const pend = snaps[1].docs.filter(d => d.data().status === 'Pending').length, opn = snaps[2].docs.filter(d => d.data().status !== 'Resolved').length;
  $('#st').insertAdjacentHTML('beforeend', [['⏳ Pending requests', pend], ['⚠️ Open complaints', opn]].map(x => `<div class="stat warn"><b data-n="${x[1]}">0</b>${x[0]}</div>`).join(''));
  document.querySelectorAll('[data-n]').forEach(b => { const n = +b.dataset.n; let c = 0; const t = setInterval(() => { c += Math.max(1, Math.ceil(n / 20)); if (c >= n) { c = n; clearInterval(t); } b.textContent = c; }, 40); });
}

function sos(el) {
  el.innerHTML = '<h2>Emergency</h2><p class="muted">Press and hold is not required. One tap alerts the barangay officials with your name and purok.</p><button class="sos" id="sos">SOS</button>';
  $('#sos').onclick = async () => { if (!confirm('Send an emergency alert to barangay officials?')) return; const pos = await new Promise(r => navigator.geolocation ? navigator.geolocation.getCurrentPosition(p => r(p.coords), () => r(null), { timeout: 6000 }) : r(null)); await addDoc(collection(db, 'alerts'), { uid: me.uid, name: me.name, purok: me.purok || '', lat: pos ? pos.latitude : null, lng: pos ? pos.longitude : null, createdAt: serverTimestamp() }); toast('Alert sent. Help is being notified.'); };
}

function alerts(el) {
  el.innerHTML = '<h2>Emergency alerts</h2><div id="list"></div>';
  live('alerts', false, rows => $('#list').innerHTML = rows.length ? rows.map(r => `<div class="card"><div class="row"><h3>${esc(r.name)}</h3><span class="badge Rejected">SOS</span></div><p>Purok: ${esc(r.purok) || 'n/a'}</p>${r.lat ? `<p><a href="https://maps.google.com/?q=${r.lat},${r.lng}" target="_blank" rel="noopener">Open location in map</a></p>` : ''}<div class="muted">${fmt(r.createdAt)}</div></div>`).join('') : '<div class="empty">No alerts.</div>');
}

function residents(el) {
  el.innerHTML = '<h2>Residents</h2><input id="q" placeholder="Search"><div id="list"></div>';
  let all = [];
  const draw = () => {
    const k = $('#q').value.toLowerCase(), rows = all.filter(r => r.role === 'resident' && JSON.stringify(Object.values(r)).toLowerCase().includes(k));
    $('#list').innerHTML = rows.map(r => `<div class="card"><div class="row"><h3>${esc(r.name)}</h3><span class="badge ${r.verified ? 'Approved' : 'Pending'}">${r.verified ? 'Verified' : 'Not verified'}</span></div><div class="muted">${esc(r.purok) || 'No purok'} · ${esc(r.email)}${r.phone ? ' · ' + esc(r.phone) : ''}</div><button class="btn sm ${r.verified ? 'red' : ''}" style="margin-top:10px" data-id="${r.id}" data-ok="${r.verified ? 0 : 1}">${r.verified ? 'Remove verification' : 'Verify resident'}</button> <button class="btn sm gold" style="margin-top:10px" data-up="${r.id}">Make official</button></div>`).join('') || '<div class="empty">No residents yet.</div>';
  };
  $('#q').oninput = draw;
  live('users', false, r => { all = r; draw(); });
  $('#list').onclick = async e => {
    const b = e.target; if (b.dataset.up) { if (confirm('Make this person a barangay official? They get full admin access.')) { await updateDoc(doc(db, 'users', b.dataset.up), { role: 'official' }); toast('Promoted to official'); } return; } if (!b.dataset.id) return;
    const v = b.dataset.ok === '1';
    await updateDoc(doc(db, 'users', b.dataset.id), { verified: v });
    if (v) await addDoc(collection(db, 'notifications'), { to: b.dataset.id, text: 'Your account is verified. You can now request certificates.', read: false, createdAt: serverTimestamp() });
    toast(v ? 'Resident verified' : 'Verification removed');
  };
}

/* ---------- Reports, polls, notifications ---------- */
function printReport(F, rows) {
  const w = window.open('', '_blank');
  w.document.write(`<body style="font-family:sans-serif;margin:30px"><h2>Barangay Mantulang, Passi City: ${esc(F.title)} report</h2><p>Generated ${new Date().toLocaleString('en-PH')}</p><table border="1" cellpadding="6" style="border-collapse:collapse;width:100%;font-size:13px"><tr>${F.cols.map(c => `<th>${c[0]}</th>`).join('')}</tr>${rows.map(r => `<tr>${F.cols.map(c => `<td>${esc(c[1](r))}</td>`).join('')}</tr>`).join('')}</table><p style="margin-top:40px">Choose "Save as PDF" in the print dialog.</p><script>onload=()=>print()<\/script></body>`);
  w.document.close();
}

function polls(el) {
  const off = me.role === 'official';
  el.innerHTML = '<h2>Polls & surveys</h2>' + (off ? '<form class="card" id="f"><input name="title" placeholder="Question" required><input name="options" placeholder="Options, separated by commas" required><button class="btn">Publish poll</button></form>' : '') + '<div id="list"></div>';
  if (off) $('#f').onsubmit = async e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    await addDoc(collection(db, 'polls'), { title: d.title, options: d.options.split(',').map(x => x.trim()).filter(Boolean), uid: me.uid, name: me.name, createdAt: serverTimestamp() });
    e.target.reset(); toast('Poll published');
  };
  let ps = [];
  const draw = async () => {
    const v = (await getDocs(collection(db, 'votes'))).docs.map(d => d.data());
    $('#list').innerHTML = ps.length ? ps.map(p => {
      const pv = v.filter(x => x.pollId === p.id), mine = pv.find(x => x.uid === me.uid);
      return `<div class="card"><h3>${esc(p.title)}</h3>${p.options.map((o, i) => {
        const n = pv.filter(x => x.choice === i).length, pc = pv.length ? Math.round(n * 100 / pv.length) : 0;
        return mine || off ? `<div class="bar"><i style="width:${pc}%"></i><span>${esc(o)}: ${n} (${pc}%)</span></div>` : `<button class="btn sm gold" style="margin:4px 6px 4px 0" data-p="${p.id}" data-c="${i}">${esc(o)}</button>`;
      }).join('')}<div class="muted">${pv.length} votes${mine ? ' · You voted' : ''}</div>${off ? `<button class="btn sm red" data-del="${p.id}">Delete</button>` : ''}</div>`;
    }).join('') : '<div class="empty">No polls yet.</div>';
  };
  live('polls', false, r => { ps = r; draw(); });
  $('#list').onclick = async e => {
    const b = e.target;
    if (b.dataset.c) { await setDoc(doc(db, 'votes', b.dataset.p + '_' + me.uid), { pollId: b.dataset.p, uid: me.uid, choice: +b.dataset.c }); toast('Vote recorded'); draw(); }
    if (b.dataset.del && confirm('Delete this poll?')) await deleteDoc(doc(db, 'polls', b.dataset.del));
  };
}

function watchNotes() {
  uUnsub && uUnsub(); uUnsub = onSnapshot(doc(db, 'users', me.uid), s => { if (s.exists()) { Object.assign(me, s.data()); setRole(); } });
  nUnsub && nUnsub();
  if (me.role === 'official') {
    let f = true;
    nUnsub = onSnapshot(collection(db, 'alerts'), s => { if (!f) s.docChanges().filter(c => c.type === 'added').forEach(c => { const a = c.doc.data(); toast('🚨 SOS from ' + a.name); navigator.vibrate && navigator.vibrate([300, 100, 300]); window.Notification && Notification.permission === 'granted' && new Notification('SOS: ' + a.name, { body: a.purok || '' }); }); f = false; });
    window.Notification && Notification.permission === 'default' && Notification.requestPermission(); return;
  }
  let first = true;
  nUnsub = onSnapshot(query(collection(db, 'notifications'), where('to', '==', me.uid)), s => {
    me.notes = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    const u = me.notes.filter(n => !n.read).length, b = document.querySelector('[data-v=notes]');
    if (b) b.lastChild.textContent = 'Notifications' + (u ? ` (${u})` : '');
    if (!first) s.docChanges().filter(c => c.type === 'added').forEach(c => { toast(c.doc.data().text); if (window.Notification && Notification.permission === 'granted') new Notification('Barangay Mantulang', { body: c.doc.data().text }); });
    first = false;
  });
  if (window.Notification && Notification.permission === 'default') Notification.requestPermission();
}

function notes(el) {
  const n = me.notes || [];
  el.innerHTML = '<h2>Notifications</h2>' + (n.length ? n.map(x => `<div class="card"><p>${esc(x.text)}</p><div class="muted">${fmt(x.createdAt)}${x.read ? '' : ' · New'}</div></div>`).join('') : '<div class="empty">No notifications yet.</div>');
  n.filter(x => !x.read).forEach(x => updateDoc(doc(db, 'notifications', x.id), { read: true }));
}

function setRole() { $('#whoRole').textContent = me.role === 'official' ? 'Barangay Official' : 'Resident · ' + (me.verified ? 'Verified' : 'Not yet verified'); }

/* ---------- Live map (GPS) ---------- */
function livemap(el) {
  const off = me.role === 'official';
  el.innerHTML = `<h2>Live map</h2><div class="card row"><span class="muted">${off ? 'Residents who share their location appear here.' : 'Share your live location with barangay officials. Only officials can see it.'}</span><button class="btn sm" id="gt">${watchId != null ? 'Stop sharing' : 'Share my location'}</button></div><div id="map"></div>`;
  const m = L.map('map').setView([11.1086, 122.6431], 14), mk = {}; let fitted = false;
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(m);
  const upd = (id, d) => {
    if (!d) { if (mk[id]) { m.removeLayer(mk[id]); delete mk[id]; } return; }
    const p = [d.lat, d.lng];
    if (mk[id]) mk[id].setLatLng(p); else mk[id] = L.marker(p).addTo(m).bindPopup(`<b>${esc(d.name)}</b><br>${esc(d.purok || '')}`);
    if (!fitted) { m.setView(p, 16); fitted = true; }
  };
  unsub = off ? onSnapshot(collection(db, 'locations'), s => s.docChanges().forEach(c => upd(c.doc.id, c.type === 'removed' ? null : c.doc.data())))
              : onSnapshot(doc(db, 'locations', me.uid), s => upd(me.uid, s.exists() ? s.data() : null));
  $('#gt').onclick = () => {
    if (watchId != null) { navigator.geolocation.clearWatch(watchId); watchId = null; deleteDoc(doc(db, 'locations', me.uid)); $('#gt').textContent = 'Share my location'; return toast('Location sharing stopped'); }
    if (!navigator.geolocation) return toast('GPS is not supported on this device');
    watchId = navigator.geolocation.watchPosition(p => setDoc(doc(db, 'locations', me.uid), { lat: p.coords.latitude, lng: p.coords.longitude, name: me.name, purok: me.purok || '', updatedAt: serverTimestamp() }), () => toast('Allow location access in your browser'), { enableHighAccuracy: true, maximumAge: 5000 });
    $('#gt').textContent = 'Stop sharing'; toast('Sharing your live location');
  };
}

/* ---------- Chats ---------- */
function chat(el) {
  const off = me.role === 'official';
  el.innerHTML = `<h2>Chats</h2><div class="card"><select id="rm" style="margin:0"><option value="general">Barangay group chat</option>${off ? '' : `<option value="help_${me.uid}">Message the officials</option>`}</select></div><div class="chat" id="msgs"></div><form class="chatform" id="cf"><input id="ct" placeholder="Type a message" autocomplete="off"><button class="btn">Send</button></form>`;
  let room = 'general';
  if (off) getDocs(collection(db, 'users')).then(s => s.docs.filter(d => d.data().role === 'resident').forEach(d => $('#rm').add(new Option('Help desk: ' + d.data().name, 'help_' + d.id))));
  const open = () => {
    unsub && unsub();
    unsub = onSnapshot(query(collection(db, 'messages'), where('room', '==', room)), s => {
      const rows = s.docs.map(d => d.data()).sort((a, b) => (a.createdAt?.seconds || 9e9) - (b.createdAt?.seconds || 9e9)).slice(-100);
      $('#msgs').innerHTML = rows.length ? rows.map(r => `<div class="msg ${r.uid === me.uid ? 'me' : ''}"><b>${esc(r.name)}${r.role === 'official' ? ' · Official' : ''}</b><span>${esc(r.text)}</span><i>${fmt(r.createdAt)}</i></div>`).join('') : '<div class="empty">No messages yet. Say hello.</div>';
      $('#msgs').scrollTop = 1e9;
    }, () => toast('Cannot load chat. Check Firestore rules.'));
  };
  $('#rm').onchange = e => { room = e.target.value; open(); };
  open();
  $('#cf').onsubmit = async e => {
    e.preventDefault(); const t = $('#ct').value.trim(); if (!t) return; $('#ct').value = '';
    await addDoc(collection(db, 'messages'), { room, text: t, uid: me.uid, name: me.name, role: me.role, createdAt: serverTimestamp() });
  };
}

/* ---------- New: home, hotlines, CSV ---------- */
function home(el) {
  const h = new Date().getHours(), g = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  const Q = [['sos','🆘','SOS'],['requests','📄','Certificate'],['complaints','📝','Complaint'],['chat','💬','Chat'],['map','🗺️','Live map'],['hotlines','☎️','Hotlines']];
  el.innerHTML = `<div class="hero"><small>${g},</small><h1>${esc(me.name.split(' ')[0])} 👋</h1><div class="wx" id="wx">Loading weather…</div><span class="badge ${me.verified ? 'Approved' : 'Pending'}">${me.verified ? '✔ Verified resident' : 'Not yet verified'}</span></div>
  <div class="quick">${Q.map(q => `<button data-v="${q[0]}"><em>${q[1]}</em>${q[2]}</button>`).join('')}</div><h3 class="sec">Latest announcements</h3><div id="list"></div>`;
  $('.quick').onclick = e => { const b = e.target.closest('button'); b && go(b.dataset.v); };
  fetch('https://api.open-meteo.com/v1/forecast?latitude=11.1086&longitude=122.6431&current=temperature_2m,weather_code,wind_speed_10m').then(r => r.json()).then(d => { const c = d.current, k = c.weather_code; $('#wx') && ($('#wx').innerHTML = `<b>${k == 0 ? '☀️' : k < 4 ? '⛅' : k < 50 ? '🌫️' : k < 70 ? '🌧️' : '⛈️'} ${Math.round(c.temperature_2m)}°C</b> Passi City · wind ${Math.round(c.wind_speed_10m)} km/h`); }).catch(() => $('#wx') && ($('#wx').textContent = 'Weather unavailable offline'));
  live('announcements', false, rows => $('#list').innerHTML = rows.slice(0, 3).map(r => `<div class="card"><h3>${esc(r.title)}</h3><p>${esc(r.body)}</p><div class="muted">${fmt(r.createdAt)}</div></div>`).join('') || '<div class="empty">No announcements yet.</div>');
}
function hotlines(el) {
  const L = [['🚓','National Emergency','911'],['❤️','Philippine Red Cross','143'],['🏛️','Citizens Complaint Hotline','8888']];
  el.innerHTML = '<h2>Emergency hotlines</h2>' + L.map(x => `<a class="card hot" href="tel:${x[2]}"><span>${x[0]}</span><div><h3>${x[1]}</h3><div class="muted">Tap to call</div></div><b>${x[2]}</b></a>`).join('') + '<div class="card"><h3>Local contacts</h3><p>Barangay officials and their numbers are in the Directory.</p><button class="btn sm" id="dir">Open directory</button></div>';
  $('#dir').onclick = () => go('officials');
}
function csv(F, rows) {
  const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const t = [F.cols.map(c => q(c[0])).join(',')].concat(rows.map(r => F.cols.map(c => q(c[1](r))).join(','))).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + t], { type: 'text/csv' })); a.download = F.title + '.csv'; a.click();
}

/* ---------- Install app (PWA) + offline ---------- */
let installEvt = null;
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone, ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; });
addEventListener('appinstalled', () => document.querySelectorAll('.install').forEach(b => b.hidden = true));
function bindInstall() {
  document.querySelectorAll('.install').forEach(b => {
    b.hidden = standalone;
    b.onclick = async () => {
      if (installEvt) { installEvt.prompt(); await installEvt.userChoice; installEvt = null; return; }
      $('#steps').innerHTML = (ios ? ['Tap the <b>Share</b> button in Safari','Scroll and tap <b>Add to Home Screen</b>','Tap <b>Add</b>'] : ['Open the browser menu <b>⋮</b>','Tap <b>Install app</b> or <b>Add to Home screen</b>','Confirm']).map(s => `<li>${s}</li>`).join('');
      $('#sheet').hidden = false;
    };
  });
}
bindInstall();
$('#sheetX').onclick = () => $('#sheet').hidden = true;
const net = () => $('#off').hidden = navigator.onLine; addEventListener('online', net); addEventListener('offline', net); net();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
