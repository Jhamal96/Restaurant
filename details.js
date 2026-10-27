/* Interactive restaurant information — real OSM records, never invented hours or ratings. */
(function () {
 'use strict';
 const modal=document.getElementById('restaurantDetailsModal');
 const content=document.getElementById('restaurantDetailContent');
 const title=document.getElementById('detailTitle');
 const subtitle=document.getElementById('detailSubtitle');
 const status=document.getElementById('detailLiveStatus');
 const saveBtn=document.getElementById('detailSaveBtn');
 const shareBtn=document.getElementById('detailShareBtn');
 const directionsBtn=document.getElementById('detailDirectionsBtn');
 let spot=null,tab='overview',openedBy=null,previousOverflow='',activeRequest=0,controller=null,loadingDetails=false;
 const validNum=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
 const showOr=(value,fallback='Not listed')=>String(value||'').trim()?esc(value):'<span class="detail-not-listed">'+esc(fallback)+'</span>';
 const safeLink=v=>{const val=safeUrl(v);return val==='#'?'':val};
 const attr=v=>esc(String(v));
 const item=(label,body,wide=false)=>'<div class="restaurant-detail-item'+(wide?' wide':'')+'"><label>'+esc(label)+'</label><div class="detail-value">'+body+'</div></div>';
 const mapped=()=>spot&&validNum(spot.lat)&&validNum(spot.lon);
 function mapHref(){
   if(!spot)return 'https://www.google.com/maps';
   return spot.provider==='Google Places'&&safeLink(spot.googleMapsUrl)
     ?safeLink(spot.googleMapsUrl):getGoogleMapsUrl(spot.name,spot.address,spot.location);
 }
 function appleHref(){
   return spot?getAppleMapsUrl(spot.name,spot.address,spot.location,spot.lat,spot.lon):'https://maps.apple.com/';
 }
 function directionsHref(){
   return spot?('https://www.google.com/maps/dir/?api=1&destination='+
    encodeURIComponent(mapped()?String(spot.lat)+','+String(spot.lon):[spot.name,spot.address,spot.location].filter(Boolean).join(', ')))
    :'https://www.google.com/maps';
 }
 function textSearch(suffix){
   return 'https://www.google.com/search?q='+encodeURIComponent([spot.name,spot.location,suffix].filter(Boolean).join(' '));
 }
 function getSource(){
   if(!spot)return '';
   if(spot.provider==='Google Places')return '';
   const m=/^osm-(node|way|relation|N|W|R)-(\d{1,18})$/.exec(String(spot.id));
   if(!m)return '';
   return 'https://www.openstreetmap.org/'+({N:'node',W:'way',R:'relation'}[m[1]]||m[1])+'/'+m[2];
 }
 function saved(){return !!spot&&savedSpots.some(s=>String(s.id)===String(spot.id));}
 function saveState(){
   saveBtn.hidden=!spot||spot.provider==='Google Places';
   saveBtn.textContent=saved()?'♥ Saved — remove':'♡ Save place';
   saveBtn.setAttribute('aria-pressed',String(saved()));
 }
 function overview(){
   const cuisine=spot.cuisine&&spot.cuisine!=='Restaurant'?spot.cuisine:'Restaurant';
   const chips=[cuisine,...(spot.amenities||[]),...(spot.tags||[]).filter(t=>t!==cuisine)]
     .filter(Boolean).filter((v,i,arr)=>arr.indexOf(v)===i).slice(0,12);
   let html='<h3 class="restaurant-detail-section-label">About this place</h3>';
   if(loadingDetails)html+='<p class="restaurant-detail-loading">Checking for additional verified restaurant information…</p>';
   html+='<div class="restaurant-detail-pills">'+chips.map(x=>'<span>'+esc(x)+'</span>').join('')+'</div>';
   html+='<div class="restaurant-detail-grid">'+
     item('Address',showOr(spot.address||spot.location),true)+
     item('Cuisine',showOr(spot.cuisine))+
     item('Hours',showOr(spot.hours,'Hours not listed'))+
     item('Phone',spot.phone?'<a href="tel:'+attr(String(spot.phone).replace(/[^\d+]/g,''))+'">'+esc(spot.phone)+'</a>':showOr(''))+
     item('Website',safeLink(spot.website)?'<a href="'+attr(safeLink(spot.website))+'" target="_blank" rel="noopener noreferrer">Visit restaurant website ↗</a>':showOr(''))+
     (spot.description?item('Description',esc(spot.description),true):'')+
     (spot.rating!==null&&spot.rating!==undefined&&spot.provider==='Google Places'
       ?item('Google rating',esc(String(spot.rating))+' / 5'+(spot.ratingCount?' · '+esc(String(spot.ratingCount))+' reviews':'')):'')+
     '</div>';
   html+='<div class="restaurant-detail-research">Details are provided by '+(spot.provider==='Google Places'?'Google Places':'OpenStreetMap')+
     ' and may be incomplete or out of date. No unverified prices, ratings, hours, or menus are added. '+
     '<a href="'+attr(mapHref())+'" target="_blank" rel="noopener noreferrer">Check latest details in Google Maps ↗</a></div>';
   return html;
 }
 function contact(){
   const menu=safeLink(spot.menuUrl)||textSearch('menu');
   const phone=String(spot.phone||'').replace(/[^\d+]/g,'');
   const phoneHtml=phone?'<a href="tel:'+attr(phone)+'">'+esc(spot.phone)+'</a>':showOr('', 'Phone number not listed');
   const site=safeLink(spot.website);
   const email=String(spot.email||'');
   const emailHtml=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)?'<a href="mailto:'+attr(email)+'">'+esc(email)+'</a>':showOr('');
   return '<h3 class="restaurant-detail-section-label">Hours & contact</h3>'+
     '<div class="restaurant-detail-grid">'+
       item('Opening hours',spot.hours?'<span class="restaurant-detail-hours">'+esc(spot.hours)+'</span>':showOr('','Hours not listed'),true)+
       item('Call restaurant',phoneHtml)+
       item('Official website',site?'<a href="'+attr(site)+'" target="_blank" rel="noopener noreferrer">Open website ↗</a>':showOr(''))+
       item('Email',emailHtml)+
       item('Menu', '<a href="'+attr(menu)+'" target="_blank" rel="noopener noreferrer">'+(safeLink(spot.menuUrl)?'Restaurant menu ↗':'Search for current menu ↗')+'</a>')+
       (spot.operator?item('Operated by',esc(spot.operator),true):'')+
       '</div><p class="restaurant-detail-research">Opening hours are published listing data, not live open/closed status. Call the restaurant to confirm hours or reservations.</p>';
 }
 function map(){
   const google=mapHref(),apple=appleHref(),directions=directionsHref();
   let html='<h3 class="restaurant-detail-section-label">Find your way there</h3>';
   if(mapped()){
     const lat=Number(spot.lat),lon=Number(spot.lon),delta=.006;
     const bounds=[lon-delta,lat-delta,lon+delta,lat+delta].map(n=>n.toFixed(5)).join(',');
     const src='https://www.openstreetmap.org/export/embed.html?bbox='+encodeURIComponent(bounds)+
       '&layer=mapnik&marker='+encodeURIComponent(lat+','+lon);
     html+='<div class="restaurant-detail-map"><iframe loading="lazy" title="Street map around '+attr(spot.name)+'" src="'+attr(src)+'" referrerpolicy="strict-origin-when-cross-origin"></iframe></div>';
   }else{
     html+='<div class="restaurant-detail-item wide">Map coordinates are not listed for this restaurant. Open Google Maps to find its location.</div>';
   }
   html+='<p class="restaurant-detail-research">📍 '+esc(spot.address||spot.location||'Location not listed')+
     '. Map markers reflect the listing coordinates, not a verified entrance.</p>'+
     '<div class="restaurant-map-links">'+
     '<a class="btn btn-google-search" href="'+attr(google)+'" target="_blank" rel="noopener noreferrer">🗺️ Google Maps</a>'+
     '<a class="btn" href="'+attr(apple)+'" target="_blank" rel="noopener noreferrer">🍎 Apple Maps</a>'+
     '<a class="btn" href="'+attr(directions)+'" target="_blank" rel="noopener noreferrer">↗ Directions</a></div>';
   const source=getSource();
   if(source)html+='<p class="restaurant-detail-research">Map data © OpenStreetMap contributors · <a href="'+attr(source)+'" target="_blank" rel="noopener noreferrer">View source listing ↗</a></p>';
   return html;
 }
 function render(){
   if(!spot)return;
   title.textContent=spot.name||'Restaurant';
   subtitle.textContent=[spot.cuisine&&spot.cuisine!=='Restaurant'?spot.cuisine:null,spot.address||spot.location,''].filter(Boolean).slice(0,2).join(' · ');
   directionsBtn.href=directionsHref();
   modal.querySelectorAll('[data-detail-tab]').forEach(button=>{
     const selected=button.dataset.detailTab===tab;
     button.setAttribute('aria-selected',String(selected));
     button.tabIndex=selected?0:-1;
   });
   content.innerHTML=tab==='contact'?contact():tab==='map'?map():overview();
   saveState();
 }
 function mergeDetails(details){
   if(!details||!spot)return;
   // Only enrich fields that the details provider actually has.
   for(const field of ['address','phone','hours','website','cuisine','description','menuUrl','email','operator','googleMapsUrl']){
     if(typeof details[field]==='string'&&details[field].trim())spot[field]=details[field];
   }
   if(Array.isArray(details.amenities))spot.amenities=details.amenities.filter(x=>typeof x==='string').slice(0,12);
   if(spot.provider==='Google Places'){
     if(validNum(details.rating))spot.rating=Number(details.rating);
     if(validNum(details.ratingCount))spot.ratingCount=Number(details.ratingCount);
   }
 }
 async function loadDetails(){
   if(!spot||!String(spot.id||'').match(/^(?:osm|google)-/))return;
   const id=String(spot.id);
   const seq=++activeRequest;controller?.abort();
   const localController=new AbortController();controller=localController;loadingDetails=true;render();
   try{
     const response=await fetch('/api/restaurant-details?id='+encodeURIComponent(id),{
       signal:localController.signal,headers:{Accept:'application/json'}
     });
     if(!response.ok)throw Error('Restaurant details temporarily unavailable');
     const data=await response.json();
     if(seq!==activeRequest||modal.hidden||id!==String(spot?.id))return;
     mergeDetails(data.details);
     // The detail sheet still works if the provider lacks more metadata.
     status.textContent=data.details?'Restaurant details loaded from '+(spot.provider==='Google Places'?'Google Places.':'OpenStreetMap.'):'Some extra details are unavailable; map links are still available.';
   }catch(e){
     if(e.name!=='AbortError'&&seq===activeRequest)status.textContent='Additional details could not be loaded. You can still use the map and contact links.';
   }finally{
     if(seq===activeRequest){loadingDetails=false;render();}
     if(controller===localController)controller=null;
   }
 }
 function open(target,initiator){
   if(!target)return;
   activeRequest++;controller?.abort();controller=null;
   openedBy=initiator||document.activeElement;
   previousOverflow=document.body.style.overflow;
   // Use a copy: enrichment shouldn't mutate previously saved data or older cached results.
   spot={...target,amenities:[...(target.amenities||[])],tags:[...(target.tags||[])]};
   tab='overview';loadingDetails=false;status.textContent='';
   modal.hidden=false;modal.classList.add('active');document.body.style.overflow='hidden';
   render();document.getElementById('closeRestaurantDetails').focus();
   loadDetails();
 }
 function close(){
   if(modal.hidden)return;
   activeRequest++;controller?.abort();controller=null;
   modal.hidden=true;modal.classList.remove('active');
   document.body.style.overflow=previousOverflow;
   spot=null;loadingDetails=false;
   const target=openedBy;openedBy=null;
   if(target?.isConnected)target.focus();else document.getElementById('regularSearchBtn')?.focus();
 }
 function openById(id,initiator){
   const hit=(currentResults||[]).find(x=>String(x.id)===String(id))||
     (savedSpots||[]).find(x=>String(x.id)===String(id));
   if(hit)open(hit,initiator);
 }
 document.getElementById('closeRestaurantDetails').addEventListener('click',close);
 modal.addEventListener('pointerdown',e=>{if(e.target===modal)close();});
 modal.addEventListener('keydown',e=>{
   if(e.key==='Escape'){e.preventDefault();close();return}
   const tabs=[...modal.querySelectorAll('[data-detail-tab]')];
   if((e.key==='ArrowRight'||e.key==='ArrowLeft')&&tabs.includes(document.activeElement)){
     e.preventDefault();const idx=tabs.indexOf(document.activeElement);
     const next=tabs[(idx+(e.key==='ArrowRight'?1:tabs.length-1))%tabs.length];
     tab=next.dataset.detailTab;render();next.focus();return;
   }
   if(e.key==='Tab'){
     const focusables=[...modal.querySelectorAll('button:not([hidden]):not([disabled]):not([tabindex="-1"]),a[href]:not([hidden])')]
       .filter(el=>el.getClientRects().length>0);
     if(!focusables.length)return;
     if(e.shiftKey&&document.activeElement===focusables[0]){
       e.preventDefault();focusables[focusables.length-1].focus();
     }else if(!e.shiftKey&&document.activeElement===focusables[focusables.length-1]){
       e.preventDefault();focusables[0].focus();
     }
   }
 });
 modal.querySelectorAll('[data-detail-tab]').forEach(btn=>btn.addEventListener('click',()=>{
   tab=btn.dataset.detailTab;render();
 }));
 saveBtn.addEventListener('click',()=>{
   if(!spot||spot.provider==='Google Places')return;
   const id=String(spot.id);
   const exists=savedSpots.findIndex(x=>String(x.id)===id);
   if(exists<0)savedSpots.push({...spot});
   else savedSpots.splice(exists,1);
   storeSaved();saveState();
   status.textContent=exists<0?'Added to your saved restaurants.':'Removed from saved restaurants.';
 });
 shareBtn.addEventListener('click',async()=>{
   if(!spot)return;
   const text=[spot.name,spot.address||spot.location,mapHref()].filter(Boolean).join('\n');
   try{
     if(navigator.share)await navigator.share({title:spot.name,text,url:mapHref()});
     else if(navigator.clipboard){await navigator.clipboard.writeText(text);status.textContent='Restaurant details copied to clipboard.';}
     else window.prompt('Copy restaurant details',text);
   }catch(e){if(e.name!=='AbortError')status.textContent='Unable to share right now.';}
 });
 // Use the existing Android APK's external navigation handler for map links.
 modal.addEventListener('click',e=>{
   const link=e.target.closest?.('a[href][target="_blank"]');
   if(!link||!/Android/i.test(navigator.userAgent)||!/(?:;\s*wv[);]|NibbleSpotAndroidApp)/i.test(navigator.userAgent))return;
   const href=link.href;if(!/^https:\/\//i.test(href))return;
   e.preventDefault();window.location.assign(href);
 });
 window.showRestaurantDetails=openById;
 window.showRestaurantDetailsSpot=open;
})();