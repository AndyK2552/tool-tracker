export const colors = {
  navy: '#0C2A4A',
  navyLight: 'rgba(255,255,255,0.08)',
  navyBorder: 'rgba(255,255,255,0.15)',
  gold: '#D4A017',
  goldBright: '#E8B923',
  blueAccent: '#6FA8E0',
  white: '#ffffff',
  textMuted: '#9FC1E0',
};
export const colors = {
  navy: '#0C2A4A',
  navyLight: 'rgba(255,255,255,0.08)',
  navyBorder: 'rgba(255,255,255,0.15)',
  gold: '#D4A017',
  goldBright: '#E8B923',
  blueAccent: '#6FA8E0',
  white: '#ffffff',
  textMuted: '#9FC1E0',
};

export const btnStyle = {
  padding: '0.6rem 1rem',
  borderRadius: '6px',
  border: 'none',
  background: colors.gold,
  color: colors.navy,
  fontWeight: 'bold',
  cursor: 'pointer',
};

export const secondaryBtnStyle = {
  ...btnStyle,
  background: colors.navyLight,
  color: colors.white,
  border: `0.5px solid ${colors.navyBorder}`,
};