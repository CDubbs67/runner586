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

function updateLocation(latlng, accuracy, speedMps) {
  userPosition = latlng;
  userMarker.setLatLng(latlng);
  
  // Pan map to player
  map.panTo(latlng);

  // Update Coordinates in HUD
  domCoordLat.textContent = latlng.lat.toFixed(6);
  domCoordLng.textContent = latlng.lng.toFixed(6);

  // Update accuracy status
  domGpsAccuracy.textContent = `±${Math.round(accuracy)}m`;

  // Calculate speed (if API returns it, use it; otherwise estimate)
  let speedKmh = 0;
  if (speedMps !== null && speedMps !== undefined && speedMps >= 0) {
    speedKmh = speedMps * 3.6;
  } else if (lastLatLng) {
    // Basic fallback calculation
    const meters = lastLatLng.distanceTo(latlng);
    // Approximate speed assuming updates occur around every 1-2s
    speedKmh = (meters * 3.6) / 2;
  }
  domStatSpeed.textContent = `${speedKmh.toFixed(1)} km/h`;

  // Calculate cumulative distance and trace the trail
  if (lastLatLng) {
    const segmentMeters = lastLatLng.distanceTo(latlng);
    
    // Only count movement if accuracy is decent and user actually moved > 2 meters
    // (prevents GPS jitter from inflating distance while standing still)
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
  showToast('🧹 Tracking stats and path reset', 'success');
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
