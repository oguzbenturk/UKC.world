CREATE TABLE student_recommendations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  instructor_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_type       VARCHAR(32) NOT NULL
                  CHECK (item_type IN ('product','service','rental','accommodation','custom')),
  item_id         UUID,
  item_name       VARCHAR(256) NOT NULL,
  item_description TEXT,
  item_price      NUMERIC(10,2),
  currency        VARCHAR(8) NOT NULL DEFAULT 'EUR',
  notes           TEXT,
  status          VARCHAR(32) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','viewed')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_student_recs_student    ON student_recommendations(student_id);
CREATE INDEX idx_student_recs_instructor ON student_recommendations(instructor_id);
