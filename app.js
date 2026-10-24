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
function getAppleMapsUrl(name,address,location,lat,lon) {
 const parts=[name,address,location].filter(Boolean).join(', ');
 const params=new URLSearchParams({q:parts});
 if(Number.isFinite(Number(lat)) && Number.isFinite(Number(lon)) && lat!==undefined && lon!==undefined && lat!==null && lon!==null) params.set('ll',Number(lat)+','+Number(lon));
 return 'https://maps.apple.com/?'+params.toString();
}
function openAppleMapsSearch(){
 const {q,city}=getSearchParts();
 const what=[q||'restaurants',city].filter(Boolean).join(' in ');
 window.open('https://maps.apple.com/?q='+encodeURIComponent(what),'_blank','noopener,noreferrer');
}
function autoCapitalizeWords(value){
 return String(value||'').replace(/(^|[\s\-\/])(\p{L})/gu,(match,sep,letter)=>sep+letter.toLocaleUpperCase())
  .replace(/\b(Fl|Ca|Ny|Tx|Ga|Il|Nj|Nv|Usa|Uk|Dc)\b/g,part=>part.toUpperCase());
}
function capitalizeField(input){
 if(!input || !input.value) return;
 const before=input.value,after=autoCapitalizeWords(before);
 if(before!==after)input.value=after;
}

function getOpenTableUrl(name,location) {return 'https://www.opentable.com/s?term='+encodeURIComponent(name+' '+location)}
function setMessage(message,isError=false){ searchInfo.textContent=message;searchInfo.style.color=isError?'#a13e33':''; }
function setBusy(flag){loading=flag; const b=byId('regularSearchBtn');if(b){b.disabled=flag;b.textContent=flag?'Searching…':'⌕ Find restaurants'} const ai=byId('aiSearchBtn');if(ai){ai.disabled=flag;ai.textContent=flag?'Finding places…':'✦ AI Search'} }
/* Accessible, Google-style location autocomplete.
   Only requests location text (never GPS) after a short typing pause. */
let suggestedLocations=[],locationOptionIndex=-1,locationSuggestTimer=null;
let locationRequestSequence=0,locationFetchController=null,selectedLocation=null;
const locationInput=byId('cityInput'),locationField=byId('locationField'),locationMenu=byId('locationSuggestions');
function selectedLocationCoords(city){
 return selectedLocation && selectedLocation.label.toLocaleLowerCase()===String(city).trim().toLocaleLowerCase()
  ? {lat:selectedLocation.lat,lon:selectedLocation.lon}:null;
}
function hideLocationSuggestions(){
 clearTimeout(locationSuggestTimer);
 locationRequestSequence++;
 if(locationFetchController){locationFetchController.abort();locationFetchController=null;}
 locationMenu.hidden=true;
 locationInput.setAttribute('aria-expanded','false');
 locationInput.removeAttribute('aria-activedescendant');
 locationOptionIndex=-1;
}
function setActiveLocationOption(index){
 const buttons=locationMenu.querySelectorAll('[role="option"]');
 if(!buttons.length)return;
 locationOptionIndex=Math.max(0,Math.min(index,buttons.length-1));
 buttons.forEach((button,i)=>{
   const active=i===locationOptionIndex;
   button.classList.toggle('active',active);
   button.setAttribute('aria-selected',active?'true':'false');
   if(active){locationInput.setAttribute('aria-activedescendant',button.id);button.scrollIntoView({block:'nearest'});}
 });
}
function showLocationStatus(message){
 suggestedLocations=[];locationOptionIndex=-1;
 locationMenu.replaceChildren();
 const status=document.createElement('div');status.className='location-status';status.setAttribute('role','status');status.textContent=message;
 locationMenu.append(status);locationMenu.hidden=false;locationInput.setAttribute('aria-expanded','true');
 locationInput.removeAttribute('aria-activedescendant');
}
function chooseLocation(place){
 if(!place)return;
 clearTimeout(locationSuggestTimer);
 locationRequestSequence++;
 if(locationFetchController){locationFetchController.abort();locationFetchController=null;}
 locationInput.value=place.label;
 selectedLocation={label:place.label,lat:place.lat,lon:place.lon};
 hideLocationSuggestions();
 const {q,city}=getSearchParts();
 searchRestaurants(city,q,selectedLocationCoords(city));
}
function paintLocationSuggestions(places,message){
 suggestedLocations=Array.isArray(places)?places:[];
 locationMenu.replaceChildren();
 locationOptionIndex=-1;
 locationInput.removeAttribute('aria-activedescendant');
 if(!suggestedLocations.length){
   showLocationStatus(message||'No close matches. You can still type a city and press Enter.');
   return;
 }
 const title=document.createElement('div');title.className='location-header';title.textContent='SUGGESTED LOCATIONS';
 locationMenu.append(title);
 suggestedLocations.forEach((place,index)=>{
   const button=document.createElement('button');
   button.type='button';button.id='location-option-'+index;
   button.className='location-option';
   button.setAttribute('role','option');button.setAttribute('aria-selected','false');
   const pin=document.createElement('span');pin.className='location-pin';pin.textContent='⌖';pin.setAttribute('aria-hidden','true');
   const info=document.createElement('span');info.className='location-option-text';
   const name=document.createElement('strong');name.textContent=place.label;
   const details=document.createElement('small');details.textContent=place.detail||place.kind||'Location';
   info.append(name,details);button.append(pin,info);
   button.addEventListener('pointerdown',event=>event.preventDefault());
   button.addEventListener('click',()=>chooseLocation(place));
   locationMenu.append(button);
 });
 const attribution=document.createElement('div');attribution.className='location-attribution';
 attribution.textContent='Places from OpenStreetMap · Select one to explore nearby restaurants';
 locationMenu.append(attribution);
 locationMenu.hidden=false;locationInput.setAttribute('aria-expanded','true');
}
function queueLocationSuggestions(){
 clearTimeout(locationSuggestTimer);
 locationRequestSequence++;
 const seq=locationRequestSequence;
 if(locationFetchController){locationFetchController.abort();locationFetchController=null;}
 const q=locationInput.value.trim();
 if(q.length<2){hideLocationSuggestions();return;}
 showLocationStatus('Finding places…');
 locationSuggestTimer=setTimeout(async()=>{
   const controller=new AbortController();locationFetchController=controller;
   try{
     const response=await fetch('/api/locations?q='+encodeURIComponent(q),{signal:controller.signal,headers:{Accept:'application/json'}});
     if(!response.ok)throw new Error('Location search is unavailable');
     const data=await response.json();
     if(seq!==locationRequestSequence||document.activeElement!==locationInput)return;
     paintLocationSuggestions(data.suggestions,data.message);
   }catch(error){
     if(error.name==='AbortError'||seq!==locationRequestSequence)return;
     showLocationStatus('Suggestions are temporarily unavailable. Press Enter to search this location.');
   }finally{if(locationFetchController===controller)locationFetchController=null;}
 },330);
}
locationInput.addEventListener('input',()=>{
 selectedLocation=null;
 queueLocationSuggestions();
});
locationInput.addEventListener('focus',()=>{
 if(locationInput.value.trim().length>=2)queueLocationSuggestions();
});
locationInput.addEventListener('keydown',event=>{
 const optionsOpen=!locationMenu.hidden&&suggestedLocations.length>0;
 if(event.key==='ArrowDown'&&optionsOpen){
   event.preventDefault();setActiveLocationOption(locationOptionIndex<0?0:locationOptionIndex+1);
 }else if(event.key==='ArrowUp'&&optionsOpen){
   event.preventDefault();setActiveLocationOption(locationOptionIndex<0?suggestedLocations.length-1:locationOptionIndex-1);
 }else if(event.key==='Escape'){
   hideLocationSuggestions();
 }else if(event.key==='Enter'){
   event.preventDefault();
   if(optionsOpen)chooseLocation(suggestedLocations[locationOptionIndex<0?0:locationOptionIndex]);
   else runAiSmartSearch();
 }
});
document.addEventListener('pointerdown',event=>{if(!locationField.contains(event.target))hideLocationSuggestions();});
function getSearchParts() {
  capitalizeField(byId('cityInput'));
  capitalizeField(byId('aiSearchInput'));
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
  currentLoc=autoCapitalizeWords(clean(loc))||currentLoc;
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
    currentLoc=autoCapitalizeWords(data.location||currentLoc);
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
function runAiSmartSearch(){const {q,city}=getSearchParts();hideLocationSuggestions();return searchRestaurants(city,q,selectedLocationCoords(city));}
function runAiIntentSearch(){const {q,city}=getSearchParts();hideLocationSuggestions();if(!q){byId('aiSearchInput').focus();setMessage('Try something like “cozy Italian dinner under $30” to use AI search.');return}return searchRestaurants(city,q,selectedLocationCoords(city),true);}
function useMyLocation(){
 const button=byId('geoBtn');
 if(!navigator.geolocation){alert('Location access is not available in this browser.');return}
 button.disabled=true;button.textContent='Locating…';
 navigator.geolocation.getCurrentPosition(pos=>{
   button.disabled=false;button.textContent='⌖ Near me';
   const {q}=getSearchParts();nextCoords={lat:pos.coords.latitude,lon:pos.coords.longitude};
   hideLocationSuggestions();selectedLocation=null;byId('cityInput').value='Near me';searchRestaurants('Near me',q,nextCoords);
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
   const appleUrl=getAppleMapsUrl(spot.name,spot.address,spot.location,spot.lat,spot.lon);
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
   '<a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer" class="link-btn btn-google" aria-label="Open '+esc(spot.name)+' in Google Maps">🗺️ Google Maps</a>'+
   '<a href="'+esc(appleUrl)+'" target="_blank" rel="noopener noreferrer" class="link-btn btn-apple" aria-label="Open '+esc(spot.name)+' in Apple Maps">🍎 Apple Maps</a></div>'+
   '<div class="action-row"><a href="'+esc(spot.website?safeUrl(spot.website):'https://www.google.com/search?q='+encodeURIComponent(spot.name+' '+spot.location+' menu'))+'" target="_blank" rel="noopener noreferrer" class="link-btn btn-menu">↗ '+(spot.website?'Website':'Menu lookup')+'</a>'+
   '<a href="'+esc(getOpenTableUrl(spot.name,spot.location))+'" target="_blank" rel="noopener noreferrer" class="link-btn btn-opentable">♡ Find tables</a></div></div></div>'+
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
   const apple=document.createElement('a');apple.href=getAppleMapsUrl(spot.name,spot.address,spot.location,spot.lat,spot.lon);apple.target='_blank';apple.rel='noopener noreferrer';apple.textContent='Apple Maps ↗';apple.style.cssText=map.style.cssText;
   const book=document.createElement('a');book.href=getOpenTableUrl(spot.name,spot.location);book.target='_blank';book.rel='noopener noreferrer';book.textContent='Find tables ↗';book.style.cssText=map.style.cssText;
   links.append(map,apple,book);info.append(links);
   const remove=document.createElement('button');remove.className='remove-btn';remove.textContent='✕';remove.setAttribute('aria-label','Remove '+spot.name);remove.onclick=()=>toggleSave(spot.id);
   li.append(info,remove);return li;
 }));
}
function openAddSpotModal(){byId('addSpotModal').classList.add('active');byId('newSpotLocation').value=byId('cityInput').value||currentLoc;byId('newSpotName').focus()}
function closeAddSpotModal(){byId('addSpotModal').classList.remove('active')}
function saveCustomSpot(){
 ['newSpotName','newSpotLocation','newSpotCuisine','newSpotAddress'].forEach(id=>capitalizeField(byId(id)));
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
['cityInput','aiSearchInput','newSpotName','newSpotLocation','newSpotCuisine','newSpotAddress'].forEach(id=>{
 const input=byId(id);
 if(input){input.setAttribute('autocapitalize','words');input.addEventListener('blur',()=>capitalizeField(input));}
});
byId('aiSearchInput').addEventListener('keydown',e=>{if(e.key==='Enter')runAiSmartSearch()});

if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));
renderSaved();
searchRestaurants('Hollywood, FL','');
