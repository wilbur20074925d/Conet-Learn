-- Fix user_id type mismatch in document_history table
-- The issue was that document_history.user_id was integer type
-- while users.id and other tables use numeric type
-- This caused problems with long user IDs (like 3027865)

-- Fix the type mismatch
ALTER TABLE document_history ALTER COLUMN user_id TYPE numeric;

-- Verify the fix
-- SELECT column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_name = 'document_history' AND column_name = 'user_id';
