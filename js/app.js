(function () {
  'use strict';

  // ========================================
  // CONFIGURATION
  // ========================================
  var CONFIG = {
    MAP_CENTER: [32.715, -117.163],
    MAP_ZOOM: 14,
    NOMINATIM_URL: 'https://nominatim.openstreetmap.org/search',
    DATA_KML: './data/districts.kml',
    DATA_CONFIG: 'https://dcpc-election-config.garyhewitt.workers.dev/api/config',
    GOOGLE_MAPS_API_KEY: null, // set to enable Google geocoding
    // Bounding box for downtown San Diego (used to constrain geocoding)
    VIEWBOX: '-117.185,32.732,-117.145,32.700',
    ELECTION_YEAR: 2026
  };

  // District color map — keyed by KML polygon name
  var DISTRICT_COLORS = {
    'Little Italy': '#c17b3c',
    'Cortez': '#b39c3e',
    'Columbia': '#457b9d',
    'Civic Core': '#7b4fa8',
    'East Village North': '#2a7a6b',
    'East Village South': '#2a5c9d',
    'Gaslamp': '#7b4fa8',
    'Marina': '#4a6e30'
  };

  // ========================================
  // STATE
  // ========================================
  var state = {
    geojsonData: null,
    electionConfig: null,
    sharedGroups: [],
    map: null,
    geojsonLayer: null,
    highlightLayer: null,
    markerLayer: null,
    matchedFeature: null,
    userType: 'resident',
    electionPhase: 'nominations-open'
  };

  // ========================================
  // INITIALIZATION
  // ========================================
  document.addEventListener('DOMContentLoaded', init);

  function init() {
    showInitLoading();
    Promise.all([loadElectionConfig(), loadKML()])
      .then(function (results) {
        state.electionConfig = results[0];
        state.sharedGroups = results[0].shared_groups || [];
        state.electionPhase = getElectionPhase(results[0]);
        updateElectionInfoBar(results[0]);
        hideInitLoading();
        bindSearchForm();
        setupUserTypeToggle();
      })
      .catch(function (err) {
        console.error('Initialization error:', err);
        hideInitLoading();
        showInitError('Unable to load election data: ' + err.message);
      });
  }

  // ========================================
  // DATA LOADING
  // ========================================
  function loadElectionConfig() {
    return fetch(CONFIG.DATA_CONFIG)
      .then(function (response) {
        if (!response.ok) {
          throw new Error('Failed to load election config (HTTP ' + response.status + ')');
        }
        return response.json();
      })
      .then(function (config) {
        if (!config || !Array.isArray(config.seats)) {
          throw new Error('Invalid config: missing seats array');
        }
        return config;
      });
  }

  function loadKML() {
    return new Promise(function (resolve, reject) {
      initMap();

      var kmlLayer = omnivore.kml(CONFIG.DATA_KML);

      kmlLayer.on('ready', function () {
        var geojson = kmlLayer.toGeoJSON();
        state.geojsonData = geojson;

        geojson.features.forEach(function (f) {
          if (!f.properties || !f.properties.name) {
            console.warn('KML feature missing name property:', f);
          }
        });

        // Remove the omnivore layer; add our own styled version
        state.map.removeLayer(kmlLayer);
        renderDistrictsOnMap();
        addDistrictLabels();

        resolve(geojson);
      });

      kmlLayer.on('error', function (err) {
        reject(new Error('Failed to load KML file: ' + (err.error || 'unknown error')));
      });
    });
  }

  // ========================================
  // MAP SETUP
  // ========================================
  function initMap() {
    if (state.map) return;

    state.map = L.map('map', {
      center: CONFIG.MAP_CENTER,
      zoom: CONFIG.MAP_ZOOM,
      zoomControl: true,
      scrollWheelZoom: true
    });

    // CartoDB Positron — light/minimal basemap that lets district colors show clearly
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 20
    }).addTo(state.map);
  }

  function renderDistrictsOnMap() {
    state.geojsonLayer = L.geoJSON(state.geojsonData, {
      style: styleFeature,
      onEachFeature: onEachFeature
    }).addTo(state.map);
  }

  function styleFeature(feature) {
    var name = feature.properties.name || '';
    var color = DISTRICT_COLORS[name] || '#888888';
    return {
      fillColor: color,
      fillOpacity: 0.40,
      color: color,
      weight: 2,
      opacity: 0.9
    };
  }

  function onEachFeature(feature, layer) {
    layer.on('click', function () {
      showDistrictInfoFromClick(feature);
    });
    // Subtle hover effect
    layer.on('mouseover', function () {
      if (state.highlightLayer && layer.feature === state.matchedFeature) return;
      layer.setStyle({ fillOpacity: 0.60 });
    });
    layer.on('mouseout', function () {
      if (state.highlightLayer && layer.feature === state.matchedFeature) return;
      layer.setStyle({ fillOpacity: 0.40 });
    });
  }

  function addDistrictLabels() {
    state.geojsonLayer.eachLayer(function (layer) {
      var name = layer.feature.properties.name || '';
      layer.bindTooltip(name, {
        permanent: true,
        direction: 'center',
        className: 'district-label'
      });
    });
  }

  // ========================================
  // ADDRESS GEOCODING
  // ========================================
  function stripUnitFromAddress(address) {
    // Remove apartment/unit/suite/floor designations and bare # numbers
    return address
      .replace(/,?\s+(?:apt\.?|apartment|unit|suite|ste\.?|floor|fl\.?|room|rm\.?|bldg\.?|building)\s*[\w-]*/gi, '')
      .replace(/\s+#\s*[\w-]+/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  function normalizeOrdinals(address) {
    var map = {
      'first': '1st', 'second': '2nd', 'third': '3rd', 'fourth': '4th',
      'fifth': '5th', 'sixth': '6th', 'seventh': '7th', 'eighth': '8th',
      'ninth': '9th', 'tenth': '10th', 'eleventh': '11th', 'twelfth': '12th'
    };
    return address.replace(
      /\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth)\b/gi,
      function (match) { return map[match.toLowerCase()]; }
    );
  }

  function normalizeAddress(address) {
    var stripped = stripUnitFromAddress(address);
    stripped = normalizeOrdinals(stripped);
    var lower = stripped.toLowerCase();
    if (lower.indexOf('san diego') === -1 && lower.indexOf(', sd') === -1) {
      stripped += ', San Diego, CA';
    }
    return stripped;
  }

  function geocodeAddress(address) {
    var fullAddress = normalizeAddress(address);
    if (CONFIG.GOOGLE_MAPS_API_KEY) {
      return geocodeGoogle(fullAddress);
    }
    return geocodeNominatim(fullAddress);
  }

  function geocodeNominatim(address) {
    var params = new URLSearchParams({
      q: address,
      format: 'json',
      limit: '1',
      countrycodes: 'us',
      viewbox: CONFIG.VIEWBOX,
      bounded: '1'
    });

    return fetch(CONFIG.NOMINATIM_URL + '?' + params.toString(), {
      headers: { 'Accept': 'application/json' }
    })
      .then(function (response) {
        if (!response.ok) {
          throw new Error('Geocoding service error. Please try again.');
        }
        return response.json();
      })
      .then(function (results) {
        if (!results || results.length === 0) {
          throw new Error('Address not found. Please check the address and try again, or click directly on the map to select your district.');
        }
        return {
          lat: parseFloat(results[0].lat),
          lng: parseFloat(results[0].lon),
          displayName: results[0].display_name
        };
      })
      .catch(function (err) {
        if (err.message.indexOf('Address not found') !== -1 ||
            err.message.indexOf('Geocoding service') === 0) {
          throw err;
        }
        throw new Error(
          'Unable to reach the address lookup service. ' +
          'This may be due to rate limiting. Please wait a moment and try again.'
        );
      });
  }

  function geocodeGoogle(address) {
    var params = new URLSearchParams({
      address: address,
      key: CONFIG.GOOGLE_MAPS_API_KEY,
      bounds: '32.700,-117.185|32.732,-117.145'
    });
    return fetch('https://maps.googleapis.com/maps/api/geocode/json?' + params.toString())
      .then(function (response) { return response.json(); })
      .then(function (data) {
        if (data.status !== 'OK' || !data.results || data.results.length === 0) {
          throw new Error('Address not found. Please check the address and try again, or click directly on the map to select your district.');
        }
        var loc = data.results[0].geometry.location;
        return {
          lat: loc.lat,
          lng: loc.lng,
          displayName: data.results[0].formatted_address
        };
      });
  }

  // ========================================
  // DISTRICT MATCHING
  // ========================================
  function getDistrictKey(featureName) {
    for (var i = 0; i < state.sharedGroups.length; i++) {
      var group = state.sharedGroups[i];
      if (group.members && group.members.indexOf(featureName) !== -1) {
        return group.group_id;
      }
    }
    return featureName;
  }

  function getDistrictDisplayName(featureName) {
    for (var i = 0; i < state.sharedGroups.length; i++) {
      var group = state.sharedGroups[i];
      if (group.members && group.members.indexOf(featureName) !== -1) {
        return group.display_name;
      }
    }
    return featureName;
  }

  function getSharedGroupNote(featureName) {
    for (var i = 0; i < state.sharedGroups.length; i++) {
      var group = state.sharedGroups[i];
      if (group.members && group.members.indexOf(featureName) !== -1) {
        return group.note || null;
      }
    }
    return null;
  }

  function findDistrict(lat, lng) {
    if (!state.geojsonData) return null;
    var point = turf.point([lng, lat]);
    for (var i = 0; i < state.geojsonData.features.length; i++) {
      var feature = state.geojsonData.features[i];
      try {
        if (turf.booleanPointInPolygon(point, feature)) {
          return feature;
        }
      } catch (e) {
        console.warn('Point-in-polygon check failed for feature:', feature.properties.name, e);
      }
    }
    return null;
  }

  // ========================================
  // SEAT FILTERING
  // ========================================
  function getSeatsForDistrict(featureName, userType) {
    var districtKey = getDistrictKey(featureName);
    var seats = state.electionConfig.seats;

    var districtSeats = seats.filter(function (s) {
      return s.district === districtKey && s.type === userType;
    });

    var atLargeSeats = seats.filter(function (s) {
      return s.type === 'at-large';
    });

    var all = districtSeats.concat(atLargeSeats);

    return {
      ballotSeats: all.filter(function (s) { return s.on_ballot; }),
      currentMembers: all
    };
  }

  // ========================================
  // ELECTION PHASE
  // ========================================
  function getElectionPhase(config) {
    var now = new Date();
    var todayNum = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();

    function dateToNum(isoStr) {
      if (!isoStr) return 99991231;
      var parts = isoStr.split('-');
      return parseInt(parts[0], 10) * 10000 + parseInt(parts[1], 10) * 100 + parseInt(parts[2], 10);
    }

    var nomNum = dateToNum(config.nomination_deadline);
    var elecNum = dateToNum(config.election_date);

    if (todayNum > elecNum) return 'post-election';
    if (todayNum > nomNum) return 'voting-only';
    return 'nominations-open';
  }

  function getDaysUntil(isoDate) {
    if (!isoDate) return null;
    var parts = isoDate.split('-');
    var target = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.ceil((target - today) / (1000 * 60 * 60 * 24));
  }

  function formatIsoDate(isoDate) {
    if (!isoDate) return '';
    var parts = isoDate.split('-');
    var months = ['January','February','March','April','May','June','July',
                  'August','September','October','November','December'];
    return months[parseInt(parts[1], 10) - 1] + ' ' + parseInt(parts[2], 10) + ', ' + parts[0];
  }

  function updateElectionInfoBar(config) {
    var el = document.getElementById('election-info-text');
    if (!el) return;
    var title = config.election_title || '';
    var dateStr = config.election_date_display || formatIsoDate(config.election_date) || '';
    if (title && dateStr) {
      el.textContent = title + ' \u2014 ' + dateStr;
    } else if (title) {
      el.textContent = title;
    }
  }

  function applyElectionPhase(phase, config) {
    var headingEl = document.getElementById('ballot-section-heading');
    var ballotSection = document.getElementById('ballot-seats-section');
    var candidateBtn = document.getElementById('candidate-reg-btn');
    var voterBtn = document.getElementById('voter-reg-btn');
    var countdownEl = document.getElementById('election-countdown');
    var noteEl = document.getElementById('inperson-voting-note');
    var year = (config && config.election_year) || '';

    if (phase === 'post-election') {
      if (ballotSection) ballotSection.hidden = true;
      if (candidateBtn) candidateBtn.hidden = true;
      if (voterBtn) voterBtn.hidden = true;
      if (countdownEl) countdownEl.hidden = true;
      if (noteEl) noteEl.hidden = true;

    } else if (phase === 'voting-only') {
      if (headingEl) headingEl.textContent = 'Seats You Can Vote for in ' + year;
      if (ballotSection) ballotSection.hidden = false;
      if (candidateBtn) candidateBtn.hidden = true;
      if (voterBtn) {
        voterBtn.href = config.voter_registration_url || '#';
        voterBtn.hidden = false;
      }
      if (countdownEl && config.election_date) {
        var daysToElec = getDaysUntil(config.election_date);
        var elecLabel = daysToElec === 0
          ? 'Today is Election Day!'
          : daysToElec > 0
            ? daysToElec + ' day' + (daysToElec === 1 ? '' : 's') +
              ' left to vote \u2014 Election Day is ' +
              (config.election_date_display || formatIsoDate(config.election_date))
            : null;
        if (elecLabel) {
          countdownEl.textContent = elecLabel;
          countdownEl.hidden = false;
        } else {
          countdownEl.hidden = true;
        }
      }
      if (noteEl) {
        if (config.in_person_voting_note) {
          noteEl.textContent = config.in_person_voting_note;
          noteEl.hidden = false;
        } else {
          noteEl.hidden = true;
        }
      }

    } else {
      // nominations-open: both buttons, full ballot section
      if (headingEl) headingEl.textContent = 'Seats You Can Run or Vote For in ' + year;
      if (ballotSection) ballotSection.hidden = false;
      if (candidateBtn) {
        candidateBtn.href = config.candidate_registration_url || '#';
        candidateBtn.hidden = false;
      }
      if (voterBtn) {
        voterBtn.href = config.voter_registration_url || '#';
        voterBtn.hidden = false;
      }
      if (countdownEl && config.nomination_deadline) {
        var daysToNom = getDaysUntil(config.nomination_deadline);
        var nomLabel = daysToNom === 0
          ? 'Today is the last day to register as a candidate!'
          : daysToNom > 0
            ? daysToNom + ' day' + (daysToNom === 1 ? '' : 's') +
              ' left to register as a candidate \u2014 Nominations close ' +
              formatIsoDate(config.nomination_deadline)
            : null;

        var voterRegLabel = null;
        if (config.voter_registration_deadline) {
          var daysToVoterReg = getDaysUntil(config.voter_registration_deadline);
          voterRegLabel = daysToVoterReg === 0
            ? 'Today is the last day to register to vote!'
            : daysToVoterReg > 0
              ? daysToVoterReg + ' day' + (daysToVoterReg === 1 ? '' : 's') +
                ' left to register to vote \u2014 Voter registration closes ' +
                formatIsoDate(config.voter_registration_deadline)
              : null;
        }

        var lines = [nomLabel, voterRegLabel].filter(Boolean);
        if (lines.length > 0) {
          countdownEl.innerHTML = lines.join('<br>');
          countdownEl.hidden = false;
        } else {
          countdownEl.hidden = true;
        }
      }
      if (noteEl) {
        if (config.in_person_voting_note) {
          noteEl.textContent = config.in_person_voting_note;
          noteEl.hidden = false;
        } else {
          noteEl.hidden = true;
        }
      }
    }
  }

  // ========================================
  // MAP INTERACTION
  // ========================================
  function highlightDistrict(feature, coords) {
    clearHighlight();

    state.highlightLayer = L.geoJSON(feature, {
      style: {
        fillColor: DISTRICT_COLORS[feature.properties.name] || '#888',
        fillOpacity: 0.55,
        color: '#1E293B',
        weight: 3,
        opacity: 1,
        className: 'district-highlight'
      }
    }).addTo(state.map);

    state.markerLayer = L.marker([coords.lat, coords.lng]).addTo(state.map);

    var displayName = getDistrictDisplayName(feature.properties.name);
    state.markerLayer.bindPopup(
      '<div class="popup-district-name">' + displayName + '</div>' +
      '<div class="popup-address">' + (coords.displayName || '') + '</div>'
    ).openPopup();

    state.map.fitBounds(state.highlightLayer.getBounds(), { padding: [50, 50], maxZoom: 16 });
  }

  function clearHighlight() {
    if (state.highlightLayer) {
      state.map.removeLayer(state.highlightLayer);
      state.highlightLayer = null;
    }
    if (state.markerLayer) {
      state.map.removeLayer(state.markerLayer);
      state.markerLayer = null;
    }
    // NOTE: state.matchedFeature is NOT cleared here so the resident/business
    // toggle can re-render seats without losing the matched district.
    // It is explicitly cleared in handleSearch() before each new search.
  }

  // ========================================
  // SEARCH HANDLING
  // ========================================
  function bindSearchForm() {
    var form = document.getElementById('search-form');
    if (!form) return;
    form.addEventListener('submit', handleSearch);
  }

  function handleSearch(event) {
    event.preventDefault();
    var input = document.getElementById('search-input');
    var address = input.value.trim();

    if (!address) {
      showSearchError('Please enter a street address.');
      return;
    }

    clearSearchError();
    hideResults();
    hideOutsidePanel();
    state.matchedFeature = null;
    clearHighlight();
    showSearchLoading();

    geocodeAddress(address)
      .then(function (coords) {
        hideSearchLoading();
        var feature = findDistrict(coords.lat, coords.lng);

        if (!feature) {
          showOutsidePanel();
          renderAtLargeOnly();
          state.markerLayer = L.marker([coords.lat, coords.lng]).addTo(state.map);
          state.markerLayer.bindPopup(
            '<div class="popup-district-name">Outside District Boundaries</div>' +
            '<div class="popup-address">' + (coords.displayName || '') + '</div>'
          ).openPopup();
          state.map.setView([coords.lat, coords.lng], 15);
          return;
        }

        state.matchedFeature = feature;
        highlightDistrict(feature, coords);
        showResults(feature);
      })
      .catch(function (err) {
        hideSearchLoading();
        showSearchError(err.message || 'An error occurred. Please try again.');
      });
  }

  function showDistrictInfoFromClick(feature) {
    state.matchedFeature = feature;
    hideOutsidePanel();
    clearHighlight();
    state.matchedFeature = feature;

    state.highlightLayer = L.geoJSON(feature, {
      style: {
        fillColor: DISTRICT_COLORS[feature.properties.name] || '#888',
        fillOpacity: 0.55,
        color: '#1E293B',
        weight: 3,
        opacity: 1,
        className: 'district-highlight'
      }
    }).addTo(state.map);

    showResults(feature);
  }

  // ========================================
  // UI — RESULTS PANEL
  // ========================================
  function showResults(feature) {
    var panel = document.getElementById('results-panel');
    if (!panel) return;

    var featureName = feature.properties.name || '';
    var displayName = getDistrictDisplayName(featureName);
    var districtColor = DISTRICT_COLORS[featureName] || '#888';
    var sharedNote = getSharedGroupNote(featureName);

    // District badge
    var badge = document.getElementById('district-badge');
    badge.style.borderLeft = '5px solid ' + districtColor;
    badge.style.background = districtColor + '18';
    badge.innerHTML =
      '<div class="district-badge-icon">📍</div>' +
      '<div class="district-badge-text">' +
      '<h2>' + displayName + '</h2>' +
      '<p>Your DCPC Election District</p>' +
      '</div>';

    // Shared seat note
    var noteEl = document.getElementById('shared-seat-note');
    if (sharedNote) {
      noteEl.textContent = sharedNote;
      noteEl.hidden = false;
    } else {
      noteEl.hidden = true;
    }

    // Render two sections
    renderSeats(featureName, state.userType);

    // Apply phase-specific heading, button visibility, and countdown
    applyElectionPhase(state.electionPhase, state.electionConfig);

    panel.hidden = false;
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function renderSeats(featureName, userType) {
    var result = getSeatsForDistrict(featureName, userType);

    renderSeatList('ballot-seats-container', result.ballotSeats, 'ballot');
    renderSeatList('current-members-container', result.currentMembers, 'current');

    // Hide current members section if empty
    var currentSection = document.getElementById('current-members-section');
    if (currentSection) {
      currentSection.hidden = result.currentMembers.length === 0;
    }
  }

  function renderSeatList(containerId, seats, section) {
    var container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    if (seats.length === 0) {
      var empty = document.createElement('p');
      empty.className = 'seats-empty';
      empty.textContent = 'No seats in this category for your district.';
      container.appendChild(empty);
      return;
    }

    var grid = document.createElement('div');
    grid.className = 'seats-grid';
    seats.forEach(function (seat) {
      grid.appendChild(createSeatCard(seat, section));
    });
    container.appendChild(grid);
  }

  function createSeatCard(seat, section) {
    var card = document.createElement('div');
    card.className = 'seat-card';
    card.setAttribute('role', 'article');
    card.setAttribute('aria-label', seat.label);

    // Header row: seat label (left) + term info (right)
    var header = document.createElement('div');
    header.className = 'seat-header';

    var label = document.createElement('span');
    label.className = 'seat-label';
    label.textContent = seat.label;
    header.appendChild(label);

    if (section === 'ballot' && seat.new_term_expires) {
      // Show term length + end year: "2-Year Term – Expiring 2028"
      var termYears = parseInt(seat.new_term_expires, 10) - CONFIG.ELECTION_YEAR;
      var termText = termYears + '-Year Term \u2013 Expiring ' + seat.new_term_expires;
      var expires = document.createElement('span');
      expires.className = 'seat-expires';
      expires.textContent = termText;
      header.appendChild(expires);
    } else if (section === 'current' && seat.current_term_expires) {
      // Show when the current holder's term ends
      var expires = document.createElement('span');
      expires.className = 'seat-expires';
      expires.textContent = 'Term Expires ' + seat.current_term_expires;
      header.appendChild(expires);
    }

    card.appendChild(header);

    // Footer row: only shown for "current members" section (member name or VACANT)
    if (section === 'current') {
      var footer = document.createElement('div');
      footer.className = 'seat-footer';

      if (seat.vacant) {
        var vacantBadge = document.createElement('span');
        vacantBadge.className = 'vacant-badge';
        vacantBadge.innerHTML = '&#9888;&#65039; VACANT';
        vacantBadge.setAttribute('aria-label', 'This seat is currently vacant');
        footer.appendChild(vacantBadge);
      } else {
        var filledBadge = document.createElement('span');
        filledBadge.className = 'filled-badge';
        filledBadge.textContent = seat.current_member;
        footer.appendChild(filledBadge);

        if (seat.org_name) {
          var orgEl = document.createElement('span');
          orgEl.className = 'seat-org-name';
          orgEl.textContent = '(' + seat.org_name + ')';
          footer.appendChild(orgEl);
        }
      }

      card.appendChild(footer);
    }

    // Reserved note (shown in both sections)
    if (seat.reserved_for === 'community-organization') {
      var note = document.createElement('div');
      note.className = 'seat-reserved-note';
      note.textContent = 'Reserved for Community Organizations';
      card.appendChild(note);
    }

    return card;
  }

  function renderAtLargeOnly() {
    var container = document.getElementById('atlarge-only-container');
    if (!container) return;
    container.innerHTML = '';

    var phase = state.electionPhase;
    var config = state.electionConfig;
    var year = (config && config.election_year) || '';

    var seats = config.seats.filter(function (s) { return s.type === 'at-large'; });
    var ballotSeats = seats.filter(function (s) { return s.on_ballot; });
    var currentMembers = seats;

    if (phase !== 'post-election' && ballotSeats.length > 0) {
      var ballotHeading = phase === 'voting-only'
        ? 'At-Large Seats You Can Vote for in ' + year
        : 'At-Large Seats You Can Run or Vote For in ' + year;
      var h3a = createElement('h3', 'seats-subsection-heading', ballotHeading);
      container.appendChild(h3a);
      var grid1 = createElement('div', 'seats-grid');
      ballotSeats.forEach(function (s) { grid1.appendChild(createSeatCard(s, 'ballot')); });
      container.appendChild(grid1);
    }

    if (currentMembers.length > 0) {
      var h3b = createElement('h3', 'seats-subsection-heading', 'Your Current At-Large Board Members');
      container.appendChild(h3b);
      var grid2 = createElement('div', 'seats-grid');
      currentMembers.forEach(function (s) { grid2.appendChild(createSeatCard(s, 'current')); });
      container.appendChild(grid2);
    }

    var note = createElement('div', 'at-large-note');
    note.style.marginTop = '16px';
    note.textContent = 'At-Large seats are open to all Downtown residents, businesses, and community organizations regardless of neighborhood. 3 of the 5 At-Large seats are reserved for Community Organizations serving the Downtown planning area.';
    container.appendChild(note);
  }

  // ========================================
  // USER TYPE TOGGLE
  // ========================================
  function setupUserTypeToggle() {
    var tabs = document.querySelectorAll('.selector-tab');
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        tabs.forEach(function (t) {
          t.classList.remove('active');
          t.setAttribute('aria-selected', 'false');
        });
        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');

        state.userType = tab.getAttribute('data-type');
        if (state.matchedFeature) {
          renderSeats(state.matchedFeature.properties.name, state.userType);
        }
      });
    });
  }

  // ========================================
  // UI HELPERS
  // ========================================
  function createElement(tag, className, textContent) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (textContent) el.textContent = textContent;
    return el;
  }

  function showInitLoading() {
    var el = document.getElementById('init-loading');
    if (el) el.hidden = false;
  }

  function hideInitLoading() {
    var el = document.getElementById('init-loading');
    if (el) el.hidden = true;
  }

  function showInitError(message) {
    var el = document.getElementById('init-error');
    if (el) {
      el.querySelector('p').textContent = message;
      el.hidden = false;
    }
    var btn = document.getElementById('search-btn');
    if (btn) btn.disabled = true;
    var input = document.getElementById('search-input');
    if (input) input.disabled = true;
  }

  function showSearchLoading() {
    var el = document.querySelector('.search-loading');
    if (el) el.hidden = false;
    var btn = document.getElementById('search-btn');
    if (btn) btn.disabled = true;
  }

  function hideSearchLoading() {
    var el = document.querySelector('.search-loading');
    if (el) el.hidden = true;
    var btn = document.getElementById('search-btn');
    if (btn) btn.disabled = false;
  }

  function showSearchError(message) {
    var el = document.querySelector('.search-error');
    if (el) {
      el.textContent = message;
      el.hidden = false;
    }
  }

  function clearSearchError() {
    var el = document.querySelector('.search-error');
    if (el) el.hidden = true;
  }

  function hideResults() {
    var el = document.getElementById('results-panel');
    if (el) el.hidden = true;
  }

  function showOutsidePanel() {
    var el = document.getElementById('outside-panel');
    if (el) {
      el.hidden = false;
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function hideOutsidePanel() {
    var el = document.getElementById('outside-panel');
    if (el) el.hidden = true;
  }

})();
