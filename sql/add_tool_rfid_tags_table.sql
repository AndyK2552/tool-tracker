-- Run this once in the Supabase SQL editor. Adds a lookup table mapping
-- RFID tag IDs to tools, replacing the old single beacon_mac column for
-- the RFID system.
--
-- One tool can have any number of tags (2-3 recommended per tool, for
-- read-angle redundancy at the door -- see firmware/README.md), and that
-- count isn't fixed: tags fall off or get lost over a tool's life, so this
-- is an unbounded one-to-many relationship rather than a few fixed
-- columns. tag_id is the table's primary key since a physical tag can
-- only ever belong to one tool.

create table if not exists tool_rfid_tags (
  tag_id text primary key,
  tool_id text not null references tools(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists tool_rfid_tags_tool_id_idx on tool_rfid_tags(tool_id);

alter table tool_rfid_tags enable row level security;

create policy "Authenticated users can view RFID tag assignments"
  on tool_rfid_tags for select
  to authenticated
  using (true);

create policy "Admins can manage RFID tag assignments"
  on tool_rfid_tags for all
  to authenticated
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_admin = true))
  with check (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_admin = true));
