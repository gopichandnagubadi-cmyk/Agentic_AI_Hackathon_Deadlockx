# DeadlockX SmartCity

DeadlockX is an urban infrastructure lifecycle system for reporting, prioritizing, assigning, repairing, and verifying road defects. It connects a citizen-facing web app, a local YOLO pothole detector, Supabase Authentication, PostgreSQL, private image storage, GIS coordinates, and role-based work-order transitions.

## The Problem

Citizens can report a road problem, but a useful municipal workflow needs more than an uploaded photograph. The system must answer:

- Is the image actually a pothole image?
- Where was the problem found?
- How serious is it compared with other defects?
- Which municipal officer should review it?
- Which contractor is responsible for repair?
- Was the repair photographed at the original location?
- Can an officer approve it or send it back for rework?

DeadlockX keeps those steps connected as one traceable lifecycle.

## End-To-End Flow

1. A citizen signs in and opens **Report Problem**.
2. The citizen uploads an image or captures one with the camera.
3. The browser sends the image to the local `/detect` API.
4. YOLO returns pothole bounding boxes and confidence values.
5. Images without a pothole detection are rejected with a request for another image.
6. The citizen provides GPS or manual coordinates, notes, and a defect type.
7. The complaint image is stored privately and the complaint is inserted into PostgreSQL.
8. The `analyze_complaint` database function calculates approximate size, depth, severity, drainage risk, waterlogging risk, duplicate risk, and priority.
9. A municipal officer reviews the complaint and assigns a contractor.
10. The contractor accepts the assignment and starts the repair.
11. The contractor must capture an after-repair image using the camera. Uploading a file is not available for repair evidence.
12. GPS is read after capture. The contractor must be within 20 meters of the original complaint coordinates.
13. Only a valid image and in-range location are submitted for officer verification.
14. The officer either approves and closes the work or rejects it.
15. A rejection resets the existing work order to `Assigned`, preserves the original before image, clears the old after evidence, and requires the contractor to accept, repair, and capture again.

## User Roles

### Citizen

Citizen accounts are used to report defects and track their own complaints.

The citizen can:

- Sign in or create an account.
- Upload or capture a possible pothole image.
- Receive an immediate AI message when the image is unrelated or the detector is unavailable.
- Provide current GPS coordinates or enter latitude and longitude manually.
- Select a defect type and add observations.
- Submit a report only after the AI confirms a pothole and a valid location is available.
- View complaint status, severity, estimated dimensions, risk, duplicate information, and priority.

The citizen cannot assign contractors, change work-order status, approve repairs, or view other citizens' private complaints.

### Municipal Officer

The officer is the municipal review and control role.

The officer can:

- View reported complaints.
- Sort and review complaints by priority and severity.
- View complaint images and GIS details.
- Assign a complaint to a contractor.
- Create or reassign a work order.
- View before and after repair evidence.
- Approve a completed repair and close the work order.
- Reject repair evidence and send the existing work order back to the contractor.

When a work order is rejected, it returns to `Assigned`, so the contractor must follow the complete process again: `Assigned` -> `Accepted` -> `In Progress` -> `Completed Awaiting Verification`.

### Contractor

The contractor sees only work orders assigned to the contractor's authenticated profile.

The contractor can:

- Accept an assigned work order.
- Start repair after acceptance.
- Open the device camera and capture repair evidence.
- Allow GPS access so the system can compare the repair location with the original location.
- Submit evidence only within the configured 20-meter radius.
- See work orders returned by an officer for rework and accept them again.

The contractor cannot upload an existing repair image, approve work, assign another contractor, or close a complaint.

## Login And Role Setup

Supabase Auth manages credentials and sessions. The `handle_new_user` trigger creates a matching row in `public.profiles` after a user is created.

The supported roles are:

- `citizen`
- `officer`
- `contractor`

For a demo, create users through Supabase Authentication, then set privileged roles using the user's Auth UUID:

```sql
update public.profiles
set role = 'officer'
where id = 'AUTH_USER_UUID';

update public.profiles
set role = 'contractor'
where id = 'AUTH_USER_UUID';
```

Log out and log in again after changing a role so the browser receives the updated profile.

## Architecture

### Frontend

`Frontend/index.html`, `Frontend/style.css`, and `Frontend/script.js` form a plain HTML/CSS/JavaScript single-page application. Views are shown according to the authenticated user's role.

The frontend integrates with:

- Supabase Auth and PostgreSQL through the Supabase JavaScript client.
- Browser camera access through `navigator.mediaDevices.getUserMedia`.
- Browser location access through `navigator.geolocation`.
- Leaflet and OpenStreetMap tiles for location maps.
- The local detection API at `http://127.0.0.1:8000/detect`.

### Local AI API

`detect_server.py` runs a small threaded HTTP server. It:

1. Accepts a JSON image data URL at `POST /detect`.
2. Decodes and validates the image.
3. Loads `runs/pothole/weights/best.pt` once and reuses it.
4. Runs YOLO inference with a configured confidence threshold.
5. Returns bounding boxes, confidence, image dimensions, and `is_pothole`.

Example positive response shape:

```json
{
  "available": true,
  "is_pothole": true,
  "image_width": 1280,
  "image_height": 720,
  "detections": [
    {
      "class": "pothole",
      "confidence": 0.81,
      "box_pixels": {
        "xmin": 300,
        "ymin": 240,
        "xmax": 620,
        "ymax": 480
      }
    }
  ]
}
```

For an unrelated image, the API returns `is_pothole: false` and a message asking the user to upload another image. The frontend blocks submission when the API is unavailable or the image is not accepted.

### Database RPCs

The database functions are the authoritative lifecycle boundary. Important functions include:

- `analyze_complaint(...)`: calculates complaint analysis and priority.
- `create_work_order(...)`: creates or resets a work order for an officer assignment.
- `submit_repair_evidence(...)`: validates contractor ownership, evidence state, GPS, and 20-meter proximity before moving work to verification.
- `transition_work_order(...)`: handles accept, start, close, and reject/reopen transitions.

The frontend calls these functions through Supabase RPC. Updating a local SQL file does not update the deployed Supabase database; the SQL must be run in the Supabase SQL Editor.

## Severity And Approximate Measurements

The system does not claim to measure physical dimensions from a normal RGB photograph with surveying accuracy. It produces approximate operational estimates from the detected bounding-box area ratio and detector confidence.

The calculation is deterministic: the same image and inputs produce the same estimate. It is intentionally not random, because random values would make a municipal record impossible to reproduce or audit.

The approximate estimate uses:

- Detected box area divided by image pixel area.
- Highest pothole confidence.
- Selected defect type.
- Optional notes such as `deep` or `dangerous`.

Severity bands are:

| Defect type         | Normal                         | Medium                           | Very Serious                                       |
| ------------------- | ------------------------------ | -------------------------------- | -------------------------------------------------- |
| Pothole             | Size < 1.5 m² and depth < 8 cm | Size 1.5-3.5 m² or depth 8-15 cm | Size >= 3.5 m² or depth >= 15 cm                   |
| Road Crack          | Size < 1.2 m² and depth < 6 cm | Size 1.2-3.0 m² or depth 6-15 cm | Size >= 3.0 m² or depth >= 15 cm                   |
| Surface Degradation | Not the default classification | Medium by type                   | Size >= 4.0 m² or depth >= 15 cm                   |
| Waterlogging        | Not the default classification | Medium by type                   | Size >= 4.0 m², depth >= 15 cm, or high water risk |
| Structural Defect   | Not the default classification | Not the default classification   | Very Serious by type                               |
| Drainage Defect     | Not the default classification | Not the default classification   | Very Serious by type                               |

Water risk, nearby drainage, duplicate complaints, and the severity band contribute to the maintenance priority score.

## Where Images Are Stored

Images are stored in Supabase Storage, not in PostgreSQL table rows as base64 text.

### Citizen Before Images

Citizen evidence is uploaded to the private `road-evidence` bucket using this pattern:

```text
complaints/{citizen-auth-user-id}/{complaint-id}.jpg
```

The `complaints.image_url` column stores this Storage path, not a public URL. When an image must be displayed, the frontend requests a temporary signed URL with a one-hour expiry.

### Contractor After Images

Repair evidence is captured by camera and uploaded to the private `repair-evidence` bucket using this pattern:

```text
repairs/{contractor-auth-user-id}/{work-order-id}-{timestamp}.jpg
```

The `work_orders.evidence_after_url` column and `repair_evidence.after_image_url` column store the Storage path. The contractor's latitude, longitude, and reported GPS accuracy are stored in both the work order repair fields and the `repair_evidence` record.

### Storage Security

Storage policies restrict uploads to authenticated users and require the first path folder to match the correct bucket and the second folder to match the authenticated user's ID. Buckets are private, so application views use signed URLs.

## Location Verification

The citizen's original complaint stores `latitude`, `longitude`, and optional GPS accuracy. When a contractor captures an after image:

1. The browser captures a frame from the live camera stream.
2. The browser requests a fresh high-accuracy GPS position.
3. The browser calculates the distance using the Haversine formula.
4. Distances over 20 meters are rejected with the measured distance shown to the contractor.
5. The Supabase RPC repeats the distance check server-side before changing the status.

The double check matters because browser validation alone can be bypassed. GPS accuracy is recorded for audit context, but the configured acceptance rule is the calculated distance from the original coordinates.

## Work-Order State Machine

```text
Assigned
	 |
	 v
Accepted
	 |
	 v
In Progress
	 |
	 v
Completed Awaiting Verification
	 |                         |
	 | officer approves        | officer rejects
	 v                         v
Closed                    Assigned
															|
															+--> contractor accepts and repeats repair
```

The original before image remains attached during reassignment. The previous after image and repair coordinates are cleared so the next verification represents a new capture.

## Database Tables

- `profiles`: authenticated user's name and role.
- `complaints`: citizen report, original image path, coordinates, defect details, analysis, risk, priority, and status.
- `defects`: analysis record linked to a complaint.
- `drainage_points`: GIS drainage infrastructure.
- `waterlogging_hotspots`: known waterlogging risk areas.
- `road_segments`: optional road infrastructure context.
- `contractors`: contractor metadata.
- `work_orders`: officer-to-contractor assignment and lifecycle state.
- `repair_evidence`: historical repair evidence, captured user, coordinates, and timestamps.
- `duplicate_reports`: possible nearby duplicate relationships.
- `complaint_status_history`: lifecycle audit history.

## Supabase Setup

1. Open the Supabase project SQL Editor.
2. Run the complete [supabase_schema.sql](supabase_schema.sql) file.
3. Confirm the tables, functions, policies, private buckets, and verification queries complete successfully.
4. Create at least one citizen, one officer, and one contractor account.
5. Set officer and contractor roles using the SQL shown above.
6. Log in again after role changes.

If the database already contains older columns or functions, running the current schema is important. It includes compatibility handling for `work_order_id`, required work-order values, the current analysis signature, and the current repair-evidence signature.

## Local Run Instructions

Use Python 3.10 or newer if possible. The tested workspace used Python 3.14 and the packages in `requirements-ml.txt`.

Install dependencies:

```bash
python3 -m pip install -r requirements-ml.txt
```

Train the detector. On Apple Silicon, `--device auto` selects MPS when available and otherwise uses CPU:

```bash
python3 train_pothole.py train --epochs 40 --imgsz 640 --device auto
```

The trained checkpoint is written to:

```text
runs/pothole/weights/best.pt
```

Start the detection API in one terminal:

```bash
python3 detect_server.py
```

Serve the frontend in a second terminal:

```bash
python3 -m http.server 5173 --directory Frontend
```

Open:

```text
http://127.0.0.1:5173/index.html
```

Do not open the HTML file directly. Camera and geolocation permissions require a local web origin such as `127.0.0.1` or `localhost`.

## Validation And Testing

Syntax checks:

```bash
node --check Frontend/script.js
python3 -m py_compile detect_server.py train_pothole.py
git diff --check
```

Validation metrics are printed by Ultralytics after training. The repository currently contains training and validation images but no independent `pothole_dataset/test/images` split. Therefore:

- `val` metrics can be calculated.
- A trustworthy test score cannot be calculated until an independent test split is added.
- The `test` command intentionally stops with a clear error instead of pretending validation data is test data.

## Evaluator Questions And Answers

### What is the main innovation?

The project connects computer vision with a complete municipal workflow. It does not stop at detecting a pothole; it links evidence, location, risk, assignment, repair capture, proximity verification, and officer approval.

### Why use a local API instead of running the model in the browser?

The local API keeps the Python/Ultralytics model separate from the lightweight browser client. It also makes model loading and inference easier to control and replace. A production deployment could move this service behind an authenticated hosted endpoint.

### How do you reject a random image?

The API returns `is_pothole: false` when there are no detections. The frontend shows a clear message and keeps the submit button disabled. If the detector is unavailable, the report is also blocked instead of silently bypassing AI validation.

### Is the physical size exact?

No. Size and depth are approximate operational estimates derived from image pixels and confidence. Real physical measurement requires calibration, a reference object, depth sensing, or a trained metric-estimation system.

### Why are size and depth not random?

Random values would make the same complaint change between runs and would not be auditable. The system varies values from detected pixel geometry, confidence, defect type, and notes while remaining reproducible.

### How is severity different by defect type?

Potholes and road cracks use size/depth bands. Surface degradation and waterlogging start at Medium because they represent broader or hazardous conditions. Structural and drainage defects are treated as Very Serious by default because their potential infrastructure impact is higher.

### How do you verify that a contractor repaired the same location?

The contractor must capture a fresh image, allow GPS, and pass the 20-meter distance check against the original complaint coordinates. The browser checks it for immediate feedback and the database RPC checks it again before verification.

### Can a contractor submit an old repair photograph?

Not through the application flow. Repair evidence uses the live camera and does not provide a file-upload control. The evidence is also tied to a fresh GPS reading.

### What happens when an officer is not satisfied?

The officer chooses Reject / Reopen. The same work order returns to `Assigned`, the original before image stays attached, and the old after image and repair coordinates are cleared. The same contractor can accept and redo the work.

### Where are access rules enforced?

The frontend hides role-inappropriate views for usability, while PostgreSQL RPCs and Supabase Row Level Security enforce permissions at the data boundary. Officers can manage assignments and verification; contractors can operate only their assigned work orders.

### What happens if the browser denies location access?

Citizen reports can use manual coordinates. Contractor repair submission requires GPS because location is part of the verification rule; the contractor must enable location and capture again.

### What happens if Supabase has an old function definition?

The browser calls the deployed Supabase function, not the local SQL file. Run the current `supabase_schema.sql` in the Supabase SQL Editor, then refresh the app and sign in again.

### What are the current limitations?

- The checked-in dataset has no independent test split.
- Normal RGB images cannot provide exact physical depth.
- Browser GPS accuracy depends on the device and environment.
- The local detection API must be running on the same machine as the browser during this prototype demo.
- Supabase credentials, storage policies, and role configuration must be set correctly before a full multi-role demo.

## Demo Checklist

1. Start the detector API and frontend server.
2. Log in as a citizen and submit a pothole image with coordinates.
3. Log in as an officer and assign the complaint to a contractor.
4. Log in as the contractor, accept the work, and start repair.
5. Capture repair evidence at the original location with GPS enabled.
6. Log in as the officer and approve or reject the evidence.
7. For rejection, confirm the contractor receives the same work order in `Assigned` and must repeat the workflow.
