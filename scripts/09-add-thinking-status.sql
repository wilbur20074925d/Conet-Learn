-- Add thinking status for NATE AI responses
-- This allows NATE to show "I am thinking..." before generating the actual response

-- Add is_thinking column to messages table
ALTER TABLE messages ADD COLUMN is_thinking BOOLEAN DEFAULT FALSE;

-- Create index for better performance when querying thinking messages
CREATE INDEX idx_messages_is_thinking ON messages(is_thinking);

-- Example of how the thinking flow works:
-- 1. User sends message with @NATE
-- 2. System inserts user message
-- 3. System inserts NATE thinking message (is_thinking = true)
-- 4. System calls AI API to get response
-- 5. System updates NATE message with actual response (is_thinking = false)
