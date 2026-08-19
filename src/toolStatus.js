// Derives the 4 display statuses from the existing is_checked_out + condition
// columns rather than a separate status column: Available (condition=Ready,
// not checked out), Checked Out (is_checked_out), Pending (returned, awaiting
// admin review), Damaged (admin-confirmed damaged, not checkable out).
export const getToolStatus = (tool) => {
  if (tool.is_checked_out) return 'Checked Out';
  if (tool.condition === 'Pending') return 'Pending';
  if (tool.condition === 'Damaged') return 'Damaged';
  return 'Available';
};

export const STATUS_DOT_COLORS = {
  Available: '#5FCF7A',
  'Checked Out': '#6FA8E0',
  Pending: '#E8B923',
  Damaged: '#E0645A',
};
