// --- TRACKER STATE ---
let map = null;
let userMarker = null;
let userPosition = null; // { lat, lng }
let watchId = null;

let playerDistanceCovered = 0;
let lastLatLng = null;
let trackingPath = []; // List of L.LatLng points representing the trail
let trackLine = null;

// Map layers
let streetLayer = null;
let satelliteLayer = null;

// --- RACE STATE ---
let checkpoints = []; // Array of L.LatLng
let checkpointMarkers = []; // Array of L.marker
let checkpointPathLine = null; // L.polyline connecting checkpoints

let botMarker = null;
let botPosition = null; // L.LatLng
let botSpeedKmh = 5.0;
let raceInterval = null;
let raceActive = false;

let playerActiveCheckpointIndex = 0;
let botActiveCheckpointIndex = 0;

// --- DOM ELEMENTS ---
const domGpsAccuracy = document.getElementById('gps-accuracy');
const domStatSpeed = document.getElementById('stat-speed');
const domStatDistance = document.getElementById('stat-distance');
const domCoordLat = document.getElementById('coord-lat');
const domCoordLng = document.getElementById('coord-lng');
const domBtnReset = document.getElementById('btn-reset-tracker');
const domToastContainer = document.getElementById('toast-container');
const domBtnStyleStreet = document.getElementById('btn-style-street');
const domBtnStyleSatellite = document.getElementById('btn-style-satellite');

// Bot Race UI
const domInputBotSpeed = document.getElementById('input-bot-speed');
const domLabelBotSpeed = document.getElementById('label-bot-speed');
const domBtnStartRace = document.getElementById('btn-start-race');
const domBtnCancelRace = document.getElementById('btn-cancel-race');
const domTargetInstruction = document.getElementById('target-instruction');
const domStatPlayerTarget = document.getElementById('stat-player-target');
const domStatBotTarget = document.getElementById('stat-bot-target');
const domStatPlayerCp = document.getElementById('stat-player-cp');
const domStatBotCp = document.getElementById('stat-bot-cp');

// --- INITIALIZATION ---
function init() {
  setupMap();
  setupEventListeners();
  startGpsTracking();
}

// Setup Leaflet Map with standard colorful OpenStreetMap tiles & Satellite tiles
function setupMap() {
  const defaultLocation = [40.7128, -74.0060];
  
  // Set maxZoom to 21 to allow zooming in to see houses
  map = L.map('map', {
    zoomControl: true,
    maxZoom: 21
  }).setView(defaultLocation, 16);

  // Define layers
  streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  });

  satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 21,
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
  });

  // Load Street Layer by default
  streetLayer.addTo(map);

  // Custom User Marker Icon
  const userIcon = L.divIcon({
    className: 'user-marker',
    iconSize: [22, 22],
    iconAnchor: [11, 11]
  });
  
  userMarker = L.marker(defaultLocation, { icon: userIcon }).addTo(map);

  // Trail path initialization
  trackLine = L.polyline([], {
    color: '#0ea5e9',
    weight: 5,
    opacity: 0.85,
    lineJoin: 'round'
  }).addTo(map);

  // Checkpoints path connection line initialization
  checkpointPathLine = L.polyline([], {
    color: '#eab308',
    weight: 3,
    opacity: 0.6,
    dashArray: '5, 10',
    lineJoin: 'round'
  }).addTo(map);

  // Map Click Listener to Set Destination
  map.on('click', (e) => {
    if (raceActive) {
      showToast('⚠️ Cannot change target while race is active!', 'error');
      return;
    }
    addCheckpoint(e.latlng);
  });
}

function addCheckpoint(latlng) {
  checkpoints.push(latlng);
  const index = checkpoints.length;

  // Create custom marker with checkpoint number
  const targetIcon = L.divIcon({
    className: 'target-marker',
    html: `<span>${index}</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  });

  const marker = L.marker(latlng, { icon: targetIcon }).addTo(map);
  
  // Delete checkpoint when clicked before the race starts
  marker.on('click', (e) => {
    L.DomEvent.stopPropagation(e); // Stop map click handler from firing
    if (raceActive) {
      showToast('⚠️ Cannot delete checkpoints during a race!', 'error');
      return;
    }
    removeCheckpoint(marker);
  });

  checkpointMarkers.push(marker);

  // Draw lines connecting checkpoints
  checkpointPathLine.setLatLngs(checkpoints);

  domTargetInstruction.textContent = `🎯 ${index} checkpoint(s) set. Click 'START RACE' to begin!`;
  domTargetInstruction.style.color = "var(--accent-green)";
  domBtnStartRace.disabled = false;
  
  updateDistanceDisplays();
  showToast(`📍 Checkpoint ${index} added!`, 'success');
}

function removeCheckpoint(markerToRemove) {
  const markerIndex = checkpointMarkers.indexOf(markerToRemove);
  if (markerIndex === -1) return;

  // Remove marker from map
  map.removeLayer(markerToRemove);

  // Remove from arrays
  checkpointMarkers.splice(markerIndex, 1);
  checkpoints.splice(markerIndex, 1);

  // Re-index remaining markers
  checkpointMarkers.forEach((marker, i) => {
    const newIndex = i + 1;
    const targetIcon = L.divIcon({
      className: 'target-marker',
      html: `<span>${newIndex}</span>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });
    marker.setIcon(targetIcon);
  });

  // Re-draw path line
  checkpointPathLine.setLatLngs(checkpoints);

  // Update instruction & buttons
  const count = checkpoints.length;
  if (count > 0) {
    domTargetInstruction.textContent = `🎯 ${count} checkpoint(s) set. Click 'START RACE' to begin!`;
    domTargetInstruction.style.color = "var(--accent-green)";
    domBtnStartRace.disabled = false;
  } else {
    domTargetInstruction.textContent = "📍 Click on the map to set checkpoints";
    domTargetInstruction.style.color = "var(--text-secondary)";
    domBtnStartRace.disabled = true;
  }

  updateDistanceDisplays();
  showToast(`🗑️ Checkpoint ${markerIndex + 1} removed`, 'info');
}

// --- GPS TRACKING ---
function startGpsTracking() {
  if (!navigator.geolocation) {
    showToast('❌ Geolocation is not supported by your browser', 'error');
    return;
  }

  showToast('🛰️ Locating satellite signal...', 'info');

  watchId = navigator.geolocation.watchPosition(
    (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const accuracy = position.coords.accuracy;
      const speed = position.coords.speed; // speed in m/s (can be null)

      const latlng = L.latLng(lat, lng);
      
      updateLocation(latlng, accuracy, speed);
    },
    (error) => {
      console.warn('GPS Error: ', error);
      domGpsAccuracy.textContent = 'Offline/Error';
      domGpsAccuracy.className = 'stat-highlight indicator-red';
      showToast('⚠️ Unable to retrieve your GPS location.', 'error');
    },
    {
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 10000
    }
  );
}

// Update coordinates & trail
function updateLocation(latlng, accuracy, speedMps) {
  userPosition = latlng;
  userMarker.setLatLng(latlng);
  
  // Update Coordinates in HUD
  domCoordLat.textContent = latlng.lat.toFixed(6);
  domCoordLng.textContent = latlng.lng.toFixed(6);

  // Update accuracy status
  domGpsAccuracy.textContent = `±${Math.round(accuracy)}m`;

  // Calculate speed
  let speedKmh = 0;
  if (speedMps !== null && speedMps !== undefined && speedMps >= 0) {
    speedKmh = speedMps * 3.6;
  } else if (lastLatLng) {
    const meters = lastLatLng.distanceTo(latlng);
    speedKmh = (meters * 3.6) / 2;
  }
  domStatSpeed.textContent = `${speedKmh.toFixed(1)} km/h`;

  // Calculate cumulative distance and trace the trail
  if (lastLatLng) {
    const segmentMeters = lastLatLng.distanceTo(latlng);
    if (segmentMeters > 2 && accuracy < 30) {
      playerDistanceCovered += segmentMeters;
      trackingPath.push(latlng);
      trackLine.setLatLngs(trackingPath);
    }
  } else {
    trackingPath.push(latlng);
    trackLine.setLatLngs(trackingPath);
  }

  lastLatLng = latlng;
  domStatDistance.textContent = `${Math.round(playerDistanceCovered)} m`;

  updateDistanceDisplays();
  checkRaceConditions();
}

function updateDistanceDisplays() {
  const totalCPs = checkpoints.length;
  
  // Update Checkpoint Counts
  domStatPlayerCp.textContent = `${playerActiveCheckpointIndex} / ${totalCPs}`;
  domStatBotCp.textContent = `${botActiveCheckpointIndex} / ${totalCPs}`;

  // Update Player Dist to Next CP
  if (raceActive && playerActiveCheckpointIndex < totalCPs) {
    const nextCP = checkpoints[playerActiveCheckpointIndex];
    if (userPosition && nextCP) {
      const playerDist = userPosition.distanceTo(nextCP);
      domStatPlayerTarget.textContent = `${Math.round(playerDist)} m`;
    } else {
      domStatPlayerTarget.textContent = '-- m';
    }
  } else if (!raceActive && totalCPs > 0) {
    // Show distance to checkpoint 1 before race starts
    if (userPosition) {
      const distToFirst = userPosition.distanceTo(checkpoints[0]);
      domStatPlayerTarget.textContent = `${Math.round(distToFirst)} m`;
    } else {
      domStatPlayerTarget.textContent = '-- m';
    }
  } else {
    domStatPlayerTarget.textContent = '-- m';
  }

  // Update Bot Dist to Next CP
  if (raceActive && botActiveCheckpointIndex < totalCPs) {
    const nextCP = checkpoints[botActiveCheckpointIndex];
    if (botPosition && nextCP) {
      const botDist = botPosition.distanceTo(nextCP);
      domStatBotTarget.textContent = `${Math.round(botDist)} m`;
    } else {
      domStatBotTarget.textContent = '-- m';
    }
  } else {
    domStatBotTarget.textContent = '-- m';
  }
}

// Reset tracking statistics
function resetTracker() {
  playerDistanceCovered = 0;
  trackingPath = [];
  if (userPosition) {
    trackingPath.push(userPosition);
  }
  trackLine.setLatLngs(trackingPath);
  domStatDistance.textContent = '0 m';
  
  // Remove checkpoints if not in active race
  if (!raceActive) {
    checkpoints = [];
    checkpointMarkers.forEach(m => map.removeLayer(m));
    checkpointMarkers = [];
    checkpointPathLine.setLatLngs([]);
    domBtnStartRace.disabled = true;
    domTargetInstruction.textContent = "📍 Click on the map to set checkpoints";
    domTargetInstruction.style.color = "var(--text-secondary)";
  }
  
  updateDistanceDisplays();
  showToast('🧹 Tracking stats and checkpoints reset', 'success');
}

function startRace() {
  if (checkpoints.length === 0) {
    showToast('⚠️ Set at least one checkpoint first!', 'error');
    return;
  }
  if (!userPosition) {
    showToast('🛰️ Waiting for GPS lock before starting race...', 'error');
    return;
  }

  // Reset indices
  playerActiveCheckpointIndex = 0;
  botActiveCheckpointIndex = 0;

  // Set initial status classes to markers
  updateCheckpointMarkerClasses();

  // Set bot starting point at player's location
  botPosition = L.latLng(userPosition.lat, userPosition.lng);

  if (botMarker) {
    botMarker.setLatLng(botPosition);
  } else {
    const botIcon = L.divIcon({
      className: 'bot-marker',
      iconSize: [22, 22],
      iconAnchor: [11, 11]
    });
    botMarker = L.marker(botPosition, { icon: botIcon }).addTo(map);
  }

  raceActive = true;
  domBtnStartRace.style.display = 'none';
  domBtnCancelRace.style.display = 'inline-block';
  domInputBotSpeed.disabled = true;
  domTargetInstruction.textContent = "🏃💨 RACE IN PROGRESS! Hit every checkpoint!";
  domTargetInstruction.style.color = "var(--accent-cyan)";
  showToast('🏁 The race has started! Beat the bot!', 'success');

  // Start Bot movement simulation
  const updateIntervalMs = 200; // updates every 200ms
  raceInterval = setInterval(() => {
    simulateBotStep(updateIntervalMs);
  }, updateIntervalMs);
}

function cancelRace() {
  cleanupRace();
  showToast('⏹️ Race cancelled.', 'info');
}

function cleanupRace() {
  raceActive = false;
  if (raceInterval) {
    clearInterval(raceInterval);
    raceInterval = null;
  }
  if (botMarker) {
    map.removeLayer(botMarker);
    botMarker = null;
  }
  botPosition = null;
  
  domBtnStartRace.style.display = 'inline-block';
  domBtnCancelRace.style.display = 'none';
  domInputBotSpeed.disabled = false;
  
  // Reset marker styling
  checkpointMarkers.forEach(m => {
    const el = m.getElement();
    if (el) {
      el.className = 'leaflet-marker-icon target-marker';
    }
  });

  if (checkpoints.length > 0) {
    domTargetInstruction.textContent = `🎯 ${checkpoints.length} checkpoint(s) set. Click 'START RACE' to begin!`;
    domTargetInstruction.style.color = "var(--accent-green)";
  } else {
    domTargetInstruction.textContent = "📍 Click on the map to set checkpoints";
    domTargetInstruction.style.color = "var(--text-secondary)";
    domBtnStartRace.disabled = true;
  }
  
  updateDistanceDisplays();
}

function updateCheckpointMarkerClasses() {
  checkpointMarkers.forEach((marker, index) => {
    const el = marker.getElement();
    if (!el) return;

    // Reset classes
    el.className = 'leaflet-marker-icon target-marker';

    if (index < playerActiveCheckpointIndex) {
      el.classList.add('completed');
    } else if (index === playerActiveCheckpointIndex) {
      el.classList.add('active-player');
    } else if (index === botActiveCheckpointIndex) {
      el.classList.add('active-bot');
    }
  });
}

function simulateBotStep(intervalMs) {
  if (!raceActive || !botPosition || checkpoints.length === 0) return;

  const totalCPs = checkpoints.length;
  if (botActiveCheckpointIndex >= totalCPs) return;

  const currentCP = checkpoints[botActiveCheckpointIndex];
  const distRemaining = botPosition.distanceTo(currentCP);
  
  // Speed in m/s = speed in km/h / 3.6
  const speedMps = botSpeedKmh / 3.6;
  const distToMove = speedMps * (intervalMs / 1000);

  if (distRemaining <= distToMove || distRemaining <= 10) {
    // Bot reached current checkpoint
    botPosition = currentCP;
    botMarker.setLatLng(botPosition);
    botActiveCheckpointIndex++;
    
    showToast(`🤖 Bot reached Checkpoint ${botActiveCheckpointIndex}!`, 'error');

    if (botActiveCheckpointIndex >= totalCPs) {
      updateDistanceDisplays();
      endRace('bot');
      return;
    }

    updateCheckpointMarkerClasses();
  } else {
    // Interpolate bot position towards target
    const ratio = distToMove / distRemaining;
    const nextLat = botPosition.lat + (currentCP.lat - botPosition.lat) * ratio;
    const nextLng = botPosition.lng + (currentCP.lng - botPosition.lng) * ratio;
    
    botPosition = L.latLng(nextLat, nextLng);
    botMarker.setLatLng(botPosition);
  }
  
  updateDistanceDisplays();
  checkRaceConditions();
}

function checkRaceConditions() {
  if (!raceActive) return;

  // Check if player reached their active checkpoint (within 10 meters)
  const totalCPs = checkpoints.length;
  if (userPosition && playerActiveCheckpointIndex < totalCPs) {
    const activeCP = checkpoints[playerActiveCheckpointIndex];
    const playerDist = userPosition.distanceTo(activeCP);
    
    if (playerDist <= 10) {
      playerActiveCheckpointIndex++;
      showToast(`🏆 You reached Checkpoint ${playerActiveCheckpointIndex}!`, 'success');
      
      if (playerActiveCheckpointIndex >= totalCPs) {
        endRace('player');
        return;
      }
      updateCheckpointMarkerClasses();
    }
  }
}

function endRace(winner) {
  raceActive = false;
  if (raceInterval) {
    clearInterval(raceInterval);
    raceInterval = null;
  }

  // Final marker refresh to show full green on completion
  updateCheckpointMarkerClasses();

  if (winner === 'player') {
    showToast('🏆 CONGRATULATIONS! You beat the bot!', 'success');
    domTargetInstruction.textContent = "🎉 YOU WON the race!";
    domTargetInstruction.style.color = "var(--accent-green)";
    speakAnnouncement("Congratulations! You won the race and beat the bot!");
  } else {
    showToast('🤖 The Bot won the race! Try again!', 'error');
    domTargetInstruction.textContent = "💀 The Bot beat you!";
    domTargetInstruction.style.color = "var(--accent-red)";
    speakAnnouncement("The bot beat you. Better luck next time!");
  }

  // Keep bot and target markers visible to inspect, but change race actions
  domBtnStartRace.style.display = 'inline-block';
  domBtnStartRace.disabled = false;
  domBtnCancelRace.style.display = 'none';
  domInputBotSpeed.disabled = false;
}

function speakAnnouncement(text) {
  if ('speechSynthesis' in window) {
    // Cancel any ongoing speech
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
  }
}

function setupEventListeners() {
  domBtnReset.addEventListener('click', resetTracker);

  domBtnStyleStreet.addEventListener('click', () => {
    if (!map.hasLayer(streetLayer)) {
      map.removeLayer(satelliteLayer);
      streetLayer.addTo(map);
      domBtnStyleSatellite.classList.remove('active');
      domBtnStyleStreet.classList.add('active');
      showToast('🗺️ Switched to Street Map style', 'info');
    }
  });

  domBtnStyleSatellite.addEventListener('click', () => {
    if (!map.hasLayer(satelliteLayer)) {
      map.removeLayer(streetLayer);
      satelliteLayer.addTo(map);
      domBtnStyleStreet.classList.remove('active');
      domBtnStyleSatellite.classList.add('active');
      showToast('🛰️ Switched to Satellite view (zoom in to see houses)', 'info');
    }
  });

  // Bot Race controls
  domInputBotSpeed.addEventListener('input', (e) => {
    botSpeedKmh = parseFloat(e.target.value);
    domLabelBotSpeed.textContent = botSpeedKmh.toFixed(1);
  });

  domBtnStartRace.addEventListener('click', startRace);
  domBtnCancelRace.addEventListener('click', cancelRace);
}

// --- UTILITY: TOAST NOTIFICATIONS ---
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let emoji = '🛰️';
  if (type === 'success') emoji = '✅';
  if (type === 'error') emoji = '🚨';

  toast.innerHTML = `<span>${emoji}</span><span>${message}</span>`;
  domToastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

window.onload = init;

