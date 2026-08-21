/**
 * SMART CITY INFRASTRUCTURE ENGINE
 * Core Logic & Lifecycle Simulation
 */

// --- CENTRAL MOCK DATA ---
const mockData = {
    complaints: [
        { id: 'CR-1024', type: 'Pothole', severity: 'High', priority: 87, status: 'Contractor Assigned', lat: 16.12345, lng: 80.12345 },
        { id: 'CR-1025', type: 'Structural', severity: 'Medium', priority: 45, status: 'Verified', lat: 16.12500, lng: 80.12600 }
    ],
    drainage: [
        { lat: 16.12380, lng: 80.12390, type: 'Main Drain', risk: 'High' }
    ]
};

let currentReport = {
    image: null,
    coords: null,
    notes: ""
};

// --- VIEW NAVIGATION ---
function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    document.getElementById(viewId).classList.remove('hidden');
    
    // Manage Nav visibility
    if(viewId === 'view-login') {
        document.getElementById('app-nav').classList.add('hidden');
    } else {
        document.getElementById('app-nav').classList.remove('hidden');
        renderNavLinks();
    }

    // Special Dashboard Initializations
    if(viewId === 'view-officer-dash') initOfficerDashboard();
}

function renderNavLinks() {
    const role = document.getElementById('login-role').value;
    const container = document.getElementById('nav-links');
    let links = '';
    
    if(role === 'citizen') {
        links = `
            <a onclick="showView('view-citizen-dash')">Dashboard</a>
            <a onclick="showView('view-report-wizard')">Report Problem</a>
        `;
    } else {
        links = `
            <a onclick="showView('view-officer-dash')">Command Center</a>
            <a>GIS Map</a>
        `;
    }
    container.innerHTML = links;
}

// --- AUTH MOCK ---
function handleLogin() {
    const role = document.getElementById('login-role').value;
    document.getElementById('nav-role-badge').innerText = role.charAt(0).toUpperCase() + role.slice(1);
    
    if(role === 'officer') showView('view-officer-dash');
    else showView('view-citizen-dash');
}

function logout() {
    showView('view-login');
}

// --- CAMERA API ---
let videoStream = null;

async function startCamera() {
    const video = document.getElementById('camera-stream');
    try {
        videoStream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: "environment" }, 
            audio: false 
        });
        video.srcObject = videoStream;
        video.classList.remove('hidden');
        document.getElementById('camera-placeholder').classList.add('hidden');
        document.getElementById('btn-open-camera').classList.add('hidden');
        document.getElementById('btn-capture').classList.remove('hidden');
    } catch (err) {
        alert("Camera access denied. Please check permissions.");
    }
}

function capturePhoto() {
    const video = document.getElementById('camera-stream');
    const preview = document.getElementById('photo-preview');
    const canvas = document.createElement('canvas');
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    
    const dataUrl = canvas.toDataURL('image/jpeg');
    currentReport.image = dataUrl;
    preview.src = dataUrl;
    
    preview.classList.remove('hidden');
    video.classList.add('hidden');
    
    // Stop stream
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
    }
    
    validateStep();
}

function handleUpload(event) {
    const file = event.target.files[0];
    const reader = new FileReader();
    reader.onload = function(e) {
        currentReport.image = e.target.result;
        const preview = document.getElementById('photo-preview');
        preview.src = e.target.result;
        preview.classList.remove('hidden');
        document.getElementById('camera-placeholder').classList.add('hidden');
        validateStep();
    }
    reader.readAsDataURL(file);
}

// --- GPS API ---
function captureGPS() {
    const display = document.getElementById('location-display');
    display.innerHTML = `<div class="loc-text">🛰️ Acquiring satellites...</div>`;

    if (!navigator.geolocation) {
        display.innerHTML = `<div class="loc-text text-danger">GPS not supported</div>`;
        return;
    }

    navigator.geolocation.getCurrentPosition((position) => {
        const { latitude, longitude, accuracy } = position.coords;
        currentReport.coords = { lat: latitude, lng: longitude, acc: accuracy };
        
        display.innerHTML = `
            <div class="loc-text">
                <strong>✓ Location Locked</strong><br>
                Lat: ${latitude.toFixed(5)}, Lng: ${longitude.toFixed(5)} (±${Math.round(accuracy)}m)
            </div>
            <button class="btn-secondary" onclick="captureGPS()">Refresh</button>
        `;
        
        showMiniMap(latitude, longitude);
        validateStep();
    }, (err) => {
        display.innerHTML = `<div class="loc-text text-danger">Permission denied / Timeout</div>`;
    }, { enableHighAccuracy: true });
}

let mapInstance = null;
function showMiniMap(lat, lng) {
    document.getElementById('mini-map').classList.remove('hidden');
    if (mapInstance) mapInstance.remove();
    
    mapInstance = L.map('mini-map').setView([lat, lng], 16);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapInstance);
    L.marker([lat, lng]).addTo(mapInstance).bindPopup("Defect Location").openPopup();
}

function validateStep() {
    const btn = document.getElementById('btn-analyze');
    if(currentReport.image && currentReport.coords) {
        btn.disabled = false;
    }
}

// --- AI ANALYSIS SIMULATION ---
function runAnalysisSequence() {
    showView('view-processing');
    const steps = document.querySelectorAll('#analysis-steps li');
    
    steps.forEach((step, index) => {
        setTimeout(() => {
            step.classList.add('done');
            if(index === steps.length - 1) {
                setTimeout(() => finalizeAnalysis(), 800);
            }
        }, (index + 1) * 700);
    });
}

function finalizeAnalysis() {
    document.getElementById('result-img').src = currentReport.image;
    showView('view-results');
}

function updateFutureRisk(scenario) {
    const bar = document.getElementById('risk-bar');
    const label = document.getElementById('risk-label');
    const btns = document.querySelectorAll('.risk-scenario button');
    
    btns.forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');

    if(scenario === 'normal') {
        bar.style.width = '45%';
        bar.style.backgroundColor = 'var(--warning)';
        label.innerText = 'Scenario Risk: MODERATE';
    } else {
        bar.style.width = '85%';
        bar.style.backgroundColor = 'var(--danger)';
        label.innerText = 'Scenario Risk: VERY HIGH';
    }
}

// --- OFFICER DASHBOARD ---
function initOfficerDashboard() {
    renderOfficerTable();
    initOfficerMap();
}

function renderOfficerTable() {
    const tbody = document.getElementById('officer-table-body');
    tbody.innerHTML = mockData.complaints.map(item => `
        <tr>
            <td>${item.id}</td>
            <td>${item.type}</td>
            <td><span class="badge danger">${item.priority}/100</span></td>
            <td>High Risk</td>
            <td>${item.status}</td>
            <td><button class="btn-primary" style="padding:4px 8px; font-size:0.7rem">Review</button></td>
        </tr>
    `).join('');
}

function initOfficerMap() {
    // Map center based on mock data
    const map = L.map('officer-map').setView([16.12345, 80.12345], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

    // Add Potholes
    mockData.complaints.forEach(p => {
        L.circleMarker([p.lat, p.lng], { color: 'red', radius: 8 }).addTo(map)
         .bindPopup(`Defect ${p.id}: ${p.type}`);
    });

    // Add Drains
    mockData.drainage.forEach(d => {
        L.marker([d.lat, d.lng], { icon: L.icon({
            iconUrl: 'https://cdn-icons-png.flaticon.com/512/566/566519.png',
            iconSize: [25, 25]
        })}).addTo(map).bindPopup("Storm Drain - Priority Zone");
    });
}

// --- INITIALIZATION ---
window.onload = () => {
    // Start at login
    showView('view-login');
};