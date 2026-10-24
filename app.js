/* NibbleSpot — real restaurant finder. Saved items keep the existing nibble_saved key. */
const byId = id => document.getElementById(id);
const clean = v => String(v == null ? '' : v).replace(/[<>"'`\\]/g, '').replace(/[\x00-\x1f]/g, '').trim().slice(0,220);
const esc = v => String(v == null ? '' : v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const safeUrl = v => { try { const u = new URL(v); return /^https?:$/.test(u.protocol) ? u.href : '#'; } catch { return '#'; } };
let savedSpots = [];
try { const data = JSON.parse(localStorage.getItem('nibble_saved') || '[]'); if(Array.isArray(data)) savedSpots=data; } catch {}
let currentResults=[], filteredResults=[], visibleCount=8, activeTab='All', currentFilter='all', currentSearchKeyword='', currentLoc='Hollywood, FL', nextCoords=null, requestNum=0, loading=false, installPrompt=null;
const searchInfo = byId('aiSummaryBox');
function getGoogleMapsUrl(name,address,location) {return 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent([name,address,location].filter(Boolean).join(', '))}
function getAppleMapsUrl(name,address,location) {return 'https://maps.apple.com/?q='+encodeURIComponent([name,address,location].filter(Boolean).join(', '))}
function getOpenTableUrl(name,location) {return 'https://www.opentable.com/s?term='+encodeURIComponent(name+' '+location)}
function setMessage(message,isError=false){ searchInfo.textContent=message;searchInfo.style.color=isError?'#a13e33':''; }
function setBusy(flag){loading=flag; const b=byId('regularSearchBtn');if(b){b.disabled=flag;b.textContent=flag?'Searching…':'⌕ Find restaurants'} const ai=byId('aiSearchBtn');if(ai){ai.disabled=flag;ai.textContent=flag?'Finding places…':'✦ AI Search'} }
function getSearchParts() {
  let q=byId('aiSearchInput').value.trim(), city=byId('cityInput').value.trim()||currentLoc;
  const m=q.match(/^(.*?)\s+in\s+(.+)$/i);
  if(m){q=m[1].trim();city=m[2].trim();}
  return {q,city};
}
function updateStats(){
  byId('statLoc').textContent=currentLoc;byId('currentLoc').textContent=currentLoc;
  byId('statCount').textContent=String(filteredResults.length);
  if(byId('savedTotal'))byId('savedTotal').textContent=String(savedSpots.length);
}
async function apiRequest(url, options, timeout=32000) {
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeout);
  try {
    const response=await fetch(url,{...options,signal:controller.signal,headers:{Accept:'application/json',...(options?.headers||{})}});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||'Restaurant search is temporarily unavailable.');
    return data;
  } finally {clearTimeout(timer);}
}
async function searchRestaurants(loc=currentLoc,keyword='',coords=null,ai=false){
  const requestId=++requestNum;
  currentLoc=clean(loc)||currentLoc;
  currentSearchKeyword=keyword.trim();
  byId('cityInput').value=currentLoc;
  updateStats();
  setBusy(true);
  setMessage('Finding real restaurants around '+currentLoc+'…');
  byId('resultsContainer').innerHTML='<div class="empty-state">⌕ Searching OpenStreetMap restaurant listings…</div>';
  try {
    const path=ai?'/api/ai-search':'/api/search';
    const params={location:currentLoc,q:currentSearchKeyword};
    if(coords && Number.isFinite(coords.lat)&&Number.isFinite(coords.lon)){params.lat=coords.lat;params.lon=coords.lon;}
    const data=ai?await apiRequest(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(params)},36000):await apiRequest(path+'?'+new URLSearchParams(params));
    if(requestId!==requestNum)return;
    currentResults=Array.isArray(data.results)?data.results:[];
    currentLoc=data.location||currentLoc;
    byId('cityInput').value=currentLoc;
    setMessage(data.message || (currentResults.length?'Actual restaurant listings from OpenStreetMap. Verify hours and details before visiting.':'No listings returned. Try a nearby city or broader cuisine.'));
    if(data.aiNote && ai) setMessage(data.aiNote+' '+(data.message||''),false);
    applyCurrentFilter();
  }catch(error){
    if(requestId!==requestNum)return;
    currentResults=[];
    applyCurrentFilter();
    setMessage((error.name==='AbortError'?'The restaurant service took too long. Please retry.':error.message)+' Your saved places are safe.',true);
  }finally{if(requestId===requestNum)setBusy(false)}
}
function runAiSmartSearch(){const {q,city}=getSearchParts();nextCoords=null;return searchRestaurants(city,q);}
function runAiIntentSearch(){const {q,city}=getSearchParts();if(!q){byId('aiSearchInput').focus();setMessage('Try something like “cozy Italian dinner under $30” to use AI search.');return}nextCoords=null;return searchRestaurants(city,q,null,true);}
function useMyLocation(){
 const button=byId('geoBtn');
 if(!navigator.geolocation){alert('Location access is not available in this browser.');return}
 button.disabled=true;button.textContent='Locating…';
 navigator.geolocation.getCurrentPosition(pos=>{
   button.disabled=false;button.textContent='⌖ Near me';
   const {q}=getSearchParts();nextCoords={lat:pos.coords.latitude,lon:pos.coords.longitude};
   byId('cityInput').value='Near me';searchRestaurants('Near me',q,nextCoords);
 },()=>{button.disabled=false;button.textContent='⌖ Near me';alert('Allow location access in your browser to search nearby, or enter a city instead.');},{timeout:11000,maximumAge:120000});
}
function filterMatch(s) {
 const text=[s.name,s.cuisine,...(s.tags||[])].join(' ').toLowerCase();
 if(currentFilter==='all')return true;
 if(currentFilter==='budget')return s.price && s.price.length<=2;
 if(currentFilter==='high-rating')return s.rating!=null && Number(s.rating)>=4.7;
 return text.includes(currentFilter)||(currentFilter==='tacos'&&/mexican|taco/i.test(text))||(currentFilter==='cafe'&&/coffee|breakfast|brunch/i.test(text));
}
function setFilter(el,value){
 document.querySelectorAll('.filter-chip').forEach(node=>node.classList.remove('active'));
 el.classList.add('active');currentFilter=value;applyCurrentFilter();
}
function applyCurrentFilter(){filteredResults=currentResults.filter(filterMatch);visibleCount=8;updateStats();renderResults();}
function loadMore(){visibleCount+=8;renderResults()}
function renderResults(){
 const container=byId('resultsContainer'),more=byId('loadMoreBtn');
 if(!filteredResults.length){
   container.innerHTML='<div class="empty-state"><div><div style="font-size:28px">🍽️</div><strong>No matching restaurants yet</strong><p style="font-size:12px;margin:12px 0">Try a different city, a broader cuisine, or reset the filter. Our information comes from OpenStreetMap, so coverage may vary.</p><button class="btn btn-ai" onclick="document.querySelector(\'.filter-chip\').click()">All restaurants</button></div></div>';more.style.display='none';return;
 }
 container.innerHTML=filteredResults.slice(0,visibleCount).map(spot=>{
   const id=String(spot.id),saved=savedSpots.some(s=>String(s.id)===id);
   const url=getGoogleMapsUrl(spot.name,spot.address,spot.location);
   return '<article class="card">'+
   '<span class="card-tag">'+esc(spot.price||'Local listing')+'</span>'+
   '<div><h3>'+esc(spot.name)+'</h3><p>'+esc(spot.cuisine||'Restaurant')+(spot.rating?' · ⭐ '+esc(spot.rating):'')+'</p>'+
   '<span class="rec-score">✓ OpenStreetMap listing</span>'+
   '<div class="ai-insight-box">✦ '+esc(spot.aiInsight||'Explore this restaurant and save it for later.')+'</div>'+
   '<div class="meta-details"><div>📍 '+esc(spot.address||spot.location)+'</div>'+
   (spot.phone?'<div>☎ '+esc(spot.phone)+'</div>':'')+
   (spot.hours?'<div>🕒 '+esc(spot.hours)+'</div>':'')+
   '<div style="margin-top:6px">'+(spot.tags||[]).slice(0,3).map(t=>'<span class="badge-pill">'+esc(t)+'</span>').join('')+'</div></div>'+
   '<div class="card-actions"><div class="action-row">'+
   '<a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer" class="link-btn btn-google">📍 Directions</a>'+
   '<a href="'+esc(spot.website?safeUrl(spot.website):'https://www.google.com/search?q='+encodeURIComponent(spot.name+' '+spot.location+' menu'))+'" target="_blank" rel="noopener noreferrer" class="link-btn btn-menu">↗ '+(spot.website?'Website':'Menu lookup')+'</a></div>'+
   '<div class="action-row"><a href="'+esc(getOpenTableUrl(spot.name,spot.location))+'" target="_blank" rel="noopener noreferrer" class="link-btn btn-opentable">♡ Find reservations</a></div></div></div>'+
   '<div class="card-footer"><small>📍 '+esc(spot.location)+'</small><button class="save-btn '+(saved?'saved':'')+'" onclick="toggleSave('+JSON.stringify(id).replace(/"/g,'&quot;')+')" aria-label="'+(saved?'Remove saved restaurant':'Save restaurant')+'">'+(saved?'♥':'♡')+'</button></div></article>';
 }).join('');
 // Use element-bound IDs instead of relying on escaped inline JavaScript strings.
 container.querySelectorAll('.save-btn').forEach((btn,i)=>{btn.onclick=()=>toggleSave(String(filteredResults[i].id));});
 more.style.display=visibleCount<filteredResults.length?'inline-flex':'none';
}
function storeSaved(){try{localStorage.setItem('nibble_saved',JSON.stringify(savedSpots))}catch(e){alert('This browser could not save your places. Check its storage settings.')}renderSaved();renderResults();}
function toggleSave(id){id=String(id);const idx=savedSpots.findIndex(item=>String(item.id)===id);if(idx!==-1)savedSpots.splice(idx,1);else{const spot=currentResults.find(s=>String(s.id)===id);if(spot)savedSpots.push(spot)}storeSaved();}
function setTab(location){activeTab=location;renderSaved();}
function renderSaved(){
 byId('savedCount').textContent=String(savedSpots.length);if(byId('savedTotal'))byId('savedTotal').textContent=String(savedSpots.length);
 const tabs=byId('tabsContainer'),container=byId('savedContainer');
 if(!savedSpots.length){tabs.innerHTML='';container.innerHTML='<li class="form-help">No saved restaurants yet. Find a lovely spot and tap the heart ♡</li>';return;}
 const locations=['All',...new Set(savedSpots.map(s=>String(s.location||'Unknown')))];
 if(!locations.includes(activeTab))activeTab='All';
 tabs.replaceChildren(...locations.map(location=>{const btn=document.createElement('button');btn.className='tab-btn '+(location===activeTab?'active':'');btn.textContent=location;btn.onclick=()=>setTab(location);return btn;}));
 container.replaceChildren(...savedSpots.filter(s=>activeTab==='All'||s.location===activeTab).map(spot=>{
   const li=document.createElement('li');li.className='saved-item';
   const info=document.createElement('div');
   const name=document.createElement('strong');name.textContent=spot.name||'Unnamed restaurant';info.append(name);
   const sub=document.createElement('small');sub.style.display='block';sub.style.color='#836e60';sub.textContent=(spot.cuisine||'Restaurant')+' · '+(spot.location||'Unknown');info.append(sub);
   const links=document.createElement('div');links.style.cssText='display:flex;gap:12px;margin-top:5px;flex-wrap:wrap';
   const map=document.createElement('a');map.href=getGoogleMapsUrl(spot.name,spot.address,spot.location);map.target='_blank';map.rel='noopener noreferrer';map.textContent='Directions ↗';map.style.cssText='font-size:11px;color:#996149;font-weight:800';
   const book=document.createElement('a');book.href=getOpenTableUrl(spot.name,spot.location);book.target='_blank';book.rel='noopener noreferrer';book.textContent='Find tables ↗';book.style.cssText=map.style.cssText;
   links.append(map,book);info.append(links);
   const remove=document.createElement('button');remove.className='remove-btn';remove.textContent='✕';remove.setAttribute('aria-label','Remove '+spot.name);remove.onclick=()=>toggleSave(spot.id);
   li.append(info,remove);return li;
 }));
}
function openAddSpotModal(){byId('addSpotModal').classList.add('active');byId('newSpotLocation').value=byId('cityInput').value||currentLoc;byId('newSpotName').focus()}
function closeAddSpotModal(){byId('addSpotModal').classList.remove('active')}
function saveCustomSpot(){
 const name=clean(byId('newSpotName').value),location=clean(byId('newSpotLocation').value);
 if(!name||!location)return;
 const spot={id:'personal-'+Date.now()+'-'+Math.floor(Math.random()*100000),name,location,cuisine:clean(byId('newSpotCuisine').value)||'Our pick',address:clean(byId('newSpotAddress').value),price:'',tags:['Saved by us'],aiInsight:'One of our restaurant ideas.',menu:[]};
 savedSpots.push(spot);storeSaved();byId('customSpotForm').reset();closeAddSpotModal();byId('our-list').scrollIntoView({behavior:'smooth',block:'start'});
}
async function shareOurList(){
 if(!savedSpots.length){alert('Save a restaurant first, then share your list.');return}
 const text='Our NibbleSpot restaurant list ♡\n\n'+savedSpots.map(s=>'♡ '+s.name+' — '+s.location).join('\n')+'\n\nhttps://restaurant.ajdapp.org';
 try{if(navigator.share)await navigator.share({title:'Our restaurant list',text});else if(navigator.clipboard){await navigator.clipboard.writeText(text);alert('Saved list copied!')}else window.prompt('Copy this list',text)}catch(e){if(e.name!=='AbortError')window.prompt('Copy this list',text)}
}
function openMenuModal(id){const spot=currentResults.find(s=>s.id===id)||savedSpots.find(s=>s.id===id);if(!spot)return;byId('modalRestName').textContent=spot.name;byId('modalRestCuisine').textContent=spot.cuisine||'Restaurant';byId('menuItemsList').textContent='See the restaurant’s current menu online. This app does not invent menu items or prices.';byId('externalMenuLink').href='https://www.google.com/search?q='+encodeURIComponent(spot.name+' '+spot.location+' menu');byId('menuModal').classList.add('active')}
function closeMenuModal(){byId('menuModal').classList.remove('active')}
function openLiveSearch(){const{q,city}=getSearchParts();window.open('https://www.google.com/maps/search/?api=1&query='+encodeURIComponent([q||'restaurants',city].join(' in ')),'_blank','noopener,noreferrer')}
function openDownload(){location.href='/download'}
function installNibbleSpot(){if(installPrompt){const p=installPrompt;installPrompt=null;p.prompt();return}const ios=/iPhone|iPad|iPod/i.test(navigator.userAgent);alert(ios?'In Safari, tap Share and choose Add to Home Screen.':'Use your browser menu and choose Install app, or visit our Download page for the Android APK.')}
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;const b=byId('installAppBtn');if(b)b.hidden=false});
window.addEventListener('appinstalled',()=>{installPrompt=null;const b=byId('installAppBtn');if(b)b.hidden=true});
byId('aiSearchInput').addEventListener('keydown',e=>{if(e.key==='Enter')runAiSmartSearch()});
byId('cityInput').addEventListener('keydown',e=>{if(e.key==='Enter')runAiSmartSearch()});
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));
renderSaved();
searchRestaurants('Hollywood, FL','');
