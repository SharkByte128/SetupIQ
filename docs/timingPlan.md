# Timing Data Integration Plan

## Objective
Integrate automated polling of Next Level Timing race data for a specific racer and event, storing lap/run data as sessions in the app, with deduplication and snooze logic.

## Steps

1. **Create timing data fetch service**
   - Use Node.js/TypeScript service in `apps/api`.
   - Fetch event page HTML using `axios`.
   - Parse lap/run data for the configured racer using `cheerio` or regex.

2. **Parse and store lap/run data**
   - Extract lap times and run numbers from the HTML.
   - Store new laps in the database, deduplicating by lap number and event ID.
   - Associate each run with the previous setup; use the lap run date as the session date.

3. **Implement 2-minute polling with 90-minute snooze**
   - Poll the event page every 2 minutes.
   - If no new laps are detected for 90 minutes, snooze polling until manually triggered.
   - On trigger, resume polling and data capture.

4. **Integrate trigger and setup association**
   - Expose a trigger endpoint or UI action in the app to resume polling after snooze.
   - Always assume the run uses the previous setup unless changed by the user.

## Notes
- No public API is available; data is scraped from the event web page.
- Service must be robust to HTML changes and handle errors gracefully.
- Only new laps/runs are stored; duplicates are ignored.
- Polling can run for days, snoozing when inactive.
