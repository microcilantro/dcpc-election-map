# San Diego Community Planning Group Election Map

An open-source, embeddable interactive map that helps residents and businesses find their planning district and discover which board seats they can vote for or run for in upcoming elections. Built for the [Downtown Community Planning Council (DCPC)](https://downtownplanningsd.org/) but designed so any San Diego Community Planning Group (CPG) can fork it and deploy their own version.

**Live demo:** https://microcilantro.github.io/dcpc-election-map/

## How It Works

A visitor enters their street address and the map highlights which planning district they're in. They then see which board seats are on the ballot, who currently holds each seat, and whether they're eligible to run or vote as a resident or business representative. No server or database is needed — everything runs in the browser from two data files.

## Set Up Your Own Version

Any San Diego CPG can deploy their own election map in about 30 minutes. No coding experience is required.

### 1. Fork this repository

Click the **Fork** button at the top of this page to create your own copy.

### 2. Enable GitHub Pages

Go to your fork's **Settings → Pages** and set the source to **Deploy from a branch**, branch `main`, folder `/ (root)`. Your site will be live at `https://<your-username>.github.io/<repo-name>/`.

### 3. Create your district boundaries (KML)

1. Go to [Google My Maps](https://www.google.com/maps/d/) and create a new map
2. Draw a polygon for each district in your planning area
3. **Name each polygon** with your district name (e.g., "North Park", "University Heights") — these names must match the `district` values in your config file
4. Export the map as KML (three-dot menu → Export to KML/KMZ, choose KML)
5. Upload the file to `data/districts.kml` in your fork, replacing the existing one

### 4. Edit the election config

Edit `data/election-config.json` to match your CPG. You can do this directly on GitHub by clicking the file and then the pencil icon.

**Top-level fields:**

| Field | Description |
|---|---|
| `election_title` | Name shown in the header (e.g., "North Park CPG 2026 Election") |
| `election_year` | Year of the election |
| `election_date` | Date in YYYY-MM-DD format |
| `election_date_display` | Human-readable date (e.g., "March 18, 2026") |
| `nomination_deadline` | Deadline for candidate nominations (YYYY-MM-DD) |
| `voter_registration_deadline` | Deadline for voter registration (YYYY-MM-DD) |
| `candidate_registration_url` | Link to your candidate registration form |
| `voter_registration_url` | Link to your voter registration form |
| `in_person_voting_note` | Optional note about in-person voting |

**Seats:** Each seat in the `seats` array has these fields:

```json
{
  "id": "district-name-type",
  "district": "District Name",
  "type": "resident",
  "label": "District Name – Resident",
  "current_member": "Jane Smith",
  "vacant": false,
  "on_ballot": true,
  "current_term_expires": "2026",
  "new_term_expires": "2028",
  "reserved_for": null,
  "org_name": null
}
```

- `type` can be `"resident"`, `"business"`, or `"at-large"`
- Set `current_member` to `null` and `vacant` to `true` for empty seats
- Set `on_ballot` to `true` for seats up for election this cycle
- Use `reserved_for` and `org_name` for organization-specific at-large seats

**Shared groups** (optional): If two or more districts share a seat, add a `shared_groups` entry:

```json
{
  "group_id": "district-a-b",
  "display_name": "District A / District B",
  "members": ["District A", "District B"],
  "note": "These districts share one seat on the board."
}
```

Shared seats use the `group_id` as their `district` value instead of a single district name.

### 5. Update the map settings

Edit these values at the top of `js/app.js`:

- `MAP_CENTER` — latitude/longitude center of your planning area
- `MAP_ZOOM` — zoom level (14 works for most neighborhoods)
- `VIEWBOX` — bounding box to constrain address lookups to your area (format: `west,north,east,south`)
- `DISTRICT_COLORS` — color for each district polygon, keyed by the KML polygon name

### 6. Customize the header text

Edit `index.html` to update the page title, description, and header text to match your CPG.

### 7. Embed on your website

Use an iframe to embed the map on your Google Site, WordPress site, or any webpage:

```html
<iframe src="https://<your-username>.github.io/<repo-name>/embed.html"
        width="100%" height="700" frameborder="0"
        style="border:none; max-width:900px;">
</iframe>
```

A compact version for embedding in surveys or forms is also available at `survey.html`.

## Updating Between Elections

To update seat data (new members, vacancies, next election), just edit `data/election-config.json` on GitHub. Changes deploy automatically within a few minutes.

## Technical Details

**No build system required.** Pure HTML/CSS/JavaScript with CDN libraries:

- **Leaflet 1.9.4** — interactive map
- **leaflet-omnivore 0.3.4** — KML file loading
- **Turf.js 7.x** — point-in-polygon address matching

**Geocoding:** Uses the free OpenStreetMap Nominatim API (no API key required). For high-traffic sites, you can set a Google Maps API key in `js/app.js`.

## File Structure

```
index.html              — standalone page with header
embed.html              — iframe-optimized embed
survey.html             — compact embed for surveys/forms
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

## License

This project is open source and free for any San Diego Community Planning Group to use.
