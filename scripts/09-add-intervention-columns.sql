-- Add intervention columns to groups table
-- These columns will control when NATE sends intervention messages

ALTER TABLE groups 
ADD COLUMN IF NOT EXISTS intervene BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS plan_time TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS monitor_time TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS evaluate_time TIMESTAMP WITH TIME ZONE;

-- Create index for better performance on intervention queries
CREATE INDEX IF NOT EXISTS idx_groups_intervention ON groups(intervene, plan_time, monitor_time, evaluate_time);

-- Add comment to explain the intervention system
COMMENT ON COLUMN groups.intervene IS 'Whether to send intervention messages to this group';
COMMENT ON COLUMN groups.plan_time IS 'Time to send "plan" intervention message';
COMMENT ON COLUMN groups.monitor_time IS 'Time to send "monitor" intervention message';
COMMENT ON COLUMN groups.evaluate_time IS 'Time to send "evaluate" intervention message';
