import { useEffect, useState, useMemo } from 'react';
import { supabase } from './supabaseClient';

const COLUMNS = [
  { key: 'tool_name', label: 'Tool Name' },
  { key: 'tool_id', label: 'Serial Number' },
  { key: 'action', label: 'Action' },
  { key: 'tech_name', label: 'Tech' },
  { key: 'timestamp', label: 'Timestamp' },
  { key: 'condition_change', label: 'Condition Change' },
];

function CheckoutHistory({ onHome }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openFilter, setOpenFilter] = useState(null);
  const [activeFilters, setActiveFilters] = useState({});
  const [sortConfig, setSortConfig] = useState({ key: 'timestamp', direction: 'desc' });

  useEffect(() => {
    const fetchHistory = async () => {
      const { data, error } = await supabase
        .from('tool_history')
        .select('*')
        .order('timestamp', { ascending: false });

      if (!error && data) {
        setRows(data);
      }
      setLoading(false);
    };

    fetchHistory();
  }, []);

  const uniqueValues = (key) => {
    const values = rows.map((r) => (r[key] === null || r[key] === undefined ? '(blank)' : String(r[key])));
    return [...new Set(values)].sort();
  };

  const toggleFilterValue = (key, value) => {
    setActiveFilters((prev) => {
      const current = prev[key] || new Set(uniqueValues(key));
      const updated = new Set(current);
      if (updated.has(value)) {
        updated.delete(value);
      } else {
        updated.add(value);
      }
      return { ...prev, [key]: updated };
    });
  };

  const isValueChecked = (key, value) => {
    const current = activeFilters[key];
    if (!current) return true; // no filter set yet = everything shown
    return current.has(value);
  };

  const handleSort = (key) => {
    setSortConfig((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

  const filteredAndSortedRows = useMemo(() => {
    let result = rows.filter((row) =>
      COLUMNS.every((col) => {
        const raw = row[col.key];
        const value = raw === null || raw === undefined ? '(blank)' : String(raw);
        return isValueChecked(col.key, value);
      })
    );

    result.sort((a, b) => {
      const aVal = a[sortConfig.key] ?? '';
      const bVal = b[sortConfig.key] ?? '';
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [rows, activeFilters, sortConfig]);

  if (loading) return <p>Loading history...</p>;

  return (
    <div style={{ padding: '1rem' }}>
      <button onClick={onHome} style={{ marginBottom: '1rem' }}>Home</button>
      <h1>Checkout History</h1>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '700px' }}>
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  style={{
                    border: '1px solid #ddd',
                    padding: '0.5rem',
                    background: '#f5f5f5',
                    textAlign: 'left',
                    position: 'relative',
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span onClick={() => handleSort(col.key)}>
                      {col.label}
                      {sortConfig.key === col.key ? (sortConfig.direction === 'asc' ? ' ▲' : ' ▼') : ''}
                    </span>
                    <span
                      onClick={() => setOpenFilter(openFilter === col.key ? null : col.key)}
                      style={{ padding: '0 0.25rem' }}
                    >
                      ▾
                    </span>
                  </div>

                  {openFilter === col.key && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        background: 'white',
                        border: '1px solid #ccc',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                        padding: '0.5rem',
                        zIndex: 10,
                        maxHeight: '200px',
                        overflowY: 'auto',
                        minWidth: '160px',
                        fontWeight: 'normal',
                      }}
                    >
                      {uniqueValues(col.key).map((val) => (
                        <label key={val} style={{ display: 'block', fontSize: '0.85rem', padding: '0.15rem 0' }}>
                          <input
                            type="checkbox"
                            checked={isValueChecked(col.key, val)}
                            onChange={() => toggleFilterValue(col.key, val)}
                            style={{ marginRight: '0.4rem' }}
                          />
                          {val}
                        </label>
                      ))}
                    </div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredAndSortedRows.map((row) => (
              <tr key={row.id}>
                {COLUMNS.map((col) => (
                  <td key={col.key} style={{ border: '1px solid #ddd', padding: '0.5rem', fontSize: '0.9rem' }}>
                    {row[col.key] ?? '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredAndSortedRows.length === 0 && <p style={{ marginTop: '1rem' }}>No results match the current filters.</p>}
    </div>
  );
}

export default CheckoutHistory;