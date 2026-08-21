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

let currentUser = null;

let currentRole = null;

let databaseComplaints = [];

let databaseWorkOrders = [];

let databaseDrainage = [];

let databaseWaterlogging = [];

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

    collectReportDetails();

    if (!currentUser) {
        alert("Please log in before submitting a complaint.");
        return false;
    }

    // Create complaint data
    const complaintData = {
        complaint_id: generateComplaintId(),

        user_id: currentUser.id,

        image_url: currentReport.image,

        latitude: currentReport.coords.latitude,

        longitude: currentReport.coords.longitude,

        accuracy: currentReport.coords.accuracy,

        notes: currentReport.notes,

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


async function loadComplaints() {

    const { data, error } = await supabaseClient
        .from("complaints")
        .select("*")
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Unable to load complaints:", error);
        alert("Unable to load complaints: " + error.message);
        return [];
    }

    databaseComplaints = data || [];
    return databaseComplaints;
}


async function loadWorkOrders() {

    const { data, error } = await supabaseClient
        .from("work_orders")
        .select("*, complaints(*)")
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Unable to load work orders:", error);
        return [];
    }

    databaseWorkOrders = data || [];
    return databaseWorkOrders;
}


async function loadInfrastructure() {

    const [drainageResult, waterloggingResult] = await Promise.all([
        supabaseClient.from("drainage").select("*").order("created_at"),
        supabaseClient.from("waterlogging").select("*").order("created_at")
    ]);

    if (drainageResult.error) {
        console.error("Unable to load drainage:", drainageResult.error);
    } else {
        databaseDrainage = drainageResult.data || [];
    }

    if (waterloggingResult.error) {
        console.error("Unable to load waterlogging:", waterloggingResult.error);
    } else {
        databaseWaterlogging = waterloggingResult.data || [];
    }
}


async function updateComplaintStatus(complaintId, status) {

    const { data, error } = await supabaseClient
        .from("complaints")
        .update({ status })
        .eq("complaint_id", complaintId)
        .select()
        .single();

    if (error) {
        console.error("Unable to update complaint status:", error);
        alert("Unable to update complaint: " + error.message);
        return null;
    }

    databaseComplaints = databaseComplaints.map(complaint =>
        complaint.complaint_id === complaintId ? data : complaint
    );

    return data;
}


async function updateWorkOrderStatus(complaintId, status) {

    const workOrder = databaseWorkOrders.find(
        item => item.complaint_id === complaintId
    );

    if (!workOrder) {
        return null;
    }

    const { data, error } = await supabaseClient
        .from("work_orders")
        .update({ status })
        .eq("id", workOrder.id)
        .select()
        .single();

    if (error) {
        console.error("Unable to update work order:", error);
        alert("Unable to update work order: " + error.message);
        return null;
    }

    databaseWorkOrders = databaseWorkOrders.map(item =>
        item.id === data.id ? { ...item, ...data } : item
    );

    return data;
}


async function handleLogin() {
    const email = document.getElementById("login-email").value;
    const password = document.getElementById("login-password").value;

    const { data: authData, error: authError } = await supabaseClient.auth.signInWithPassword({
        email,
        password
    });

    if (authError) {
        alert("Login failed: " + authError.message);
        return;
    }

    const { data: profile, error: profileError } = await supabaseClient
        .from("profiles")
        .select("role, full_name")
        .eq("id", authData.user.id)
        .maybeSingle();

    if (profileError || !profile) {
        await supabaseClient.auth.signOut();
        alert("No profile was found for this account.");
        return;
    }

    currentUser = authData.user;
    currentRole = profile.role;

    // Update role badge in navigation
    const badge = document.getElementById("nav-role-badge");
    if (badge) {
        badge.innerText = profile.role.toUpperCase();
    }

    // Direct user to their respective dashboard
    if (profile.role === "officer") {
        showView("view-officer-dash");
    } else if (profile.role === "contractor") {
        showContractorDashboard();
    } else {
        showView("view-citizen-dash");
    }
}


async function restoreSession() {

    const { data, error } = await supabaseClient.auth.getSession();

    if (error || !data.session) {
        showView("view-login");
        return;
    }

    const { data: profile } = await supabaseClient
        .from("profiles")
        .select("role")
        .eq("id", data.session.user.id)
        .maybeSingle();

    if (!profile) {
        await supabaseClient.auth.signOut();
        showView("view-login");
        return;
    }

    currentUser = data.session.user;
    currentRole = profile.role;

    await Promise.all([
        loadWorkOrders(),
        loadInfrastructure()
    ]);

    const badge = document.getElementById("nav-role-badge");
    if (badge) badge.innerText = profile.role.toUpperCase();

    if (profile.role === "officer") {
        showView("view-officer-dash");
    } else if (profile.role === "contractor") {
        showContractorDashboard();
    } else {
        showView("view-citizen-dash");
    }
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

        loadComplaints().then(renderCitizenHistory);
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
        currentRole || roleElement.value;

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
// 8. LOGOUT
// ======================================================

async function logout() {

    stopCamera();

    await supabaseClient.auth.signOut();

    currentUser = null;
    currentRole = null;
    databaseComplaints = [];

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

    databaseDrainage.forEach(
        drain => {

            L.circleMarker(
                [drain.latitude, drain.longitude],
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

    databaseWaterlogging.forEach(
        hotspot => {

            L.circleMarker(
                [hotspot.latitude, hotspot.longitude],
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

    updateComplaintStatus(currentReport.complaintId, "Analyzed");


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

function renderCitizenHistory(complaints = databaseComplaints) {

    const container =
        document.getElementById(
            "citizen-history-list"
        );


    if (!container) {
        return;
    }


    const visibleComplaints = currentUser
        ? complaints.filter(item => item.user_id === currentUser.id)
        : complaints;

    const activeCount = visibleComplaints.filter(item =>
        !["Closed", "Verified"].includes(item.status)
    ).length;

    const resolvedCount = visibleComplaints.filter(item =>
        ["Closed", "Verified"].includes(item.status)
    ).length;

    document.getElementById("citizen-active-count").innerText = activeCount;
    document.getElementById("citizen-resolved-count").innerText = resolvedCount;

    container.innerHTML =
        visibleComplaints
            .map(item => `

                <div class="stat-card">

                    <strong>
                        ${item.complaint_id}
                    </strong>

                    <p>
                        Road Defect Report
                    </p>

                    <p>
                        Severity:
                        ${item.status}
                    </p>

                    <p>
                        Priority:
                        ${item.latitude.toFixed(6)}, ${item.longitude.toFixed(6)}
                    </p>

                    <p>
                        Status:
                        ${new Date(item.created_at).toLocaleString()}
                    </p>

                </div>

            `)
            .join("");
}


// ======================================================
// 27. OFFICER DASHBOARD
// ======================================================

async function initOfficerDashboard() {

    await Promise.all([
        loadComplaints(),
        loadWorkOrders(),
        loadInfrastructure()
    ]);

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
        databaseComplaints
            .map(item => `

                <tr>

                    <td>
                        ${item.complaint_id}
                    </td>

                    <td>
                        Guntur
                    </td>

                    <td>
                        Road Defect
                    </td>

                    <td>
                        ${item.latitude.toFixed(6)}
                        <br>
                        ${item.longitude.toFixed(6)}
                    </td>

                    <td>
                        ${item.accuracy ? `${item.accuracy} m` : "Manual"}
                    </td>

                    <td>
                        ${item.status}
                    </td>

                    <td>
                    <td>

                        <button
                            class="btn-primary"
                            onclick="reviewComplaint('${item.complaint_id}')">

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


    const firstComplaint = databaseComplaints[0] || {
        latitude: 16.12345,
        longitude: 80.12345
    };


    officerMapInstance =
        L.map("officer-map")
            .setView(
                        [
                            firstComplaint.latitude,
                            firstComplaint.longitude
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

    databaseComplaints.forEach(
        complaint => {

            L.circleMarker(
                [
                    complaint.latitude,
                    complaint.longitude
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
                    ${complaint.complaint_id}
                </strong>

                <br>

                Notes:
                ${complaint.notes || "No notes provided"}

                <br>

                Coordinates:
                ${complaint.latitude.toFixed(6)},
                ${complaint.longitude.toFixed(6)}

            `);
        }
    );


    // Drainage

    databaseDrainage.forEach(
        drain => {

            L.circleMarker(
                [
                    drain.latitude,
                    drain.longitude
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

    databaseWaterlogging.forEach(
        hotspot => {

            L.circleMarker(
                [
                    hotspot.latitude,
                    hotspot.longitude
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
        databaseComplaints.find(
            item =>
                item.complaint_id === complaintId
        );


    if (!complaint) {
        return;
    }


    alert(`

Complaint: ${complaint.complaint_id}

Notes: ${complaint.notes || "No notes provided"}

Coordinates:
${complaint.latitude},
${complaint.longitude}

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

        showView("view-contractor-dash");

        Promise.all([loadComplaints(), loadWorkOrders()])
            .then(() => renderContractorWorkOrders());

        return;
    }


    alert(
        "Contractor dashboard UI needs to be added to index.html."
    );
}


function renderContractorWorkOrders() {

    const container = document.getElementById("contractor-work-orders");

    if (!container) {
        return;
    }

    const assignedWorkOrders = databaseWorkOrders;

    document.getElementById("contractor-assigned").innerText = assignedWorkOrders.length;
    document.getElementById("contractor-progress").innerText =
        assignedWorkOrders.filter(order => order.status === "In Progress").length;
    document.getElementById("contractor-completed").innerText =
        assignedWorkOrders.filter(order => order.status === "Repair Completed").length;

    if (!assignedWorkOrders.length) {
        container.innerHTML = "<p>No work orders are currently assigned.</p>";
        return;
    }

    container.innerHTML = assignedWorkOrders.map(workOrder => {
        const complaint = workOrder.complaints;

        return `
        <div class="work-order-card">
            <div class="work-order-header">
                <div>
                    <span class="work-order-id">${workOrder.work_order_id}</span>
                    <h3>Road Defect Repair</h3>
                </div>
                <span class="status-badge danger">${workOrder.status}</span>
            </div>
            <div class="work-order-details">
                <div><span>Coordinates</span><strong>${complaint.latitude.toFixed(6)}, ${complaint.longitude.toFixed(6)}</strong></div>
                <div><span>Accuracy</span><strong>${complaint.accuracy ? `${complaint.accuracy} m` : "Manual"}</strong></div>
                <div><span>Reported</span><strong>${new Date(complaint.created_at).toLocaleDateString()}</strong></div>
            </div>
            <div class="work-order-actions">
                <button class="btn-secondary" onclick="acceptWorkOrder('${complaint.complaint_id}')">Accept Work</button>
                <button class="btn-primary" onclick="startWorkOrder('${complaint.complaint_id}')">Start Work</button>
                <button class="btn-cta" onclick="completeWorkOrder('${complaint.complaint_id}')">Mark Completed</button>
            </div>
        </div>
    `;
    }).join("");
}


async function acceptWorkOrder(workOrderId) {

    const complaint = await updateComplaintStatus(workOrderId, "Contractor Assigned");
    await updateWorkOrderStatus(workOrderId, "Accepted");

    if (complaint) alert(`${workOrderId} accepted.`);
}


async function startWorkOrder(workOrderId) {

    const complaint = await updateComplaintStatus(workOrderId, "In Progress");
    await updateWorkOrderStatus(workOrderId, "In Progress");

    if (complaint) alert(`${workOrderId} work started.`);
}


function uploadRepairEvidence(event, workOrderId) {

    const file = event.target.files[0];

    if (!file || !file.type.startsWith("image/")) {
        alert("Please select a valid repair image.");
        return;
    }

    const targetId =
        document.getElementById("before-repair-image").getAttribute("src")
            ? "after-repair-image"
            : "before-repair-image";

    const reader = new FileReader();

    reader.onload = event => {
        document.getElementById(targetId).src = event.target.result;
        alert(`Repair evidence uploaded for ${workOrderId}.`);
    };

    reader.readAsDataURL(file);
}


async function completeWorkOrder(workOrderId) {

    const complaint = await updateComplaintStatus(workOrderId, "Repair Completed");
    await updateWorkOrderStatus(workOrderId, "Repair Completed");

    if (!complaint) return;

    showView("view-repair-verification");
    alert(`${workOrderId} submitted for municipal verification.`);
}


async function reopenRepair() {

    const complaintId = databaseComplaints[0]?.complaint_id;
    const complaint = await updateComplaintStatus(complaintId, "Contractor Assigned");
    await updateWorkOrderStatus(complaintId, "Reopened");

    if (complaint) alert("Repair rejected and sent back to the contractor.");
}


// ======================================================
// 32. CREATE WORK ORDER
// ======================================================

async function createWorkOrder(
    complaintId
) {

    const workOrder = {
        work_order_id: "WO-" + Date.now().toString().slice(-6),
        complaint_id: complaintId,
        status: "Assigned"
    };

    const { data, error } = await supabaseClient
        .from("work_orders")
        .insert(workOrder)
        .select()
        .single();

    if (error) {
        alert("Unable to create work order: " + error.message);
        return;
    }

    databaseWorkOrders.unshift(data);

    const complaint = await updateComplaintStatus(
        complaintId,
        "Work Order Created"
    );

    if (!complaint) return;

    alert(
        `Work order created for ${complaint.complaint_id}`
    );


    renderOfficerTable();
}


// ======================================================
// 33. ASSIGN CONTRACTOR
// ======================================================

async function assignContractor(
    complaintId,
    contractorId
) {

    const contractor =
        mockData.contractors.find(
            item =>
                item.id === contractorId
        );


    if (!contractor) {

        return;
    }

    const complaint = await updateComplaintStatus(
        complaintId,
        "Contractor Assigned"
    );

    if (!complaint) return;

    const workOrder = databaseWorkOrders.find(
        item => item.complaint_id === complaintId
    );

    if (workOrder) {
        const contractorIsUserId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
            .test(contractorId);

        const update = contractorIsUserId
            ? { contractor_id: contractorId, status: "Assigned" }
            : { status: "Assigned" };

        await supabaseClient
            .from("work_orders")
            .update(update)
            .eq("id", workOrder.id);
    }


    alert(
        `${contractor.name} assigned to ${complaint.complaint_id}`
    );


    renderOfficerTable();
}


// ======================================================
// 34. MARK WORK COMPLETED
// ======================================================

async function markWorkCompleted(
    complaintId
) {

    const complaint = await updateComplaintStatus(
        complaintId,
        "Repair Completed"
    );

    if (!complaint) return;

    alert(
        `${complaint.complaint_id} marked as repair completed.`
    );
}


// ======================================================
// 35. VERIFY REPAIR
// ======================================================

async function verifyRepair(
    complaintId
) {

    const targetComplaint = complaintId || databaseComplaints[0]?.complaint_id;
    const complaint = await updateComplaintStatus(targetComplaint, "Closed");


    if (!complaint) {
        return;
    }


    complaint.status =
        "Closed";


    alert(
        `${complaint.complaint_id} has been verified and closed.`
    );


    renderOfficerTable();
}


// ======================================================
// 36. INITIALIZE APPLICATION
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