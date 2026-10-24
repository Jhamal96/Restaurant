# NibbleSpot · Our Table ♡

Restaurant discovery and saved places for two. Live app: https://restaurant.ajdapp.org

## Features

- Internal restaurant listings from **OpenStreetMap**, via server-side Overpass API. **No fabricated restaurant listings, phone numbers, ratings or menus.**
- Precise location search: Photon-backed autocomplete for cities, neighborhoods and available street/address matches. The five-digit U.S. ZIP search is resolved using the Zippopotam.us postcode directory rather than matching unrelated numbers elsewhere. A street number is never silently swapped for another address. Street and neighborhood coverage depends on OpenStreetMap data.
- Restaurant-name autocomplete: `/api/restaurant-suggestions` finds actual nearby OSM restaurant, cafe and fast-food listings with their mapped positions. Selecting a restaurant opens that exact listing, not a guessed place; free-text searches also rank close restaurant-name matches.
- City lookup with the Photon OpenStreetMap geocoder. For moderate personal use only; public demo services can be rate-limited or become unavailable. Restaurant results are cached in Cloudflare for 30 minutes; suggestion endpoints use shorter cache windows.
- Optional **AI Search** powered by Cloudflare Workers AI and its `AI` binding, which interprets cuisine and location. AI does not invent restaurants; it ranks/filters real listings. Workers AI may incur Cloudflare charges beyond the daily free allocation.
- Personal saved restaurants, grouped by location, stored under the existing `nibble_saved` browser-localStorage key. **Not yet shared/synced between phones.**
- PWA web install, branded icon, offline shell, Android WebView APK source and GitHub Actions build.
- Dedicated download page: https://restaurant.ajdapp.org/download

## Deploy

Run `npx wrangler deploy` from the repository root after logging into the appropriate Cloudflare account. Wrangler runs `node scripts/bundle-worker.mjs`, embedding app files in the Worker. The Worker serves the UI and `/api/search` + `/api/ai-search` from the same origin. **Do not use an assets-only deployment** or the internal search API will be absent. A previously configured automated static deploy can overwrite the API-enabled Worker, so update that workflow to use this Wrangler configuration.

Do not commit secrets or private API keys. The AI binding is server-side.

The public search sources are subject to availability, attribution and fair-use limits. Results are best-effort listings, not verified reservation inventory. The app includes a Google Maps fallback.

## Android

GitHub Actions builds a test/debug APK and publishes it under Releases (private repository login required). Android app package: `org.ajdapp.nibblespot`. The app opens the same HTTPS site, so searches need internet. For app-store distribution, use a signed release build and a reviewed privacy policy.

## Attribution

Restaurant listing data © OpenStreetMap contributors (ODbL). Geocoding via Photon (OpenStreetMap data). OpenStreetMap: https://www.openstreetmap.org/copyright
