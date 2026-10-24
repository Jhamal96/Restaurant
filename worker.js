// NibbleSpot Cloudflare Worker. Deployment bundles public files into STATIC_FILES.
const STATIC_FILES = {};
const AI_USAGE = new Map();
const JSON_HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
function json(value,status=200){return new Response(JSON.stringify(value),{status,headers:JSON_HEADERS})}
function text(v,max=110){return String(v==null?'':v).trim().slice(0,max)}
function numberIn(v,min,max){const n=Number(v);return Number.isFinite(n)&&n>=min&&n<=max?n:null}
function locateKnown(location){
 const key=location.toLowerCase().replace(/\s+/g,' ').trim();
 const choices=[[/hollywood.*(fl|florida)|^hollywood$/,[26.0112,-80.1495]],[/^miami/,[25.7752,-80.1992]],[/fort lauderdale/,[26.1224,-80.1373]],[/^orlando/,[28.5384,-81.3789]],[/^new york|^nyc$/,[40.7128,-74.006]],[/^las vegas/,[36.1699,-115.1398]],[/^tampa/,[27.9506,-82.4572]],[/^atlanta/,[33.749,-84.388]],[/^chicago/,[41.8781,-87.6298]],[/^los angeles/,[34.0522,-118.2437]],[/^san francisco/,[37.7749,-122.4194]],[/^paris/,[48.8566,2.3522]],[/^london/,[51.5072,-.1276]]];
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
async function resolveLocation(location) {
 const known=locateKnown(location);
 if(known)return known;
 const query=encodeURIComponent(location);
 const response=await apiFetch('https://photon.komoot.io/api/?q='+query+'&limit=5&lang=en',{},9500);
 const features=(response.features||[]).filter(f=>Array.isArray(f.geometry?.coordinates)&&f.geometry.coordinates.length===2);
 const match=features.find(f=>/city|town|village|municipality|borough|suburb/.test(f.properties?.type||''))||features[0];
 if(!match)throw Error('We could not locate that city. Try adding a state or country.');
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
async function nearby(lat,lon,location,q='') {
 const radius=6600;
 const query='[out:json][timeout:18];(nwr["amenity"~"^(restaurant|cafe|fast_food)$"](around:'+radius+','+lat.toFixed(5)+','+lon.toFixed(5)+'););out center 130;';
 let data=null,error=null;
 for(const url of fallbackHost){
  try {data=await apiFetch(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body:'data='+encodeURIComponent(query)},8500);break}
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
     const answer=await env.AI.run('@cf/meta/llama-3.1-8b-instruct',{
       messages:[{role:'system',content:'Extract restaurant search criteria. Return ONLY a JSON object with keys "location", "cuisine", "vibe". The location must be a real named city if the user mentions one; otherwise use the fallback city. Cuisine must be 1-2 cuisine keywords if explicit, otherwise blank. Vibe can be 3-8 words describing atmosphere. Never invent restaurant names, ratings or facts.'},
        {role:'user',content:'Fallback city: '+location+'; restaurant request: '+q}],max_tokens:175,temperature:0.1});
     const raw=String(answer.response||'');const obj=JSON.parse(raw.match(/\{[\s\S]*?\}/)?.[0]||'{}');
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
  const note=matches.length?'Showing '+matches.length+' real restaurant listings near '+location+'. OpenStreetMap does not supply verified ratings or reservation availability.':'No matching restaurants were found in this OpenStreetMap area. Try another cuisine or nearby location.';
  return json({location,results:matches.slice(0,90),aiNote,message:note,source:'OpenStreetMap · Overpass · Photon'});
 }catch(e){return json({error:'Unable to search this area right now. '+text(e.message,140)},503)}
}
export default {async fetch(request,env){
 const url=new URL(request.url);let path=url.pathname;
 if(path==='/api/health')return json({ok:true,service:'NibbleSpot',search:'Overpass/Photon',ai:!!env.AI,version:'2026.10.24'});
 if(path==='/api/search'&&request.method==='GET')return restaurantSearch(request,env,false);
 if(path==='/api/ai-search'&&request.method==='POST')return restaurantSearch(request,env,true);
 if(path.startsWith('/api/'))return json({error:'Not found'},404);
 if(path==='/'||path==='/index.html')path='/index.html';
 else if(path==='/download'||path==='/download/')path='/download.html';
 const file=STATIC_FILES[path];
 if(!file)return new Response('Not found',{status:404});
 return new Response(file.content,{headers:{'content-type':file.type,'cache-control':path==='/sw.js'?'no-cache':'public,max-age=120','x-content-type-options':'nosniff','access-control-allow-origin':'*'}});
}};
