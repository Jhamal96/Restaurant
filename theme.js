/* NibbleSpot Appearance — follow system by default, or remember a manual choice. */
(function () {
  'use strict';
  const KEY = 'nibblespot_appearance';
  const allowed = ['system','light','dark','ultra-dark'];
  const root = document.documentElement;
  const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  let choice = 'system', opener = null;
  try {
    const saved = localStorage.getItem(KEY);
    if (allowed.includes(saved)) choice = saved;
  } catch (_) {}

  function resolved() {
    return choice === 'system' ? (media?.matches ? 'dark' : 'light') : choice;
  }

  function paint() {
    const mode = resolved();
    root.setAttribute('data-theme', mode);
    root.setAttribute('data-theme-choice', choice);
    root.style.colorScheme = mode === 'light' ? 'light' : 'dark';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', mode === 'ultra-dark' ? '#050506' : mode === 'dark' ? '#191714' : '#f9f5ee');
    document.querySelectorAll('.appearance-choice').forEach(button => {
      const active = button.dataset.appearance === choice;
      button.classList.toggle('selected', active);
      button.setAttribute('aria-pressed', String(active));
    });
    const note = document.getElementById('nibbleThemeActive');
    if (note) note.textContent = 'Currently displaying: ' + ({light:'Light',dark:'Dark','ultra-dark':'Ultra Dark'}[mode] || 'Light');
    const summary = document.getElementById('nibbleThemeSummary');
    if (summary) summary.textContent = choice === 'system'
      ? 'Follows your device and changes automatically when the system theme changes.'
      : 'Your choice is saved on this device. Switch to Follow System anytime.';
    return mode;
  }

  function choose(value) {
    if (!allowed.includes(value)) return false;
    choice = value;
    try { localStorage.setItem(KEY, value); } catch (_) {}
    paint();
    return true;
  }

  window.NibbleSpotTheme = Object.freeze({
    get preference() { return choice; },
    get effective() { return resolved(); },
    set: choose,
    refresh: paint
  });
  paint();

  function onSystemChange() { if (choice === 'system') paint(); }
  if (media) {
    if (media.addEventListener) media.addEventListener('change', onSystemChange);
    else if (media.addListener) media.addListener(onSystemChange);
  }
  window.addEventListener('storage', (event) => {
    if (event.key !== KEY) return;
    choice = allowed.includes(event.newValue) ? event.newValue : 'system';
    paint();
  });

  function setupSettings() {
    const nav = document.querySelector('.topnav') || document.querySelector('body > nav');
    if (!nav || document.getElementById('nibbleSettingsBtn')) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'nibbleSettingsBtn';
    button.className = 'nibble-settings-btn';
    button.setAttribute('aria-haspopup','dialog');
    button.setAttribute('aria-controls','nibbleSettingsOverlay');
    button.setAttribute('aria-label','Open NibbleSpot settings');
    button.innerHTML = '<span aria-hidden="true" class="settings-gear">⚙</span><span>Settings</span>';
    const install = nav.querySelector('[data-install-promo]');
    if (install) nav.insertBefore(button,install);
    else nav.append(button);

    const overlay = document.createElement('div');
    overlay.id = 'nibbleSettingsOverlay';
    overlay.className = 'nibble-settings-overlay';
    overlay.hidden = true;
    overlay.innerHTML = [
      '<section class="nibble-settings-panel" role="dialog" aria-modal="true" aria-labelledby="nibbleSettingsTitle" aria-describedby="nibbleSettingsDesc">',
      '<div class="nibble-settings-head">',
      '<div><span class="nibble-settings-eyebrow">MAKE IT YOURS ♡</span>',
      '<h2 id="nibbleSettingsTitle">Settings</h2></div>',
      '<button type="button" class="nibble-settings-close" id="nibbleSettingsClose" aria-label="Close settings">✕</button></div>',
      '<div class="nibble-settings-body">',
      '<h3>☼ Appearance</h3>',
      '<p id="nibbleSettingsDesc">Choose how NibbleSpot looks on this device.</p>',
      '<div class="appearance-grid" role="group" aria-label="Color mode">',
      '<button type="button" class="appearance-choice" data-appearance="system" aria-pressed="false">',
      '<span class="appearance-preview preview-system" aria-hidden="true"><i></i><b></b></span>',
      '<span class="appearance-name">◐ Follow System</span><small>Automatic</small><span class="appearance-check" aria-hidden="true">✓</span></button>',
      '<button type="button" class="appearance-choice" data-appearance="light" aria-pressed="false">',
      '<span class="appearance-preview preview-light" aria-hidden="true"><i></i><b></b></span>',
      '<span class="appearance-name">☀ Light</span><small>Warm &amp; airy</small><span class="appearance-check" aria-hidden="true">✓</span></button>',
      '<button type="button" class="appearance-choice" data-appearance="dark" aria-pressed="false">',
      '<span class="appearance-preview preview-dark" aria-hidden="true"><i></i><b></b></span>',
      '<span class="appearance-name">☾ Dark</span><small>Cozy evening</small><span class="appearance-check" aria-hidden="true">✓</span></button>',
      '<button type="button" class="appearance-choice" data-appearance="ultra-dark" aria-pressed="false">',
      '<span class="appearance-preview preview-ultra-dark" aria-hidden="true"><i></i><b></b></span>',
      '<span class="appearance-name">◕ Ultra Dark</span><small>Near black</small><span class="appearance-check" aria-hidden="true">✓</span></button>',
      '</div>',
      '<div class="appearance-explainer"><strong id="nibbleThemeActive"></strong><p id="nibbleThemeSummary"></p></div>',
      '</div></section>'
    ].join('');
    document.body.append(overlay);

    const closeButton = overlay.querySelector('#nibbleSettingsClose');
    function open() {
      opener = document.activeElement;
      overlay.hidden = false;
      document.body.classList.add('nibble-settings-open');
      paint();
      const selected = overlay.querySelector('.appearance-choice.selected');
      (selected || closeButton).focus();
    }
    function close() {
      if (overlay.hidden) return;
      overlay.hidden = true;
      document.body.classList.remove('nibble-settings-open');
      (opener && opener.isConnected ? opener : button).focus();
    }
    button.addEventListener('click', open);
    closeButton.addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    overlay.querySelectorAll('[data-appearance]').forEach(option =>
      option.addEventListener('click', () => choose(option.dataset.appearance)));
    overlay.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { event.preventDefault(); close(); return; }
      if (event.key !== 'Tab') return;
      // Include controls added to Settings after this panel was constructed.
      const focusable = [...overlay.querySelectorAll('button:not([disabled])')];
      const index = focusable.indexOf(document.activeElement);
      if (event.shiftKey && index <= 0) { event.preventDefault(); focusable[focusable.length-1].focus(); }
      else if (!event.shiftKey && index === focusable.length-1) { event.preventDefault(); focusable[0].focus(); }
    });
    paint();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setupSettings, {once:true});
  else setupSettings();
})();
/* Release announcements share the current Settings style and preserve the saved-list data. */
(function(){'use strict';
 const VERSION='2026-10-24-nibblespot-welcome-v1';
 const KEY='nibblespot_updates_last_acknowledged',DISABLE='nibblespot_updates_dont_show_again';
 const features=[
  ['⌕','Discover restaurants','Search real restaurant listings by location, restaurant name, or cuisine. Get suggested cities, addresses, and restaurants while typing.'],
  ['✦','AI-powered search','Use natural-language requests to help interpret cuisines and locations. Results are grounded in restaurant listings rather than invented places.'],
  ['⌖','Location and maps','Find places near your location with permission, open Apple Maps, and look up menus and navigation.'],
  ['♡','Our saved places','Save favorites and new finds by city or destination. Copy a list to share with one another. Saved places remain on this device; cloud syncing is not enabled yet.'],
  ['◐','Make it comfortable','Pick Follow System, Light, Dark, or Ultra Dark in Settings. Your device remembers the choice.'],
  ['↓','Install the app','Use the Download page for the supported web and device app options; installation prompts are hidden when the web app is installed.']
 ];
 let opener=null,modal=null;
 function get(k){try{return localStorage.getItem(k)}catch(e){return null}}
 function put(k,v){try{localStorage.setItem(k,v)}catch(e){}}
 function setup(){
  if(document.getElementById('nibbleUpdatesOverlay'))return;
  const settings=document.querySelector('#nibbleSettingsOverlay .nibble-settings-body');
  if(!settings)return;
  const entry=document.createElement('section');entry.className='nibble-updates-entry';entry.innerHTML='<div><strong>✨ What’s New</strong><p>Discover what NibbleSpot can do and review the latest improvements.</p></div><button type="button" class="nibble-updates-link">View Updates ↗</button>';
  settings.append(entry);
  const overlay=document.createElement('div');overlay.id='nibbleUpdatesOverlay';overlay.className='nibble-updates-overlay';overlay.hidden=true;
  overlay.innerHTML='<section class="nibble-updates-panel" role="dialog" aria-modal="true" aria-labelledby="nibbleUpdatesTitle" aria-describedby="nibbleUpdatesDesc">'+
  '<div class="nibble-updates-head"><div><span class="nibble-settings-eyebrow">OUR TABLE, YOUR LITTLE ADVENTURES ♡</span><h2 id="nibbleUpdatesTitle">Welcome to NibbleSpot</h2><p id="nibbleUpdatesDesc">Here’s what’s new, and everything you can do together.</p></div><button type="button" id="nibbleUpdatesClose" class="nibble-settings-close" aria-label="Close updates">✕</button></div>'+
  '<div class="nibble-updates-release"><span>✨ OCTOBER 24, 2026 UPDATE</span><strong>Better restaurant adventures, together</strong><p>New search suggestions, precise location searching, AI-assisted discovery, Apple Maps, and comfortable display themes.</p></div>'+
  '<div class="nibble-updates-features">'+features.map(([icon,title,description])=>'<div class="nibble-updates-feature"><span aria-hidden="true">'+icon+'</span><div><strong>'+title+'</strong><p>'+description+'</p></div></div>').join('')+'</div>'+
  '<label class="nibble-updates-optout"><input type="checkbox" id="nibbleUpdatesDontShow"> <span>Don’t show future update pop-ups automatically</span></label>'+
  '<button type="button" class="nibble-updates-confirm" id="nibbleUpdatesConfirm">Got it! Let’s find somewhere lovely ♡</button></section>';
  document.body.append(overlay);modal=overlay;
  const closeButton=overlay.querySelector('#nibbleUpdatesClose'),confirmButton=overlay.querySelector('#nibbleUpdatesConfirm'),optout=overlay.querySelector('#nibbleUpdatesDontShow');
  function open(){opener=document.activeElement;const settingsOverlay=document.getElementById('nibbleSettingsOverlay');if(settingsOverlay&&!settingsOverlay.hidden){settingsOverlay.hidden=true;document.body.classList.remove('nibble-settings-open')}optout.checked=get(DISABLE)==='1';overlay.hidden=false;document.body.classList.add('nibble-updates-open');closeButton.focus()}
  function close(){if(overlay.hidden)return;overlay.hidden=true;document.body.classList.remove('nibble-updates-open');const target=opener?.isConnected?opener:document.getElementById('nibbleSettingsBtn');if(target&&target.focus)target.focus()}
  function acknowledge(){put(KEY,VERSION);put(DISABLE,optout.checked?'1':'0');close()}
  entry.querySelector('button').addEventListener('click',open);
  closeButton.addEventListener('click',close);confirmButton.addEventListener('click',acknowledge);
  overlay.addEventListener('click',e=>{if(e.target===overlay)close()});
  overlay.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close()}if(e.key!=='Tab')return;const focus=[closeButton,optout,confirmButton];const i=focus.indexOf(document.activeElement);if(e.shiftKey&&i===0){e.preventDefault();confirmButton.focus()}else if(!e.shiftKey&&i===focus.length-1){e.preventDefault();closeButton.focus()}});
  window.NibbleSpotUpdates={open,acknowledge};
  if(get(DISABLE)!=='1'&&get(KEY)!==VERSION)window.setTimeout(()=>{if(!overlay.hidden||!document.getElementById('nibbleSettingsOverlay')?.hidden)return;open()},850);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
})();
