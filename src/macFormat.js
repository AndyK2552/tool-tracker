// Strips any separators and re-inserts colons every 2 hex digits, so a raw
// QR-code string (or a pasted MAC with dashes/spaces/no separators) becomes
// the AA:BB:CC:DD:EE:FF form the app and firmware both expect.
export const formatMacInput = (raw) => {
  const hex = raw.replace(/[^0-9a-fA-F]/g, '').toUpperCase().slice(0, 12);
  return hex.match(/.{1,2}/g)?.join(':') || hex;
};

export const MAC_PATTERN = /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/;
