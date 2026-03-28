# SetupIQ

**SetupIQ** is a mobile‑first RC car setup intelligence app designed to help racers make smarter setup decisions using structured data, feedback, and track timing.

This project goes beyond simple setup notes. SetupIQ models RC cars as unique mechanical systems, tracks setup changes and measurements in detail, and recommends **explainable setup adjustments** based on real runs and results.

> **Tune with intent.**

---

## Vision

RC racers make dozens of setup changes based on feel, habit, and incomplete notes. SetupIQ exists to bring structure, repeatability, and intelligence to that process.

SetupIQ links together:
- Car‑specific setup data
- Driver feedback
- Track timing (e.g. Next Level Timing)
- Measurements (including Bluetooth scales)

The goal is not automation, but **better decisions**.

---

## Core Principles

These principles define the architecture. They should not be violated.

### 1. Cars Are First‑Class Systems
Each car has:
- Unique geometry
- Unique adjustment methods
- Unique compatibility rules
- Its own UI, generated from its capabilities

There is no “one size fits all” setup screen.

---

### 2. Capabilities First, Parts Second
Cars define **what can be configured**.

Parts (wheels, tires, springs, weights, etc.) must conform to:
- The car’s capabilities
- Explicit compatibility rules

This prevents illegal or impossible setups.

---

### 3. Shared Components With Validation
Some components are shared across cars:
- Tires
- Wheels
- Electronics

Fitment is always validated per car.

---

### 4. Numeric Realism
- Wheel offsets are numeric, signed, and decimal  
  (negative, zero, positive values allowed)
- Geometry uses real discrete or stepped values
- No fake continuous ranges

---

### 5. Mobile‑First
SetupIQ is designed for **trackside use**:
- Fast inputs
- Pick‑lists and toggles
- Minimal typing
- Works offline

---

### 6. Local‑First Data
- All core functionality works without internet
- Cloud sync is a future enhancement

---

### 7. Explainable Recommendations
- No black‑box AI
- All recommendations are rule‑based and traceable
- The user should always understand *why* a suggestion is made

---

## Core Concepts

The app is built around these core entities:

- **CarDefinition**
- **Capability**
  - Geometry
  - Wheel slots
  - Variants
  - Weight zones
  - Measurement support
- **CompatibilityRule**
- **SharedComponent**
  - Tires
  - Wheels
  - Electronics
- **WheelComponent**
  - Front or rear specific
  - Numeric offset (signed decimal)
  - Color and SKU
- **TireMount**
  - Glued or taped
  - Optional edge glue (outside / inside / both)
- **SetupSnapshot**
  - A frozen setup state before a run
- **RunSession**
- **RunSegment**
- **Driver Feedback**
- **Measurements**
  - Corner weights
  - Total weight
  - Weight bias

---

## Supported Cars (Planned Rollout)

Cars are added incrementally to validate scalability.

1. **Kyosho MR‑03 RWD (box stock)**
2. **Atomic MRX Master Edition**
3. **Reflex Racing RX28**

Each car defines its own capabilities and UI.

---

## Development Phases

### Phase 0 — Foundation
**Goal:** Correct architecture before UI polish.

- Define TypeScript models for all core entities
- Implement capability‑driven validation
- Prevent illegal configurations
- No recommendations yet

**Exit Criteria**
- A setup can be fully recreated from stored data
- Invalid setups cannot be saved

---

### Phase 1 — MR‑03 Setup & Run Logging
**Goal:** End‑to‑end workflow for one car.

- MR‑03 capability schema
- Mobile UI generated from capabilities
- Setup creation and editing
- Run logging with driver feedback
- Manual timing entry

**Exit Criteria**
- Setup → Run → Feedback loop works end‑to‑end

---

### Phase 2 — Wheels, Tires & Measurements
**Goal:** Add realism and repeatability.

- Front and rear wheels with numeric offsets
- Tire mounting:
  - Glued or taped
  - Optional edge glue (outside / inside / both)
- Bluetooth scale measurements
- Weight calculations (total, bias, cross)

**Exit Criteria**
- Measurements are linked to setups and runs

---

### Phase 3 — Recommendations (Rules‑Based)
**Goal:** First intelligence layer.

- Simple rule engine
- Explainable recommendations
- Examples:
  - Rear loose → softer rear spring or plate
  - Traction roll → taped fronts or edge glue change

**Exit Criteria**
- App can recommend a next change and explain why

---

### Phase 4 — Multi‑Car Expansion
**Goal:** Prove scalability.

- Add Atomic MRX Master Edition
  - Chassis variants
  - Weight zones
  - Compatibility rules
- Add Reflex RX28
- Verify per‑car UI generation

**Exit Criteria**
- New cars require minimal new code

---

### Phase 5 — Timing Integration & Insights
**Goal:** Correlate performance.

- Timing import or sync (e.g. Next Level Timing)
- Consistency and delta analysis
- Trend‑based insights

**Exit Criteria**
- Recommendations reference timing trends

---

## Non‑Goals (For Now)

- Social features
- Online leaderboards
- Desktop‑first UI
- Complex machine learning models

---

## Tech Direction

- **Frontend:** Mobile‑first (React Native / Expo planned)
- **Language:** TypeScript
- **Data:** Local‑first (SQLite or equivalent)
- **Dev Tooling:** GitHub Copilot is a first‑class contributor

---

## Copilot Guidance

When generating code:
- Prefer explicit types over inference
- Favor composition over inheritance
- Never hardcode car logic
- Generate UI from capabilities
- Always validate compatibility before saving data

Copilot should treat this README as the **source of truth** for architecture and scope.

---

## Status

🚧 Active development — architecture and Phase 0 in progress.

---

**SetupIQ**  
*Tune with intent.*