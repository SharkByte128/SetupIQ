<!--
  AGENT INSTRUCTIONS — READ BEFORE PROCEEDING
  ============================================
  This file is the living development plan for SetupIQ.

  As you implement each phase:
  - Mark completed items with [x] (e.g., "- [x] Task name")
  - Mark in-progress items with [~] (e.g., "- [~] Task name")
  - Mark the phase header COMPLETE when all items are done
  - Do NOT delete completed content — preserve history

  At the END of each phase:
  - Build or update the wiki/docs HTML viewer (see Phase 8)
    so all .md files in /docs are browsable in a static HTML page.
  - Commit the updated docs viewer alongside the phase work.
-->

# SetupIQ – Project Plan

## Product Vision
SetupIQ is a mobile-first RC car setup intelligence app — a structured experiment, measurement, and recommendation system for RC 1:28 scale racing. Not a notes app.

**Tagline: "Tune with intent."**

---

## Core Design Principles (Do Not Violate)

1. **Cars are first-class, unique systems** — Each car has its own geometry, adjustment methods, compatibility rules, and UI. Do NOT assume all cars share the same options.
2. **Capabilities first, parts second** — Cars define what CAN be configured. Parts must obey those constraints.
3. **Shared components with strict compatibility** — Tires, wheels, batteries can be shared; fitment is always validated per car.
4. **Numeric realism** — Wheel offsets are signed decimal. Geometry uses real discrete or stepped values.
5. **Mobile-first UX** — Trackside use, fast inputs, pick-lists, toggles, minimal typing.
6. **Local-first data** — Full offline capability; syncs to LAN server when connected.
7. **Explainable recommendations** — AI suggestions include reasoning. No black-box outputs.

---

## Tech Stack Decisions

| Layer | Choice |
|---|---|
| Platform | Progressive Web App (PWA) |
| Frontend | React + TypeScript (Vite) |
| UI Library | Tailwind CSS + shadcn/ui |
| Local Storage | IndexedDB via Dexie.js |
| Backend | Node.js + Fastify + PostgreSQL |
| ORM | Drizzle ORM |
| Hosting | Docker on Proxmox LAN host |
| Auth | OAuth2 — Google + Microsoft Live |
| AI/Recommendations | Self-hosted Ollama (Proxmox) or OpenAI API |
| Service Worker | Workbox |
| Bluetooth | Web Bluetooth API |

---

## Repo Structure

```
apps/
  web/          ← PWA (React + Vite)
  api/          ← Fastify + Drizzle + PostgreSQL
packages/
  shared/       ← TypeScript models, validation, compatibility rules
docs/           ← This file and all reference documentation
docker-compose.yml
```

---

## Initial Supported Cars (Rollout Order)

1. Kyosho MR-03 RWD (box stock) ← **Phase 2 target**
2. Atomic MRX Master Edition ← **Phase 7 target**
3. Reflex RX28 ← Future (Phase 10+)

---

## Development Phases

---

### Phase 0 — Repository & Infrastructure Setup ✅ COMPLETE

**Goal**: Working skeleton with all tooling configured and shared models defined before any UI work.

- [x] Initialize monorepo: `apps/web`, `apps/api`, `packages/shared`
- [x] Configure Vite + React + TypeScript in `apps/web`
- [x] Configure Tailwind CSS + shadcn/ui
- [x] Configure Fastify + TypeScript + Drizzle ORM + PostgreSQL in `apps/api`
- [x] Create Docker Compose for `api` + `postgres` containers (Proxmox LAN target)
- [x] Add PWA manifest + Service Worker for offline shell caching
- [x] Define shared TypeScript models in `packages/shared`:
  - [x] `CarDefinition`, `Capability`, `CompatibilityRule`
  - [x] `SetupSnapshot`, `RunSession`, `RunSegment`
  - [x] `DriverFeedback`, `Measurement`, `TireMount`, `WheelComponent`
  - [x] `Track`, `UserProfile`

**Exit Criteria**:
- ✅ App shell loads and installs as a PWA
- ✅ Docker Compose brings up API + DB cleanly
- ✅ All shared models compile without errors

**Phase Deliverable**: Build initial `/docs` wiki HTML viewer.

---

### Phase 1 — Auth & Local-First Sync ✅ COMPLETE

**Goal**: Users can log in via Google or Microsoft; app works offline and syncs on LAN reconnect.

- [x] OAuth2 login server-side (Fastify + `@fastify/oauth2`) — Google + Microsoft providers
- [x] Issue JWT sessions in httpOnly cookies
- [x] PWA continues in local-only mode if offline or unauthenticated
- [x] Implement Dexie.js schema matching shared models
- [x] Build sync engine:
  - [x] Dirty-flag queue for local writes
  - [x] Push local changes → server + pull server changes → local on reconnect
  - [x] Conflict resolution: last-write-wins by `updatedAt` timestamp
- [x] Sync status indicator in app shell (synced / pending / offline)

**Exit Criteria**:
- Login works with Google and Microsoft accounts
- App stores and retrieves data offline via IndexedDB
- Data syncs cleanly when LAN connection is restored
- Multi-user: each user sees only their own data

**Phase Deliverable**: Update `/docs` wiki HTML viewer.

---

### Phase 2 — Car Setup (Kyosho MR-03 First) ✅ COMPLETE

**Goal**: Full setup creation, editing, and validation for the MR-03 RWD.

- [x] Define MR-03 RWD `CarDefinition` + `Capability` schema in `packages/shared` (ref: `kyosho-mr03rwd.md`)
- [x] Build capability-driven Setup Editor UI:
  - [x] Car selector drives all form fields from capability schema
  - [x] Pick-lists for spring rates, tire compounds, gear ratios
  - [x] Signed decimal numeric inputs for wheel offsets
  - [x] Toggle groups for damper positions, caster, toe, etc.
- [x] Setup list view: named setups per car, sortable by date
- [x] Setup detail view: full snapshot, edit, clone
- [x] Setup diff view: compare two setups side by side
- [x] CompatibilityRule validation: block saving illegal part combos
- [x] Shared tire/wheel library with glue type and mounting notes (ref: `tires.md`)

**Exit Criteria**:
- A complete MR-03 setup can be created, saved, and fully recreated from stored data
- Invalid configurations (incompatible parts) cannot be saved
- Setup diff shows changes between two snapshots

**Phase Deliverable**: Update `/docs` wiki HTML viewer.

---

### Phase 3 — Run Logging & Driver Feedback ✅ COMPLETE

**Goal**: Full run session logging with per-run driver feedback, mobile-optimized.

- [x] "New Run" flow: select car + active setup → start session
- [x] Run session view: list of segments/heats with timestamps
- [x] Per-run driver feedback form (mobile-optimized):
  - [x] Handling characteristics (understeer / oversteer / traction roll / consistency) — toggles/sliders
  - [x] Free-text notes with large tap targets
  - [x] Optional manual lap time entry
- [x] Mid-session setup change: snapshot current setup, log what changed, continue session
- [x] Session summary: all runs, feedback aggregation, notes

**Exit Criteria**:
- Setup → Run → Feedback loop works end-to-end
- Setup changes within a session are tracked and linked to run segments

**Phase Deliverable**: Update `/docs` wiki HTML viewer.

---

### Phase 4 — Bluetooth Scale Integration (SkyRC SCWS2000) ✅ COMPLETE

**Goal**: Capture corner weights directly from SkyRC SCWS2000 scales into setup/run records.

- [x] Web Bluetooth API integration for SkyRC SCWS2000:
  - [x] Discover device by GATT service UUID
  - [x] Read FL / FR / RL / RR weight characteristics
- [x] Weight measurement screen: live values + capture button
- [x] Calculate: total weight, front/rear bias %, left/right bias %, cross weight %
- [x] Link weight snapshot to setup + run session
- [ ] Weight history chart per setup (deferred to Phase 6 Trends)

**Note**: BLE GATT UUIDs are placeholders pending real device scan. Manual entry fallback included.

**Exit Criteria**:
- Corner weights captured from SkyRC SCWS2000 via Bluetooth
- Weights linked to a setup snapshot and visible in session summary

**Phase Deliverable**: Update `/docs` wiki HTML viewer.

---

### Phase 5 — EasyLap Timing Integration ✅ COMPLETE

**Goal**: Pull live lap times from EasyLap transponder into run sessions.

- [x] Determine EasyLap data output format (serial/USB vs. LAN broadcast)
- [x] If serial/USB: build Node serial-port bridge on Proxmox API host, expose laps via LAN HTTP endpoint
- [x] If LAN: PWA fetches laps via API proxy
- [x] Associate incoming laps to active run session automatically
- [x] Display per-session: best lap, average lap, consistency (std dev), lap chart
- [x] Flag outlier laps (crashed / off-track)
- [x] Fallback: CSV/file import for away tracks without LAN EasyLap access

**Exit Criteria**:
- Lap times flow into the active session during a live run
- Session summary shows best / avg / consistency metrics

**Phase Deliverable**: Update `/docs` wiki HTML viewer.

---

### Phase 6 — AI Setup Recommendations ✅ COMPLETE

**Goal**: AI-powered "What to try next" suggestions generated after each session.

- [x] Deploy Ollama on Proxmox (Llama 3 / Mistral) as Docker container
  - Quick-start alternative: OpenAI API key (migrate to Ollama once stable)
- [x] Build recommendation context builder: serialize setup + run history + driver feedback + lap delta into structured prompt
- [x] Fastify endpoint: receive context → query LLM → return structured suggestions with explanations
- [x] Recommendation UI: surfaced after session, showing next steps with reasoning
- [x] User can accept / reject / defer suggestions
- [x] Track which suggestions were tried and their outcomes
- [x] Seed with rule-based baseline logic so app is useful before LLM is tuned:
  - rear loose → softer rear spring or plate
  - traction roll → taped fronts or edge glue change

**Exit Criteria**:
- Recommendation generated and displayed after every completed run session
- User can accept/reject and outcome is recorded
- Recommendations explicitly reference the setup + timing data that triggered them

**Phase Deliverable**: Update `/docs` wiki HTML viewer.

---

### Phase 7 — Track Profiles & Multi-Car Expansion ✅ COMPLETE

**Goal**: Track management and second car proves that the architecture scales with minimal new code.

- [x] Track management: create/edit track profiles (name, location, surface type, tile type, layout description, notes)
- [x] Associate run sessions to a track
- [x] Track-specific setup notes and tire recommendations
- [x] Pre-load "The Cave" — basement track (12×24 ft, RCP 30 cm tiles, smooth side up)
- [x] Add Atomic MRX Master Edition capability schema (ref: `AtomicMRXME.md`):
  - [x] Chassis variants (plastic / aluminum / brass)
  - [x] Weight zones
  - [x] Compatibility rules
  - [x] PNWC compliance checker
- [x] Verify: MRX ME UI generated from schema with zero changes to `packages/shared` core logic

**Exit Criteria**:
- Multiple tracks can be created and sessions assigned to them
- MRX ME is fully functional with its own capability-driven setup UI
- Adding MRX ME required no changes to `packages/shared` core logic

**Phase Deliverable**: Update `/docs` wiki HTML viewer.

---

### Phase 8 — Wiki / Docs HTML Viewer ✅ COMPLETE

**Goal**: All `/docs` markdown files are browsable as a static HTML site on the LAN.

> **Note**: This viewer is first built at the end of Phase 0 and updated at the end of every subsequent phase.

- [x] Choose and configure static docs renderer (Docsify, MkDocs, or custom Vite-built page)
- [x] Automatically renders all `.md` files in `/docs/`
- [x] Sidebar navigation between files
- [x] Mobile-friendly layout consistent with app design (Tailwind)
- [x] Served from Fastify (static file route) or standalone Docker container
- [x] Accessible at `http://<proxmox-host>/docs` on LAN

**Exit Criteria**:
- All `.md` files in `/docs` render as readable, navigable HTML pages
- Accessible on LAN from phone and desktop

**Phase Deliverable**: Final wiki content is accurate and current.

---

### Phase 9 — Polish & Production Hardening ✅ COMPLETE

**Goal**: Production-ready PWA and hardened server deployment on Proxmox.

- [x] PWA install prompt, splash screen, app icon set (iOS + Android)
- [x] Dark mode (trackside-friendly, high contrast)
- [x] Export: setup → PDF / shareable link; session → CSV
- [x] PNWC compliance checker for each car
- [x] Nginx reverse proxy + HTTPS on LAN (Caddy with LAN-trusted cert)
- [x] Lighthouse PWA audit: installable, offline-capable, ≥ 90 mobile performance score
- [x] Docker Compose production hardening: health checks, restart policies, named volumes

**Exit Criteria**:
- Lighthouse score ≥ 90 on mobile
- App installable from LAN URL on iOS and Android
- All data persists across server restarts

**Phase Deliverable**: Final wiki update — all docs current and accurate.

---

### Phase 10 — Reflex RX28 (Future) ✅ COMPLETE

**Goal**: Add third car to further validate scalability.

- [x] Define RX28 capability schema (damper/spring-focused)
- [x] Validate: RX28 UI generated from schema with zero framework changes

---

## Non-Goals (For Now)

- Social features / online leaderboards
- Public cloud hosting
- Desktop-first UI
- Complex manual ML model training

---

## Coding Guidance for Copilot

- Prefer explicit types over inference
- Favor composition over inheritance
- Avoid hardcoding car logic — generate UI from capability schemas
- Always validate compatibility before saving data
- Local-first: all writes go to IndexedDB first, then sync to server
- Keep shared models in `packages/shared` — never duplicate in `apps/`
- PWA Service Worker must not cache API responses that contain user data
