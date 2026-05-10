# DCPC Election District Map

An embeddable interactive map widget for the Downtown Community Planning Council (DCPC). Residents and businesses can look up their address to find which DCPC district they're in and which seats they can vote for or run for in upcoming elections.

Hosted on GitHub Pages at: https://microcilantro.github.io/dcpc-election-map/

## Embedding in Google Sites

Use the **Embed → By URL** widget with one of these URLs:

- **Full embed:** `https://microcilantro.github.io/dcpc-election-map/embed.html`
- **Survey embed:** `https://microcilantro.github.io/dcpc-election-map/survey.html`

## Updating Seat Data

Edit `data/election-config.json` on GitHub: https://github.com/microcilantro/dcpc-election-map/edit/main/data/election-config.json

Changes deploy automatically after committing.

**To mark a seat as vacant:**
```json
{
  "id": "ev-north-resident",
  "current_member": null,
  "vacant": true
}
```

**To fill a vacant seat:**
```json
{
  "id": "ev-north-resident",
  "current_member": "Jane Smith",
  "vacant": false
}
```

## Replacing District Boundaries (KML)

1. Open Google Maps and create/edit your district polygons
2. Export as KML
3. Replace `data/districts.kml` with your new file

Each polygon's **name** in Google Maps must match the `district` value used in `election-config.json`.

## Technical Details

**No build system required.** Pure HTML/CSS/JavaScript with CDN libraries:

- **Leaflet 1.9.4** — interactive map
- **leaflet-omnivore 0.3.4** — KML file loading
- **Turf.js 7.x** — point-in-polygon address matching

**Geocoding:** Uses the free OpenStreetMap Nominatim API (no API key required).

## File Structure

```
index.html              — standalone version with header
embed.html              — iframe-optimized embed
survey.html             — compact embed for survey/form use
css/
  style.css             — all shared styles
  embed-overrides.css   — iframe-specific overrides
  survey-overrides.css  — survey-specific overrides
js/
  app.js                — all application logic
data/
  districts.kml         — district boundary polygons (from Google Maps)
  election-config.json  — seat data and election configuration
```
