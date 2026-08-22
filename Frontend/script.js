/* =========================================================
   SMART CITY INFRASTRUCTURE LIFECYCLE ENGINE
   Supabase + GPS + Camera + GIS + Lifecycle
========================================================= */


/* =========================================================
   1. SUPABASE CONFIGURATION
========================================================= */


const SUPABASE_URL =
    "https://jdymqqjylrjhrhqdakfq.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_nBBSroTBJ2xA2mhVGWIqDg_QreS1dwI";

if (!window.supabase || !SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Supabase configuration is missing or the Supabase client was not loaded.");
}

const supabaseClient =
    supabase.createClient(
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY
    );


/* =========================================================
   2. GLOBAL STATE
========================================================= */

let currentUser = null;
let currentRole = null;

let databaseComplaints = [];
let databaseWorkOrders = [];
let databaseDrainage = [];
let databaseWaterlogging = [];
let databaseContractors = [];

let videoStream = null;

let citizenMap = null;
let officerMapInstance = null;

let currentLocationMarker = null;

let verificationWorkOrderId = null;

let repairCaptureState = {};

const locationNameCache = new Map();


/* =========================================================
   3. CURRENT REPORT
========================================================= */

let currentReport = {
    complaintId: null,

    image: null,
    imageFile: null,

    coords: null,

    locality: null,
    city: null,
    state: null,

    notes: "",

    defectType: null,
    severity: null,
    priority: null,

    waterRisk: null,
    drainageNearby: null,

    estimatedSize: null,
    approximateDepth: null,

    timestamp: null
};


/* =========================================================
   4. SUPABASE CONNECTION
========================================================= */

async function testSupabaseConnection() {

    const { data, error } =
        await supabaseClient.auth.getSession();

    if (error) {

        console.error(
            "Supabase connection failed:",
            error
        );

        return;
    }

    console.log(
        "Supabase connected successfully!"
    );

    console.log(
        "Session:",
        data
    );
}


/* =========================================================
   5. LOCATION REVERSE GEOCODING
========================================================= */

/*
    Converts:

    latitude + longitude

    into:

    locality
    city
    state
*/

async function resolveLocationName(
    latitude,
    longitude
) {

    const cacheKey =
        `${Number(latitude).toFixed(6)},${Number(longitude).toFixed(6)}`;

    if (locationNameCache.has(cacheKey)) {

        return locationNameCache.get(
            cacheKey
        );
    }


    const url =
        "https://nominatim.openstreetmap.org/reverse" +
        "?format=jsonv2" +
        "&addressdetails=1" +
        "&zoom=18" +
        `&lat=${encodeURIComponent(latitude)}` +
        `&lon=${encodeURIComponent(longitude)}`;


    const response =
        await fetch(
            url,
            {
                headers: {
                    Accept:
                        "application/json"
                }
            }
        );


    if (!response.ok) {

        throw new Error(
            "Reverse geocoding failed."
        );
    }


    const result =
        await response.json();


    const address =
        result.address || {};


    /*
        Different locations use different
        OpenStreetMap address fields.

        Therefore we use multiple fallbacks.
    */

    const locality =
        address.suburb ||
        address.neighbourhood ||
        address.quarter ||
        address.city_district ||
        address.district ||
        address.village ||
        address.hamlet ||
        address.town ||
        address.city ||
        address.municipality ||
        "Unavailable";


    const city =
        address.city ||
        address.town ||
        address.village ||
        address.municipality ||
        address.city_district ||
        address.county ||
        address.state_district ||
        "Unavailable";


    const state =
        address.state ||
        address.state_district ||
        "Unavailable";


    const place = {

        locality: String(locality),

        city: String(city),

        state: String(state),

        displayName:
            result.display_name ||
            `${locality}, ${city}, ${state}`
    };


    locationNameCache.set(
        cacheKey,
        place
    );


    return place;
}


/* =========================================================
   6. RENDER LOCATION ADDRESS
========================================================= */

function renderLocationAddress() {

    const container =
        document.getElementById(
            "location-address"
        );

    if (!container) return;


    container.classList.remove(
        "hidden"
    );


    document.getElementById(
        "location-locality"
    ).innerText =
        currentReport.locality ||
        "Looking up...";


    document.getElementById(
        "location-city"
    ).innerText =
        currentReport.city ||
        "Looking up...";


    document.getElementById(
        "location-state"
    ).innerText =
        currentReport.state ||
        "Looking up...";
}


/* =========================================================
   7. UPDATE LOCATION NAME
========================================================= */

async function updateLocationAddress(
    latitude,
    longitude
) {

    currentReport.locality = null;
    currentReport.city = null;
    currentReport.state = null;

    renderLocationAddress();


    try {

        const place =
            await resolveLocationName(
                latitude,
                longitude
            );


        currentReport.locality =
            place.locality;

        currentReport.city =
            place.city;

        currentReport.state =
            place.state;


    } catch (error) {

        console.error(
            "Reverse geocoding error:",
            error
        );


        currentReport.locality =
            "Unavailable";

        currentReport.city =
            "Unavailable";

        currentReport.state =
            "Unavailable";
    }


    renderLocationAddress();

    updateLocationChecklist();
}


/* =========================================================
   8. RESET REPORT
========================================================= */

function resetReport() {

    stopCamera();


    currentReport = {

        complaintId: null,

        image: null,
        imageFile: null,

        coords: null,

        locality: null,
        city: null,
        state: null,

        notes: "",

        defectType: null,
        severity: null,
        priority: null,

        waterRisk: null,
        drainageNearby: null,

        estimatedSize: null,
        approximateDepth: null,

        timestamp: null
    };


    const ids = [

        "photo-preview",
        "location-address",
        "gps-details",
        "mini-map",
        "location-warning"
    ];


    ids.forEach(id => {

        const element =
            document.getElementById(id);

        if (element) {

            element.classList.add(
                "hidden"
            );
        }

    });


    const preview =
        document.getElementById(
            "photo-preview"
        );

    if (preview) {

        preview.src = "";
    }


    const notes =
        document.getElementById(
            "report-notes"
        );

    if (notes) {

        notes.value = "";
    }


    const manualLat =
        document.getElementById(
            "manual-latitude"
        );

    const manualLng =
        document.getElementById(
            "manual-longitude"
        );


    if (manualLat)
        manualLat.value = "";

    if (manualLng)
        manualLng.value = "";


    const placeholder =
        document.getElementById(
            "camera-placeholder"
        );

    if (placeholder)
        placeholder.classList.remove(
            "hidden"
        );


    document.getElementById(
        "btn-open-camera"
    )?.classList.remove(
        "hidden"
    );


    document.getElementById(
        "btn-capture"
    )?.classList.add(
        "hidden"
    );


    document.getElementById(
        "btn-close-camera"
    )?.classList.add(
        "hidden"
    );


    const gallery =
        document.getElementById(
            "upload-gallery-input"
        );

    if (gallery)
        gallery.disabled = false;


    document.getElementById(
        "upload-gallery-wrapper"
    )?.classList.remove(
        "disabled"
    );


    document.getElementById(
        "image-check"
    ).innerText =
        "Not captured";


    document.getElementById(
        "location-check"
    ).innerText =
        "Required";


    document.getElementById(
        "btn-analyze"
    ).disabled = true;
}


/* =========================================================
   9. START NEW REPORT
========================================================= */

function startNewReport() {

    resetReport();

    showView(
        "view-report-wizard"
    );
}


/* =========================================================
   10. CAMERA
========================================================= */

async function startCamera() {

    if (
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia
    ) {

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
            document.getElementById(
                "camera-stream"
            );


        video.srcObject =
            videoStream;


        video.classList.remove(
            "hidden"
        );


        document.getElementById(
            "camera-placeholder"
        ).classList.add(
            "hidden"
        );


        document.getElementById(
            "btn-open-camera"
        ).classList.add(
            "hidden"
        );


        document.getElementById(
            "btn-capture"
        ).classList.remove(
            "hidden"
        );


        document.getElementById(
            "btn-close-camera"
        ).classList.remove(
            "hidden"
        );


        document.getElementById(
            "upload-gallery-input"
        ).disabled = true;


        document.getElementById(
            "upload-gallery-wrapper"
        ).classList.add(
            "disabled"
        );


    } catch (error) {

        console.error(
            "Camera error:",
            error
        );


        alert(
            "Camera access was denied or unavailable."
        );
    }
}


/* =========================================================
   11. STOP CAMERA
========================================================= */

function stopCamera() {

    if (videoStream) {

        videoStream
            .getTracks()
            .forEach(
                track => track.stop()
            );

        videoStream = null;
    }


    const video =
        document.getElementById(
            "camera-stream"
        );

    if (video)
        video.srcObject = null;
}


/* =========================================================
   12. CLOSE CAMERA
========================================================= */

function closeCamera() {

    stopCamera();


    document.getElementById(
        "camera-stream"
    )?.classList.add(
        "hidden"
    );


    document.getElementById(
        "camera-placeholder"
    )?.classList.remove(
        "hidden"
    );


    document.getElementById(
        "btn-open-camera"
    )?.classList.remove(
        "hidden"
    );


    document.getElementById(
        "btn-capture"
    )?.classList.add(
        "hidden"
    );


    document.getElementById(
        "btn-close-camera"
    )?.classList.add(
        "hidden"
    );


    const gallery =
        document.getElementById(
            "upload-gallery-input"
        );


    if (gallery)
        gallery.disabled = false;


    document.getElementById(
        "upload-gallery-wrapper"
    )?.classList.remove(
        "disabled"
    );
}


/* =========================================================
   13. CAPTURE PHOTO
========================================================= */

function capturePhoto() {

    const video =
        document.getElementById(
            "camera-stream"
        );


    if (
        !video.videoWidth ||
        !video.videoHeight
    ) {

        alert(
            "Camera is not ready."
        );

        return;
    }


    const canvas =
        document.createElement(
            "canvas"
        );


    canvas.width =
        video.videoWidth;

    canvas.height =
        video.videoHeight;


    canvas
        .getContext("2d")
        .drawImage(
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


    const preview =
        document.getElementById(
            "photo-preview"
        );


    preview.src =
        dataUrl;


    preview.classList.remove(
        "hidden"
    );


    closeCamera();

    validateStep();
}


/* =========================================================
   14. GALLERY UPLOAD
========================================================= */

function handleUpload(event) {

    const file =
        event.target.files?.[0];


    if (!file) return;


    if (!file.type.startsWith("image/")) {

        alert(
            "Please select an image."
        );

        return;
    }


    closeCamera();


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


            document.getElementById(
                "camera-placeholder"
            ).classList.add(
                "hidden"
            );


            validateStep();
        };


    reader.readAsDataURL(file);
}


/* =========================================================
   15. GPS
========================================================= */

function captureGPS() {

    const display =
        document.getElementById(
            "location-display"
        );


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

        showLocationError(
            "Your browser does not support GPS location."
        );

        return;
    }


    navigator.geolocation.getCurrentPosition(

        handleGPSsuccess,

        handleGPSerror,

        {
            enableHighAccuracy: true,
            timeout: 20000,
            maximumAge: 0
        }
    );
}

function normalizeCoordinates(latitude, longitude) {
    const normalizedLatitude = Number(latitude);
    const normalizedLongitude = Number(longitude);

    if (!Number.isFinite(normalizedLatitude) || normalizedLatitude < -90 || normalizedLatitude > 90) {
        throw new Error("Invalid latitude received from the location provider.");
    }

    if (!Number.isFinite(normalizedLongitude) || normalizedLongitude < -180 || normalizedLongitude > 180) {
        throw new Error("Invalid longitude received from the location provider.");
    }

    return {
        latitude: normalizedLatitude,
        longitude: normalizedLongitude
    };
}


/* =========================================================
   16. GPS SUCCESS
========================================================= */

async function handleGPSsuccess(
    position
) {

    const coordinates = normalizeCoordinates(
        position.coords.latitude,
        position.coords.longitude
    );

    const latitude = coordinates.latitude;
    const longitude = coordinates.longitude;

    const accuracy =
        position.coords.accuracy;


    const timestamp =
        new Date().toISOString();


    currentReport.coords = {

        latitude,
        longitude,
        accuracy,
        timestamp
    };


    currentReport.timestamp =
        timestamp;


    document.getElementById(
        "gps-details"
    ).classList.remove(
        "hidden"
    );


    document.getElementById(
        "gps-latitude"
    ).innerText =
        latitude.toFixed(6);


    document.getElementById(
        "gps-longitude"
    ).innerText =
        longitude.toFixed(6);


    document.getElementById(
        "gps-accuracy"
    ).innerText =
        `±${Math.round(accuracy)} m`;


    document.getElementById(
        "gps-timestamp"
    ).innerText =
        new Date(
            timestamp
        ).toLocaleString();


    document.getElementById(
        "location-display"
    ).innerHTML = `

        <div class="location-empty">

            <strong>
                ✓ GPS Location Captured
            </strong>

            <span>
                ${latitude.toFixed(6)},
                ${longitude.toFixed(6)}
            </span>

        </div>

        <button
            class="btn-secondary"
            onclick="captureGPS()"
        >
            Refresh Location
        </button>
    `;


    showMiniMap(
        latitude,
        longitude
    );


    /*
        IMPORTANT:
        Reverse geocode immediately.
    */

    await updateLocationAddress(
        latitude,
        longitude
    );


    validateStep();
}


/* =========================================================
   17. GPS ERROR
========================================================= */

function handleGPSerror(error) {

    let message =
        "Unable to determine your current location.";


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


    showLocationError(
        message
    );
}


/* =========================================================
   18. LOCATION ERROR UI
========================================================= */

function showLocationError(
    message
) {

    const warning =
        document.getElementById(
            "location-warning"
        );


    warning.innerHTML = `

        <strong>
            Location problem
        </strong>

        <p>
            ${escapeHTML(message)}
        </p>

        <button
            class="btn-outline"
            onclick="captureGPS()"
        >
            Try Again
        </button>

    `;


    warning.classList.remove(
        "hidden"
    );
}


/* =========================================================
   19. MANUAL LOCATION
========================================================= */

async function useManualLocation() {

    const lat =
        Number(
            document.getElementById(
                "manual-latitude"
            ).value
        );


    const lng =
        Number(
            document.getElementById(
                "manual-longitude"
            ).value
        );


    if (
        !Number.isFinite(lat) ||
        lat < -90 ||
        lat > 90
    ) {

        alert(
            "Enter a valid latitude between -90 and 90."
        );

        return;
    }


    if (
        !Number.isFinite(lng) ||
        lng < -180 ||
        lng > 180
    ) {

        alert(
            "Enter a valid longitude between -180 and 180."
        );

        return;
    }


    const coordinates = normalizeCoordinates(lat, lng);
    const timestamp =
        new Date().toISOString();


    currentReport.coords = {

        latitude: coordinates.latitude,
        longitude: coordinates.longitude,

        /*
            Manual coordinates do not have
            GPS accuracy.
        */

        accuracy: null,

        timestamp
    };


    currentReport.timestamp =
        timestamp;


    document.getElementById(
        "gps-details"
    ).classList.remove(
        "hidden"
    );


    document.getElementById(
        "gps-latitude"
    ).innerText =
        lat.toFixed(6);


    document.getElementById(
        "gps-longitude"
    ).innerText =
        lng.toFixed(6);


    document.getElementById(
        "gps-accuracy"
    ).innerText =
        "Manual";


    document.getElementById(
        "gps-timestamp"
    ).innerText =
        new Date(
            timestamp
        ).toLocaleString();


    document.getElementById(
        "location-display"
    ).innerHTML = `

        <div class="location-empty">

            <strong>
                ✓ Manual Location Selected
            </strong>

            <span>
                ${lat.toFixed(6)},
                ${lng.toFixed(6)}
            </span>

        </div>

        <button
            class="btn-secondary"
            onclick="captureGPS()"
        >
            Use Live GPS
        </button>

    `;


    showMiniMap(
        lat,
        lng
    );


    /*
        IMPORTANT:
        Manual coordinates also get
        locality/city/state.
    */

    await updateLocationAddress(
        lat,
        lng
    );


    validateStep();
}


/* =========================================================
   20. MINI MAP
========================================================= */

function showMiniMap(
    lat,
    lng
) {

    const coordinates = normalizeCoordinates(lat, lng);
    lat = coordinates.latitude;
    lng = coordinates.longitude;

    const element =
        document.getElementById(
            "mini-map"
        );


    element.classList.remove(
        "hidden"
    );


    if (citizenMap) {

        citizenMap.remove();

        citizenMap = null;
    }


    citizenMap =
        L.map(
            "mini-map"
        ).setView(
            [lat, lng],
            17
        );

    setTimeout(
        () => citizenMap.invalidateSize(),
        0
    );


    L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
            attribution:
                "&copy; OpenStreetMap contributors"
        }
    ).addTo(
        citizenMap
    );


    currentLocationMarker =
        L.marker(
            [lat, lng]
        )
        .addTo(
            citizenMap
        )
        .bindPopup(
            "Reported Defect Location"
        )
        .openPopup();
}


/* =========================================================
   21. VALIDATE REPORT
========================================================= */

function validateStep() {

    const imageReady =
        Boolean(
            currentReport.image
        );


    const locationReady =
        Boolean(
            currentReport.coords
        );


    document.getElementById(
        "image-check"
    ).innerText =
        imageReady
            ? "✓ Ready"
            : "Not captured";


    document.getElementById(
        "location-check"
    ).innerText =
        locationReady
            ? "✓ Ready"
            : "Required";


    document.getElementById(
        "btn-analyze"
    ).disabled =
        !imageReady ||
        !locationReady;
}


function updateLocationChecklist() {

    validateStep();
}


/* =========================================================
   22. ANALYSIS
========================================================= */

async function runAnalysisSequence() {

    if (!currentReport.image) {

        alert(
            "Capture an image first."
        );

        return;
    }


    if (!currentReport.coords) {

        alert(
            "Capture or enter a location first."
        );

        return;
    }


    collectReportDetails();


    showView(
        "view-processing"
    );


    const steps =
        document.querySelectorAll(
            "#analysis-steps li"
        );


    steps.forEach(
        step =>
            step.classList.remove(
                "done"
            )
    );


    for (
        let i = 0;
        i < steps.length;
        i++
    ) {

        await new Promise(
            resolve =>
                setTimeout(
                    resolve,
                    500
                )
        );


        steps[i].classList.add(
            "done"
        );
    }


    await finalizeAnalysis();
}


/* =========================================================
   23. COLLECT REPORT DETAILS
========================================================= */

function collectReportDetails() {

    currentReport.notes =
        document.getElementById(
            "report-notes"
        ).value.trim();


    /*
        Temporary ML prototype values.

        Later replace this section with
        actual ML API response.
    */

    currentReport.defectType =
        "Pothole";

    currentReport.severity =
        "High";

    currentReport.estimatedSize =
        2.4;

    currentReport.approximateDepth =
        14;
}


/* =========================================================
   24. SAVE COMPLAINT
========================================================= */

async function saveComplaintToSupabase() {

    if (!currentUser) {

        alert(
            "Please log in first."
        );

        return false;
    }


    if (!currentReport.image) {

        alert(
            "Complaint image is missing."
        );

        return false;
    }


    if (!currentReport.coords) {

        alert(
            "Complaint location is missing."
        );

        return false;
    }


    const complaintId =
        generateComplaintId();


    const imagePath =
        await uploadEvidenceFile(

            currentReport.imageFile,

            currentReport.image,

            `complaints/${currentUser.id}/${complaintId}.jpg`
        );


    if (!imagePath) {

        return false;
    }


    const complaintData = {

        complaint_id:
            complaintId,

        user_id:
            currentUser.id,

        image_url:
            imagePath,

        latitude:
            currentReport.coords.latitude,

        longitude:
            currentReport.coords.longitude,

        accuracy:
            currentReport.coords.accuracy,

        locality:
            currentReport.locality,

        city:
            currentReport.city,

        state:
            currentReport.state,

        notes:
            currentReport.notes,

        defect_type:
            currentReport.defectType,

        status:
            "Reported"
    };


    const {
        data,
        error
    } =
        await supabaseClient
            .from("complaints")
            .insert(
                [complaintData]
            )
            .select()
            .single();


    if (error) {

        console.error(
            "Complaint insertion failed:",
            error
        );


        alert(
            "Failed to submit complaint:\n" +
            error.message
        );


        return false;
    }


    currentReport.complaintId =
        data.complaint_id;


    currentReport.databaseId =
        data.id;


    return true;
}


/* =========================================================
   25. FINALIZE ANALYSIS
========================================================= */

async function finalizeAnalysis() {

    try {

        const saved =
            await saveComplaintToSupabase();


        if (!saved) {

            showView(
                "view-report-wizard"
            );

            return;
        }


        /*
            Ask database to perform
            spatial analysis.
        */

        const {
            data,
            error
        } =
            await supabaseClient.rpc(
                "save_complaint_analysis",
                {
                    target_complaint_id:
                        currentReport.complaintId,

                    target_defect_type:
                        currentReport.defectType,

                    target_severity:
                        currentReport.severity,

                    target_priority:
                        0,

                    target_water_risk:
                        "Medium",

                    target_drainage_nearby:
                        false,

                    target_estimated_size_m2:
                        currentReport.estimatedSize,

                    target_approximate_depth_cm:
                        currentReport.approximateDepth
                }
            );


        if (error) {

            console.error(
                "Analysis save error:",
                error
            );

            alert(
                "Complaint saved, but analysis could not be completed:\n" +
                error.message
            );

        } else {

            currentReport =
                {
                    ...currentReport,
                    ...mapDatabaseAnalysis(
                        data
                    )
                };
        }


        renderAnalysisResult();

        showView(
            "view-results"
        );


    } catch (error) {

        console.error(
            "Finalize analysis error:",
            error
        );


        alert(
            "Unexpected error:\n" +
            error.message
        );


        showView(
            "view-report-wizard"
        );
    }
}


/* =========================================================
   26. MAP DATABASE ANALYSIS
========================================================= */

function mapDatabaseAnalysis(
    data
) {

    if (!data)
        return {};


    return {

        severity:
            data.severity,

        priority:
            data.priority,

        waterRisk:
            data.water_risk,

        drainageNearby:
            data.drainage_nearby,

        estimatedSize:
            data.estimated_size_m2,

        approximateDepth:
            data.approximate_depth_cm
    };
}


/* =========================================================
   27. RENDER ANALYSIS
========================================================= */

function renderAnalysisResult() {

    document.getElementById(
        "result-img"
    ).src =
        currentReport.image;


    document.getElementById(
        "result-defect-type"
    ).innerText =
        currentReport.defectType ||
        "Pothole";


    document.getElementById(
        "result-confidence"
    ).innerText =
        "Prototype estimate";


    document.getElementById(
        "result-severity"
    ).innerText =
        currentReport.severity ||
        "Pending";


    document.getElementById(
        "result-estimated-size"
    ).innerText =
        currentReport.estimatedSize
            ? `${currentReport.estimatedSize} m²`
            : "Pending";


    document.getElementById(
        "result-approximate-depth"
    ).innerText =
        currentReport.approximateDepth
            ? `${currentReport.approximateDepth} cm`
            : "Pending";


    document.getElementById(
        "result-drainage"
    ).innerText =
        currentReport.drainageNearby === true
            ? "YES"
            : currentReport.drainageNearby === false
                ? "NO"
                : "Pending";


    document.getElementById(
        "result-water-risk"
    ).innerText =
        currentReport.waterRisk ||
        "Pending";


    document.getElementById(
        "result-spatial-correlation"
    ).innerText =
        currentReport.drainageNearby
            ? "Detected"
            : "Pending";


    document.getElementById(
        "priority-score"
    ).innerText =
        currentReport.priority != null
            ? `${currentReport.priority}/100`
            : "Pending";


    document.getElementById(
        "result-location"
    ).innerHTML = `

        <strong>
            Report Location
        </strong>

        <br>

        Locality:
        ${escapeHTML(currentReport.locality || "Unavailable")}

        <br>

        City:
        ${escapeHTML(currentReport.city || "Unavailable")}

        <br>

        State:
        ${escapeHTML(currentReport.state || "Unavailable")}

        <br>

        Coordinates:
        ${formatCoordinate(currentReport.coords?.latitude)},
        ${formatCoordinate(currentReport.coords?.longitude)}

    `;


    updateFutureRisk(
        "heavy"
    );
}


/* =========================================================
   28. FUTURE RISK
========================================================= */

function updateFutureRisk(
    scenario,
    event
) {

    const values = {

        normal: {
            width: 40,
            label: "MODERATE"
        },

        heavy: {
            width: 75,
            label: "HIGH"
        },

        extreme: {
            width: 92,
            label: "VERY HIGH"
        }

    };


    const selected =
        values[scenario];


    if (!selected)
        return;


    const bar =
        document.getElementById(
            "risk-bar"
        );


    bar.style.width =
        `${selected.width}%`;


    document.getElementById(
        "risk-label"
    ).innerText =
        `Scenario Risk: ${selected.label}`;


    document
        .querySelectorAll(
            ".risk-scenario button"
        )
        .forEach(
            button =>
                button.classList.remove(
                    "active"
                )
        );


    if (event?.target) {

        event.target.classList.add(
            "active"
        );

    } else {

        const buttons =
            document.querySelectorAll(
                ".risk-scenario button"
            );

        if (scenario === "heavy")
            buttons[1]?.classList.add(
                "active"
            );
    }
}


/* =========================================================
   29. UPLOAD STORAGE
========================================================= */

async function uploadEvidenceFile(
    file,
    dataUrl,
    path
) {

    let uploadFile =
        file;


    if (
        !uploadFile &&
        dataUrl
    ) {

        const response =
            await fetch(
                dataUrl
            );


        uploadFile =
            await response.blob();
    }


    if (!uploadFile)
        return null;


    const {
        error
    } =
        await supabaseClient
            .storage
            .from("road-evidence")
            .upload(
                path,
                uploadFile,
                {
                    contentType:
                        uploadFile.type ||
                        "image/jpeg",

                    upsert: true
                }
            );


    if (error) {

        console.error(
            "Storage upload error:",
            error
        );


        alert(
            "Image upload failed:\n" +
            error.message
        );


        return null;
    }


    return path;
}


/* =========================================================
   30. SIGNED IMAGE URL
========================================================= */

async function getEvidenceUrl(
    path
) {

    if (!path)
        return null;


    const {
        data,
        error
    } =
        await supabaseClient
            .storage
            .from("road-evidence")
            .createSignedUrl(
                path,
                3600
            );


    if (error) {

        console.error(
            "Signed URL error:",
            error
        );

        return null;
    }


    return data.signedUrl;
}


/* =========================================================
   31. LOAD COMPLAINTS
========================================================= */

async function loadComplaints() {

    const {
        data,
        error
    } =
        await supabaseClient
            .from("complaints")
            .select(
                "*, complaint_locations(locality,city,state)"
            )
            .order(
                "created_at",
                {
                    ascending: false
                }
            );


    if (error) {

        console.error(
            "Unable to load complaints:",
            error
        );

        return [];
    }


    databaseComplaints =
        data || [];


    return databaseComplaints;
}


/* =========================================================
   32. LOAD WORK ORDERS
========================================================= */

async function loadWorkOrders() {

    const {
        data,
        error
    } =
        await supabaseClient
            .from("work_orders")
            .select(
                "*, complaints(*)"
            )
            .order(
                "created_at",
                {
                    ascending: false
                }
            );


    if (error) {

        console.error(
            "Unable to load work orders:",
            error
        );

        return [];
    }


    databaseWorkOrders =
        data || [];


    return databaseWorkOrders;
}


/* =========================================================
   33. LOAD INFRASTRUCTURE
========================================================= */

async function loadInfrastructure() {

    const [
        drainageResult,
        waterloggingResult
    ] =
        await Promise.all([

            supabaseClient
                .from("drainage")
                .select("*"),

            supabaseClient
                .from("waterlogging")
                .select("*")

        ]);


    databaseDrainage =
        drainageResult.data || [];


    databaseWaterlogging =
        waterloggingResult.data || [];
}


/* =========================================================
   34. LOAD CONTRACTORS
========================================================= */

async function loadContractors() {

    const {
        data,
        error
    } =
        await supabaseClient
            .from("profiles")
            .select(
                "id,full_name"
            )
            .eq(
                "role",
                "contractor"
            )
            .order(
                "full_name"
            );


    if (error) {

        console.error(
            "Unable to load contractors:",
            error
        );

        return [];
    }


    databaseContractors =
        data || [];


    return databaseContractors;
}


/* =========================================================
   35. COMPLAINT STATUS
========================================================= */

async function updateComplaintStatus(
    complaintId,
    status
) {

    const {
        data,
        error
    } =
        await supabaseClient.rpc(
            "transition_complaint",
            {
                target_complaint_id:
                    complaintId,

                next_status:
                    status
            }
        );


    if (error) {

        alert(
            "Unable to update complaint:\n" +
            error.message
        );

        return null;
    }


    await loadComplaints();


    return data;
}


/* =========================================================
   36. WORK ORDER STATUS
========================================================= */

async function transitionWorkOrderById(
    workOrderId,
    status
) {

    const {
        data,
        error
    } =
        await supabaseClient.rpc(
            "transition_work_order",
            {
                target_work_order_id:
                    workOrderId,

                next_status:
                    status
            }
        );


    if (error) {

        alert(
            "Unable to update work order:\n" +
            error.message
        );

        return null;
    }


    await loadWorkOrders();

    return data;
}


/* =========================================================
   37. LOGIN
========================================================= */

async function handleLogin() {

    const email =
        document.getElementById(
            "login-email"
        ).value.trim();


    const password =
        document.getElementById(
            "login-password"
        ).value;


    if (!email || !password) {

        alert(
            "Enter email and password."
        );

        return;
    }


    const {
        data,
        error
    } =
        await supabaseClient.auth.signInWithPassword({

            email,
            password

        });


    if (error) {

        alert(
            "Login failed:\n" +
            error.message
        );

        return;
    }


    const {
        data: profile,
        error: profileError
    } =
        await supabaseClient
            .from("profiles")
            .select(
                "role,full_name"
            )
            .eq(
                "id",
                data.user.id
            )
            .maybeSingle();


    if (
        profileError ||
        !profile
    ) {

        await supabaseClient.auth.signOut();


        alert(
            "No profile was found for this user."
        );

        return;
    }


    currentUser =
        data.user;


    currentRole =
        profile.role;


    document.getElementById(
        "nav-role-badge"
    ).innerText =
        getRoleName(
            currentRole
        );


    if (
        currentRole ===
        "officer"
    ) {

        showView(
            "view-officer-dash"
        );

    } else if (
        currentRole ===
        "contractor"
    ) {

        showContractorDashboard();

    } else {

        showView(
            "view-citizen-dash"
        );
    }
}


/* =========================================================
   38. SESSION
========================================================= */

async function restoreSession() {

    const {
        data
    } =
        await supabaseClient.auth.getSession();


    if (!data.session) {

        showView(
            "view-login"
        );

        return;
    }


    const {
        data: profile
    } =
        await supabaseClient
            .from("profiles")
            .select(
                "role"
            )
            .eq(
                "id",
                data.session.user.id
            )
            .maybeSingle();


    if (!profile) {

        await supabaseClient.auth.signOut();

        showView(
            "view-login"
        );

        return;
    }


    currentUser =
        data.session.user;

    currentRole =
        profile.role;


    if (
        currentRole ===
        "officer"
    ) {

        showView(
            "view-officer-dash"
        );

    } else if (
        currentRole ===
        "contractor"
    ) {

        showContractorDashboard();

    } else {

        showView(
            "view-citizen-dash"
        );
    }
}


/* =========================================================
   39. LOGOUT
========================================================= */

async function logout() {

    stopCamera();

    await supabaseClient.auth.signOut();

    currentUser = null;
    currentRole = null;

    databaseComplaints = [];
    databaseWorkOrders = [];

    showView(
        "view-login"
    );
}


/* =========================================================
   40. NAVIGATION
========================================================= */

function showView(viewId) {

    document
        .querySelectorAll(".view")
        .forEach(
            view =>
                view.classList.add(
                    "hidden"
                )
        );


    const target =
        document.getElementById(
            viewId
        );


    if (!target)
        return;


    target.classList.remove(
        "hidden"
    );


    const nav =
        document.getElementById(
            "app-nav"
        );


    if (
        viewId ===
        "view-login"
    ) {

        nav.classList.add(
            "hidden"
        );

    } else {

        nav.classList.remove(
            "hidden"
        );

        renderNavLinks();
    }


    if (
        viewId ===
        "view-citizen-dash"
    ) {

        loadCitizenDashboard();
    }


    if (
        viewId ===
        "view-officer-dash"
    ) {

        setTimeout(
            initOfficerDashboard,
            100
        );
    }


    if (
        viewId ===
        "view-contractor-dash"
    ) {

        renderContractorDashboard();
    }
}


/* =========================================================
   41. NAV LINKS
========================================================= */

function renderNavLinks() {

    const container =
        document.getElementById(
            "nav-links"
        );


    if (!container)
        return;


    if (
        currentRole ===
        "citizen"
    ) {

        container.innerHTML = `

            <a
                onclick="showView('view-citizen-dash')"
            >
                Dashboard
            </a>

            <a
                onclick="startNewReport()"
            >
                Report Problem
            </a>
        `;


    } else if (
        currentRole ===
        "officer"
    ) {

        container.innerHTML = `

            <a
                onclick="showView('view-officer-dash')"
            >
                Command Center
            </a>
        `;


    } else {

        container.innerHTML = `

            <a
                onclick="showContractorDashboard()"
            >
                Work Center
            </a>
        `;
    }
}


/* =========================================================
   42. CITIZEN DASHBOARD
========================================================= */

async function loadCitizenDashboard() {

    const complaints =
        await loadComplaints();


    const own =
        complaints.filter(
            item =>
                item.user_id ===
                currentUser?.id
        );


    const active =
        own.filter(
            item =>
                item.status !==
                "Closed"
        ).length;


    const resolved =
        own.filter(
            item =>
                item.status ===
                "Closed"
        ).length;


    const highRisk =
        own.filter(
            item =>
                item.severity ===
                "High"
        ).length;


    document.getElementById(
        "citizen-active-count"
    ).innerText =
        active;


    document.getElementById(
        "citizen-resolved-count"
    ).innerText =
        resolved;


    document.getElementById(
        "citizen-high-risk-count"
    ).innerText =
        highRisk;


    const container =
        document.getElementById(
            "citizen-history-list"
        );


    if (!own.length) {

        container.innerHTML =
            "<p>No complaints submitted yet.</p>";

        return;
    }


    container.innerHTML =
        own.map(
            item => `

                <div class="history-card">

                    <h4>
                        ${escapeHTML(item.complaint_id)}
                    </h4>

                    <p>
                        Status:
                        ${escapeHTML(item.status)}
                    </p>

                    <p>
                        Location:
                        ${escapeHTML(item.locality || "Unavailable")},
                        ${escapeHTML(item.city || "Unavailable")},
                        ${escapeHTML(item.state || "Unavailable")}
                    </p>

                    <p>
                        Coordinates:
                        ${formatCoordinate(item.latitude)},
                        ${formatCoordinate(item.longitude)}
                    </p>

                </div>
            `
        )
        .join("");
}


/* =========================================================
   43. OFFICER DASHBOARD
========================================================= */

async function initOfficerDashboard() {

    await Promise.all([
        loadComplaints(),
        loadWorkOrders(),
        loadInfrastructure(),
        loadContractors()
    ]);


    document.getElementById(
        "officer-total-count"
    ).innerText =
        databaseComplaints.length;


    document.getElementById(
        "officer-high-risk-count"
    ).innerText =
        databaseComplaints.filter(
            item =>
                item.severity ===
                "High"
        ).length;


    document.getElementById(
        "officer-water-risk-count"
    ).innerText =
        databaseComplaints.filter(
            item =>
                item.water_risk ===
                "High"
        ).length;


    document.getElementById(
        "officer-work-order-count"
    ).innerText =
        databaseWorkOrders.filter(
            item =>
                item.status !==
                "Closed"
        ).length;


    document.getElementById(
        "officer-assigned-count"
    ).innerText =
        databaseWorkOrders.filter(
            item =>
                item.status ===
                "Assigned"
        ).length;


    document.getElementById(
        "officer-in-progress-count"
    ).innerText =
        databaseWorkOrders.filter(
            item =>
                [
                    "Accepted",
                    "In Progress"
                ].includes(
                    item.status
                )
        ).length;


    document.getElementById(
        "officer-finished-count"
    ).innerText =
        databaseWorkOrders.filter(
            item =>
                item.status ===
                "Completed Awaiting Verification"
        ).length;


    document.getElementById(
        "officer-approved-count"
    ).innerText =
        databaseWorkOrders.filter(
            item =>
                item.status ===
                "Closed"
        ).length;


    renderOfficerTable();

    setTimeout(
        initOfficerMap,
        150
    );
}


/* =========================================================
   44. OFFICER TABLE
========================================================= */

function renderOfficerTable() {

    const tbody =
        document.getElementById(
            "officer-table-body"
        );


    if (!tbody)
        return;


    tbody.innerHTML =
        databaseComplaints
            .map(
                complaint => `

                <tr>

                    <td>
                        ${escapeHTML(
                            complaint.complaint_id
                        )}
                    </td>


                    <td>

                        ${escapeHTML(
                            complaint.locality ||
                            "Unavailable"
                        )}

                        <br>

                        <small>
                            ${escapeHTML(
                                complaint.city ||
                                "Unavailable"
                            )}

                            ,

                            ${escapeHTML(
                                complaint.state ||
                                "Unavailable"
                            )}
                        </small>

                    </td>


                    <td>

                        ${formatCoordinate(
                            complaint.latitude
                        )}

                        <br>

                        ${formatCoordinate(
                            complaint.longitude
                        )}

                    </td>


                    <td>
                        ${escapeHTML(
                            complaint.defect_type ||
                            "Road Defect"
                        )}
                    </td>


                    <td>
                        ${complaint.priority ??
                            "Pending"}
                    </td>


                    <td>
                        ${escapeHTML(
                            complaint.water_risk ||
                            "Pending"
                        )}
                    </td>


                    <td>
                        ${escapeHTML(
                            complaint.status
                        )}
                    </td>


                    <td>
                        ${renderOfficerActions(
                            complaint
                        )}
                    </td>

                </tr>
            `
            )
            .join("");
}


/* =========================================================
   45. OFFICER MAP
========================================================= */

function initOfficerMap() {

    const element =
        document.getElementById(
            "officer-map"
        );


    if (!element)
        return;


    if (officerMapInstance) {

        officerMapInstance.remove();

        officerMapInstance =
            null;
    }


    const first =
        databaseComplaints.find(
            item =>
                Number.isFinite(
                    Number(
                        item.latitude
                    )
                ) &&
                Number.isFinite(
                    Number(
                        item.longitude
                    )
                )
        );


    if (!first) {

        element.innerHTML =
            "No complaint coordinates available.";

        return;
    }


    officerMapInstance =
        L.map(
            "officer-map"
        ).setView(
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
    ).addTo(
        officerMapInstance
    );


    databaseComplaints.forEach(
        complaint => {

            if (
                !Number.isFinite(
                    Number(
                        complaint.latitude
                    )
                )
            )
                return;


            const marker =
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
                );


            marker.bindPopup(`

                <strong>
                    ${escapeHTML(
                        complaint.complaint_id
                    )}
                </strong>

                <br>

                Location:
                ${escapeHTML(
                    complaint.locality ||
                    "Unavailable"
                )},

                ${escapeHTML(
                    complaint.city ||
                    "Unavailable"
                )},

                ${escapeHTML(
                    complaint.state ||
                    "Unavailable"
                )}

                <br>

                Coordinates:
                ${formatCoordinate(
                    complaint.latitude
                )},

                ${formatCoordinate(
                    complaint.longitude
                )}

                <br>

                Status:
                ${escapeHTML(
                    complaint.status
                )}

            `);


            marker.on(
                "click",
                () =>
                    showOfficerLocation(
                        complaint
                    )
            );
        }
    );


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
            .bindPopup(
                `Drainage: ${escapeHTML(drain.type)}`
            );
        }
    );


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
            .bindPopup(
                `Waterlogging Risk: ${escapeHTML(hotspot.risk)}`
            );
        }
    );
}


/* =========================================================
   46. OFFICER LOCATION PANEL
========================================================= */

function showOfficerLocation(
    complaint
) {

    document.getElementById(
        "officer-locality"
    ).innerText =
        complaint.locality ||
        "Unavailable";


    document.getElementById(
        "officer-city"
    ).innerText =
        complaint.city ||
        "Unavailable";


    document.getElementById(
        "officer-state"
    ).innerText =
        complaint.state ||
        "Unavailable";


    document.getElementById(
        "officer-latitude"
    ).innerText =
        formatCoordinate(
            complaint.latitude
        );


    document.getElementById(
        "officer-longitude"
    ).innerText =
        formatCoordinate(
            complaint.longitude
        );


    document.getElementById(
        "officer-accuracy"
    ).innerText =
        complaint.accuracy
            ? `±${Math.round(
                complaint.accuracy
            )} m`
            : "Manual";


    document.getElementById(
        "officer-defect-id"
    ).innerText =
        complaint.complaint_id;
}


/* =========================================================
   47. OFFICER ACTIONS
========================================================= */

function renderOfficerActions(
    complaint
) {

    const workOrder =
        databaseWorkOrders.find(
            item =>
                item.complaint_id ===
                complaint.complaint_id
        );


    if (
        complaint.status ===
        "Reported"
    ) {

        return `

            <button
                class="btn-primary"
                onclick="reviewComplaint('${complaint.complaint_id}')"
            >
                Review
            </button>
        `;
    }


    if (
        [
            "Under Review",
            "Analyzed"
        ].includes(
            complaint.status
        )
    ) {

        return `

            <button
                class="btn-primary"
                onclick="verifyComplaint('${complaint.complaint_id}')"
            >
                Verify
            </button>
        `;
    }


    if (
        complaint.status ===
            "Verified" &&
        !workOrder
    ) {

        return `

            <button
                class="btn-primary"
                onclick="createWorkOrder('${complaint.complaint_id}')"
            >
                Create Work Order
            </button>
        `;
    }


    if (
        workOrder?.status ===
        "Completed Awaiting Verification"
    ) {

        return `

            <button
                class="btn-cta"
                onclick="openVerification('${workOrder.id}')"
            >
                Verify Repair
            </button>
        `;
    }


    if (workOrder) {

        const options =
            databaseContractors
                .map(
                    contractor => `

                        <option
                            value="${contractor.id}"
                            ${
                                contractor.id ===
                                workOrder.contractor_id
                                    ? "selected"
                                    : ""
                            }
                        >
                            ${
                                escapeHTML(
                                    contractor.full_name ||
                                    "Contractor"
                                )
                            }
                        </option>
                    `
                )
                .join("");


        return `

            <select
                id="contractor-${complaint.complaint_id}"
            >

                <option value="">
                    Select Contractor
                </option>

                ${options}

            </select>


            <button
                class="btn-primary"
                onclick="assignSelectedContractor('${complaint.complaint_id}')"
            >
                Assign Contractor
            </button>
        `;
    }


    return "No action";
}


/* =========================================================
   48. REVIEW COMPLAINT
========================================================= */

async function reviewComplaint(
    complaintId
) {

    const {
        data,
        error
    } =
        await supabaseClient.rpc(
            "prepare_complaint_for_review",
            {
                target_complaint_id:
                    complaintId
            }
        );


    if (error) {

        alert(
            "Unable to review complaint:\n" +
            error.message
        );

        return;
    }


    databaseComplaints =
        databaseComplaints.map(
            item =>
                item.complaint_id ===
                complaintId
                    ? {
                        ...item,
                        ...data
                    }
                    : item
        );


    showOfficerLocation(
        data
    );


    await initOfficerDashboard();
}


/* =========================================================
   49. VERIFY COMPLAINT
========================================================= */

async function verifyComplaint(
    complaintId
) {

    const result =
        await updateComplaintStatus(
            complaintId,
            "Verified"
        );


    if (!result)
        return;


    alert(
        `${complaintId} verified.`
    );


    await initOfficerDashboard();
}


/* =========================================================
   50. CREATE WORK ORDER
========================================================= */

async function createWorkOrder(
    complaintId
) {

    const {
        data,
        error
    } =
        await supabaseClient.rpc(
            "create_work_order_for_complaint",
            {
                target_complaint_id:
                    complaintId
            }
        );


    if (error) {

        alert(
            "Unable to create work order:\n" +
            error.message
        );

        return;
    }


    await loadWorkOrders();
    await loadComplaints();


    alert(
        `Work order ${data.work_order_id} created.`
    );


    await initOfficerDashboard();
}


/* =========================================================
   51. ASSIGN CONTRACTOR
========================================================= */

async function assignSelectedContractor(
    complaintId
) {

    const selector =
        document.getElementById(
            `contractor-${complaintId}`
        );


    if (
        !selector ||
        !selector.value
    ) {

        alert(
            "Select a contractor first."
        );

        return;
    }


    const workOrder =
        databaseWorkOrders.find(
            item =>
                item.complaint_id ===
                complaintId
        );


    if (!workOrder) {

        alert(
            "Work order not found."
        );

        return;
    }


    const {
        data,
        error
    } =
        await supabaseClient.rpc(
            "assign_work_order",
            {
                target_work_order_id:
                    workOrder.id,

                target_contractor_id:
                    selector.value
            }
        );


    if (error) {

        alert(
            "Unable to assign contractor:\n" +
            error.message
        );

        return;
    }


    await loadWorkOrders();
    await loadComplaints();


    alert(
        "Contractor assigned successfully."
    );


    await initOfficerDashboard();
}


/* =========================================================
   52. CONTRACTOR DASHBOARD
========================================================= */

async function showContractorDashboard() {

    showView(
        "view-contractor-dash"
    );


    await loadComplaints();

    await loadWorkOrders();


    renderContractorDashboard();
}


/* =========================================================
   53. CONTRACTOR RENDER
========================================================= */

function renderContractorDashboard() {

    const container =
        document.getElementById(
            "contractor-work-orders"
        );


    if (!container)
        return;


    const orders =
        databaseWorkOrders.filter(
            order =>
                order.contractor_id ===
                currentUser?.id
        );


    document.getElementById(
        "contractor-assigned"
    ).innerText =
        orders.filter(
            order =>
                order.status ===
                "Assigned"
        ).length;


    document.getElementById(
        "contractor-accepted"
    ).innerText =
        orders.filter(
            order =>
                order.status ===
                "Accepted"
        ).length;


    document.getElementById(
        "contractor-progress"
    ).innerText =
        orders.filter(
            order =>
                order.status ===
                "In Progress"
        ).length;


    document.getElementById(
        "contractor-completed"
    ).innerText =
        orders.filter(
            order =>
                [
                    "Completed Awaiting Verification",
                    "Closed"
                ].includes(
                    order.status
                )
        ).length;


    if (!orders.length) {

        container.innerHTML =
            "<p>No work orders are assigned to you.</p>";

        return;
    }


    container.innerHTML =
        orders.map(
            order =>
                renderContractorWorkOrder(
                    order
                )
        ).join("");


    orders.forEach(
        order =>
            initializeContractorMap(
                order
            )
    );
}


/* =========================================================
   54. CONTRACTOR WORK ORDER CARD
========================================================= */

function renderContractorWorkOrder(
    order
) {

    const complaint =
        order.complaints || {};


    const canStart =
        order.status ===
        "Accepted";


    const canRepair =
        order.status ===
        "In Progress";


    return `

        <div class="work-order-card">

            <div class="work-order-header">

                <h3>
                    ${escapeHTML(
                        order.work_order_id
                    )}
                </h3>


                <p>
                    Complaint:
                    ${escapeHTML(
                        order.complaint_id
                    )}
                </p>


                <div class="work-order-details">

                    <div>
                        <span>Locality</span>
                        <strong>
                            ${escapeHTML(
                                complaint.locality ||
                                "Unavailable"
                            )}
                        </strong>
                    </div>


                    <div>
                        <span>City</span>
                        <strong>
                            ${escapeHTML(
                                complaint.city ||
                                "Unavailable"
                            )}
                        </strong>
                    </div>


                    <div>
                        <span>State</span>
                        <strong>
                            ${escapeHTML(
                                complaint.state ||
                                "Unavailable"
                            )}
                        </strong>
                    </div>


                    <div>
                        <span>Coordinates</span>
                        <strong>
                            ${formatCoordinate(
                                complaint.latitude
                            )},
                            ${formatCoordinate(
                                complaint.longitude
                            )}
                        </strong>
                    </div>


                    <div>
                        <span>Status</span>
                        <strong>
                            ${escapeHTML(
                                order.status
                            )}
                        </strong>
                    </div>

                </div>


                <div
                    id="contractor-map-${order.id}"
                    class="contractor-map"
                ></div>


                <!-- BEFORE IMAGE -->

                <div class="result-card">

                    <h3>
                        Original Defect — Before Repair
                    </h3>

                    <img
                        id="contractor-before-${order.id}"
                        class="repair-image"
                        alt="Original road defect"
                    >

                    <p
                        id="before-status-${order.id}"
                        class="note"
                    >
                        Loading original defect image...
                    </p>

                </div>

            </div>


            <div class="work-order-actions">


                ${
                    order.status ===
                    "Assigned"
                        ? `

                            <button
                                class="btn-secondary"
                                onclick="acceptWorkOrder('${order.id}')"
                            >
                                Accept Work
                            </button>

                        `
                        : ""
                }


                ${
                    canStart
                        ? `

                            <button
                                class="btn-primary"
                                onclick="startWorkOrder('${order.id}')"
                            >
                                Start Work
                            </button>

                        `
                        : ""
                }


                ${
                    canRepair
                        ? `

                            <button
                                class="btn-outline"
                                onclick="startRepairCamera('${order.id}')"
                            >
                                Open Repair Camera
                            </button>


                            <button
                                id="submit-repair-${order.id}"
                                class="btn-cta"
                                onclick="submitRepairCompletion('${order.id}')"
                                disabled
                            >
                                Submit Completed Repair
                            </button>


                            <div
                                id="repair-capture-${order.id}"
                                class="repair-capture-panel hidden"
                            >

                                <video
                                    id="repair-video-${order.id}"
                                    autoplay
                                    playsinline
                                ></video>


                                <button
                                    class="btn-primary"
                                    onclick="captureRepairPhoto('${order.id}')"
                                >
                                    Capture After-Repair Photo
                                </button>


                                <img
                                    id="repair-preview-${order.id}"
                                    class="repair-image hidden"
                                    alt="After repair preview"
                                >

                            </div>


                            <p
                                id="repair-location-${order.id}"
                                class="note"
                            >
                                Location will be detected automatically after the photo is captured.
                            </p>

                            <p
                                id="repair-analysis-${order.id}"
                                class="note"
                            >
                                After-repair image analysis will start automatically.
                            </p>

                        `
                        : ""
                }

            </div>

        </div>
    `;
}


/* =========================================================
   55. CONTRACTOR MAP
========================================================= */

function initializeContractorMap(
    order
) {

    const complaint =
        order.complaints;


    if (
        !complaint ||
        !Number.isFinite(
            Number(
                complaint.latitude
            )
        )
    )
        return;


    const element =
        document.getElementById(
            `contractor-map-${order.id}`
        );


    if (!element)
        return;


    const map =
        L.map(
            element
        ).setView(
            [
                complaint.latitude,
                complaint.longitude
            ],
            17
        );


    L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
            attribution:
                "&copy; OpenStreetMap contributors"
        }
    ).addTo(
        map
    );


    L.marker(
        [
            complaint.latitude,
            complaint.longitude
        ]
    )
    .addTo(map)
    .bindPopup(
        "Assigned defect location"
    )
    .openPopup();


    /*
        Load original BEFORE image.
    */

    loadContractorBeforeImage(
        order
    );
}


/* =========================================================
   56. LOAD BEFORE IMAGE
========================================================= */

async function loadContractorBeforeImage(
    order
) {

    const imageElement =
        document.getElementById(
            `contractor-before-${order.id}`
        );


    const statusElement =
        document.getElementById(
            `before-status-${order.id}`
        );


    if (!imageElement)
        return;


    /*
        The corrected SQL copies:

        complaints.image_url

        into:

        work_orders.evidence_before_url

        when the work order is created.
    */

    let beforePath =
        order.evidence_before_url;


    /*
        Backward compatibility:
        if an old work order has no before path,
        use the original complaint image.
    */

    if (
        !beforePath &&
        order.complaints
    ) {

        beforePath =
            order.complaints.image_url;
    }


    if (!beforePath) {

        statusElement.innerText =
            "Original defect image unavailable.";

        return;
    }


    const url =
        await getEvidenceUrl(
            beforePath
        );


    if (!url) {

        statusElement.innerText =
            "Unable to load original defect image.";

        return;
    }


    imageElement.src =
        url;


    statusElement.innerText =
        "Original citizen-submitted image loaded.";
}


/* =========================================================
   57. ACCEPT WORK
========================================================= */

async function acceptWorkOrder(
    workOrderId
) {

    const result =
        await transitionWorkOrderById(
            workOrderId,
            "Accepted"
        );


    if (!result)
        return;


    alert(
        "Work order accepted."
    );


    renderContractorDashboard();
}


/* =========================================================
   58. START WORK
========================================================= */

async function startWorkOrder(
    workOrderId
) {

    const result =
        await transitionWorkOrderById(
            workOrderId,
            "In Progress"
        );


    if (!result)
        return;


    alert(
        "Repair work started."
    );


    renderContractorDashboard();
}


/* =========================================================
   59. CONTRACTOR REPAIR CAMERA
========================================================= */

async function startRepairCamera(
    workOrderId
) {

    const panel =
        document.getElementById(
            `repair-capture-${workOrderId}`
        );


    const video =
        document.getElementById(
            `repair-video-${workOrderId}`
        );


    if (!panel || !video)
        return;


    try {

        repairCaptureState[
            workOrderId
        ] =
            repairCaptureState[
                workOrderId
            ] || {};


        repairCaptureState[
            workOrderId
        ].stream =
            await navigator.mediaDevices.getUserMedia({

                video: {
                    facingMode: {
                        ideal: "environment"
                    }
                },

                audio: false
            });


        video.srcObject =
            repairCaptureState[
                workOrderId
            ].stream;


        panel.classList.remove(
            "hidden"
        );


    } catch (error) {

        console.error(
            error
        );


        alert(
            "Repair camera access failed."
        );
    }
}


/* =========================================================
   60. CAPTURE AFTER IMAGE
========================================================= */

async function captureRepairPhoto(
    workOrderId
) {

    const video =
        document.getElementById(
            `repair-video-${workOrderId}`
        );


    const preview =
        document.getElementById(
            `repair-preview-${workOrderId}`
        );


    if (
        !video ||
        !video.videoWidth
    ) {

        alert(
            "Open the repair camera first."
        );

        return;
    }


    const canvas =
        document.createElement(
            "canvas"
        );


    canvas.width =
        video.videoWidth;


    canvas.height =
        video.videoHeight;


    canvas
        .getContext("2d")
        .drawImage(
            video,
            0,
            0,
            canvas.width,
            canvas.height
        );


    const image =
        canvas.toDataURL(
            "image/jpeg",
            0.9
        );


    repairCaptureState[
        workOrderId
    ] =
        repairCaptureState[
            workOrderId
        ] || {};


    repairCaptureState[
        workOrderId
    ].image =
        image;


    preview.src =
        image;


    preview.classList.remove(
        "hidden"
    );


    repairCaptureState[
        workOrderId
    ].stream
        ?.getTracks()
        .forEach(
            track =>
                track.stop()
        );


    repairCaptureState[
        workOrderId
    ].stream =
        null;

    await analyzeRepairPhoto(workOrderId, image);
    captureRepairLocation(workOrderId);


    updateRepairSubmitState(
        workOrderId
    );
}


async function analyzeRepairPhoto(workOrderId, image) {
    const capture = repairCaptureState[workOrderId] || {};
    const statusElement = document.getElementById(`repair-analysis-${workOrderId}`);

    if (statusElement) statusElement.innerText = "Analyzing after-repair image...";

    try {
        const imageElement = new Image();
        await new Promise((resolve, reject) => {
            imageElement.onload = resolve;
            imageElement.onerror = reject;
            imageElement.src = image;
        });
        capture.analysis = {
            width: imageElement.naturalWidth,
            height: imageElement.naturalHeight,
            analyzedAt: new Date().toISOString()
        };
        if (statusElement) statusElement.innerText = "After-repair image analyzed successfully.";
    } catch (error) {
        console.error("Repair image analysis failed:", error);
        if (statusElement) statusElement.innerText = "After-repair image analysis failed.";
    }

    repairCaptureState[workOrderId] = capture;
}


/* =========================================================
   61. REPAIR GPS
========================================================= */

function captureRepairLocation(
    workOrderId
) {

    if (!navigator.geolocation) {

        alert(
            "Location is not supported."
        );

        return;
    }


    navigator.geolocation.getCurrentPosition(

        position => {

            const coordinates = normalizeCoordinates(
                position.coords.latitude,
                position.coords.longitude
            );

            repairCaptureState[
                workOrderId
            ] =
                repairCaptureState[
                    workOrderId
                ] || {};


            repairCaptureState[
                workOrderId
            ].coords = {

                latitude:
                    coordinates.latitude,

                longitude:
                    coordinates.longitude,

                accuracy:
                    position.coords.accuracy,

                timestamp:
                    new Date().toISOString()
            };


            const element =
                document.getElementById(
                    `repair-location-${workOrderId}`
                );


            if (element) {

                element.innerText =
                    `Repair location captured: ` +
                    `${formatCoordinate(coordinates.latitude)}, ` +
                    `${formatCoordinate(coordinates.longitude)} ` +
                    `(±${Math.round(position.coords.accuracy)} m)`;
            }


            updateRepairSubmitState(
                workOrderId
            );
        },


        error => {

            alert(
                "Unable to capture repair location:\n" +
                error.message
            );
        },


        {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 0
        }
    );
}


/* =========================================================
   62. ENABLE REPAIR SUBMIT
========================================================= */

function updateRepairSubmitState(
    workOrderId
) {

    const capture =
        repairCaptureState[
            workOrderId
        ];


    const button =
        document.getElementById(
            `submit-repair-${workOrderId}`
        );


    if (button) {

        button.disabled =
            !capture?.image ||
            !capture?.coords ||
            !capture?.analysis;
    }
}


/* =========================================================
   63. SUBMIT COMPLETED REPAIR
========================================================= */

async function submitRepairCompletion(
    workOrderId
) {

    const capture =
        repairCaptureState[
            workOrderId
        ];


    if (
        !capture?.image ||
        !capture?.coords
    ) {

        alert(
            "Capture the after-repair image and repair location first."
        );

        return;
    }


    const path =
        `work-orders/${currentUser.id}/${workOrderId}/evidence_after.jpg`;


    const imagePath =
        await uploadEvidenceFile(
            null,
            capture.image,
            path
        );


    if (!imagePath)
        return;


    /*
        Database function:

        - verifies contractor
        - verifies In Progress
        - stores after image
        - stores repair GPS
        - changes work order status
        - changes complaint status
    */

    const {
        data,
        error
    } =
        await supabaseClient.rpc(
            "submit_work_order_completion",
            {

                target_work_order_id:
                    workOrderId,

                captured_latitude:
                    capture.coords.latitude,

                captured_longitude:
                    capture.coords.longitude,

                captured_accuracy:
                    capture.coords.accuracy,

                captured_image_path:
                    imagePath
            }
        );


    if (error) {

        alert(
            "Unable to submit repair:\n" +
            error.message
        );

        return;
    }


    databaseWorkOrders =
        databaseWorkOrders.map(
            item =>
                item.id ===
                workOrderId
                    ? {
                        ...item,
                        ...data
                    }
                    : item
        );


    alert(
        "Repair submitted to municipal officer for verification."
    );


    await loadWorkOrders();


    renderContractorDashboard();
}


/* =========================================================
   64. OFFICER VERIFICATION
========================================================= */

async function openVerification(
    workOrderId
) {

    verificationWorkOrderId =
        workOrderId;


    const workOrder =
        databaseWorkOrders.find(
            item =>
                item.id ===
                workOrderId
        );


    if (!workOrder)
        return;


    const complaint =
        workOrder.complaints ||
        databaseComplaints.find(
            item =>
                item.complaint_id ===
                workOrder.complaint_id
        );


    /*
        BEFORE IMAGE

        First preference:
        work_orders.evidence_before_url

        Fallback:
        complaints.image_url
    */

    const beforePath =
        workOrder.evidence_before_url ||
        complaint?.image_url;


    const afterPath =
        workOrder.evidence_after_url;


    const [
        beforeUrl,
        afterUrl
    ] =
        await Promise.all([

            getEvidenceUrl(
                beforePath
            ),

            getEvidenceUrl(
                afterPath
            )

        ]);


    const beforeImage =
        document.getElementById(
            "before-repair-image"
        );


    const afterImage =
        document.getElementById(
            "after-repair-image"
        );


    const beforePlaceholder =
        document.getElementById(
            "before-image-placeholder"
        );


    const afterPlaceholder =
        document.getElementById(
            "after-image-placeholder"
        );


    if (beforeUrl) {

        beforeImage.src =
            beforeUrl;

        beforeImage.classList.remove(
            "hidden"
        );

        beforePlaceholder.classList.add(
            "hidden"
        );

    } else {

        beforeImage.classList.add(
            "hidden"
        );

        beforePlaceholder.classList.remove(
            "hidden"
        );
    }


    if (afterUrl) {

        afterImage.src =
            afterUrl;

        afterImage.classList.remove(
            "hidden"
        );

        afterPlaceholder.classList.add(
            "hidden"
        );

    } else {

        afterImage.classList.add(
            "hidden"
        );

        afterPlaceholder.classList.remove(
            "hidden"
        );
    }


    document.getElementById(
        "repair-coordinates"
    ).innerText =

        `Complaint: ` +

        `${formatCoordinate(
            complaint?.latitude
        )}, ` +

        `${formatCoordinate(
            complaint?.longitude
        )}` +

        ` | Repair: ` +

        `${formatCoordinate(
            workOrder.repair_latitude
        )}, ` +

        `${formatCoordinate(
            workOrder.repair_longitude
        )}` +

        ` ` +

        (
            workOrder.repair_accuracy
                ? `(±${Math.round(
                    workOrder.repair_accuracy
                )} m)`
                : ""
        );


    showView(
        "view-repair-verification"
    );
}


/* =========================================================
   65. APPROVE REPAIR
========================================================= */

async function verifyRepair() {

    const workOrder =
        databaseWorkOrders.find(
            item =>
                item.id ===
                verificationWorkOrderId
        );


    if (!workOrder)
        return;


    const result =
        await transitionWorkOrderById(
            workOrder.id,
            "Closed"
        );


    if (!result)
        return;


    alert(
        `${workOrder.work_order_id} approved and closed.`
    );


    await initOfficerDashboard();


    showView(
        "view-officer-dash"
    );
}


/* =========================================================
   66. REJECT / REOPEN
========================================================= */

async function reopenRepair() {

    const workOrder =
        databaseWorkOrders.find(
            item =>
                item.id ===
                verificationWorkOrderId
        );


    if (!workOrder)
        return;


    const result =
        await transitionWorkOrderById(
            workOrder.id,
            "Reopened"
        );


    if (!result)
        return;


    alert(
        "Repair rejected. Work order reopened for contractor."
    );


    await initOfficerDashboard();


    showView(
        "view-officer-dash"
    );
}


/* =========================================================
   67. UTILITIES
========================================================= */

function generateComplaintId() {

    const random =
        Math.floor(
            100000 +
            Math.random() *
            900000
        );


    return `CR-${random}`;
}


function formatCoordinate(
    value
) {

    const number =
        Number(value);


    return Number.isFinite(number)
        ? number.toFixed(6)
        : "Not provided";
}


function getRoleName(
    role
) {

    const names = {

        citizen:
            "Citizen",

        officer:
            "Municipal Officer",

        contractor:
            "Contractor"
    };


    return (
        names[role] ||
        role
    );
}


function escapeHTML(
    value
) {

    return String(
        value ?? ""
    )
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#039;"
        );
}


/* =========================================================
   68. INITIALIZATION
========================================================= */

window.addEventListener(
    "load",
    async () => {

        await testSupabaseConnection();

        await restoreSession();

        console.log(
            "Smart City application loaded."
        );
    }
);