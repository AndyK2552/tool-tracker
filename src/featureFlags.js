// Flags for pausing shelved functionality without deleting the code, so it
// can come back with a one-line change if plans change.

// The shop-beacon-monitor (BLE) system -- Beacon Settings, WiFi Settings,
// per-tool beacon assignment, and the "Near door" badge. Hidden while
// evaluating a UHF RFID replacement; the firmware/SQL/app code behind it is
// untouched, just not linked into the UI.
export const BEACON_FEATURE_ENABLED = false;

// The RFID tool-reconciliation page (scan the shop with the Zebra RFD8500
// handheld, compare against Available/Pending tools in the app). Deprioritized
// for now -- built, but going in last, after tag assignment is proven out.
export const RFID_FEATURE_ENABLED = false;

// The RFID tag-assignment page (scan a tool's QR code with the Zebra RFD8500,
// then scan its RFID tags to link them in tool_rfid_tags). Independent of the
// other two flags above -- each RFID-related surface ships on its own.
export const RFID_TAG_ASSIGNMENT_ENABLED = false;
