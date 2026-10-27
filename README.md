# NibbleSpot · Our Table ♡

Restaurant discovery and saved places for two. Live app: https://restaurant.ajdapp.org

## Features

- Internal restaurant listings from **OpenStreetMap**, via server-side Overpass API. **No fabricated restaurant listings, phone numbers, ratings or menus.**
- Precise location search: Photon-backed autocomplete for cities, neighborhoods and available street/address matches. The five-digit U.S. ZIP search is resolved using the Zippopotam.us postcode directory rather than matching unrelated numbers elsewhere. A street number is never silently swapped for another address. Street and neighborhood coverage depends on OpenStreetMap data.
- Restaurant-name autocomplete: `/api/restaurant-suggestions` finds actual nearby OSM restaurant, cafe and fast-food listings with their mapped positions. Selecting a restaurant opens that exact listing, not a guessed place.
- **Deep name search** preserves complete restaurant/brand names (for example, `Pizza Hut` no longer becomes just `pizza`). It first searches an OSM name index within the selected area, then tries a wider 40 km Overpass named-restaurant lookup; neighborhood/ZIP selections use their exact map coordinates. It resets any old cuisine filter when starting a new search.
- **Google research links are always available:** the homepage sends the full restaurant and location text to both Google Maps Search and Google Web Search in an external tab, including when OpenStreetMap misses the restaurant. NibbleSpot does **not** scrape or fabricate Google listings.
- **Optional in-app Google Places (New):** if a server-side Cloudflare Worker secret named `GOOGLE_MAPS_API_KEY` is configured, the Worker attempts official Google Places Text Search (New) for nonempty queries, using a location bias. Google-sourced result cards are identified distinctly and link back to Google Maps. No Google Places results are stored in NibbleSpot's long-lived search cache or copied into saved spots. Without this secret, the in-app search remains OpenStreetMap-based and the Google search buttons open Google directly.
- City lookup with the Photon OpenStreetMap geocoder. For moderate personal use only; public demo services can be rate-limited or become unavailable. Restaurant results are cached in Cloudflare for 30 minutes; suggestion endpoints use shorter cache windows.
- Optional **AI Search** powered by Cloudflare Workers AI and its `AI` binding, which interprets cuisine and location. AI does not invent restaurants; it ranks/filters real listings. Workers AI may incur Cloudflare charges beyond the daily free allocation.
- Personal saved restaurants, grouped by location, stored under the existing `nibble_saved` browser-localStorage key. **Not yet shared/synced between phones.**
- PWA web install, branded icon, offline shell, Android WebView APK source and GitHub Actions build.
- Dedicated download page: https://restaurant.ajdapp.org/download

## Deploy

Run `npx wrangler deploy` from the repository root after logging into the appropriate Cloudflare account. Wrangler runs `node scripts/bundle-worker.mjs`, embedding app files in the Worker. The Worker serves the UI and `/api/search` + `/api/ai-search` from the same origin. **Do not use an assets-only deployment** or the internal search API will be absent. A previously configured automated static deploy can overwrite the API-enabled Worker, so update that workflow to use this Wrangler configuration.

Do not commit secrets or private API keys. The AI binding is server-side.

The public search sources are subject to availability, attribution and fair-use limits. Results are best-effort listings, not verified reservation inventory. The app includes a Google Maps fallback.

## Optional Google Places setup

NibbleSpot cannot query Google's private Places database inside the website without a Google Maps Platform project and billable API credentials. To enable the official API, activate **Places API (New)** and billing in Google Cloud, create an API key restricted to Places API, then add it as a **secret** named `GOOGLE_MAPS_API_KEY` to the `restaurant` Cloudflare Worker (Settings → Variables and Secrets). Do not commit it to GitHub or place it in HTML. Set Google Cloud quotas and a budget alert; Google may bill for Text Search requests. The API is intentionally optional so the Google Maps / Google Web search links work even without billing.

## Android

GitHub Actions builds a test/debug APK and publishes it under Releases (private repository login required). Android app package: `org.ajdapp.nibblespot`. The app opens the same HTTPS site, so searches need internet. For app-store distribution, use a signed release build and a reviewed privacy policy.

## Attribution

Restaurant listing data © OpenStreetMap contributors (ODbL). Geocoding via Photon (OpenStreetMap data). OpenStreetMap: https://www.openstreetmap.org/copyright
