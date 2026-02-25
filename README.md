# DCPC Election District Map

An embeddable interactive map widget for the Downtown Community Planning Council (DCPC). Residents and businesses can look up their address to find which DCPC district they're in and which seats they can vote for or run for in upcoming elections.

## Quick Start

1. Upload the entire `election-map/` folder to your web server
2. Replace `data/districts.kml` with your actual boundary file from Google Maps
3. Update `#REGISTRATION-URL` in both `index.html` and `embed.html` with your JotForm registration link
4. Test by visiting `index.html` in a browser

## Embedding in WordPress

Upload the `election-map/` folder to your WordPress server (e.g., via FTP or File Manager to a location like `/election-map/` on the web root). Then add this iframe to any page or post:

```html
<iframe src="https://downtownplanningsd.org/election-map/embed.html"
        width="100%" height="700" frameborder="0"
        style="border:none; max-width:900px;">
</iframe>
```

Adjust the `src` path if you uploaded the folder to a different location.

## Updating Seat Data

Edit `data/election-config.md` in any text editor. No coding is required.

**To mark a seat as vacant:**
```yaml
- id: ev-north-resident
  current_member: null
  vacant: true
```

**To fill a vacant seat:**
```yaml
- id: ev-north-resident
  current_member: "Jane Smith"
  vacant: false
```

**To change the election date:**
```yaml
election_date: "March 19, 2026"
election_title: "DCPC 2026 General Election"
```

Changes take effect immediately on the next page load.

## Replacing District Boundaries (KML)

1. Open Google Maps and create/edit your district polygons
2. Export as KML
3. Replace `data/districts.kml` with your new file

**Important:** Each polygon's **name** in Google Maps must match the `district` value used in `election-config.md`. The current expected names are:

| Polygon Name | Config District Value |
|---|---|
| East Village – North | `"East Village – North"` |
| East Village – South | `"East Village – South"` |
| Cortez | `"Cortez"` |
| Little Italy | `"Little Italy"` |
| Columbia | `"Columbia"` |
| Marina | `"Marina"` |
| Gaslamp Quarter | (mapped via `shared_groups`) |
| Core | (mapped via `shared_groups`) |

## Shared Seat Groups

The Gaslamp Quarter and Core neighborhoods share seats. This is configured in `election-config.md` under `shared_groups`:

```yaml
shared_groups:
  - group_id: "gaslamp-core"
    display_name: "Gaslamp Quarter / Core"
    members: ["Gaslamp Quarter", "Core"]
    note: "Gaslamp Quarter and Civic Core share one Resident seat..."
```

The `members` list must contain the exact polygon names from the KML file. Seats for shared groups use the `group_id` as their `district` value:

```yaml
- id: gaslamp-core-resident
  district: "gaslamp-core"
  type: resident
```

## Updating the Registration Link

Find `#REGISTRATION-URL` in both `index.html` and `embed.html` and replace it with your live registration URL (e.g., JotForm link).

## Technical Details

**No build system required.** The widget is pure HTML/CSS/JavaScript loaded from CDN libraries:

- **Leaflet 1.9.4** — interactive map
- **leaflet-omnivore 0.3.4** — KML file loading
- **Turf.js 7.x** — point-in-polygon address matching
- **js-yaml 4.1.0** — YAML config parsing

**Geocoding:** Uses the free OpenStreetMap Nominatim API (no API key required). For high-traffic sites, set a Google Maps API key in `js/app.js` (`CONFIG.GOOGLE_MAPS_API_KEY`).

**Browser support:** All modern browsers (Chrome, Firefox, Safari, Edge). Mobile-responsive.

## File Structure

```
election-map/
  index.html              — standalone version with header
  embed.html              — iframe-optimized version
  css/
    style.css             — all shared styles
    embed-overrides.css   — iframe-specific overrides
  js/
    app.js                — all application logic
  data/
    districts.kml         — district boundary polygons (from Google Maps)
    election-config.md    — seat data and election configuration
  README.md               — this file
```
