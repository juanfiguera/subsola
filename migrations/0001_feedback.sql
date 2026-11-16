-- Feedback from the site's form. `visitor` is a salted hash of the sender's IP, kept only to
-- limit how much one sender can post; the IP itself is never stored.
CREATE TABLE feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  visitor TEXT NOT NULL,
  message TEXT NOT NULL,
  email TEXT,
  page TEXT,
  country TEXT
);
CREATE INDEX feedback_visitor_time ON feedback (visitor, created_at);
