-- Apply once to an existing database. Existing profiles are treated as verified;
-- new resident registrations explicitly start with email_verified_at = NULL.
ALTER TABLE profiles
  ADD COLUMN email_verified_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP AFTER is_active;

CREATE TABLE email_verification_tokens (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  delivered_at TIMESTAMP NULL,
  used_at TIMESTAMP NULL,
  CONSTRAINT fk_email_verification_user FOREIGN KEY(user_id) REFERENCES profiles(id) ON DELETE CASCADE,
  INDEX idx_email_verification_user_created(user_id,created_at),
  INDEX idx_email_verification_expiry(expires_at)
) ENGINE=InnoDB;
