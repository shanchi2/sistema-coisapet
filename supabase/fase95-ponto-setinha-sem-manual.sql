-- fase95 (06/10) — Ponto: horário só MOVIDO pela setinha não vira "manual".
-- admin_mark_manual só liga a flag; o modal "Ajustar Ponto" agora precisa
-- também DESLIGAR quando um campo recebe um horário batido de verdade pelo
-- funcionário (que só trocou de posição). Esta função define a flag explícita.
CREATE OR REPLACE FUNCTION public.admin_set_manual(p_record_id uuid, p_manual boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE time_records
     SET manually_edited = p_manual,
         edited_at = CASE WHEN p_manual THEN NOW() ELSE edited_at END
   WHERE id = p_record_id;
END; $$;

GRANT EXECUTE ON FUNCTION public.admin_set_manual(uuid, boolean) TO anon, authenticated;
