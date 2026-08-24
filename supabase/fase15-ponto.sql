-- ================================================================
-- CoisaPet — Fase 15: Ponto (versão corrigida — limpa e recria)
-- ================================================================

-- ── 0. Limpa tabelas anteriores com erro ─────────────────────────
DROP TABLE IF EXISTS public.time_records CASCADE;
DROP FUNCTION IF EXISTS public.get_next_punch_type(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.register_punch(UUID) CASCADE;
DROP VIEW  IF EXISTS public.hours_balance CASCADE;

-- ── 1. Registros de ponto ────────────────────────────────────────
CREATE TABLE public.time_records (
  id           UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id  UUID        NOT NULL REFERENCES public.system_users(id) ON DELETE CASCADE,
  punch_type   TEXT        NOT NULL CHECK (punch_type IN (
                 'entrada','saida_almoco','volta_almoco','saida'
               )),
  recorded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  date         DATE        NOT NULL DEFAULT CURRENT_DATE,
  hours_worked NUMERIC(5,2),
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

GRANT ALL ON public.time_records TO anon;
CREATE INDEX idx_tr_employee ON public.time_records(employee_id);
CREATE INDEX idx_tr_date     ON public.time_records(date DESC);
CREATE INDEX idx_tr_ptype    ON public.time_records(punch_type);

-- ── 2. Solicitações de férias ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vacation_requests (
  id            UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id   UUID        NOT NULL REFERENCES public.system_users(id) ON DELETE CASCADE,
  date_start    DATE        NOT NULL,
  date_end      DATE        NOT NULL,
  days          INTEGER     NOT NULL,
  status        TEXT        NOT NULL DEFAULT 'pendente'
                            CHECK (status IN ('pendente','aprovado','rejeitado')),
  notes         TEXT,
  reviewed_by   UUID        REFERENCES public.system_users(id) ON DELETE SET NULL,
  reviewed_at   TIMESTAMPTZ,
  reject_reason TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
GRANT ALL ON public.vacation_requests TO anon;
CREATE INDEX IF NOT EXISTS idx_vr_employee ON public.vacation_requests(employee_id);

-- ── 3. Atestados médicos ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.medical_certificates (
  id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID        NOT NULL REFERENCES public.system_users(id) ON DELETE CASCADE,
  date        DATE        NOT NULL,
  days_off    INTEGER     NOT NULL DEFAULT 1,
  file_url    TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
GRANT ALL ON public.medical_certificates TO anon;

-- ── 4. Avisos da empresa ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.announcements (
  id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title       TEXT        NOT NULL,
  body        TEXT        NOT NULL,
  priority    TEXT        NOT NULL DEFAULT 'normal'
                          CHECK (priority IN ('normal','importante','urgente')),
  created_by  UUID        REFERENCES public.system_users(id) ON DELETE SET NULL,
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
GRANT ALL ON public.announcements TO anon;

-- ── 5. Holerites ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payslips (
  id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID        NOT NULL REFERENCES public.system_users(id) ON DELETE CASCADE,
  reference   TEXT        NOT NULL,
  month       INTEGER     NOT NULL,
  year        INTEGER     NOT NULL,
  file_url    TEXT        NOT NULL,
  created_by  UUID        REFERENCES public.system_users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
GRANT ALL ON public.payslips TO anon;

-- ── 6. Colunas extras em system_users ───────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name='system_users' AND column_name='work_start')
  THEN ALTER TABLE public.system_users ADD COLUMN work_start TIME DEFAULT '08:00'; END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name='system_users' AND column_name='work_end')
  THEN ALTER TABLE public.system_users ADD COLUMN work_end TIME DEFAULT '17:00'; END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name='system_users' AND column_name='lunch_minutes')
  THEN ALTER TABLE public.system_users ADD COLUMN lunch_minutes INTEGER DEFAULT 60; END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name='system_users' AND column_name='work_days')
  THEN ALTER TABLE public.system_users ADD COLUMN work_days TEXT DEFAULT 'seg,ter,qua,qui,sex'; END IF;
END $$;

-- ── 7. Colunas extras em production_orders (se existir) ──────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='production_orders') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_name='production_orders' AND column_name='import_batch_id')
    THEN ALTER TABLE public.production_orders ADD COLUMN import_batch_id UUID; END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_name='production_orders' AND column_name='source')
    THEN ALTER TABLE public.production_orders ADD COLUMN source TEXT DEFAULT 'manual'; END IF;
  END IF;
END $$;

-- ── 8. Storage bucket ────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('employee-docs','employee-docs',false,20971520,
  ARRAY['application/pdf','image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "anon_employee_docs_select" ON storage.objects;
DROP POLICY IF EXISTS "anon_employee_docs_insert" ON storage.objects;
DROP POLICY IF EXISTS "anon_employee_docs_delete" ON storage.objects;
CREATE POLICY "anon_employee_docs_select" ON storage.objects FOR SELECT TO anon USING (bucket_id='employee-docs');
CREATE POLICY "anon_employee_docs_insert" ON storage.objects FOR INSERT TO anon WITH CHECK (bucket_id='employee-docs');
CREATE POLICY "anon_employee_docs_delete" ON storage.objects FOR DELETE TO anon USING (bucket_id='employee-docs');

-- ── 9. View: banco de horas ──────────────────────────────────────
CREATE VIEW public.hours_balance AS
SELECT
  u.id          AS employee_id,
  u.name        AS employee_name,
  u.work_start,
  u.work_end,
  u.lunch_minutes,
  COALESCE(
    EXTRACT(EPOCH FROM (u.work_end::time - u.work_start::time))/3600
    - COALESCE(u.lunch_minutes,60)::numeric/60,
    8
  ) AS daily_expected_hours,
  COALESCE((
    SELECT SUM(t.hours_worked) FROM public.time_records t
    WHERE t.employee_id = u.id AND t.punch_type = 'saida'
      AND DATE_TRUNC('month',t.date) = DATE_TRUNC('month',CURRENT_DATE)
  ),0) AS hours_worked_month,
  COALESCE((
    SELECT COUNT(DISTINCT t.date) FROM public.time_records t
    WHERE t.employee_id = u.id AND t.punch_type = 'entrada'
      AND DATE_TRUNC('month',t.date) = DATE_TRUNC('month',CURRENT_DATE)
  ),0) AS days_worked_month
FROM public.system_users u
WHERE u.active = true;

GRANT SELECT ON public.hours_balance TO anon;

-- ── 10. Função: próximo tipo de ponto ────────────────────────────
CREATE OR REPLACE FUNCTION public.get_next_punch_type(p_employee_id UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_last TEXT;
BEGIN
  SELECT punch_type INTO v_last
  FROM public.time_records
  WHERE employee_id = p_employee_id AND date = CURRENT_DATE
  ORDER BY recorded_at DESC LIMIT 1;

  IF v_last IS NULL THEN RETURN 'entrada'; END IF;
  RETURN CASE v_last
    WHEN 'entrada'      THEN 'saida_almoco'
    WHEN 'saida_almoco' THEN 'volta_almoco'
    WHEN 'volta_almoco' THEN 'saida'
    WHEN 'saida'        THEN 'entrada'
    ELSE 'entrada'
  END;
END; $$;
GRANT EXECUTE ON FUNCTION public.get_next_punch_type TO anon;

-- ── 11. Função: registrar ponto ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.register_punch(p_employee_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_type         TEXT;
  v_record_id    UUID;
  v_hours        NUMERIC(5,2) := NULL;
  v_entrada_at   TIMESTAMPTZ;
  v_almoco_s     TIMESTAMPTZ;
  v_almoco_e     TIMESTAMPTZ;
BEGIN
  v_type := public.get_next_punch_type(p_employee_id);

  IF v_type = 'saida' THEN
    SELECT recorded_at INTO v_entrada_at FROM public.time_records
    WHERE employee_id=p_employee_id AND date=CURRENT_DATE AND punch_type='entrada'
    ORDER BY recorded_at LIMIT 1;

    SELECT recorded_at INTO v_almoco_s FROM public.time_records
    WHERE employee_id=p_employee_id AND date=CURRENT_DATE AND punch_type='saida_almoco'
    ORDER BY recorded_at LIMIT 1;

    SELECT recorded_at INTO v_almoco_e FROM public.time_records
    WHERE employee_id=p_employee_id AND date=CURRENT_DATE AND punch_type='volta_almoco'
    ORDER BY recorded_at LIMIT 1;

    IF v_entrada_at IS NOT NULL THEN
      v_hours := EXTRACT(EPOCH FROM (NOW()-v_entrada_at))/3600;
      IF v_almoco_s IS NOT NULL AND v_almoco_e IS NOT NULL THEN
        v_hours := v_hours - EXTRACT(EPOCH FROM (v_almoco_e-v_almoco_s))/3600;
      END IF;
      v_hours := ROUND(v_hours::NUMERIC, 2);
    END IF;
  END IF;

  INSERT INTO public.time_records (employee_id, punch_type, hours_worked)
  VALUES (p_employee_id, v_type, v_hours)
  RETURNING id INTO v_record_id;

  RETURN jsonb_build_object(
    'id', v_record_id, 'type', v_type,
    'hours_worked', v_hours, 'recorded_at', NOW()
  );
END; $$;
GRANT EXECUTE ON FUNCTION public.register_punch TO anon;

-- ── 12. Triggers de auditoria ────────────────────────────────────
DROP TRIGGER IF EXISTS audit_time_records         ON public.time_records;
DROP TRIGGER IF EXISTS audit_vacation_requests    ON public.vacation_requests;
DROP TRIGGER IF EXISTS audit_medical_certificates ON public.medical_certificates;
DROP TRIGGER IF EXISTS audit_announcements        ON public.announcements;

CREATE TRIGGER audit_time_records
  AFTER INSERT OR UPDATE OR DELETE ON public.time_records
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();
CREATE TRIGGER audit_vacation_requests
  AFTER INSERT OR UPDATE OR DELETE ON public.vacation_requests
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();
CREATE TRIGGER audit_medical_certificates
  AFTER INSERT OR UPDATE OR DELETE ON public.medical_certificates
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();
CREATE TRIGGER audit_announcements
  AFTER INSERT OR UPDATE OR DELETE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- ── 13. Confirma ─────────────────────────────────────────────────
SELECT table_name, 'OK' AS status
FROM information_schema.tables
WHERE table_schema='public'
  AND table_name IN (
    'time_records','vacation_requests',
    'medical_certificates','announcements','payslips'
  )
ORDER BY table_name;
