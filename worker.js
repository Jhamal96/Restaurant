// NibbleSpot Cloudflare Worker. Deployment bundles public files into STATIC_FILES.
const STATIC_FILES = {};
const AI_USAGE = new Map();
const JSON_HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
function json(value,status=200){return new Response(JSON.stringify(value),{status,headers:JSON_HEADERS})}
function text(v,max=110){return String(v==null?'':v).trim().slice(0,max)}
function numberIn(v,min,max){const n=Number(v);return Number.isFinite(n)&&n>=min&&n<=max?n:null}
function locateKnown(location){
 const key=location.toLowerCase().replace(/\s+/g,' ').trim();
 const choices=[[/hollywood.*(fl|florida)|^hollywood$/,[26.0112,-80.1495]],[/^miami(?:,?\s*(?:fl|florida))?$/,[25.7752,-80.1992]],[/fort lauderdale/,[26.1224,-80.1373]],[/^orlando(?:,?\s*(?:fl|florida))?$/,[28.5384,-81.3789]],[/^new york(?:,?\s*(?:ny|new york))?$|^nyc$/,[40.7128,-74.006]],[/^las vegas(?:,?\s*(?:nv|nevada))?$/,[36.1699,-115.1398]],[/^tampa(?:,?\s*(?:fl|florida))?$/,[27.9506,-82.4572]],[/^atlanta(?:,?\s*(?:ga|georgia))?$/,[33.749,-84.388]],[/^chicago(?:,?\s*(?:il|illinois))?$/,[41.8781,-87.6298]],[/^los angeles(?:,?\s*(?:ca|california))?$/,[34.0522,-118.2437]],[/^san francisco(?:,?\s*(?:ca|california))?$/,[37.7749,-122.4194]],[/^paris/,[48.8566,2.3522]],[/^london/,[51.5072,-.1276]]];
 for(const [re,point] of choices){if(re.test(key))return point}return null;
}
function normalize(s){return text(s,160).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\w\s]/g,' ').replace(/\s+/g,' ').trim()}
function keywords(q){
 const clean=normalize(q).replace(/\b(cheap|affordable|budget|cozy|romantic|fancy|date|night|nice|great|good|best|top|dinner|lunch|breakfast|brunch|food|near|me|please|place|places|restaurant|restaurants|spot|spots|with|for|and|the|a|an|under|over|dollars|usd|\d+)\b/g,' ').replace(/\s+/g,' ').trim();
 return clean.split(/\s+/).filter(Boolean);
}
function matchesQuery(spot,q){
 const words=keywords(q);if(!words.length)return true;
 const all=normalize([spot.name,spot.cuisine,spot.tags?.join(' ')].join(' '));
 const aliases={taco:['taco','mexican','tex mex'],tacos:['taco','mexican','tex mex'],pizza:['pizza','italian'],sushi:['sushi','japanese'],ramen:['ramen','japanese'],brunch:['cafe','breakfast','brunch'],coffee:['cafe','coffee'],steak:['steak','steakhouse','grill'],vegan:['vegan','vegetarian'],burger:['burger','american'],burgers:['burger','american'],seafood:['seafood','fish','sushi'],italian:['italian','pizza'],chinese:['chinese'],indian:['indian'],mexican:['mexican','tacos'],bbq:['barbecue','bbq','grill']};
 return words.every(w=>(aliases[w]||[w]).some(alias=>all.includes(alias)));
}
async function apiFetch(url,opts={},ms=11000){
 const ac=new AbortController();const timer=setTimeout(()=>ac.abort(),ms);
 try {const response=await fetch(url,{...opts,signal:ac.signal,headers:{'Accept':'application/json','User-Agent':'NibbleSpot-Restaurant-Discovery/1.0 (https://restaurant.ajdapp.org)',...(opts.headers||{})}});if(!response.ok)throw Error('Upstream unavailable: '+response.status);return response.json();}
 finally {clearTimeout(timer)}
}
/* Autocomplete is sourced from Photon/OpenStreetMap, with conservative caching
   to avoid sending the public geocoder a request for every keystroke. */
const DEFAULT_PLACES=[
 {name:'Miami',region:'Florida',country:'United States',lat:25.7752,lon:-80.1992,kind:'City'},
 {name:'Hollywood',region:'Florida',country:'United States',lat:26.0112,lon:-80.1495,kind:'City'},
 {name:'Fort Lauderdale',region:'Florida',country:'United States',lat:26.1224,lon:-80.1373,kind:'City'},
 {name:'Orlando',region:'Florida',country:'United States',lat:28.5384,lon:-81.3789,kind:'City'},
 {name:'Tampa',region:'Florida',country:'United States',lat:27.9506,lon:-82.4572,kind:'City'},
 {name:'New York',region:'New York',country:'United States',lat:40.7128,lon:-74.006,kind:'City'},
 {name:'Las Vegas',region:'Nevada',country:'United States',lat:36.1699,lon:-115.1398,kind:'City'},
 {name:'Atlanta',region:'Georgia',country:'United States',lat:33.749,lon:-84.388,kind:'City'},
 {name:'Chicago',region:'Illinois',country:'United States',lat:41.8781,lon:-87.6298,kind:'City'},
 {name:'Los Angeles',region:'California',country:'United States',lat:34.0522,lon:-118.2437,kind:'City'},
 {name:'San Francisco',region:'California',country:'United States',lat:37.7749,lon:-122.4194,kind:'City'},
 {name:'Paris',region:'',country:'France',lat:48.8566,lon:2.3522,kind:'City'},
 {name:'London',region:'England',country:'United Kingdom',lat:51.5072,lon:-0.1276,kind:'City'}
];
function makePlace(name,region,country,lat,lon,kind){
 const n=text(name,100),state=text(region,100),c=text(country,100);
 const parts=[n,state,c].filter((piece,i,arr)=>piece && arr.findIndex(other=>other.toLocaleLowerCase()===piece.toLocaleLowerCase())===i);
 return {name:n,label:parts.join(', '),detail:[kind||'Location',state,c].filter(Boolean).join(' · '),
         kind:kind||'Location',lat:Number(lat),lon:Number(lon)};
}
function fallbackLocations(q){
 const key=normalize(q);
 return DEFAULT_PLACES.filter(place=>normalize([place.name,place.region,place.country].join(' ')).includes(key))
  .map(p=>makePlace(p.name,p.region,p.country,p.lat,p.lon,p.kind));
}
function convertPhotonPlace(feature){
 const p=feature?.properties||{},coord=feature?.geometry?.coordinates||[];
 if(coord.length!==2||!Number.isFinite(Number(coord[0]))||!Number.isFinite(Number(coord[1])))return null;
 const type=String(p.type||p.osm_value||'').toLowerCase();
 const address=!!p.housenumber;
 const street=String(p.street||'').trim();
 const name=text(address?[p.housenumber,street||p.name].filter(Boolean).join(' '):(p.name||street||p.postcode),100);
 if(!name)return null;
 const kind=address?'Street address':/street|highway/.test(type)?'Street':/postcode|postal/.test(type)?'ZIP / postal code':
  /country/.test(type)?'Country':/state|province|region/.test(type)?'Region':
  /district|suburb|locality|neighbou?rhood|quarter/.test(type)?'Neighborhood':/county/.test(type)?'County':/city|town|village/.test(type)?'City':'Place';
 const unique=[];
 const append=v=>{if(v&&!unique.some(item=>normalize(item)===normalize(v)))unique.push(String(v))};
 append(name);
 if(!address&&street&&kind!=='Street'&&normalize(street)!==normalize(name))append(street);
 append(p.district||p.locality);
 append(p.city);
 append(p.state);
 if(p.postcode&&kind==='Street address')append(p.postcode);
 append(p.country);
 return {name,label:unique.slice(0,6).join(', '),detail:[kind,p.city||p.district||p.locality,p.state,p.country].filter(Boolean).join(' · '),
   kind,lat:Number(coord[1]),lon:Number(coord[0])};
}
/* US ZIP codes require a dedicated postal lookup: generic name search matches
   building/street numbers worldwide and can send people to the wrong country. */
async function zipLocation(zip) {
 const z=String(zip||'').match(/^(\d{5})(?:-\d{4})?$/)?.[1];
 if(!z)return null;
 try{
   const data=await apiFetch('https://api.zippopotam.us/us/'+z,{},6500);
   const p=(data.places||[])[0];
   if(!p)return null;
   const lat=numberIn(p.latitude,-90,90),lon=numberIn(p.longitude,-180,180);
   if(lat===null||lon===null)return null;
   const city=text(p['place name'],90),state=text(p.state,80);
   return {name:z,label:[z,city,state,'United States'].filter(Boolean).join(', '),
     detail:'U.S. ZIP code · '+[city,state].filter(Boolean).join(', '),
     kind:'ZIP code',lat,lon,source:'Zippopotam.us'};
 }catch{return null;}
}

async function locationSuggestions(request){
 const raw=new URL(request.url).searchParams.get('q')||'';
 const query=text(raw,90);
 if(query.length<2)return json({suggestions:[],message:'Type at least two letters to see places.'});
 if(/^\d{5}(?:-\d{0,4})?$/.test(query)){
   const zip=await zipLocation(query);
   return json({suggestions:zip?[zip]:[],source:'U.S. ZIP directory · Zippopotam.us',
     message:zip?'':'No matching U.S. ZIP code was found. Double-check the number.'});
 }
 const cacheKey=new Request('https://restaurant.ajdapp.org/_cache/locations?q='+encodeURIComponent(normalize(query)));
 const cache=caches.default;
 const hit=await cache.match(cacheKey);
 if(hit)return hit;
 let matched=[],source='OpenStreetMap · Photon',message='';
 try{
   const params=new URLSearchParams({q:query,lang:'en',limit:'15'});
   for(const layer of ['house','street','city','district','locality','county','state','country'])params.append('layer',layer);
   const data=await apiFetch('https://photon.komoot.io/api/?'+params.toString(),{},7000);
   matched=(data.features||[]).map(convertPhotonPlace).filter(Boolean);
 }catch(error){
   source='Popular destinations';
   message='Live suggestions are temporarily unavailable. Showing familiar destinations.';
 }
 const seen=new Set(),suggestions=[];
 for(const place of [...matched,...fallbackLocations(query)]){
   if(!place || !Number.isFinite(place.lat)||!Number.isFinite(place.lon))continue;
   const key=normalize(place.label);
   if(!key||seen.has(key))continue;
   seen.add(key);suggestions.push(place);
   if(suggestions.length>=7)break;
 }
 const response=json({suggestions,source,message});
 response.headers.set('cache-control','public,max-age=900');
 await cache.put(cacheKey,response.clone());
 return response;
}

async function resolveLocation(location) {
 if(/^\d{5}(?:-\d{4})?$/.test(String(location).trim())){
   const zip=await zipLocation(location.trim());
   if(!zip)throw Error('That U.S. ZIP code could not be resolved. Check all five digits.');
   return [zip.lat,zip.lon];
 }
 const known=locateKnown(location);
 if(known)return known;
 const query=encodeURIComponent(location);
 const response=await apiFetch('https://photon.komoot.io/api/?q='+query+'&limit=5&lang=en',{},9500);
 const features=(response.features||[]).filter(f=>Array.isArray(f.geometry?.coordinates)&&f.geometry.coordinates.length===2);
 const exactHouse=String(location).trim().match(/^(\d{1,6})\s+(\S.*)/);
 const precise=!!exactHouse||/\d/.test(location)||/\b(street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|way|zip|postcode)\b/i.test(location);
 let match;
 if(exactHouse){
   // Never silently substitute a different street number for the requested address.
   const requestedNumber=exactHouse[1];
   const streetParts=normalize(exactHouse[2]).split(' ').filter(w=>w.length>2&&
     !/^(street|road|avenue|boulevard|florida|california|northwest|southeast|drive|lane|washington)$/.test(w));
   match=features.find(f=>{
     const p=f.properties||{};
     if(String(p.housenumber||'')!==requestedNumber)return false;
     const candidate=normalize([p.street,p.name].join(' '));
     return streetParts.length===0||streetParts.some(word=>candidate.includes(word));
   });
   if(!match)throw Error('Could not confirm that exact street number. Select an address suggestion or search the city and neighborhood instead.');
 }else{
   match=precise
    ? features.find(f=>f.properties?.housenumber||f.properties?.postcode&&normalize(location).includes(normalize(f.properties.postcode)))||features[0]
    : features.find(f=>/city|town|village|municipality|borough|suburb|district|neighbou?rhood|quarter/.test(f.properties?.type||''))||features[0];
 }
 if(!match)throw Error('We could not locate this place. Try a more detailed address, city, state or postal code.');
 return [match.geometry.coordinates[1],match.geometry.coordinates[0]];
}
function makeSpot(el,loc){
 const t=el.tags||{},name=text(t.name||t['name:en'],130);
 if(!name)return null;
 const lat=el.lat??el.center?.lat,lon=el.lon??el.center?.lon;
 if(!Number.isFinite(lat)||!Number.isFinite(lon))return null;
 const parts=[t['addr:housenumber'],t['addr:street'],t['addr:city']].filter(Boolean);
 const address=parts.join(' ')||loc;
 const cuisine=text((t.cuisine||'Restaurant').replace(/;/g,', '),100);
 const hours=text(t.opening_hours||'',110);
 const tags=[cuisine,...[t.takeaway==='yes'?'Takeout':null,t.outdoor_seating==='yes'?'Outdoor seating':null,t.vegan==='yes'?'Vegan-friendly':null,t.wheelchair==='yes'?'Accessible':null,t['diet:vegetarian']==='yes'?'Vegetarian options':null].filter(Boolean)].filter(Boolean);
 const website=text(t.website||t['contact:website']||'',250);
 return {id:'osm-'+el.type+'-'+el.id,name,cuisine,location:loc,address,lat,lon,phone:text(t.phone||t['contact:phone']||'',45),hours,website:/^https?:\/\//i.test(website)?website:'',price:'',rating:null,recScore:'',tags,aiInsight:'Listed on OpenStreetMap. '+(cuisine!=='Restaurant'?'Cuisine: '+cuisine+'. ':'')+'Check the restaurant for current details.',menu:[]};
}
// Overpass provides detailed OSM listings. Photon offers a smaller, faster OSM fallback.
const fallbackHost=['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter'];
function withinKm(a,b,c,d){
 const toRad=Math.PI/180, dl=(c-a)*toRad, dn=(d-b)*toRad;
 return 6371*2*Math.asin(Math.min(1,Math.sqrt(Math.sin(dl/2)**2+Math.cos(a*toRad)*Math.cos(c*toRad)*Math.sin(dn/2)**2)));
}
async function photonRestaurants(lat,lon,location,q){
 const terms=[text(q,70).trim(), 'restaurant'].filter(Boolean);
 let features=[];
 for(const term of terms){
   const params=new URLSearchParams({q:term,lat:String(lat),lon:String(lon),limit:'50',lang:'en'});
   params.append('osm_tag','amenity:restaurant');
   params.append('osm_tag','amenity:cafe');
   try {
     const d=await apiFetch('https://photon.komoot.io/api/?'+params.toString(),{},8500);
     features=d.features||[];
     if(features.length)break;
   }catch(e){ /* One unavailable public endpoint must not erase saved places. */ }
 }
 const seen=new Set(),spots=[];
 for(const f of features){
   const p=f.properties||{},coord=f.geometry?.coordinates||[];
   if(!Array.isArray(coord)||coord.length<2||!p.name||!['restaurant','cafe','fast_food'].includes(p.osm_value))continue;
   const lo=Number(coord[0]),la=Number(coord[1]);
   if(!Number.isFinite(lo)||!Number.isFinite(la)||withinKm(lat,lon,la,lo)>27)continue;
   const address=[p.housenumber,p.street,p.city||p.locality,p.state].filter(Boolean).join(' ')||location;
   const item={
      id:'osm-'+(p.osm_type||'N')+'-'+(p.osm_id||la+'-'+lo),
      name:text(p.name,120),
      location,cuisine:p.osm_value==='cafe'?'Cafe':'Restaurant',
      address,lat:la,lon:lo,website:'',phone:'',hours:'',
      price:'',rating:null,recScore:'',tags:[p.osm_value==='cafe'?'Cafe':'Restaurant'],
      aiInsight:'Real OpenStreetMap place listing via Photon. Check current details before visiting.',menu:[]
   };
   const key=normalize(item.name)+'|'+normalize(item.address);
   if(!seen.has(key)){spots.push(item);seen.add(key)}
 }
 return spots;
}

/* Live OSM restaurant-name autocomplete near the selected search location.
   Suggestions are actual Photon places, not AI-generated restaurant names. */
function photonPlaceRestaurant(feature,location){
 const p=feature?.properties||{},coord=feature?.geometry?.coordinates||[];
 if(!p.name||coord.length!==2||!['restaurant','cafe','fast_food'].includes(p.osm_value))return null;
 const lat=Number(coord[1]),lon=Number(coord[0]);
 if(!Number.isFinite(lat)||!Number.isFinite(lon))return null;
 const address=[p.housenumber,p.street,p.city||p.locality,p.state,p.postcode].filter(Boolean).join(', ')||location;
 const cuisine=p.osm_value==='cafe'?'Cafe':p.osm_value==='fast_food'?'Fast food':'Restaurant';
 return {id:'osm-'+(p.osm_type||'N')+'-'+(p.osm_id||lat+'-'+lon),
   name:text(p.name,120),location,address,lat,lon,cuisine,
   website:'',phone:'',hours:'',price:'',rating:null,recScore:'',
   tags:[cuisine],aiInsight:'Listed on OpenStreetMap via Photon. Please verify hours, menu and availability.',menu:[]};
}
function nameRelevance(name,query){
 const n=normalize(name),q=normalize(query);
 if(!n||!q)return 0;
 if(n===q)return 120;
 if(n.startsWith(q))return 90;
 if(n.includes(q))return 70;
 const words=q.split(' ').filter(Boolean);
 return words.length&&words.every(w=>n.includes(w))?45:0;
}
async function restaurantSuggestions(request){
 const u=new URL(request.url),q=text(u.searchParams.get('q'),90);
 const location=text(u.searchParams.get('location')||'Hollywood, FL',100);
 if(q.length<2)return json({suggestions:[],message:'Type at least two letters.'});
 let lat=numberIn(u.searchParams.get('lat'),-90,90),lon=numberIn(u.searchParams.get('lon'),-180,180);
 // Beware missing query params: Number(null) is zero.
 if(u.searchParams.get('lat')===null)lat=null;
 if(u.searchParams.get('lon')===null)lon=null;
 try{
   if(lat===null||lon===null)[lat,lon]=await resolveLocation(location);
   const cacheKey=new Request('https://restaurant.ajdapp.org/_cache/restaurant-suggest?q='+encodeURIComponent(normalize(q))+'&lat='+lat.toFixed(3)+'&lon='+lon.toFixed(3));
   const cache=caches.default,hit=await cache.match(cacheKey);
   if(hit)return hit;
   const params=new URLSearchParams({q,lat:String(lat),lon:String(lon),limit:'35',lang:'en'});
   for(const tag of ['amenity:restaurant','amenity:cafe','amenity:fast_food'])params.append('osm_tag',tag);
   const data=await apiFetch('https://photon.komoot.io/api/?'+params.toString(),{},8500);
   const unique=new Set(),restaurants=[];
   for(const f of data.features||[]){
     const spot=photonPlaceRestaurant(f,location);
     if(!spot||withinKm(lat,lon,spot.lat,spot.lon)>30)continue;
     const key=normalize(spot.name)+'|'+normalize(spot.address);
     if(unique.has(key))continue;
     unique.add(key);
     restaurants.push(spot);
   }
   restaurants.sort((a,b)=>nameRelevance(b.name,q)-nameRelevance(a.name,q)||
     withinKm(lat,lon,a.lat,a.lon)-withinKm(lat,lon,b.lat,b.lon));
   const response=json({suggestions:restaurants.slice(0,8),source:'OpenStreetMap · Photon',
     message:restaurants.length?'':'No matching restaurant names nearby. Try another term or wider area.'});
   response.headers.set('cache-control','public,max-age=600');
   await cache.put(cacheKey,response.clone());
   return response;
 }catch(e){return json({suggestions:[],message:'Name suggestions are temporarily unavailable. You can still search by name or cuisine.'})}
}

async function nearby(lat,lon,location,q='') {
 // A targeted Photon search is more responsive for named cuisines than large Overpass area queries.
 // Photon returns OSM-backed places, so we never fabricate a restaurant.
 if(q && keywords(q).length) {
   const direct=await photonRestaurants(lat,lon,location,q);
   const matching=direct.filter(s=>matchesQuery(s,q));
   if(matching.length)return matching;
 }
 const radius=6600;
 const query='[out:json][timeout:18];(nwr["amenity"~"^(restaurant|cafe|fast_food)$"](around:'+radius+','+lat.toFixed(5)+','+lon.toFixed(5)+'););out center 130;';
 let data=null,error=null;
 for(const url of fallbackHost){
  try {data=await apiFetch(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body:'data='+encodeURIComponent(query)},6500);break}
  catch(e){error=e}
 }
 if(!data){
   const results=await photonRestaurants(lat,lon,location,q);
   if(!results.length)throw Error('Restaurant providers are temporarily busy. Try again soon. '+(error?.message||''));
   return results;
 }
 const spots=(data.elements||[]).map(e=>makeSpot(e,location)).filter(Boolean);
 const seen=new Set();
 return spots.filter(s=>{const key=normalize(s.name)+'|'+normalize(s.address);if(seen.has(key))return false;seen.add(key);return true}).slice(0,110);
}
async function restaurantSearch(request,env,isAI){
 let args;
 if(isAI){
   const origin=request.headers.get('Origin');
   if(origin && origin!==new URL(request.url).origin)return json({error:'This AI search must come from NibbleSpot.'},403);
   if(Number(request.headers.get('content-length'))>1024)return json({error:'Search is too long.'},413);
   args=await request.json().catch(()=>({}));
 } else { const p=new URL(request.url).searchParams;args=Object.fromEntries(p.entries());}
 let location=text(args.location||'Hollywood, FL',100),q=text(args.q||'',150);
 const lat=numberIn(args.lat,-90,90),lon=numberIn(args.lon,-180,180);
 if(!location)location='Hollywood, FL';
 let aiNote='';
 if(isAI){
   if(!q)return json({error:'Tell AI what type of restaurant you would like.'},400);
   const key=request.headers.get('CF-Connecting-IP')||'anonymous';
   const now=Date.now(),previous=AI_USAGE.get(key)||[];
   const recent=previous.filter(v=>now-v<3600000);
   if(recent.length>=12)return json({error:'AI search limit reached for this hour. Regular search is still available.'},429);
   recent.push(now);AI_USAGE.set(key,recent);
   try {
     if(!env.AI)throw Error('AI binding is not enabled');
     const answer=await env.AI.run('@cf/meta/llama-4-scout-17b-16e-instruct',{
       messages:[{role:'system',content:'Extract restaurant search criteria. Return ONLY a JSON object with keys "location", "cuisine", "vibe". The location must be a real named city if the user mentions one; otherwise use the fallback city. Cuisine must be 1-2 cuisine keywords if explicit, otherwise blank. Vibe can be 3-8 words describing atmosphere. Never invent restaurant names, ratings or facts.'},
        {role:'user',content:'Fallback city: '+location+'; restaurant request: '+q}],max_tokens:175,temperature:0.1});
     // Workers AI currently returns response as structured JSON, but some model variants emit text.
     const payload=answer?.response;
     const raw=typeof payload==='string'?payload:String(answer?.choices?.[0]?.message?.content||'');
     const obj=payload && typeof payload==='object'?payload:JSON.parse(raw.match(/\{[\s\S]*?\}/)?.[0]||'{}');
     if(typeof obj.location==='string'&&obj.location.length<=100)location=text(obj.location)||location;
     if(typeof obj.cuisine==='string'&&obj.cuisine.length<=80)q=text(obj.cuisine);
     aiNote='✦ AI interpreted your request'+(obj.vibe?' ('+text(obj.vibe,65)+')':'')+'.';
   } catch(e){aiNote='AI is temporarily unavailable, so we used a regular restaurant search.';}
 }
 // Even when inference is unavailable, keep a city mentioned in a natural-language query.
 const inCity=q.match(/^(.*?)\s+in\s+([^,]+(?:,\s*[a-zA-Z]{2,})?)$/i);
 if(inCity){q=text(inCity[1],70);location=text(inCity[2],100)||location;}
 const foodKeyword=q.match(/\b(pizza|sushi|ramen|tacos?|seafood|italian|mexican|japanese|indian|chinese|thai|vegan|steak|burgers?|cafe|coffee|breakfast|brunch)\b/i);
 if(foodKeyword&&keywords(q).length>1)q=foodKeyword[1];
 // Keep explicit cuisine from the user's request if the AI returns an unrelated interpretation.
 const explicitCuisine=text(args.q,150).match(/\b(pizza|sushi|ramen|tacos?|seafood|italian|mexican|japanese|indian|chinese|thai|vegan|steak|burgers?|cafe|coffee|breakfast|brunch)\b/i);
 if(isAI && explicitCuisine)q=explicitCuisine[1];
 try{
  const coords=lat!==null&&lon!==null?[lat,lon]:await resolveLocation(location);
  const cacheKey=new Request('https://restaurant.ajdapp.org/_cache/nearby?lat='+coords[0].toFixed(4)+'&lon='+coords[1].toFixed(4)+'&q='+encodeURIComponent(normalize(q)));
  const cache=caches.default;let spots;
  const hit=await cache.match(cacheKey);
  if(hit){spots=await hit.json()}
  else{
    spots=await nearby(coords[0],coords[1],location,q);
    const copy=new Response(JSON.stringify(spots),{headers:{'Content-Type':'application/json','Cache-Control':'public,max-age=1800'}});
    await cache.put(cacheKey,copy);
  }
  spots=spots.map(s=>({...s,location}));
  let matches=spots.filter(s=>matchesQuery(s,q));
  if(q&&matches.length===0&&keywords(q).length===0)matches=spots;
  if(q)matches.sort((a,b)=>nameRelevance(b.name,q)-nameRelevance(a.name,q));
  const note=matches.length?'Showing '+matches.length+' real restaurant listings near '+location+'. OpenStreetMap does not supply verified ratings or reservation availability.':'No matching restaurants were found in this OpenStreetMap area. Try another cuisine or nearby location.';
  return json({location,results:matches.slice(0,90),aiNote,message:note,source:'OpenStreetMap · Overpass · Photon'});
 }catch(e){return json({error:'Unable to search this area right now. '+text(e.message,140)},503)}
}
export default {async fetch(request,env){
 const url=new URL(request.url);let path=url.pathname;
 if(path==='/api/health')return json({ok:true,service:'NibbleSpot',search:'Overpass/Photon',ai:!!env.AI,version:'2026.10.24'});
 if(path==='/api/locations'&&request.method==='GET')return locationSuggestions(request);
 if(path==='/api/restaurant-suggestions'&&request.method==='GET')return restaurantSuggestions(request);
 if(path==='/api/search'&&request.method==='GET')return restaurantSearch(request,env,false);
 if(path==='/api/ai-search'&&request.method==='POST')return restaurantSearch(request,env,true);
 if(path.startsWith('/api/'))return json({error:'Not found'},404);
 if(path==='/'||path==='/index.html')path='/index.html';
 else if(path==='/download'||path==='/download/')path='/download.html';
 const file=STATIC_FILES[path];
 if(!file)return new Response('Not found',{status:404});
 return new Response(file.content,{headers:{'content-type':file.type,'cache-control':path==='/sw.js'?'no-cache':'public,max-age=120','x-content-type-options':'nosniff','access-control-allow-origin':'*'}});
}};
