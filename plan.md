# PROJECT: RescueMesh – Offline-First Emergency Communication & Rescue Coordination System

Act as a senior full-stack developer, Android engineer, UI/UX designer and software architect.

I want you to help me build a functional prototype of a project called **RescueMesh**.

This is an Android-first, offline-first emergency communication and rescue coordination application designed for situations such as floods, earthquakes, cyclones and other disasters where conventional mobile networks and internet connectivity may become unavailable.

Do not build this as an ordinary emergency SOS application. Its core innovation is enabling emergency messages to travel between nearby participating smartphones without requiring every phone to have internet access.

Build a clean, professional, functional and demonstrable prototype suitable for a national-level hackathon.

---

# 1. PROJECT OBJECTIVE

RescueMesh connects three important groups:

1. People in danger who need emergency assistance.
2. Nearby volunteers or community members who can relay emergency messages.
3. Rescue coordinators who receive, prioritise and manage emergency requests.

The application must support two operating conditions:

**ONLINE MODE**
- Users can submit SOS requests directly to the backend.
- Emergency requests are stored in the database.
- Rescue coordinators can view alerts on a dashboard.
- Coordinators can assign volunteers and update rescue status.

**OFFLINE MODE**
- Users can create SOS alerts without internet connectivity.
- Alerts are saved locally on the smartphone.
- Nearby participating devices can exchange and relay messages.
- Messages are stored and forwarded until an internet-connected gateway becomes available.
- The gateway synchronises queued messages with the backend.

Important: Never display an SOS as delivered to the rescue server merely because another phone received it. Delivery states must accurately distinguish local storage, device relay, gateway receipt, server receipt and coordinator acknowledgement.

---

# 2. TECHNOLOGY STACK

Use the following technologies unless a technical limitation requires a justified alternative.

### Android Mobile Application
- React Native
- TypeScript
- React Navigation
- SQLite for offline data storage
- Native Android integration using Kotlin where required for device-to-device communication.
- Location services for GPS coordinates.

### Offline Communication
- Bluetooth Low Energy (BLE).
- Wi-Fi Direct where technically supported.
- Store-and-forward message architecture.
- Unique message identifiers.
- Duplicate message detection.
- Priority-based forwarding queues.

IMPORTANT TECHNICAL REQUIREMENT:

Do not pretend that ordinary React Native networking automatically provides multi-hop mesh communication.

Investigate the actual Android capabilities and library limitations before implementation.

Create a modular communication layer that separates:
- Device discovery.
- Device connection.
- Message transmission.
- Message reception.
- Local persistence.
- Relay decisions.

If full BLE peripheral functionality or Wi-Fi Direct integration requires native Android code, implement the necessary Kotlin bridge or explain the limitation.

If genuine multi-device communication cannot be completed within the prototype timeframe, implement a clearly labelled simulation mode for demonstrating multi-hop forwarding. Never represent simulated communication as real device communication.

### Backend
- Python
- FastAPI
- REST APIs
- PostgreSQL
- SQLAlchemy
- Pydantic validation.

### Rescue Coordination Dashboard
- React
- TypeScript
- Tailwind CSS
- Leaflet / OpenStreetMap for map visualisation.

---

# 3. MOBILE APPLICATION – REQUIRED SCREENS

Build a polished Android application with consistent navigation and a professional emergency-response design.

Use:
- White backgrounds.
- Navy blue and bright blue primary colours.
- Coral red for emergency actions.
- Clear typography.
- Rounded cards.
- Simple icons.
- Accessible buttons and spacing.

Project branding: RescueMesh.

Use a shield-shaped emergency logo incorporating a medical cross and wireless signal motif.

### Screen 1: Splash Screen
- RescueMesh logo.
- Project name.
- Tagline: "When Networks Fail, Communities Become the Network."
- Simple loading animation.

### Screen 2: Onboarding
Explain the application's purpose through three short sections:
- Send emergency SOS alerts.
- Connect through nearby participating smartphones.
- Reach rescue coordinators through available gateways.

Provide a Get Started button.

### Screen 3: Home Dashboard

Display:

- RescueMesh branding.
- Current connection status: ONLINE / OFFLINE.
- Nearby participating device count.
- Mesh connectivity status.
- Large red SEND SOS button.
- Recent SOS alerts.
- Pending message count.
- Latest delivery status.

Include bottom navigation:
- Home
- Alerts
- Map
- Profile

Do not invent a nearby device count. Display real discovery results or clearly marked demo data.

### Screen 4: Create SOS

Create an easy-to-use emergency reporting form.

Fields:
- Emergency category: Medical, Trapped, Fire, Flood, Other.
- Priority: Critical, High, Medium, Low.
- Current GPS location.
- Emergency description.
- Optional number of people affected.
- Timestamp.

Buttons:
- Capture Location.
- Save SOS.
- Send SOS.

Generate a unique Message ID for every SOS.

When offline:
- Save the SOS in SQLite.
- Add it to the pending forwarding queue.
- Show an appropriate offline status.

When online:
- Attempt direct backend submission.

### Screen 5: SOS Confirmation

Display:
- Unique Message ID.
- Emergency category.
- Priority.
- Location.
- Creation timestamp.
- Current delivery status.

Possible messages:
- Saved on this device.
- Relayed to nearby device.
- Waiting for internet gateway.
- Received by rescue server.
- Acknowledged by coordinator.

### Screen 6: Alert History

Display:
- Previously created SOS requests.
- Emergency category.
- Priority.
- Timestamp.
- Message ID.
- Current delivery status.

Allow users to open an alert and inspect its delivery history.

### Screen 7: Mesh Network Status

Show:
- Nearby participating devices.
- Connection status.
- Number of pending messages.
- Last successful relay.
- Current communication mode.
- Gateway availability.

Use a simple network visualisation showing connected devices.

### Screen 8: Map Screen

Display:
- Current device location.
- Available emergency alerts.
- Nearby participating devices where discovery information is available.
- Relevant rescue locations if provided by the backend.

Use OpenStreetMap.

Do not display fabricated device locations.

### Screen 9: Profile and Settings

Include:
- User name.
- Phone number (optional).
- Emergency contact.
- Location permission status.
- Bluetooth permission status.
- Notification preferences.
- Application settings.

---

# 4. OFFLINE COMMUNICATION ENGINE – CORE INNOVATION

This is the most important technical component of RescueMesh.

Implement a store-and-forward communication mechanism.

### Message Structure

Each SOS must contain:

- message_id
- sender_id
- emergency_type
- priority
- latitude
- longitude
- description
- created_at
- expiry_at
- hop_count
- delivery_status
- relay_history

Use a unique UUID for message_id.

### Message Lifecycle

Implement the following workflow:

1. A user creates an SOS.
2. The application saves the SOS locally.
3. The device discovers nearby participating RescueMesh devices.
4. The device exchanges eligible pending messages.
5. The receiving device validates the message.
6. Duplicate messages are rejected.
7. New messages are stored locally.
8. The receiving device can forward the message to another device.
9. The forwarding mechanism considers priority and hop limits.
10. When an internet-connected gateway is available, queued messages are uploaded to the backend.
11. The backend confirms successful receipt.
12. The acknowledgement is synchronised back to originating devices when a communication path becomes available.

### Reliability Rules

Implement:
- Unique Message ID.
- Duplicate suppression.
- Store-before-forward.
- Priority-aware forwarding.
- Controlled retries.
- Maximum hop count.
- Message expiry.
- Delivery acknowledgements.

Prevent infinite forwarding loops.

Do not delete an SOS merely because it was relayed to one nearby phone.

### Delivery Status Model

Maintain these distinct states:

CREATED_LOCAL → RELAYED → GATEWAY_REACHED → SERVER_RECEIVED → COORDINATOR_ACKNOWLEDGED → ASSIGNED → RESOLVED

Include appropriate intermediate and failure states.

Never confuse a successful local device transfer with successful delivery to the backend.

---

# 5. PRIORITY MANAGEMENT

Implement an emergency priority mechanism.

Critical:
Life-threatening medical emergencies and trapped people.

High:
Immediate rescue and evacuation requirements.

Medium:
Food, water and essential supplies.

Low:
General assistance and non-urgent requests.

Higher-priority alerts should receive forwarding preference.

Use message age as an additional factor to avoid indefinitely delaying lower-priority alerts.

Allow the rescue coordinator to review and modify priorities.

---

# 6. BACKEND DEVELOPMENT

Create a FastAPI backend with properly organised modules.

Suggested structure:

backend/
  app/
    main.py
    database.py
    models/
    schemas/
    routers/
      sos.py
      users.py
      volunteers.py
      assignments.py
      acknowledgements.py
    services/
      sos_service.py
      priority_service.py
      deduplication_service.py
    core/
      config.py

### Required API Endpoints

Implement:

POST /api/sos
Create a new SOS request.

GET /api/sos
Retrieve SOS requests.

GET /api/sos/{message_id}
Retrieve a specific SOS.

PATCH /api/sos/{message_id}/status
Update the emergency status.

POST /api/sos/sync
Synchronise queued offline SOS messages.

POST /api/sos/{message_id}/acknowledge
Record coordinator acknowledgement.

POST /api/assignments
Assign a volunteer or rescue team.

GET /api/assignments
Retrieve assignments.

GET /api/dashboard/stats
Retrieve dashboard statistics.

Implement:
- Input validation.
- Error handling.
- Duplicate detection.
- Database persistence.
- Appropriate HTTP response codes.
- API documentation through Swagger.

---

# 7. RESCUE COORDINATION WEB DASHBOARD

Build a separate responsive React web application for rescue coordinators.

### Dashboard Overview

Display:
- Total emergency requests.
- Critical emergencies.
- Pending requests.
- Assigned requests.
- Resolved requests.

### Live Emergency Map

Use OpenStreetMap and Leaflet.

Show SOS requests using colour-coded markers based on priority.

### Emergency Requests Table

Columns:
- Message ID.
- Emergency category.
- Priority.
- Location.
- Timestamp.
- Delivery status.
- Assignment status.

### Emergency Details

When a coordinator selects an SOS, show:
- Full emergency description.
- GPS location.
- Priority.
- Message history.
- Relay history, where available.
- Delivery status.

### Volunteer Assignment

Allow coordinators to:
- View available volunteers.
- Assign a volunteer to an SOS.
- Update assignment status.
- Mark an emergency as resolved.

### Status Management

Support:

RECEIVED → ACKNOWLEDGED → ASSIGNED → IN_PROGRESS → RESOLVED

The dashboard must distinguish communication delivery status from rescue operation status.

---

# 8. DATABASE DESIGN

Create suitable PostgreSQL tables.

Suggested entities:

1. Users
2. Devices
3. SOS_Requests
4. Message_Relay_History
5. Volunteers
6. Rescue_Assignments
7. Delivery_Acknowledgements

Define:
- Primary keys.
- Foreign keys.
- Appropriate indexes.
- Timestamps.
- Relationships.
- Unique constraints for message IDs.

Ensure duplicate SOS messages cannot accidentally create multiple emergency records.

---

# 9. SECURITY AND PRIVACY

Implement reasonable prototype-level security.

Include:
- Input validation.
- Secure API communication using HTTPS in deployment.
- Appropriate authentication for coordinators.
- Role-based access control.
- Protection of sensitive location information.
- Secure local storage where practical.
- Avoid logging unnecessary personal information.

Do not hardcode passwords, API secrets or database credentials.

---

# 10. DEMONSTRATION SCENARIO

The application must support a convincing hackathon demonstration.

Prepare this scenario:

A flood occurs in a village.

Person A has no internet and creates an SOS.

The alert is stored locally.

Person B, who has the RescueMesh application installed, comes within communication range and receives the alert.

Person B stores and forwards the alert.

Person C receives the message and eventually has internet connectivity.

Person C acts as an internet gateway and uploads the queued alert.

The FastAPI backend receives the SOS and stores it in PostgreSQL.

A rescue coordinator sees the emergency on the web dashboard.

The coordinator acknowledges the request and assigns a volunteer.

The originating device receives updated delivery and rescue status when synchronisation becomes possible.

Demonstrate this scenario using real device communication wherever implemented, and clearly label any simulated stages.

---

# 11. DEVELOPMENT STRATEGY

Build this as a realistic hackathon prototype.

Prioritise working functionality over unnecessary complexity.

Follow this order:

PHASE 1:
Create project structure, mobile UI, navigation and database models.

PHASE 2:
Implement SOS creation, local SQLite persistence and alert history.

PHASE 3:
Implement FastAPI backend, PostgreSQL and API integration.

PHASE 4:
Implement online SOS submission and offline-to-online synchronisation.

PHASE 5:
Implement the communication abstraction and Android device-to-device relay.

PHASE 6:
Implement the rescue coordinator dashboard.

PHASE 7:
Implement priority management, delivery tracking and acknowledgements.

PHASE 8:
Test the complete demonstration scenario and fix errors.

If a feature is too complex for the available timeframe, prioritise a working implementation and clearly document the remaining limitation.

---

# 12. IMPORTANT DEVELOPMENT INSTRUCTIONS

1. First inspect the existing project directory before creating or changing files.
2. Do not overwrite existing working code without checking it.
3. Create a clear folder structure for mobile, backend and dashboard.
4. Use reusable components and modular architecture.
5. Write clean, maintainable TypeScript and Python code.
6. Include meaningful comments for complex communication logic.
7. Handle permissions and connectivity changes properly.
8. Make the mobile app responsive to different Android screen sizes.
9. Do not leave buttons that do nothing.
10. Do not use fake backend responses while claiming they are real.
11. Separate demo data from real data.
12. Provide clear setup instructions and environment configuration.
13. Include database migrations or initialisation scripts.
14. Provide a README with installation, execution and testing instructions.
15. Test important API endpoints and core application flows.
16. Explain every important technical decision.

Do not try to generate the entire project in one enormous code dump.

Work incrementally. Complete one phase, verify it, explain what has been implemented, and then proceed to the next phase.

If you encounter a blocker, explain it and propose the simplest technically correct solution instead of silently replacing the intended functionality.

---

# 13. FINAL EXPECTED DELIVERABLE

At the end, I need:

- A working Android RescueMesh application.
- A functioning FastAPI backend.
- PostgreSQL database integration.
- A React rescue coordination dashboard.
- Offline SOS creation and local persistence.
- A demonstrable message relay workflow.
- Online synchronisation.
- Priority-based message processing.
- Accurate delivery status tracking.
- A working end-to-end emergency demonstration.
- Complete project documentation.

The final product should look professional, demonstrate a meaningful technical innovation and be suitable for a hackathon evaluation.

**Start by inspecting the project environment, proposing the folder structure and identifying the most technically challenging components. Then begin Phase 1.**
