import { colors } from './theme';

function PageHeader({ title }) {
  return (
    <div
      style={{
        background: colors.navy,
        padding: '1rem 1.25rem',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        color: colors.white,
      }}
    >
      <img src="/KYPD%20Logo.PNG" alt="KYPD" style={{ width: '48px', height: '48px' }} />
      <span style={{ fontSize: '16px', fontWeight: 500 }}>{title}</span>
    </div>
  );
}

export default PageHeader;