// Flags for pausing shelved functionality without deleting the code, so it
// can come back with a one-line change if plans change.

// The shop-beacon-monitor (BLE) system -- Beacon Settings, WiFi Settings,
// per-tool beacon assignment, and the "Near door" badge. Hidden while
// evaluating a UHF RFID replacement; the firmware/SQL/app code behind it is
// untouched, just not linked into the UI.
export const BEACON_FEATURE_ENABLED = false;
