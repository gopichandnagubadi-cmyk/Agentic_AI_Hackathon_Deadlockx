// ======================================================
// SMART CITY INFRASTRUCTURE ENGINE
// Supabase + Camera + GPS + GIS + AI Simulation
// ======================================================


// ======================================================
// 1. SUPABASE CONFIGURATION
// ======================================================

const SUPABASE_URL = "https://jdymqqjylrjhrhqdakfq.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_nBBSroTBJ2xA2mhVGWIqDg_QreS1dwI";

const supabaseClient = supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
);


// ======================================================
// 2. SUPABASE CONNECTION TEST
// ======================================================

async function testSupabaseConnection() {

    const { data, error } =
        await supabaseClient.auth.getSession();

    if (error) {
        console.error(
            "❌ Supabase connection failed:",
            error
        );
        return;
    }

    console.log(
        "✅ Supabase connected successfully!"
    );

    console.log("Session:", data);
}

testSupabaseConnection();

async function saveComplaintToSupabase() {

    // Check whether image exists
    if (!currentReport.image) {
        alert("Please capture or upload an image first.");
        return false;
    }

    // Check whether GPS exists
    if (!currentReport.coords) {
        alert("Please capture your GPS location first.");
        return false;
    }

    // Get citizen notes
    const notesElement = document.getElementById("report-notes");

    const notes = notesElement
        ? notesElement.value.trim()
        : "";

    // Create complaint data
    const complaintData = {
        complaint_id: "CR-" + Date.now(),

        user_id: null,

        image_url: currentReport.image,

        latitude: currentReport.coords.lat,

        longitude: currentReport.coords.lng,

        accuracy: currentReport.coords.acc,

        notes: notes,

        status: "Reported"
    };

    console.log("Sending complaint to Supabase:", complaintData);

    // Insert into Supabase
    const { data, error } = await supabaseClient
        .from("complaints")
        .insert([complaintData])
        .select();

    // Handle error
    if (error) {

        console.error(
            "Complaint insertion failed:",
            error
        );

        alert(
            "Failed to submit complaint.\n\n" +
            error.message
        );

        return false;
    }

    // Success
    console.log(
        "Complaint saved successfully:",
        data
    );

    // Store returned complaint
    if (data && data.length > 0) {
        currentReport.complaintId =
            data[0].complaint_id;

        currentReport.databaseId =
            data[0].id;
    }

    return true;
}


// ======================================================
// 3. CENTRAL MOCK DATA
// ======================================================

const mockData = {

    complaints: [
        {
            id: "CR-1024",
            type: "Pothole",
            severity: "High",
            priority: 87,
            status: "Contractor Assigned",
            lat: 16.12345,
            lng: 80.12345,
            city: "Guntur",
            waterRisk: "High"
        },

        {
            id: "CR-1025",
            type: "Structural",
            severity: "Medium",
            priority: 45,
            status: "Verified",
            lat: 16.12500,
            lng: 80.12600,
            city: "Guntur",
            waterRisk: "Medium"
        }
    ],

    drainage: [
        {
            lat: 16.12380,
            lng: 80.12390,
            type: "Main Drain",
            risk: "High"
        }
    ],

    waterlogging: [
        {
            lat: 16.12420,
            lng: 80.12450,
            type: "Waterlogging Hotspot",
            risk: "High"
        }
    ],

    contractors: [
        {
            id: "CON-001",
            name: "Urban Roads Contractors",
            status: "Available"
        },
        {
            id: "CON-002",
            name: "City Infrastructure Works",
            status: "Busy"
        }
    ]
};


// ======================================================
// 4. CURRENT REPORT
// ======================================================

let currentReport = {

    complaintId: null,

    image: null,

    imageFile: null,

    coords: null,

    notes: "",

    city: null,

    defectType: null,

    severity: null,

    priority: null,

    waterRisk: null,

    drainageNearby: null,

    timestamp: null
};


// ======================================================
// 5. GLOBAL VARIABLES
// ======================================================

let videoStream = null;

let mapInstance = null;

let officerMapInstance = null;

let currentLocationMarker = null;


// ======================================================
// 6. VIEW NAVIGATION
// ======================================================

function showView(viewId) {

    document
        .querySelectorAll(".view")
        .forEach(view => {
            view.classList.add("hidden");
        });

    const target =
        document.getElementById(viewId);

    if (!target) {
        console.error(
            "View not found:",
            viewId
        );
        return;
    }

    target.classList.remove("hidden");


    // Login navigation

    if (viewId === "view-login") {

        document
            .getElementById("app-nav")
            .classList.add("hidden");

    } else {

        document
            .getElementById("app-nav")
            .classList.remove("hidden");

        renderNavLinks();
    }


    // Officer dashboard

    if (viewId === "view-officer-dash") {

        setTimeout(() => {
            initOfficerDashboard();
        }, 100);
    }


    // Citizen dashboard

    if (viewId === "view-citizen-dash") {

        renderCitizenHistory();
    }
}


// ======================================================
// 7. NAVIGATION LINKS
// ======================================================

function renderNavLinks() {

    const roleElement =
        document.getElementById("login-role");

    const container =
        document.getElementById("nav-links");

    if (!roleElement || !container) {
        return;
    }

    const role =
        roleElement.value;

    let links = "";


    if (role === "citizen") {

        links = `
            <a onclick="showView('view-citizen-dash')">
                Dashboard
            </a>

            <a onclick="showView('view-report-wizard')">
                Report Problem
            </a>
        `;

    } else if (role === "officer") {

        links = `
            <a onclick="showView('view-officer-dash')">
                Command Center
            </a>

            <a onclick="showView('view-officer-dash')">
                GIS Map
            </a>
        `;

    } else if (role === "contractor") {

        links = `
            <a onclick="showContractorDashboard()">
                Contractor Dashboard
            </a>
        `;
    }

    container.innerHTML = links;
}


// ======================================================
// 8. MOCK LOGIN
// ======================================================

function handleLogin() {

    const roleElement =
        document.getElementById("login-role");

    const role =
        roleElement.value;


    const badge =
        document.getElementById("nav-role-badge");

    if (badge) {

        badge.innerText =
            role === "officer"
                ? "Municipal Officer"
                : role === "contractor"
                    ? "Contractor"
                    : "Citizen";
    }


    if (role === "officer") {

        showView("view-officer-dash");

    } else if (role === "contractor") {

        showContractorDashboard();

    } else {

        showView("view-citizen-dash");
    }
}


// ======================================================
// 9. LOGOUT
// ======================================================

function logout() {

    stopCamera();

    showView("view-login");
}


// ======================================================
// 10. CAMERA
// ======================================================

async function startCamera() {

    const video =
        document.getElementById("camera-stream");

    const placeholder =
        document.getElementById("camera-placeholder");

    const openButton =
        document.getElementById("btn-open-camera");

    const captureButton =
        document.getElementById("btn-capture");


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


        video.srcObject =
            videoStream;

        video.classList.remove("hidden");

        placeholder.classList.add("hidden");

        openButton.classList.add("hidden");

        captureButton.classList.remove("hidden");


    } catch (error) {

        console.error(
            "Camera error:",
            error
        );

        alert(
            "Camera access was denied or unavailable. Please check browser permissions."
        );
    }
}


// ======================================================
// 11. STOP CAMERA
// ======================================================

function stopCamera() {

    if (!videoStream) {
        return;
    }

    videoStream
        .getTracks()
        .forEach(track => track.stop());

    videoStream = null;
}


// ======================================================
// 12. CAPTURE PHOTO
// ======================================================

function capturePhoto() {

    const video =
        document.getElementById("camera-stream");

    const preview =
        document.getElementById("photo-preview");

    if (!video.videoWidth ||
        !video.videoHeight) {

        alert(
            "Camera is not ready yet."
        );

        return;
    }


    const canvas =
        document.createElement("canvas");

    canvas.width =
        video.videoWidth;

    canvas.height =
        video.videoHeight;


    const context =
        canvas.getContext("2d");

    context.drawImage(
        video,
        0,
        0,
        canvas.width,
        canvas.height
    );


    const dataUrl =
        canvas.toDataURL(
            "image/jpeg",
            0.9
        );


    currentReport.image =
        dataUrl;

    currentReport.imageFile =
        null;


    preview.src =
        dataUrl;

    preview.classList.remove(
        "hidden"
    );

    video.classList.add(
        "hidden"
    );


    stopCamera();


    document
        .getElementById("btn-open-camera")
        .classList.remove("hidden");

    document
        .getElementById("btn-capture")
        .classList.add("hidden");


    validateStep();
}


// ======================================================
// 13. IMAGE UPLOAD
// ======================================================

function handleUpload(event) {

    const file =
        event.target.files[0];

    if (!file) {
        return;
    }


    if (!file.type.startsWith("image/")) {

        alert(
            "Please select a valid image."
        );

        return;
    }


    currentReport.imageFile =
        file;


    const reader =
        new FileReader();


    reader.onload =
        function (e) {

            currentReport.image =
                e.target.result;


            const preview =
                document.getElementById(
                    "photo-preview"
                );


            preview.src =
                e.target.result;

            preview.classList.remove(
                "hidden"
            );


            const placeholder =
                document.getElementById(
                    "camera-placeholder"
                );

            if (placeholder) {
                placeholder.classList.add(
                    "hidden"
                );
            }


            validateStep();
        };


    reader.readAsDataURL(file);
}


// ======================================================
// 14. GPS LOCATION
// ======================================================

function captureGPS() {

    const display =
        document.getElementById(
            "location-display"
        );


    if (!display) {
        return;
    }


    display.innerHTML = `
        <div class="loc-text">
            🛰️ Acquiring location...
        </div>
    `;


    if (!navigator.geolocation) {

        display.innerHTML = `
            <div class="loc-text text-danger">
                GPS is not supported by this browser.
            </div>

            <button
                class="btn-secondary"
                onclick="captureGPS()">
                Try Again
            </button>
        `;

        return;
    }


    navigator.geolocation.getCurrentPosition(

        handleGPSsuccess,

        handleGPSerror,

        {
            enableHighAccuracy: true,

            timeout: 15000,

            maximumAge: 0
        }
    );
}


// ======================================================
// 15. GPS SUCCESS
// ======================================================

function handleGPSsuccess(position) {

    const latitude =
        position.coords.latitude;

    const longitude =
        position.coords.longitude;

    const accuracy =
        position.coords.accuracy;


    currentReport.coords = {

        latitude: latitude,

        longitude: longitude,

        accuracy: accuracy,

        timestamp:
            new Date().toISOString()
    };


    currentReport.timestamp =
        new Date().toISOString();


    const display =
        document.getElementById(
            "location-display"
        );


    display.innerHTML = `

        <div class="loc-text">

            <strong>
                ✓ GPS Location Captured
            </strong>

            <br>

            Latitude:
            ${latitude.toFixed(6)}

            <br>

            Longitude:
            ${longitude.toFixed(6)}

            <br>

            Accuracy:
            ±${Math.round(accuracy)} meters

        </div>

        <button
            class="btn-secondary"
            onclick="captureGPS()">

            Refresh Location

        </button>
    `;


    showMiniMap(
        latitude,
        longitude
    );


    validateStep();
}


// ======================================================
// 16. GPS ERROR HANDLING
// ======================================================

function handleGPSerror(error) {

    const display =
        document.getElementById(
            "location-display"
        );


    let message =
        "Unable to determine your location.";


    if (error.code === 1) {

        message =
            "Location permission was denied. GPS is required for accurate GIS mapping.";

    } else if (error.code === 2) {

        message =
            "Unable to determine your current location.";

    } else if (error.code === 3) {

        message =
            "Location request timed out.";
    }


    display.innerHTML = `

        <div class="loc-text text-danger">

            ❌ ${message}

        </div>

        <button
            class="btn-secondary"
            onclick="captureGPS()">

            Try Again

        </button>
    `;
}


// ======================================================
// 17. MINI GIS MAP
// ======================================================

function showMiniMap(
    latitude,
    longitude
) {

    const mapElement =
        document.getElementById(
            "mini-map"
        );


    if (!mapElement) {
        return;
    }


    mapElement.classList.remove(
        "hidden"
    );


    if (mapInstance) {

        mapInstance.remove();

        mapInstance = null;
    }


    mapInstance =
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
    ).addTo(mapInstance);


    currentLocationMarker =
        L.marker([
            latitude,
            longitude
        ])
        .addTo(mapInstance)
        .bindPopup(`
            <strong>
                Current Report Location
            </strong>
            <br>
            Latitude:
            ${latitude.toFixed(6)}
            <br>
            Longitude:
            ${longitude.toFixed(6)}
        `)
        .openPopup();


    // Nearby drainage

    mockData.drainage.forEach(
        drain => {

            L.circleMarker(
                [drain.lat, drain.lng],
                {
                    radius: 7,
                    color: "#0047bb"
                }
            )
            .addTo(mapInstance)
            .bindPopup(
                `Drainage: ${drain.type}`
            );
        }
    );


    // Waterlogging

    mockData.waterlogging.forEach(
        hotspot => {

            L.circleMarker(
                [hotspot.lat, hotspot.lng],
                {
                    radius: 8,
                    color: "#de350b"
                }
            )
            .addTo(mapInstance)
            .bindPopup(
                "Waterlogging Hotspot"
            );
        }
    );
}


// ======================================================
// 18. MANUAL LOCATION
// ======================================================

function useManualLocation() {

    const latitudeInput =
        document.getElementById(
            "manual-latitude"
        );

    const longitudeInput =
        document.getElementById(
            "manual-longitude"
        );


    if (!latitudeInput ||
        !longitudeInput) {

        alert(
            "Manual location fields are not available."
        );

        return;
    }


    const latitude =
        parseFloat(
            latitudeInput.value
        );

    const longitude =
        parseFloat(
            longitudeInput.value
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
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180
    ) {

        alert(
            "Latitude or longitude is outside the valid range."
        );

        return;
    }


    currentReport.coords = {

        latitude: latitude,

        longitude: longitude,

        accuracy: null,

        timestamp:
            new Date().toISOString(),

        source: "manual"
    };


    currentReport.timestamp =
        new Date().toISOString();


    const display =
        document.getElementById(
            "location-display"
        );


    display.innerHTML = `

        <div class="loc-text">

            <strong>
                ✓ Manual Location Added
            </strong>

            <br>

            Latitude:
            ${latitude.toFixed(6)}

            <br>

            Longitude:
            ${longitude.toFixed(6)}

            <br>

            Source:
            Manual Entry

        </div>

        <button
            class="btn-secondary"
            onclick="captureGPS()">

            Use GPS Instead

        </button>
    `;


    showMiniMap(
        latitude,
        longitude
    );


    validateStep();
}


// ======================================================
// 19. VALIDATE REPORT
// ======================================================

function validateStep() {

    const button =
        document.getElementById(
            "btn-analyze"
        );


    if (!button) {
        return;
    }


    button.disabled =
        !currentReport.image ||
        !currentReport.coords;
}


// ======================================================
// 20. READ REPORT DETAILS
// ======================================================

function collectReportDetails() {

    const notes =
        document.getElementById(
            "report-notes"
        );


    currentReport.notes =
        notes
            ? notes.value.trim()
            : "";
}


// ======================================================
// 21. GENERATE COMPLAINT ID
// ======================================================

function generateComplaintId() {

    return (
        "CR-" +
        Date.now()
            .toString()
            .slice(-6)
    );
}


// ======================================================
// 22. AI PROCESSING SIMULATION
// ======================================================

async function runAnalysisSequence() {
    const saved = await saveComplaintToSupabase();

    if (!saved) {
        return;
    }

    collectReportDetails();


    if (
        !currentReport.image ||
        !currentReport.coords
    ) {

        alert(
            "Please provide an image and location."
        );

        return;
    }


    currentReport.complaintId =
        generateComplaintId();


    showView(
        "view-processing"
    );


    const steps =
        document.querySelectorAll(
            "#analysis-steps li"
        );


    steps.forEach(step => {

        step.classList.remove(
            "done"
        );
    });


    steps.forEach(
        (step, index) => {

            setTimeout(
                () => {

                    step.classList.add(
                        "done"
                    );


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

                (index + 1) * 700
            );
        }
    );
}


// ======================================================
// 23. FINALIZE AI ANALYSIS
// ======================================================

function finalizeAnalysis() {

    currentReport.defectType =
        "Pothole";

    currentReport.severity =
        "High";

    currentReport.priority =
        87;

    currentReport.waterRisk =
        "High";

    currentReport.drainageNearby =
        true;


    const resultImage =
        document.getElementById(
            "result-img"
        );


    if (resultImage) {

        resultImage.src =
            currentReport.image;
    }


    updateResultLocation();


    showView(
        "view-results"
    );
}


// ======================================================
// 24. UPDATE RESULT LOCATION
// ======================================================

function updateResultLocation() {

    const coords =
        currentReport.coords;


    if (!coords) {
        return;
    }


    const resultLocation =
        document.getElementById(
            "result-location"
        );


    if (!resultLocation) {
        return;
    }


    resultLocation.innerHTML = `

        <strong>
            📍 Report Location
        </strong>

        <br>

        Latitude:
        ${coords.latitude.toFixed(6)}

        <br>

        Longitude:
        ${coords.longitude.toFixed(6)}

        <br>

        Accuracy:
        ${
            coords.accuracy
                ? "±" +
                  Math.round(
                      coords.accuracy
                  ) +
                  " m"
                : "Manual location"
        }

    `;
}


// ======================================================
// 25. FUTURE RISK
// ======================================================

function updateFutureRisk(
    scenario
) {

    const bar =
        document.getElementById(
            "risk-bar"
        );

    const label =
        document.getElementById(
            "risk-label"
        );


    if (!bar || !label) {
        return;
    }


    const buttons =
        document.querySelectorAll(
            ".risk-scenario button"
        );


    buttons.forEach(
        button => {
            button.classList.remove(
                "active"
            );
        }
    );


    if (
        typeof event !==
        "undefined" &&
        event.target
    ) {

        event.target.classList.add(
            "active"
        );
    }


    if (scenario === "normal") {

        bar.style.width =
            "45%";

        label.innerText =
            "Scenario Risk: MODERATE";


    } else if (
        scenario === "heavy"
    ) {

        bar.style.width =
            "85%";

        label.innerText =
            "Scenario Risk: VERY HIGH";


    } else {

        bar.style.width =
            "95%";

        label.innerText =
            "Scenario Risk: EXTREME";
    }
}


// ======================================================
// 26. CITIZEN HISTORY
// ======================================================

function renderCitizenHistory() {

    const container =
        document.getElementById(
            "citizen-history-list"
        );


    if (!container) {
        return;
    }


    container.innerHTML =
        mockData.complaints
            .map(item => `

                <div class="stat-card">

                    <strong>
                        ${item.id}
                    </strong>

                    <p>
                        ${item.type}
                    </p>

                    <p>
                        Severity:
                        ${item.severity}
                    </p>

                    <p>
                        Priority:
                        ${item.priority}/100
                    </p>

                    <p>
                        Status:
                        ${item.status}
                    </p>

                </div>

            `)
            .join("");
}


// ======================================================
// 27. OFFICER DASHBOARD
// ======================================================

function initOfficerDashboard() {

    renderOfficerTable();

    setTimeout(
        initOfficerMap,
        100
    );
}


// ======================================================
// 28. OFFICER TABLE
// ======================================================

function renderOfficerTable() {

    const tbody =
        document.getElementById(
            "officer-table-body"
        );


    if (!tbody) {
        return;
    }


    tbody.innerHTML =
        mockData.complaints
            .map(item => `

                <tr>

                    <td>
                        ${item.id}
                    </td>

                    <td>
                        ${item.type}
                    </td>

                    <td>
                        ${item.severity}
                    </td>

                    <td>
                        ${item.priority}/100
                    </td>

                    <td>
                        ${item.waterRisk}
                    </td>

                    <td>
                        ${item.city}
                    </td>

                    <td>
                        ${item.lat.toFixed(6)}
                        <br>
                        ${item.lng.toFixed(6)}
                    </td>

                    <td>
                        ${item.status}
                    </td>

                    <td>

                        <button
                            class="btn-primary"
                            onclick="reviewComplaint('${item.id}')">

                            Review

                        </button>

                    </td>

                </tr>

            `)
            .join("");
}


// ======================================================
// 29. OFFICER GIS MAP
// ======================================================

function initOfficerMap() {

    const mapElement =
        document.getElementById(
            "officer-map"
        );


    if (!mapElement) {
        return;
    }


    if (officerMapInstance) {

        officerMapInstance.remove();

        officerMapInstance = null;
    }


    const firstComplaint =
        mockData.complaints[0];


    officerMapInstance =
        L.map("officer-map")
            .setView(
                [
                    firstComplaint.lat,
                    firstComplaint.lng
                ],
                14
            );


    L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
            attribution:
                "&copy; OpenStreetMap contributors"
        }
    ).addTo(
        officerMapInstance
    );


    // Defects

    mockData.complaints.forEach(
        complaint => {

            L.circleMarker(
                [
                    complaint.lat,
                    complaint.lng
                ],
                {
                    color: "#de350b",
                    radius: 9
                }
            )
            .addTo(
                officerMapInstance
            )
            .bindPopup(`

                <strong>
                    ${complaint.id}
                </strong>

                <br>

                Type:
                ${complaint.type}

                <br>

                Severity:
                ${complaint.severity}

                <br>

                Priority:
                ${complaint.priority}/100

                <br>

                Water Risk:
                ${complaint.waterRisk}

                <br>

                City:
                ${complaint.city}

                <br>

                Coordinates:
                ${complaint.lat.toFixed(6)},
                ${complaint.lng.toFixed(6)}

            `);
        }
    );


    // Drainage

    mockData.drainage.forEach(
        drain => {

            L.circleMarker(
                [
                    drain.lat,
                    drain.lng
                ],
                {
                    color: "#0047bb",
                    radius: 7
                }
            )
            .addTo(
                officerMapInstance
            )
            .bindPopup(`
                <strong>
                    Drainage Point
                </strong>
                <br>
                ${drain.type}
                <br>
                Risk:
                ${drain.risk}
            `);
        }
    );


    // Waterlogging

    mockData.waterlogging.forEach(
        hotspot => {

            L.circleMarker(
                [
                    hotspot.lat,
                    hotspot.lng
                ],
                {
                    color: "#ffab00",
                    radius: 8
                }
            )
            .addTo(
                officerMapInstance
            )
            .bindPopup(`
                <strong>
                    Waterlogging Hotspot
                </strong>
                <br>
                Risk:
                ${hotspot.risk}
            `);
        }
    );
}


// ======================================================
// 30. REVIEW COMPLAINT
// ======================================================

function reviewComplaint(
    complaintId
) {

    const complaint =
        mockData.complaints.find(
            item =>
                item.id === complaintId
        );


    if (!complaint) {
        return;
    }


    alert(`

Complaint: ${complaint.id}

Type: ${complaint.type}

Severity: ${complaint.severity}

Priority: ${complaint.priority}/100

Water Risk: ${complaint.waterRisk}

City: ${complaint.city}

Coordinates:
${complaint.lat},
${complaint.lng}

Status:
${complaint.status}

    `);
}


// ======================================================
// 31. CONTRACTOR DASHBOARD
// ======================================================

function showContractorDashboard() {

    const contractorView =
        document.getElementById(
            "view-contractor-dash"
        );


    if (contractorView) {

        showView(
            "view-contractor-dash"
        );

        return;
    }


    alert(
        "Contractor dashboard UI needs to be added to index.html."
    );
}


// ======================================================
// 32. CREATE WORK ORDER
// ======================================================

function createWorkOrder(
    complaintId
) {

    const complaint =
        mockData.complaints.find(
            item =>
                item.id === complaintId
        );


    if (!complaint) {
        return;
    }


    complaint.status =
        "Work Order Created";


    alert(
        `Work order created for ${complaint.id}`
    );


    renderOfficerTable();
}


// ======================================================
// 33. ASSIGN CONTRACTOR
// ======================================================

function assignContractor(
    complaintId,
    contractorId
) {

    const complaint =
        mockData.complaints.find(
            item =>
                item.id === complaintId
        );


    const contractor =
        mockData.contractors.find(
            item =>
                item.id === contractorId
        );


    if (!complaint ||
        !contractor) {

        return;
    }


    complaint.status =
        "Contractor Assigned";


    alert(
        `${contractor.name} assigned to ${complaint.id}`
    );


    renderOfficerTable();
}


// ======================================================
// 34. MARK WORK COMPLETED
// ======================================================

function markWorkCompleted(
    complaintId
) {

    const complaint =
        mockData.complaints.find(
            item =>
                item.id === complaintId
        );


    if (!complaint) {
        return;
    }


    complaint.status =
        "Repair Completed";

    alert(
        `${complaint.id} marked as repair completed.`
    );
}


// ======================================================
// 35. VERIFY REPAIR
// ======================================================

function verifyRepair(
    complaintId
) {

    const complaint =
        mockData.complaints.find(
            item =>
                item.id === complaintId
        );


    if (!complaint) {
        return;
    }


    complaint.status =
        "Closed";


    alert(
        `${complaint.id} has been verified and closed.`
    );


    renderOfficerTable();
}


// ======================================================
// 36. SUBMIT COMPLAINT TO SUPABASE
// ======================================================

async function submitComplaintToSupabase() {

    if (!currentReport.coords) {

        console.error(
            "GPS location is missing."
        );

        return;
    }


    const complaintData = {

        complaint_id:
            currentReport.complaintId,

        defect_type:
            currentReport.defectType,

        severity:
            currentReport.severity,

        priority:
            currentReport.priority,

        latitude:
            currentReport.coords.latitude,

        longitude:
            currentReport.coords.longitude,

        gps_accuracy:
            currentReport.coords.accuracy,

        notes:
            currentReport.notes,

        status:
            "Reported",

        created_at:
            new Date().toISOString()
    };


    const {
        data,
        error
    } =
        await supabaseClient
            .from("complaints")
            .insert([
                complaintData
            ])
            .select();


    if (error) {

        console.error(
            "Supabase complaint error:",
            error
        );

        return null;
    }


    console.log(
        "✅ Complaint saved to Supabase:",
        data
    );


    return data;
}


// ======================================================
// 37. INITIALIZE APPLICATION
// ======================================================

window.addEventListener(
    "load",
    () => {

        showView(
            "view-login"
        );

        console.log(
            "🚀 Smart City application loaded."
        );
    }
);