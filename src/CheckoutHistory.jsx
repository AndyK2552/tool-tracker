import { useEffect, useState, useMemo, useRef } from 'react';
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
  const [searchText, setSearchText] = useState('');
  const [activeFilters, setActiveFilters] = useState({});
  const [sortConfig, setSortConfig] = useState({ key: 'timestamp', direction: 'desc' });
  const dropdownRef = useRef(null);

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

  // Close the open filter dropdown if the user clicks anywhere outside it
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpenFilter(null);
        setSearchText('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
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

  const toggleSelectAll = (key, visibleValues) => {
    setActiveFilters((prev) => {
      const current = prev[key] || new Set(uniqueValues(key));
      const allVisibleChecked = visibleValues.every((v) => current.has(v));
      const updated = new Set(current);
      visibleValues.forEach((v) => {
        if (allVisibleChecked) {
          updated.delete(v);
        } else {
          updated.add(v);
        }
      });
      return { ...prev, [key]: updated };
    });
  };

  const isValueChecked = (key, value) => {
    const current = activeFilters[key];
    if (!current) return true;
    return current.has(value);
  };

  const setSort = (key, direction) => {
    setSortConfig({ key, direction });
    setOpenFilter(null);
    setSearchText('');
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
              {COLUMNS.map((col) => {
                const isOpen = openFilter === col.key;
                const allValues = uniqueValues(col.key);
                const visibleValues = allValues.filter((v) =>
                  v.toLowerCase().includes(searchText.toLowerCase())
                );
                const allVisibleChecked = visibleValues.every((v) => isValueChecked(col.key, v));

                return (
                  <th
                    key={col.key}
                    style={{
                      border: '1px solid #ddd',
                      padding: '0.5rem',
                      background: '#f5f5f5',
                      textAlign: 'left',
                      position: 'relative',
                      userSelect: 'none',
                    }}
                  >
                    <div
                      onClick={() => {
                        setOpenFilter(isOpen ? null : col.key);
                        setSearchText('');
                      }}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
                    >
                      <span>
                        {col.label}
                        {sortConfig.key === col.key ? (sortConfig.direction === 'asc' ? ' ▲' : ' ▼') : ''}
                      </span>
                      <span style={{ marginLeft: '0.4rem' }}>▾</span>
                    </div>

                    {isOpen && (
                      <div
                        ref={dropdownRef}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          position: 'absolute',
                          top: '100%',
                          left: 0,
                          background: 'white',
                          border: '1px solid #ccc',
                          boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                          padding: '0.5rem',
                          zIndex: 10,
                          minWidth: '200px',
                          fontWeight: 'normal',
                        }}
                      >
                        <div style={{ marginBottom: '0.4rem' }}>
                          <button
                            onClick={() => setSort(col.key, 'asc')}
                            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.3rem', fontSize: '0.85rem', border: 'none', background: 'none', cursor: 'pointer' }}
                          >
                            ▲ Sort A to Z
                          </button>
                          <button
                            onClick={() => setSort(col.key, 'desc')}
                            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.3rem', fontSize: '0.85rem', border: 'none', background: 'none', cursor: 'pointer' }}
                          >
                            ▼ Sort Z to A
                          </button>
                        </div>

                        <hr style={{ margin: '0.4rem 0' }} />

                        <input
                          type="text"
                          placeholder="Search..."
                          value={searchText}
                          onChange={(e) => setSearchText(e.target.value)}
                          style={{ width: '100%', padding: '0.3rem', marginBottom: '0.4rem', fontSize: '0.85rem', boxSizing: 'border-box' }}
                        />

                        <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
                          <label style={{ display: 'block', fontSize: '0.85rem', padding: '0.15rem 0', fontWeight: 'bold' }}>
                            <input
                              type="checkbox"
                              checked={allVisibleChecked}
                              onChange={() => toggleSelectAll(col.key, visibleValues)}
                              style={{ marginRight: '0.4rem' }}
                            />
                            (Select All)
                          </label>
                          {visibleValues.map((val) => (
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
                      </div>
                    )}
                  </th>
                );
              })}
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