-- Add status column to projects table
-- Values: 'working' (default), 'finished', 'archived'
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'working'
  CHECK (status IN ('working', 'finished', 'archived'));
