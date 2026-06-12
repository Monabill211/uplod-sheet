-- ===================================================
--  schema.sql
--  شغّل الكود ده في Supabase → SQL Editor
-- ===================================================

-- 1) جدول الشركات
CREATE TABLE IF NOT EXISTS companies (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2) جدول الملفات المرفوعة
CREATE TABLE IF NOT EXISTS uploads (
  id         BIGSERIAL PRIMARY KEY,
  company_id BIGINT REFERENCES companies(id) ON DELETE CASCADE,
  file_name  TEXT NOT NULL,
  row_count  INT DEFAULT 0,
  columns    TEXT[],  -- أسماء الأعمدة
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3) جدول صفوف الداتا (كل صف من الاكسل)
CREATE TABLE IF NOT EXISTS upload_rows (
  id         BIGSERIAL PRIMARY KEY,
  upload_id  BIGINT REFERENCES uploads(id) ON DELETE CASCADE,
  company_id BIGINT REFERENCES companies(id) ON DELETE CASCADE,
  row_index  INT,
  row_data   JSONB NOT NULL,  -- كل بيانات الصف
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes (عشان البحث يبقى سريع) ──────────────
CREATE INDEX IF NOT EXISTS idx_uploads_company   ON uploads(company_id);
CREATE INDEX IF NOT EXISTS idx_rows_upload       ON upload_rows(upload_id);
CREATE INDEX IF NOT EXISTS idx_rows_company      ON upload_rows(company_id);

-- ── RLS (اختياري - شغّله لو محتاج أمان) ─────────
-- ALTER TABLE companies   ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE uploads     ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE upload_rows ENABLE ROW LEVEL SECURITY;

-- ── View مفيد: اطلع كل الشركات مع عدد ملفاتهم ──
CREATE OR REPLACE VIEW companies_summary AS
SELECT
  c.id,
  c.name,
  c.created_at,
  COUNT(DISTINCT u.id)  AS upload_count,
  SUM(u.row_count)      AS total_rows
FROM companies c
LEFT JOIN uploads u ON u.company_id = c.id
GROUP BY c.id, c.name, c.created_at
ORDER BY c.created_at DESC;