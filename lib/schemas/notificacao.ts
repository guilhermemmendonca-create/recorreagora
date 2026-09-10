import { z } from "zod";

/**
 * Schema ESTRITO — a forma canônica de uma notificação já normalizada.
 *
 * Este schema NÃO é aplicado diretamente na resposta do LLM. A resposta crua
 * passa por `lib/schemas/extraction-raw.ts` (permissivo) e depois por
 * `lib/extraction/normalize.ts`, que rebaixa para `null` qualquer campo que não
 * satisfaça as regras abaixo. Assim um campo ilegível nunca derruba a extração
 * inteira — vira um campo vazio destacado na tela de conferência.
 */

/** Placa antiga (AAA9999) e Mercosul (AAA9A99), já em caixa alta e sem separadores. */
export const PLACA_REGEX = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/;

/** yyyy-mm-dd que também existe no calendário (rejeita 2026-02-31). */
export const isDataISO = (s: string): boolean => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return (
    d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia
  );
};

export const DataISO = z.string().refine(isDataISO, "data inválida (esperado yyyy-mm-dd)");
export const HoraHHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "hora inválida (esperado HH:mm)");
export const Placa = z.string().regex(PLACA_REGEX, "placa fora dos formatos brasileiros");

export const CampoExtraido = <T extends z.ZodTypeAny>(inner: T) =>
  z.object({
    /** null = ilegível, ausente, ou rebaixado pela normalização. */
    value: inner.nullable(),
    confidence: z.number().min(0).max(1),
    /** Texto bruto lido no documento — alimenta o placeholder da tela de conferência. */
    source_text: z.string().nullable(),
  });

export const DocumentType = z.enum([
  "notificacao_autuacao", // NA — abre prazo de defesa prévia
  "notificacao_penalidade", // NIP — abre prazo de recurso JARI
  "auto_infracao", // AIT lavrado em mãos (abordagem)
  "outro", // CRLV, boleto, documento irrelevante
]);
export type DocumentType = z.infer<typeof DocumentType>;

export const NotificacaoExtraida = z.object({
  document_type: DocumentType,
  orgao_autuador: CampoExtraido(z.string()),
  numero_ait: CampoExtraido(z.string()),
  placa: CampoExtraido(Placa),
  data_infracao: CampoExtraido(DataISO),
  hora_infracao: CampoExtraido(HoraHHMM),
  local_infracao: CampoExtraido(z.string()),
  municipio_uf: CampoExtraido(z.string()),
  codigo_enquadramento: CampoExtraido(z.string()),
  descricao_infracao: CampoExtraido(z.string()),
  /** Campo de maior valor: dirige a tese do prazo de 30 dias (art. 281, §1º, II, CTB). */
  data_expedicao_notificacao: CampoExtraido(DataISO),
  data_limite_defesa: CampoExtraido(DataISO),
  equipamento: CampoExtraido(z.string()),
  data_afericao_equipamento: CampoExtraido(DataISO),
  velocidade_medida_kmh: CampoExtraido(z.number()),
  velocidade_limite_kmh: CampoExtraido(z.number()),
  valor_multa_brl: CampoExtraido(z.number()),
  overall_confidence: z.number().min(0).max(1),
  legibility_issues: z.array(z.string()),
});

export type NotificacaoExtraida = z.infer<typeof NotificacaoExtraida>;

/** Nomes dos campos que são `CampoExtraido` (exclui os metadados do topo). */
export const CAMPOS_EXTRAIDOS = [
  "orgao_autuador",
  "numero_ait",
  "placa",
  "data_infracao",
  "hora_infracao",
  "local_infracao",
  "municipio_uf",
  "codigo_enquadramento",
  "descricao_infracao",
  "data_expedicao_notificacao",
  "data_limite_defesa",
  "equipamento",
  "data_afericao_equipamento",
  "velocidade_medida_kmh",
  "velocidade_limite_kmh",
  "valor_multa_brl",
] as const;

export type CampoNome = (typeof CAMPOS_EXTRAIDOS)[number];

/** Rótulos PT-BR para a tela de conferência. */
export const CAMPO_LABELS: Record<CampoNome, string> = {
  orgao_autuador: "Órgão autuador",
  numero_ait: "Número do AIT",
  placa: "Placa",
  data_infracao: "Data da infração",
  hora_infracao: "Hora da infração",
  local_infracao: "Local da infração",
  municipio_uf: "Município / UF",
  codigo_enquadramento: "Código de enquadramento",
  descricao_infracao: "Descrição da infração",
  data_expedicao_notificacao: "Data de expedição da notificação",
  data_limite_defesa: "Data limite para defesa",
  equipamento: "Equipamento (radar)",
  data_afericao_equipamento: "Data de aferição do equipamento",
  velocidade_medida_kmh: "Velocidade medida (km/h)",
  velocidade_limite_kmh: "Velocidade permitida (km/h)",
  valor_multa_brl: "Valor da multa (R$)",
};
