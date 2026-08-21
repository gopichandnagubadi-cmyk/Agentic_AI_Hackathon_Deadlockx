/**
 * SMART CITY INFRASTRUCTURE LIFECYCLE ENGINE
 *
 * Current version:
 * Frontend prototype
 *
 * Future:
 * FastAPI + PostgreSQL/Supabase + ML model + GIS services
 */


/* =====================================================
   CENTRAL DATA
===================================================== */

const mockData = {

    complaints: [

        {
            id: "CR-1024",
            type: "Pothole",
            severity: "High",
            priority: 87,

            status: "Contractor Assigned",

            city: "Guntur",
            area: "Ward 12",

            latitude: 16.12345,
            longitude: 80.12345,

            accuracy: 12,

            waterRisk: "High",

            drainageDistance: 42,

            workOrderId: "WO-102"
        },

        {
            id: "CR-1025",
            type: "Structural Defect",
            severity: "Medium",
            priority: 45,

            status: "Verified",

            city: "Guntur",
            area: "Ward 8",

            latitude: 16.12500,
            longitude: 80.12600,

            accuracy: 15,

            waterRisk: "Medium",

            drainageDistance: 85,

            workOrderId: null
        }

    ],


    drainage: [

        {
            latitude: 16.12380,
            longitude: 80.12390,

            type: "Main Drain",
            risk: "High"
        }

    ],


    waterlogging: [

        {
            latitude: 16.12420,
            longitude: 80.12410,

            risk: "High"
        }

    ],


    workOrders: [

        {
            id: "WO-102",

            complaintId: "CR-1024",

            type: "Pothole Repair",

            priority: 87,

            location: "Ward 12, Guntur",

            latitude: 16.12345,
            longitude: 80.12345,

            status: "Assigned",

            contractor: "ABC Road Works",

            assignedDate: "2026-08-21",

            description:
                "Repair high-severity pothole near drainage corridor.",

            beforeImage: null,

            afterImage: null,

            verification: "Pending"

        }

    ]

};


/* =====================================================
   CURRENT REPORT
===================================================== */

let currentReport = {

    complaintId: null,

    image: null,

    coords: null,

    notes: "",

    city: "",

    address: "",

    defectType: "Pothole"

};


let currentRole = null;

let videoStream = null;

let citizenMap = null;

let officerMap = null;


/* =====================================================
   NAVIGATION
===================================================== */

function showView(viewId) {

    document
        .querySelectorAll(".view")
        .forEach(view => {

            view.classList.add("hidden");

        });


    const target = document.getElementById(viewId);

    if (!target) return;

    target.classList.remove("hidden");


    const nav = document.getElementById("app-nav");

    if (viewId === "view-login") {

        nav.classList.add("hidden");

    } else {

        nav.classList.remove("hidden");

        renderNavLinks();

    }


    if (viewId === "view-officer-dash") {

        setTimeout(initOfficerDashboard, 100);

    }


    if (viewId === "view-contractor-dash") {

        renderContractorDashboard();

    }

}


/* =====================================================
   ROLE NAVIGATION
===================================================== */

function renderNavLinks() {

    const container =
        document.getElementById("nav-links");


    if (!container) return;


    if (currentRole === "citizen") {

        container.innerHTML = `

            <a onclick="showView('view-citizen-dash')">
                Dashboard
            </a>

            <a onclick="startNewReport()">
                Report Problem
            </a>

        `;

    }


    else if (currentRole === "officer") {

        container.innerHTML = `

            <a onclick="showView('view-officer-dash')">
                Command Center
            </a>

        `;

    }


    else if (currentRole === "contractor") {

        container.innerHTML = `

            <a onclick="showView('view-contractor-dash')">
                Work Center
            </a>

        `;

    }

}


/* =====================================================
   LOGIN
===================================================== */

function handleLogin() {

    currentRole =
        document.getElementById("login-role").value;


    const badge =
        document.getElementById("nav-role-badge");


    badge.innerText =
        getRoleName(currentRole);


    if (currentRole === "citizen") {

        renderCitizenHistory();

        showView("view-citizen-dash");

    }


    else if (currentRole === "officer") {

        showView("view-officer-dash");

    }


    else if (currentRole === "contractor") {

        showView("view-contractor-dash");

    }

}


function getRoleName(role) {

    const names = {

        citizen: "Citizen",

        officer: "Municipal Officer",

        contractor: "Contractor"

    };

    return names[role] || role;

}


function logout() {

    currentRole = null;

    stopCamera();

    showView("view-login");

}


/* =====================================================
   NEW REPORT
===================================================== */

function startNewReport() {

    currentReport = {

        complaintId: null,

        image: null,

        coords: null,

        notes: "",

        city: "",

        address: "",

        defectType: "Pothole"

    };


    resetReportUI();

    showView("view-report-wizard");

}


function resetReportUI() {

    const preview =
        document.getElementById("photo-preview");

    preview.src = "";

    preview.classList.add("hidden");


    const video =
        document.getElementById("camera-stream");

    video.classList.add("hidden");


    document
        .getElementById("camera-placeholder")
        .classList.remove("hidden");


    document
        .getElementById("btn-open-camera")
        .classList.remove("hidden");


    document
        .getElementById("btn-capture")
        .classList.add("hidden");


    document
        .getElementById("manual-location-form")
        .classList.add("hidden");


    document
        .getElementById("mini-map")
        .classList.add("hidden");


    document
        .getElementById("report-notes")
        .value = "";


    document
        .getElementById("btn-analyze")
        .disabled = true;


    document
        .getElementById("location-display")
        .innerHTML = `

            <div class="location-empty">

                <strong>
                    Location not captured
                </strong>

                <span>
                    Use GPS or enter the location manually.
                </span>

            </div>

            <button
                class="btn-secondary"
                onclick="captureGPS()"
            >
                📍 Use My Current Location
            </button>

        `;


    stopCamera();

}


/* =====================================================
   CAMERA
===================================================== */

async function startCamera() {

    if (!navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia) {

        alert(
            "Camera access is not supported by this browser."
        );

        return;

    }


    try {

        videoStream =
            await navigator.mediaDevices.getUserMedia({

                video: {
                    facingMode: {
                        ideal: "environment"
                    }
                },

                audio: false

            });


        const video =
            document.getElementById("camera-stream");


        video.srcObject = videoStream;


        video.classList.remove("hidden");


        document
            .getElementById("camera-placeholder")
            .classList.add("hidden");


        document
            .getElementById("btn-open-camera")
            .classList.add("hidden");


        document
            .getElementById("btn-capture")
            .classList.remove("hidden");

    }


    catch (error) {

        alert(
            "Camera access was denied or unavailable. " +
            "Please check browser permissions."
        );

    }

}


function capturePhoto() {

    const video =
        document.getElementById("camera-stream");


    if (!video.videoWidth) {

        alert("Camera is not ready yet.");

        return;

    }


    const canvas =
        document.createElement("canvas");


    canvas.width = video.videoWidth;

    canvas.height = video.videoHeight;


    const context =
        canvas.getContext("2d");


    context.drawImage(
        video,
        0,
        0,
        canvas.width,
        canvas.height
    );


    currentReport.image =
        canvas.toDataURL("image/jpeg", 0.85);


    const preview =
        document.getElementById("photo-preview");


    preview.src =
        currentReport.image;


    preview.classList.remove("hidden");

    video.classList.add("hidden");


    stopCamera();


    validateReport();

}


function handleUpload(event) {

    const file =
        event.target.files[0];


    if (!file) return;


    if (!file.type.startsWith("image/")) {

        alert("Please select an image.");

        return;

    }


    const reader =
        new FileReader();


    reader.onload = function(e) {

        currentReport.image =
            e.target.result;


        const preview =
            document.getElementById("photo-preview");


        preview.src =
            e.target.result;


        preview.classList.remove("hidden");


        document
            .getElementById("camera-placeholder")
            .classList.add("hidden");


        validateReport();

    };


    reader.readAsDataURL(file);

}


function stopCamera() {

    if (!videoStream) return;


    videoStream
        .getTracks()
        .forEach(track => track.stop());


    videoStream = null;

}


/* =====================================================
   GPS
===================================================== */

function captureGPS() {

    const display =
        document.getElementById("location-display");


    display.innerHTML = `

        <div class="location-empty">

            <strong>
                🛰️ Acquiring location...
            </strong>

            <span>
                Please allow location access.
            </span>

        </div>

    `;


    if (!navigator.geolocation) {

        showGPSMessage(
            "Your browser does not support GPS location.",
            true
        );

        return;

    }


    navigator.geolocation.getCurrentPosition(

        async function(position) {

            const {

                latitude,
                longitude,
                accuracy

            } = position.coords;


            currentReport.coords = {

                latitude,

                longitude,

                accuracy,

                timestamp:
                    new Date().toISOString()

            };


            await reverseGeocode(
                latitude,
                longitude
            );


            renderLocation();


            showMiniMap(
                latitude,
                longitude
            );


            validateReport();

        },


        function(error) {

            let message;


            switch (error.code) {

                case error.PERMISSION_DENIED:

                    message =
                        "Location permission was denied. GPS is required for accurate GIS mapping.";

                    break;


                case error.POSITION_UNAVAILABLE:

                    message =
                        "Unable to determine your current location.";

                    break;


                case error.TIMEOUT:

                    message =
                        "Location request timed out.";

                    break;


                default:

                    message =
                        "Unable to determine your location.";

            }


            showGPSMessage(message, true);

        },


        {

            enableHighAccuracy: true,

            timeout: 15000,

            maximumAge: 0

        }

    );

}


function showGPSMessage(message, isError = false) {

    const status =
        document.getElementById("gps-status");


    status.classList.remove("hidden");


    status.style.background =
        isError ? "#ffebe6" : "#e3fcef";


    status.style.color =
        isError ? "#de350b" : "#00875a";


    status.innerText =
        message;


    document
        .getElementById("location-display")
        .innerHTML = `

            <div class="location-empty">

                <strong>
                    Location unavailable
                </strong>

                <span>
                    ${message}
                </span>

            </div>

            <button
                class="btn-secondary"
                onclick="captureGPS()"
            >
                Try Again
            </button>

        `;

}


/* =====================================================
   REVERSE GEOCODING
===================================================== */

async function reverseGeocode(latitude, longitude) {

    try {

        const url =
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`;


        const response =
            await fetch(url, {

                headers: {
                    "Accept": "application/json"
                }

            });


        if (!response.ok) {

            throw new Error(
                "Reverse geocoding failed"
            );

        }


        const data =
            await response.json();


        currentReport.city =
            data.address?.city ||
            data.address?.town ||
            data.address?.municipality ||
            data.address?.village ||
            "Unknown";


        currentReport.address =
            data.display_name ||
            "Address unavailable";

    }


    catch (error) {

        currentReport.city =
            "Location detected";


        currentReport.address =
            "Address lookup unavailable";

    }

}


/* =====================================================
   RENDER LOCATION
===================================================== */

function renderLocation() {

    if (!currentReport.coords) return;


    const {

        latitude,
        longitude,
        accuracy

    } = currentReport.coords;


    document
        .getElementById("location-display")
        .innerHTML = `

            <div class="location-empty">

                <strong>
                    ✓ GPS Location Captured
                </strong>

                <span>
                    📍 ${escapeHTML(currentReport.city)}
                </span>

                <span>
                    Latitude:
                    ${latitude.toFixed(6)}
                </span>

                <span>
                    Longitude:
                    ${longitude.toFixed(6)}
                </span>

                <span>
                    Accuracy:
                    ±${Math.round(accuracy)} m
                </span>

            </div>


            <button
                class="btn-secondary"
                onclick="captureGPS()"
            >
                Refresh Location
            </button>

        `;

}


/* =====================================================
   MANUAL LOCATION
===================================================== */

function toggleManualLocation() {

    document
        .getElementById("manual-location-form")
        .classList.toggle("hidden");

}


async function useManualLocation() {

    const latitude =
        parseFloat(
            document.getElementById(
                "manual-latitude"
            ).value
        );


    const longitude =
        parseFloat(
            document.getElementById(
                "manual-longitude"
            ).value
        );


    if (
        Number.isNaN(latitude) ||
        Number.isNaN(longitude)
    ) {

        alert(
            "Please enter valid latitude and longitude."
        );

        return;

    }


    if (
        latitude < -90 ||
        latitude > 90
    ) {

        alert(
            "Latitude must be between -90 and 90."
        );

        return;

    }


    if (
        longitude < -180 ||
        longitude > 180
    ) {

        alert(
            "Longitude must be between -180 and 180."
        );

        return;

    }


    currentReport.coords = {

        latitude,

        longitude,

        accuracy: null,

        timestamp:
            new Date().toISOString(),

        source: "manual"

    };


    await reverseGeocode(
        latitude,
        longitude
    );


    renderLocation();


    showMiniMap(
        latitude,
        longitude
    );


    validateReport();

}


/* =====================================================
   MINI MAP
===================================================== */

function showMiniMap(latitude, longitude) {

    const element =
        document.getElementById("mini-map");


    element.classList.remove("hidden");


    if (citizenMap) {

        citizenMap.remove();

        citizenMap = null;

    }


    citizenMap =
        L.map("mini-map")
        .setView(
            [latitude, longitude],
            16
        );


    L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {

            attribution:
                "&copy; OpenStreetMap contributors"

        }
    ).addTo(citizenMap);


    L.marker(
        [latitude, longitude]
    )
    .addTo(citizenMap)
    .bindPopup(
        `<strong>Defect Location</strong><br>
         ${escapeHTML(currentReport.city)}`
    )
    .openPopup();

}


/* =====================================================
   VALIDATE REPORT
===================================================== */

function validateReport() {

    const submitButton =
        document.getElementById(
            "btn-analyze"
        );


    submitButton.disabled =
        !(currentReport.image &&
          currentReport.coords);

}


/* =====================================================
   AI ANALYSIS SIMULATION
===================================================== */

function runAnalysisSequence() {

    currentReport.notes =
        document.getElementById(
            "report-notes"
        ).value;


    showView("view-processing");


    const steps =
        document.querySelectorAll(
            "#analysis-steps li"
        );


    steps.forEach(step => {

        step.classList.remove("done");

    });


    steps.forEach(
        (step, index) => {

            setTimeout(

                () => {

                    step.classList.add("done");


                    if (
                        index ===
                        steps.length - 1
                    ) {

                        setTimeout(
                            finalizeAnalysis,
                            700
                        );

                    }

                },

                (index + 1) * 650

            );

        }

    );

}


/* =====================================================
   FINALIZE ANALYSIS
===================================================== */

function finalizeAnalysis() {

    currentReport.complaintId =
        "CR-" +
        Math.floor(
            1000 +
            Math.random() * 9000
        );


    const image =
        document.getElementById(
            "result-img"
        );


    image.src =
        currentReport.image;


    renderResultLocation();


    showView("view-results");

}


/* =====================================================
   RESULT LOCATION
===================================================== */

function renderResultLocation() {

    const container =
        document.getElementById(
            "result-location"
        );


    const {
        latitude,
        longitude,
        accuracy
    } = currentReport.coords;


    container.innerHTML = `

        <strong>
            ${escapeHTML(currentReport.city)}
        </strong>

        <br>

        Address:
        ${escapeHTML(currentReport.address)}

        <br>

        Latitude:
        ${latitude.toFixed(6)}

        <br>

        Longitude:
        ${longitude.toFixed(6)}

        <br>

        Accuracy:
        ${
            accuracy
            ? "±" + Math.round(accuracy) + " m"
            : "Manual location"
        }

    `;

}


/* =====================================================
   FUTURE RISK
===================================================== */

function updateFutureRisk(
    scenario,
    clickedButton
) {

    document
        .querySelectorAll(
            ".risk-scenario button"
        )
        .forEach(button => {

            button.classList.remove("active");

        });


    clickedButton.classList.add("active");


    const bar =
        document.getElementById(
            "risk-bar"
        );


    const label =
        document.getElementById(
            "risk-label"
        );


    if (scenario === "normal") {

        bar.style.width = "45%";

        label.innerText =
            "Scenario Risk: MODERATE";

    }


    else if (scenario === "heavy") {

        bar.style.width = "85%";

        label.innerText =
            "Scenario Risk: VERY HIGH";

    }


    else {

        bar.style.width = "95%";

        label.innerText =
            "Scenario Risk: EXTREME";

    }

}


/* =====================================================
   FINISH CITIZEN REPORT
===================================================== */

function finishReport() {

    if (!currentReport.coords) return;


    mockData.complaints.unshift({

        id: currentReport.complaintId,

        type: "Pothole",

        severity: "High",

        priority: 87,

        status: "Reported",

        city: currentReport.city,

        area: "New Citizen Report",

        latitude:
            currentReport.coords.latitude,

        longitude:
            currentReport.coords.longitude,

        accuracy:
            currentReport.coords.accuracy,

        waterRisk: "High",

        drainageDistance: 42,

        workOrderId: null

    });


    renderCitizenHistory();


    showView(
        "view-citizen-dash"
    );

}


/* =====================================================
   CITIZEN HISTORY
===================================================== */

function renderCitizenHistory() {

    const container =
        document.getElementById(
            "citizen-history-list"
        );


    if (!container) return;


    container.innerHTML =
        mockData.complaints
        .slice(0, 5)
        .map(item => `

            <div class="work-order-card">

                <div class="work-order-header">

                    <div>

                        <strong>
                            ${item.id}
                        </strong>

                        <h3>
                            ${escapeHTML(item.type)}
                        </h3>

                    </div>

                    <span class="badge badge-danger">
                        ${escapeHTML(item.status)}
                    </span>

                </div>


                <p>
                    📍 ${escapeHTML(item.city)}
                </p>

                <p>
                    Coordinates:
                    ${item.latitude.toFixed(5)},
                    ${item.longitude.toFixed(5)}
                </p>

                <p>
                    Priority:
                    <strong>
                        ${item.priority}/100
                    </strong>
                </p>

            </div>

        `)
        .join("");

}


/* =====================================================
   OFFICER DASHBOARD
===================================================== */

function initOfficerDashboard() {

    renderOfficerTable();

    initOfficerMap();

    document.getElementById(
        "officer-total"
    ).innerText =
        mockData.complaints.length;

}


/* =====================================================
   OFFICER TABLE
===================================================== */

function renderOfficerTable() {

    const tbody =
        document.getElementById(
            "officer-table-body"
        );


    tbody.innerHTML =
        mockData.complaints
        .map(item => `

            <tr>

                <td>
                    <strong>
                        ${item.id}
                    </strong>
                </td>

                <td>
                    ${escapeHTML(item.type)}
                </td>

                <td>

                    <strong>
                        ${escapeHTML(item.city)}
                    </strong>

                    <br>

                    <small>
                        ${escapeHTML(item.area)}
                    </small>

                </td>

                <td>

                    ${item.latitude.toFixed(6)}

                    <br>

                    ${item.longitude.toFixed(6)}

                    <br>

                    <small>
                        ±${item.accuracy || "N/A"}m
                    </small>

                </td>

                <td>

                    <span class="badge badge-danger">
                        ${item.priority}/100
                    </span>

                </td>

                <td>
                    ${escapeHTML(item.waterRisk)}
                </td>

                <td>
                    ${escapeHTML(item.status)}
                </td>

                <td>

                    <button
                        class="btn-primary"
                        onclick="reviewComplaint('${item.id}')"
                    >
                        Review
                    </button>

                </td>

            </tr>

        `)
        .join("");

}


/* =====================================================
   OFFICER MAP
===================================================== */

function initOfficerMap() {

    const mapElement =
        document.getElementById(
            "officer-map"
        );


    if (!mapElement) return;


    if (officerMap) {

        officerMap.remove();

        officerMap = null;

    }


    const first =
        mockData.complaints[0];


    officerMap =
        L.map("officer-map")
        .setView(
            [
                first.latitude,
                first.longitude
            ],
            14
        );


    L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {

            attribution:
                "&copy; OpenStreetMap contributors"

        }
    ).addTo(officerMap);


    mockData.complaints.forEach(
        complaint => {

            L.circleMarker(

                [
                    complaint.latitude,
                    complaint.longitude
                ],

                {

                    radius: 9,

                    color:
                        complaint.priority >= 70
                        ? "#de350b"
                        : "#0047bb",

                    fillOpacity: 0.8

                }

            )

            .addTo(officerMap)

            .bindPopup(`

                <strong>
                    ${complaint.id}
                </strong>

                <br>

                ${escapeHTML(
                    complaint.type
                )}

                <br>

                📍 ${escapeHTML(
                    complaint.city
                )}

                <br>

                Lat:
                ${complaint.latitude.toFixed(6)}

                <br>

                Lng:
                ${complaint.longitude.toFixed(6)}

                <br>

                Priority:
                ${complaint.priority}/100

            `);

        }

    );


    mockData.drainage.forEach(
        drain => {

            L.circleMarker(

                [
                    drain.latitude,
                    drain.longitude
                ],

                {

                    radius: 7,

                    color: "#00875a",

                    fillColor: "#00875a",

                    fillOpacity: 0.8

                }

            )

            .addTo(officerMap)

            .bindPopup(
                "🚰 Drainage Point"
            );

        }

    );


    mockData.waterlogging.forEach(
        hotspot => {

            L.circleMarker(

                [
                    hotspot.latitude,
                    hotspot.longitude
                ],

                {

                    radius: 10,

                    color: "#0047bb",

                    fillColor: "#0047bb",

                    fillOpacity: 0.3

                }

            )

            .addTo(officerMap)

            .bindPopup(
                "💧 Waterlogging Hotspot"
            );

        }

    );

}


/* =====================================================
   OFFICER REVIEW
===================================================== */

function reviewComplaint(id) {

    const complaint =
        mockData.complaints.find(
            item => item.id === id
        );


    if (!complaint) return;


    const panel =
        document.getElementById(
            "officer-detail-panel"
        );


    panel.classList.remove("hidden");


    panel.innerHTML = `

        <h3>
            Defect Review — ${complaint.id}
        </h3>

        <br>

        <p>
            <strong>Type:</strong>
            ${escapeHTML(complaint.type)}
        </p>

        <p>
            <strong>City:</strong>
            ${escapeHTML(complaint.city)}
        </p>

        <p>
            <strong>Area:</strong>
            ${escapeHTML(complaint.area)}
        </p>

        <p>
            <strong>Latitude:</strong>
            ${complaint.latitude.toFixed(6)}
        </p>

        <p>
            <strong>Longitude:</strong>
            ${complaint.longitude.toFixed(6)}
        </p>

        <p>
            <strong>Priority:</strong>
            ${complaint.priority}/100
        </p>

        <p>
            <strong>Water Risk:</strong>
            ${escapeHTML(complaint.waterRisk)}
        </p>

        <hr>

        <br>

        ${
            complaint.workOrderId

            ? `<button
                    class="btn-secondary"
                    onclick="openWorkOrder('${complaint.workOrderId}')"
               >
                    View Work Order
               </button>`

            : `<button
                    class="btn-primary"
                    onclick="createWorkOrder('${complaint.id}')"
               >
                    Create Work Order
               </button>`
        }

    `;

}


/* =====================================================
   CREATE WORK ORDER
===================================================== */

function createWorkOrder(complaintId) {

    const complaint =
        mockData.complaints.find(
            item => item.id === complaintId
        );


    if (!complaint) return;


    const workOrderId =
        "WO-" +
        Math.floor(
            100 +
            Math.random() * 900
        );


    mockData.workOrders.push({

        id: workOrderId,

        complaintId,

        type:
            complaint.type +
            " Repair",

        priority:
            complaint.priority,

        location:
            `${complaint.area}, ${complaint.city}`,

        latitude:
            complaint.latitude,

        longitude:
            complaint.longitude,

        status: "Assigned",

        contractor: "ABC Road Works",

        assignedDate:
            new Date().toISOString()
                .split("T")[0],

        description:
            "Repair road defect and restore safe road surface.",

        beforeImage: null,

        afterImage: null,

        verification: "Pending"

    });


    complaint.workOrderId =
        workOrderId;


    complaint.status =
        "Contractor Assigned";


    renderOfficerTable();


    reviewComplaint(complaintId);


    alert(
        `Work Order ${workOrderId} created and assigned to contractor.`
    );

}


/* =====================================================
   CONTRACTOR DASHBOARD
===================================================== */

function renderContractorDashboard() {

    const container =
        document.getElementById(
            "contractor-work-orders"
        );


    const orders =
        mockData.workOrders;


    document.getElementById(
        "contractor-assigned-count"
    ).innerText =
        orders.filter(
            order =>
                order.status !== "Completed"
        ).length;


    container.innerHTML =
        orders.map(order => `

            <div class="work-order-card">

                <div class="work-order-header">

                    <div>

                        <span class="eyebrow">
                            WORK ORDER
                        </span>

                        <h3>
                            ${order.id}
                        </h3>

                        <p>
                            ${escapeHTML(order.type)}
                        </p>

                    </div>


                    <span class="badge badge-danger">
                        ${escapeHTML(order.status)}
                    </span>

                </div>


                <br>


                <p>
                    📍 ${escapeHTML(order.location)}
                </p>

                <p>
                    Coordinates:
                    ${order.latitude.toFixed(6)},
                    ${order.longitude.toFixed(6)}
                </p>

                <p>
                    Priority:
                    <strong>
                        ${order.priority}/100
                    </strong>
                </p>


                <div class="work-order-actions">

                    <button
                        class="btn-primary"
                        onclick="openWorkOrder('${order.id}')"
                    >
                        Open Work Order
                    </button>

                </div>

            </div>

        `)
        .join("");

}


/* =====================================================
   OPEN WORK ORDER
===================================================== */

function openWorkOrder(workOrderId) {

    const order =
        mockData.workOrders.find(
            item => item.id === workOrderId
        );


    if (!order) return;


    const container =
        document.getElementById(
            "work-order-details"
        );


    container.innerHTML = `

        <span class="eyebrow">
            MUNICIPAL WORK ORDER
        </span>

        <h2>
            ${order.id}
        </h2>

        <br>

        <p>
            <strong>Repair:</strong>
            ${escapeHTML(order.type)}
        </p>

        <p>
            <strong>Location:</strong>
            ${escapeHTML(order.location)}
        </p>

        <p>
            <strong>Coordinates:</strong>
            ${order.latitude.toFixed(6)},
            ${order.longitude.toFixed(6)}
        </p>

        <p>
            <strong>Priority:</strong>
            ${order.priority}/100
        </p>

        <p>
            <strong>Contractor:</strong>
            ${escapeHTML(order.contractor)}
        </p>


        <div class="lifecycle">

            ${lifecycleStep(
                "Assigned",
                order.status,
                ["Assigned"]
            )}

            ${lifecycleStep(
                "Accepted",
                order.status,
                ["Accepted"]
            )}

            ${lifecycleStep(
                "Repair In Progress",
                order.status,
                ["In Progress"]
            )}

            ${lifecycleStep(
                "Repair Completed",
                order.status,
                ["Completed"]
            )}

            ${lifecycleStep(
                "Municipal Verification",
                order.verification,
                ["Verified"]
            )}

        </div>


        <div class="work-order-actions">

            ${
                order.status === "Assigned"

                ? `<button
                        class="btn-primary"
                        onclick="updateWorkOrder('${order.id}', 'Accepted')"
                   >
                        Accept Work Order
                   </button>`

                : ""
            }


            ${
                order.status === "Accepted"

                ? `<button
                        class="btn-primary"
                        onclick="updateWorkOrder('${order.id}', 'In Progress')"
                   >
                        Start Repair
                   </button>`

                : ""
            }


            ${
                order.status === "In Progress"

                ? `

                    <label class="btn-outline">

                        Upload After-Repair Evidence

                        <input
                            type="file"
                            accept="image/*"
                            onchange="uploadRepairEvidence(event, '${order.id}')"
                            style="display:none"
                        >

                    </label>

                  `

                : ""

            }


            ${
                order.status === "Completed" &&
                order.verification === "Pending"

                ? `<p>
                        ⏳ Awaiting municipal verification.
                   </p>`

                : ""

            }

        </div>


        ${
            order.afterImage

            ? `

                <hr>

                <br>

                <h3>
                    After-Repair Evidence
                </h3>

                <img
                    src="${order.afterImage}"
                    style="
                        width:100%;
                        max-height:400px;
                        object-fit:cover;
                        border-radius:8px;
                        margin-top:1rem;
                    "
                >

              `

            : ""

        }


        ${
            order.verification === "Pending" &&
            order.status === "Completed"

            ? `

                <div class="detail-panel">

                    <strong>
                        Awaiting Officer Verification
                    </strong>

                </div>

              `

            : ""

        }

    `;


    showView("view-work-order");

}


/* =====================================================
   LIFECYCLE STEP
===================================================== */

function lifecycleStep(
    name,
    current,
    completedStates
) {

    let className =
        "lifecycle-step";


    if (
        completedStates.includes(current)
    ) {

        className += " current";

    }


    return `
        <div class="${className}">
            ${name}
        </div>
    `;

}


/* =====================================================
   WORK ORDER UPDATE
===================================================== */

function updateWorkOrder(
    workOrderId,
    newStatus
) {

    const order =
        mockData.workOrders.find(
            item => item.id === workOrderId
        );


    if (!order) return;


    order.status =
        newStatus;


    if (newStatus === "In Progress") {

        const complaint =
            mockData.complaints.find(
                item =>
                    item.id ===
                    order.complaintId
            );


        if (complaint) {

            complaint.status =
                "Repair In Progress";

        }

    }


    if (newStatus === "Completed") {

        order.verification =
            "Pending";

    }


    openWorkOrder(workOrderId);

}


/* =====================================================
   AFTER REPAIR EVIDENCE
===================================================== */

function uploadRepairEvidence(
    event,
    workOrderId
) {

    const file =
        event.target.files[0];


    if (!file) return;


    if (!file.type.startsWith("image/")) {

        alert(
            "Please upload an image."
        );

        return;

    }


    const reader =
        new FileReader();


    reader.onload = function(e) {

        const order =
            mockData.workOrders.find(
                item =>
                    item.id ===
                    workOrderId
            );


        if (!order) return;


        order.afterImage =
            e.target.result;


        order.status =
            "Completed";


        order.verification =
            "Pending";


        const complaint =
            mockData.complaints.find(
                item =>
                    item.id ===
                    order.complaintId
            );


        if (complaint) {

            complaint.status =
                "Awaiting Verification";

        }


        alert(
            "Repair evidence uploaded. Awaiting municipal verification."
        );


        openWorkOrder(workOrderId);

    };


    reader.readAsDataURL(file);

}


/* =====================================================
   UTILITY
===================================================== */

function escapeHTML(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

}


/* =====================================================
   INITIALIZATION
===================================================== */

window.addEventListener(
    "load",
    function() {

        showView("view-login");

    }
);