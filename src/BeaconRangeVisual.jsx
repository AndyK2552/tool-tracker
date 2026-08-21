import { useEffect, useRef, useState } from 'react';
import { colors } from './theme';

const VIEW_W = 320;
const VIEW_H = 220;
const ANTENNA_X = VIEW_W / 2;
const ANTENNA_Y = 12;
const MAX_RADIUS = 195;

// Distance from the antenna is inversely related to % (0% = -90 dBm = the
// loosest threshold = detects from farthest away = the biggest ring; 100% =
// -30 dBm = strictest = must be right on top of the antenna = radius 0).
const pctToRadius = (pct) => MAX_RADIUS * (1 - pct / 100);
const radiusToPct = (radius) => {
  const clamped = Math.max(0, Math.min(MAX_RADIUS, radius));
  return Math.round(100 * (1 - clamped / MAX_RADIUS));
};

// Interactive radar-style picker for Warning Beep Distance and Threshold
// Distance, replacing two plain sliders. The antenna sits at the top; drag
// the red ring (Threshold, closer to the antenna -- the continuous-tone
// point) or the yellow ring (Warning, farther out -- where chirping
// starts). Threshold can never be dragged outside Warning or vice versa --
// onThresholdChange/onWarningChange already enforce that.
function BeaconRangeVisual({ warningPct, thresholdPct, warningRssi, thresholdRssi, onWarningChange, onThresholdChange }) {
  const svgRef = useRef(null);
  const [dragging, setDragging] = useState(null); // 'warning' | 'threshold' | null

  const warningRadius = pctToRadius(warningPct);
  const thresholdRadius = pctToRadius(thresholdPct);

  useEffect(() => {
    if (!dragging) return;

    const handleMove = (e) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const scale = rect.height / VIEW_H;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const radius = (clientY - rect.top) / scale - ANTENNA_Y;
      const pct = radiusToPct(radius);
      if (dragging === 'warning') onWarningChange(pct);
      else onThresholdChange(pct);
    };

    const handleUp = () => setDragging(null);

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [dragging, onWarningChange, onThresholdChange]);

  const handleProps = (which) => ({
    onPointerDown: (e) => {
      e.preventDefault();
      setDragging(which);
    },
    style: { cursor: 'grab', touchAction: 'none' },
  });

  return (
    <div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        style={{ width: '100%', height: 'auto', display: 'block', touchAction: 'none' }}
      >
        <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill={colors.navyLight} rx="8" />

        {/* Warning zone -- everything out to warningRadius */}
        <circle cx={ANTENNA_X} cy={ANTENNA_Y} r={warningRadius} fill="#F5D76E" fillOpacity="0.35" stroke="#F5D76E" strokeOpacity="0.7" strokeDasharray="4 3" />

        {/* Threshold zone drawn on top -- covers the inner region in red, leaving the yellow ring visible between the two */}
        <circle cx={ANTENNA_X} cy={ANTENNA_Y} r={thresholdRadius} fill="#ff8080" fillOpacity="0.55" stroke="#ff8080" strokeOpacity="0.85" />

        <text x={ANTENNA_X} y={ANTENNA_Y + 8} fontSize="22" textAnchor="middle">📡</text>

        <g transform={`translate(${ANTENNA_X}, ${ANTENNA_Y + warningRadius})`} {...handleProps('warning')}>
          <circle r="10" fill={colors.navy} stroke="#F5D76E" strokeWidth="3" />
        </g>

        <g transform={`translate(${ANTENNA_X}, ${ANTENNA_Y + thresholdRadius})`} {...handleProps('threshold')}>
          <circle r="10" fill={colors.navy} stroke="#ff8080" strokeWidth="3" />
        </g>
      </svg>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: colors.textMuted, marginTop: '0.5rem' }}>
        <span>🔴 Threshold: {thresholdPct}% ({thresholdRssi} dBm)</span>
        <span>🟡 Warning: {warningPct}% ({warningRssi} dBm)</span>
      </div>
    </div>
  );
}

export default BeaconRangeVisual;
