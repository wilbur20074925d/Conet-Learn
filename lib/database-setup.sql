-- Create user_consent table to store user consent preferences
CREATE TABLE IF NOT EXISTS user_consent (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  consent_given BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_user_consent_user_id ON user_consent(user_id);
CREATE INDEX IF NOT EXISTS idx_user_consent_consent_given ON user_consent(consent_given);

-- Add comment to the table
COMMENT ON TABLE user_consent IS 'Stores user consent preferences for data collection';
COMMENT ON COLUMN user_consent.user_id IS 'Reference to users table';
COMMENT ON COLUMN user_consent.consent_given IS 'Whether user has given consent for data collection';
COMMENT ON COLUMN user_consent.created_at IS 'When the consent record was first created';
COMMENT ON COLUMN user_consent.updated_at IS 'When the consent record was last updated';
