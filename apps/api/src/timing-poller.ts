import axios from 'axios';
import * as cheerio from 'cheerio';

// Configurable constants
const RACE_URL = 'https://nextleveltiming.com/communities/piedmont-micro-rc-racing-club/races/171034';
const RACER_NAME = 'MS Evo2 5600kv';
const POLL_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes
const SNOOZE_THRESHOLD_MS = 90 * 60 * 1000; // 90 minutes

let lastLapTimestamp: number | null = null;
let snoozed = false;

async function fetchRaceData() {
  const { data: html } = await axios.get(RACE_URL);
  const $ = cheerio.load(html);
  // Find the section for the racer
  const racerSection = $("body").text();
  const regex = new RegExp(`${RACER_NAME}[^\n]*?(\d+)\\s+(\\d{1,2}:\\d{2}\\.\\d{3})`, 'g');
  let match;
  const laps: { lap: number, time: string }[] = [];
  while ((match = regex.exec(racerSection)) !== null) {
    laps.push({ lap: parseInt(match[1], 10), time: match[2] });
  }
  return laps;
}

async function pollRaceData() {
  if (snoozed) return;
  try {
    const laps = await fetchRaceData();
    if (laps.length === 0) return;
    const latestLap = laps[laps.length - 1];
    const now = Date.now();
    // For demo, use current time as lap timestamp
    if (!lastLapTimestamp || now - lastLapTimestamp < SNOOZE_THRESHOLD_MS) {
      // Store or process laps here (deduplicate by lap number)
      lastLapTimestamp = now;
      console.log('Fetched laps:', laps);
    } else {
      snoozed = true;
      console.log('No activity for 90 minutes, snoozing.');
    }
  } catch (err) {
    console.error('Error fetching race data:', err);
  }
}

export function startRacePolling() {
  snoozed = false;
  setInterval(pollRaceData, POLL_INTERVAL_MS);
}

export function triggerRacePolling() {
  snoozed = false;
  pollRaceData();
}
