-- ══════════════════════════════════════════════════════════════════
-- KANBAN — CoisaPet
-- Tabelas: tasks, task_comments, task_attachments
-- ══════════════════════════════════════════════════════════════════

-- Tabela principal de tarefas
CREATE TABLE IF NOT EXISTS tasks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL,
  description  TEXT,
  status       TEXT NOT NULL DEFAULT 'todo'
                 CHECK (status IN ('todo','doing','done')),
  priority     TEXT NOT NULL DEFAULT 'media'
                 CHECK (priority IN ('baixa','media','alta','urgente')),
  due_date     DATE,
  created_by   UUID REFERENCES system_users(id) ON DELETE SET NULL,
  assigned_to  UUID REFERENCES system_users(id) ON DELETE SET NULL,
  position     INTEGER NOT NULL DEFAULT 0,
  color        TEXT DEFAULT NULL,  -- tag de cor opcional
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Comentários nas tarefas
CREATE TABLE IF NOT EXISTS task_comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_id  UUID REFERENCES system_users(id) ON DELETE SET NULL,
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Anexos nas tarefas
CREATE TABLE IF NOT EXISTS task_attachments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES system_users(id) ON DELETE SET NULL,
  file_name   TEXT NOT NULL,
  file_url    TEXT NOT NULL,
  file_size   BIGINT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_tasks_status   ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_position ON tasks(status, position);
CREATE INDEX IF NOT EXISTS idx_comments_task  ON task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_attach_task    ON task_attachments(task_id);

-- Trigger: atualiza updated_at automaticamente
CREATE OR REPLACE FUNCTION update_task_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_task_updated ON tasks;
CREATE TRIGGER trg_task_updated
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_task_timestamp();

-- RLS
ALTER TABLE tasks            ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_comments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tasks_all"       ON tasks;
DROP POLICY IF EXISTS "comments_all"    ON task_comments;
DROP POLICY IF EXISTS "attachments_all" ON task_attachments;

CREATE POLICY "tasks_all"       ON tasks            FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "comments_all"    ON task_comments    FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "attachments_all" ON task_attachments FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Storage bucket para anexos de tarefas
INSERT INTO storage.buckets (id, name, public)
VALUES ('task-files', 'task-files', false)
ON CONFLICT (id) DO NOTHING;
