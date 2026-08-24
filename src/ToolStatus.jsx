import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { supabase } from './supabaseClient';
import { getToolStatus, STATUS_DOT_COLORS } from './toolStatus';
import { formatTechName, fetchTruckNumberByName } from './techDisplay';
import { colors } from './theme';
import PageHeader from './PageHeader';
import { BEACON_FEATURE_ENABLED } from './featureFlags';

const formatDuration = (checkedOutAt) => {
  const utcString = checkedOutAt.endsWith('Z') ? checkedOutAt : checkedOutAt + 'Z';
  const start = new Date(utcString);
  const now = new Date();
  const diffMs = now - start;

  const totalMinutes = Math.floor(diffMs / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);

  return parts.join(' ');
};

const STATUS_TABS = ['All', 'Available', 'Checked Out', 'Pending', 'Damaged'];

function ToolStatus({ onHome, onSelectTool, isAdmin, techName }) {
  const [tools, setTools] = useState([]);
  const [truckNumbers, setTruckNumbers] = useState({});
  const [loading, setLoading] = useState(true);
  const [locationFilter, setLocationFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [expandedTechs, setExpandedTechs] = useState({});

  const fetchTools = async () => {
    const { data, error } = await supabase
      .from('tools')
      .select('*')
      .order('name', { ascending: true });

    if (!error && data) {
      setTools(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchTools();
    const interval = setInterval(fetchTools, 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    fetchTruckNumberByName().then(setTruckNumbers);
  }, []);

  const locationFilteredTools = tools.filter((t) => {
    if (locationFilter === 'All') return true;
    if (locationFilter === 'My Tools') return t.checked_out_by === techName;
    return t.location === locationFilter;
  });

  const locationCount = (option) => {
    if (option === 'All') return tools.length;
    if (option === 'My Tools') return tools.filter((t) => t.checked_out_by === techName).length;
    return tools.filter((t) => t.location === option).length;
  };

  const grouped = { Available: [], 'Checked Out': [], Pending: [], Damaged: [] };
  for (const tool of locationFilteredTools) {
    grouped[getToolStatus(tool)].push(tool);
  }
  grouped['Checked Out'].sort((a, b) => new Date(a.checked_out_at) - new Date(b.checked_out_at));
  grouped['All'] = locationFilteredTools;

  const cardStyle = {
    background: colors.navyLight,
    border: `0.5px solid ${colors.navyBorder}`,
    borderRadius: '8px',
    padding: '0.75rem',
    marginBottom: '0.5rem',
    cursor: 'pointer',
  };

  const thumbnailStyle = {
    width: '44px',
    height: '44px',
    borderRadius: '6px',
    objectFit: 'cover',
    flexShrink: 0,
  };

  const thumbnailPlaceholderStyle = {
    ...thumbnailStyle,
    background: colors.navyBorder,
  };

  if (loading) return (
  <div style={{ background: colors.navy, minHeight: '100vh', padding: '1rem' }}>
    <p style={{ color: colors.white }}>Loading tool status...</p>
  </div>
);

  const truckView = locationFilter === 'Truck';
  const visibleTools = grouped[statusFilter];

  const toggleTech = (techKey) => {
    setExpandedTechs((prev) => ({ ...prev, [techKey]: !prev[techKey] }));
  };

  const renderToolCard = (tool, { showTechLine = true } = {}) => {
    const toolStatus = getToolStatus(tool);
    return (
      <div key={tool.id} onClick={() => onSelectTool(tool.id)} style={{ ...cardStyle, display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
        {tool.image_url ? (
          <img src={tool.image_url} alt={tool.name} style={thumbnailStyle} />
        ) : (
          <div style={thumbnailPlaceholderStyle} />
        )}
        <div>
          <span style={{ color: STATUS_DOT_COLORS[toolStatus], marginRight: '0.5rem' }}>●</span>
          <strong style={{ color: colors.white }}>{tool.name}</strong>
          {BEACON_FEATURE_ENABLED && tool.beacon_alarm_active && (
            <span style={{ color: '#ff8080', fontWeight: 'bold', marginLeft: '0.5rem' }}>⚠ Near door</span>
          )}
          <p style={{ fontSize: '0.85rem', color: colors.textMuted, margin: '4px 0 0' }}>
            {tool.id}
            {(statusFilter === 'All' || truckView) && <> — {toolStatus}</>}
            {showTechLine && toolStatus === 'Checked Out' && (
              <>
                <br />
                Checked out by: {formatTechName(tool.checked_out_by, truckNumbers[tool.checked_out_by])}<br />
                Duration: {formatDuration(tool.checked_out_at)}
              </>
            )}
            {showTechLine && toolStatus === 'Pending' && (
              <>
                <br />
                Returned by: {tool.checked_out_by ? formatTechName(tool.checked_out_by, truckNumbers[tool.checked_out_by]) : '—'}
              </>
            )}
            {showTechLine && toolStatus === 'Damaged' && (
              <>
                <br />
                Last held by: {tool.checked_out_by ? formatTechName(tool.checked_out_by, truckNumbers[tool.checked_out_by]) : '—'}
              </>
            )}
          </p>
        </div>
      </div>
    );
  };

  // Truck view groups by tech instead of by status — tools only record a
  // generic "Truck" location, not which specific truck, so the tech
  // currently holding a tool (via checked_out_by) is the only real link to
  // a truck number. Tools with location=Truck but nobody currently holding
  // them (Available/Pending/Damaged) can't be grouped by tech, so they're
  // listed separately as Unassigned.
  const truckTools = tools.filter((t) => t.location === 'Truck');
  const techGroups = {};
  for (const tool of truckTools) {
    if (!tool.is_checked_out) continue;
    const tech = tool.checked_out_by || 'Unassigned';
    if (!techGroups[tech]) techGroups[tech] = [];
    techGroups[tech].push(tool);
  }
  const sortedTechNames = Object.keys(techGroups).sort((a, b) => {
    const na = parseInt(truckNumbers[a], 10);
    const nb = parseInt(truckNumbers[b], 10);
    if (isNaN(na) && isNaN(nb)) return a.localeCompare(b);
    if (isNaN(na)) return 1;
    if (isNaN(nb)) return -1;
    return na - nb;
  });
  const unassignedTruckTools = truckTools.filter((t) => !t.is_checked_out);

  return (
    <div style={{ background: colors.navy, minHeight: '100vh' }}>
      <PageHeader title="KYPD Tool Tracker" />

      <div style={{ padding: '1.25rem', maxWidth: '500px', margin: '0 auto' }}>
        <button
          onClick={onHome}
          style={{ marginBottom: '1rem', padding: '0.5rem 1rem', borderRadius: '6px', border: 'none', background: colors.gold, color: colors.navy, fontWeight: 'bold', cursor: 'pointer' }}
        >
          {isAdmin ? 'Home' : 'Go to Scanner'}
        </button>

        <h1 style={{ color: colors.white, fontSize: '20px' }}>Tool Status</h1>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          {['All', 'Truck', 'Shop', 'My Tools'].map((option) => (
            <button
              key={option}
              onClick={() => setLocationFilter(option)}
              style={{
                padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold',
                border: `0.5px solid ${colors.navyBorder}`,
                background: locationFilter === option ? colors.gold : colors.navyLight,
                color: locationFilter === option ? colors.navy : colors.white,
              }}
            >
              {option} ({locationCount(option)})
            </button>
          ))}
        </div>

        {!truckView && (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            {STATUS_TABS.map((option) => (
              <button
                key={option}
                onClick={() => setStatusFilter(option)}
                style={{
                  padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold',
                  border: `0.5px solid ${colors.navyBorder}`,
                  background: statusFilter === option ? colors.gold : colors.navyLight,
                  color: statusFilter === option ? colors.navy : colors.white,
                }}
              >
                {option} ({grouped[option].length})
              </button>
            ))}
          </div>
        )}

        <div style={{ maxWidth: '450px' }}>
          {truckView ? (
            <>
              {sortedTechNames.length === 0 && unassignedTruckTools.length === 0 && (
                <p style={{ color: colors.textMuted }}>No tools currently on trucks.</p>
              )}
              {sortedTechNames.map((tech) => {
                const techTools = techGroups[tech];
                const isExpanded = !!expandedTechs[tech];
                return (
                  <div key={tech} style={{ marginBottom: '0.5rem' }}>
                    <div
                      onClick={() => toggleTech(tech)}
                      style={{ ...cardStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                    >
                      <strong style={{ color: colors.white }}>
                        {formatTechName(tech, truckNumbers[tech])} ({techTools.length})
                      </strong>
                      <ChevronDown
                        size={18}
                        color={colors.textMuted}
                        style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}
                      />
                    </div>
                    {isExpanded && (
                      <div style={{ paddingLeft: '0.75rem' }}>
                        {techTools.map((tool) => renderToolCard(tool, { showTechLine: false }))}
                      </div>
                    )}
                  </div>
                );
              })}

              {unassignedTruckTools.length > 0 && (
                <>
                  <h2 style={{ color: colors.white, fontSize: '16px', marginTop: '1.5rem' }}>
                    Unassigned ({unassignedTruckTools.length})
                  </h2>
                  {unassignedTruckTools.map((tool) => renderToolCard(tool))}
                </>
              )}
            </>
          ) : (
            <>
              {visibleTools.length === 0 && <p style={{ color: colors.textMuted }}>No tools currently {statusFilter === 'All' ? 'match this filter' : statusFilter.toLowerCase()}.</p>}
              {visibleTools.map((tool) => renderToolCard(tool))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default ToolStatus;
