import { supabase } from './supabaseClient';

// Formats a tech's display name as "Name (Truck N)". Used at render time
// only — never write this composed string into tools.checked_out_by or
// tool_history.tech_name, since those are matched against the raw
// profiles.name for checkout ownership and RLS.
export const formatTechName = (name, truckNumber) => {
  if (!name) return name;
  return truckNumber ? `${name} (Truck ${truckNumber})` : name;
};

// Builds a { [profileName]: truckNumber } lookup so screens that only have
// a bare name string (e.g. tools.checked_out_by) can still show the truck
// number without changing what's stored.
export const fetchTruckNumberByName = async () => {
  const { data } = await supabase.from('profiles').select('name, truck_number');
  const map = {};
  (data || []).forEach((p) => {
    map[p.name] = p.truck_number;
  });
  return map;
};
