/* Study → Pancakes
   - Start/stop timer; 1 minute = 10 coins
   - Buy ingredients; cook pancakes from recipe
   - Auto-save to localStorage; reset button clears
*/

const RATE_PER_MIN = 10; // coins per full minute
const PRICES = {
  flour: 20,
  egg: 15,
  milk: 15,
  sugar: 10,
  butter: 25,
};
const RECIPE = { flour: 2, egg: 1, milk: 1, sugar: 1, butter: 1 };

const el = (id)=>document.getElementById(id);
const fmt = (s)=> {
  const t = Math.max(0, Math.floor(s));
  const h = String(Math.floor(t/3600)).padStart(2,'0');
  const m = String(Math.floor((t%3600)/60)).padStart(2,'0');
  const ss= String(t%60).padStart(2,'0');
  return `${h}:${m}:${ss}`;
};

const state = {
  running:false,
  startedAt:null,      // timestamp (ms)
  sessionSec:0,        // current session seconds (not yet added to total)
  totalSec:0,          // lifetime studied seconds
  creditedMinutes:0,   // how many minutes already converted to coins
  coins:0,
  inv:{ flour:0, egg:0, milk:0, sugar:0, butter:0 },
  pancakes:0,
  batches:0,
  notes:[]
};

// ---------- Persistence ----------
const KEY = 'studyPancakes:v1';
function save(){
  localStorage.setItem(KEY, JSON.stringify(state));
  flashLog('Progress saved.');
}
function load(){
  const raw = localStorage.getItem(KEY);
  if(!raw) return;
  try{
    const obj = JSON.parse(raw);
    Object.assign(state, obj);
  }catch(e){}
}

// ---------- UI Update ----------
function updateUI(){
  el('rate').textContent = RATE_PER_MIN;
  el('sessionTime').textContent = fmt(state.sessionSec);
  const total = state.totalSec + state.sessionSec;
  el('totalTime').textContent = fmt(total);

  el('coins').textContent = state.coins;
  // inventory
  const inv = el('inventory');
  inv.innerHTML = '';
  for(const k of Object.keys(state.inv)){
    const slot = document.createElement('div');
    slot.className = 'slot';
    slot.innerHTML = `<strong>${icon(k)} ${cap(k)}</strong> <span>x ${state.inv[k]}</span>`;
    inv.appendChild(slot);
  }
  el('pancakes').textContent = state.pancakes;
  el('batches').textContent = state.batches;

  // notes
  const ul = el('notes');
  ul.innerHTML = '';
  state.notes.slice(-50).forEach(n=>{
    const li = document.createElement('li');
    li.innerHTML = `<time>${new Date(n.t).toLocaleTimeString()}</time> ${escapeHtml(n.text)}`;
    ul.appendChild(li);
  });

  // shop
  const shop = el('shop');
  shop.innerHTML = '';
  Object.entries(PRICES).forEach(([k,price])=>{
    const div = document.createElement('div');
    div.className = 'item';
    div.innerHTML = `
      <div class="left">
        <span>${icon(k)}</span>
        <div>
          <div><strong>${cap(k)}</strong></div>
          <div class="muted tiny">Price: <span class="price">${price}</span></div>
        </div>
      </div>
      <button class="btn ghost" data-thing="${k}" data-price="${price}">Buy</button>
    `;
    shop.appendChild(div);
  });
}

function icon(k){
  return {
    flour:'🌾', egg:'🥚', milk:'🥛', sugar:'🧂', butter:'🧈'
  }[k] || '❓';
}
function cap(s){ return s[0].toUpperCase()+s.slice(1); }
function escapeHtml(s){ return s.replace(/[&<>"]/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[m])); }

function flashLog(msg){
  const log = el('log');
  const p = document.createElement('div');
  p.textContent = '• ' + msg;
  log.appendChild(p);
  log.scrollTop = log.scrollHeight;
}

// ---------- Timer Loop ----------
let lastTick = performance.now();
function tick(now){
  requestAnimationFrame(tick);
  // pause if not running
  if(!state.running) { lastTick = now; return; }

  // anti-cheat: pause when tab hidden
  if(document.hidden){ lastTick = now; return; }

  const dt = Math.max(0, now - lastTick)/1000; // seconds
  lastTick = now;
  state.sessionSec += dt;

  // credit coins per full minute of total time
  const total = Math.floor(state.totalSec + state.sessionSec);
  const totalMinutes = Math.floor(total/60);
  const newMinutes = Math.max(0, totalMinutes - state.creditedMinutes);
  if(newMinutes > 0){
    state.creditedMinutes += newMinutes;
    const add = newMinutes * RATE_PER_MIN;
    state.coins += add;
  }
  updateUI();
}

// ---------- Actions ----------
function start(){
  if(state.running) return;
  state.running = true;
  state.startedAt = Date.now();
  el('toggleBtn').textContent = 'Pause';
  flashLog('Timer started.');
}
function pause(){
  if(!state.running) return;
  state.running = false;
  state.totalSec += state.sessionSec;
  state.sessionSec = 0;
  el('toggleBtn').textContent = 'Start studying';
  flashLog('Timer paused.');
  save();
}
function resetSession(){
  state.sessionSec = 0;
  flashLog('Session cleared (total time kept).');
  updateUI();
}
function hardReset(){
  if(!confirm('Reset EVERYTHING? This clears time, coins, items, pancakes.')) return;
  localStorage.removeItem(KEY);
  Object.assign(state, {
    running:false, startedAt:null, sessionSec:0, totalSec:0,
    creditedMinutes:0, coins:0, inv:{flour:0,egg:0,milk:0,sugar:0,butter:0},
    pancakes:0, batches:0, notes:[]
  });
  updateUI();
  flashLog('All progress reset.');
}

function buy(thing, qty){
  const price = PRICES[thing];
  const cost = price * qty;
  if(state.coins < cost) { flashLog(`Not enough coins for ${qty} ${thing}.`); return; }
  state.coins -= cost;
  state.inv[thing] += qty;
  flashLog(`Bought ${qty} × ${cap(thing)}.`);
  updateUI();
  save();
}

function cookOne(){
  // check recipe
  for(const [k,need] of Object.entries(RECIPE)){
    if(state.inv[k] < need){ flashLog(`Need more ${k}.`); return; }
  }
  // consume
  for(const [k,need] of Object.entries(RECIPE)){
    state.inv[k] -= need;
  }
  state.pancakes += 1;
  state.batches += 1;
  flashLog('Cooked 1 pancake 🥞!');
  updateUI();
  save();
}
function cookMax(){
  // compute max batches possible
  let max = Infinity;
  for(const [k,need] of Object.entries(RECIPE)){
    max = Math.min(max, Math.floor(state.inv[k] / need));
  }
  if(max <= 0){ flashLog('Not enough ingredients to cook.'); return; }
  for(const [k,need] of Object.entries(RECIPE)){
    state.inv[k] -= need * max;
  }
  state.pancakes += max;
  state.batches += max;
  flashLog(`Cooked ${max} pancakes 🥞!`);
  updateUI();
  save();
}

// ---------- Events ----------
window.addEventListener('load', ()=>{
  load();
  updateUI();
  el('year').textContent = new Date().getFullYear();
  el('toggleBtn').addEventListener('click', ()=> state.running ? pause() : start());
  el('resetSessionBtn').addEventListener('click', resetSession);
  el('resetAllBtn').addEventListener('click', hardReset);
  el('saveBtn').addEventListener('click', save);
  el('cookOneBtn').addEventListener('click', cookOne);
  el('cookMaxBtn').addEventListener('click', cookMax);
  el('lapBtn').addEventListener('click', ()=>{
    const text = prompt('Note for this study session?');
    if(text && text.trim()){
      state.notes.push({ t: Date.now(), text: text.trim() });
      updateUI(); save();
    }
  });

  // shop delegate
  el('shop').addEventListener('click', (e)=>{
    const btn = e.target.closest('button[data-thing]');
    if(!btn) return;
    const thing = btn.dataset.thing;
    let qty = 1;
    if(e.shiftKey) qty = 5;
    if(e.altKey) qty = 10;
    buy(thing, qty);
  });

  requestAnimationFrame((t)=>{ lastTick=t; tick(t); });
});

// pause timer if window/tab not focused (fairness)
document.addEventListener('visibilitychange', ()=>{
  if(document.hidden && state.running){
    flashLog('Tab hidden → timer paused.');
  }
});

// keyboard shortcuts
window.addEventListener('keydown', (e)=>{
  if(e.ctrlKey && e.key.toLowerCase()==='s'){ e.preventDefault(); save(); }
  if(e.code==='Space'){ e.preventDefault(); state.running ? pause() : start(); }
});


function popOnce(node){
  node.classList.add('pop');
  setTimeout(()=>node.classList.remove('pop'), 250);
}
function bubbleToast(msg){
  const log = document.getElementById('log');
  const div = document.createElement('div');
  div.textContent = '• ' + msg;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}
