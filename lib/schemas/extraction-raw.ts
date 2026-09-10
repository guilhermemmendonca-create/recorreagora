import { z } from "zod";

/**
 * Schema PERMISSIVO — a fronteira com o LLM.
 *
 * Regra de ouro: nada aqui pode falhar por causa de conteúdo. Sem regex, sem
 * range, sem validação de calendário. Se o modelo ler a placa errada ou devolver
 * "31/02/2026", queremos receber o valor e rebaixá-lo campo a campo na
 * normalização — nunca perder os outros 15 campos que vieram certos.
 *
 * Este schema é entregue ao `zodOutputFormat()` (structured outputs), então a
 * própria API garante que a resposta tem esta forma. Ele existe para descrever a
 * FORMA, não para julgar o CONTEÚDO.
 */

const CampoTextoRaw = z.object({
  value: z.string().nullable(),
  confidence: z.number(),
  source_text: z.string().nullable(),
});

const CampoNumeroRaw = z.object({
  value: z.number().nullable(),
  confidence: z.number(),
  source_text: z.string().nullable(),
});

export const NotificacaoExtraidaRaw = z.object({
  document_type: z.enum([
    "notificacao_autuacao",
    "notificacao_penalidade",
    "auto_infracao",
    "outro",
  ]),
  orgao_autuador: CampoTextoRaw,
  numero_ait: CampoTextoRaw,
  placa: CampoTextoRaw,
  data_infracao: CampoTextoRaw,
  hora_infracao: CampoTextoRaw,
  local_infracao: CampoTextoRaw,
  municipio_uf: CampoTextoRaw,
  codigo_enquadramento: CampoTextoRaw,
  descricao_infracao: CampoTextoRaw,
  data_expedicao_notificacao: CampoTextoRaw,
  data_limite_defesa: CampoTextoRaw,
  equipamento: CampoTextoRaw,
  data_afericao_equipamento: CampoTextoRaw,
  velocidade_medida_kmh: CampoNumeroRaw,
  velocidade_limite_kmh: CampoNumeroRaw,
  valor_multa_brl: CampoNumeroRaw,
  overall_confidence: z.number(),
  legibility_issues: z.array(z.string()),
});

export type NotificacaoExtraidaRaw = z.infer<typeof NotificacaoExtraidaRaw>;
