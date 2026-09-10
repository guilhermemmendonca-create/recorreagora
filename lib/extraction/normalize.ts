import {
  CAMPOS_EXTRAIDOS,
  type CampoNome,
  NotificacaoExtraida,
  PLACA_REGEX,
  isDataISO,
} from "@/lib/schemas/notificacao";
import type { NotificacaoExtraidaRaw } from "@/lib/schemas/extraction-raw";

/**
 * Um campo que o modelo devolveu mas que não sobreviveu à normalização.
 * Não é um erro fatal: o campo vira `null` e a tela de conferência pede que o
 * usuário digite, usando `raw_value` como dica.
 */
export type FieldIssue = {
  field: CampoNome;
  reason: string;
  raw_value: string | number | null;
};

const clampConfidence = (c: number): number =>
  Number.isFinite(c) ? Math.min(1, Math.max(0, c)) : 0;

const limparTexto = (s: string | null): string | null => {
  if (s === null) return null;
  const t = s.replace(/\s+/g, " ").trim();
  return t.length === 0 ? null : t;
};

/** Anos de 2 dígitos: 00–69 → 20xx, 70–99 → 19xx. */
const expandirAno = (yy: number): number => (yy < 70 ? 2000 + yy : 1900 + yy);

const MESES_PT: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

/** Remove acentos para casar "março" com a chave "marco". */
const semAcento = (s: string): string =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/**
 * Aceita yyyy-mm-dd (já normalizado pelo modelo) e os formatos brasileiros
 * dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy e dd/mm/yy. Datas que não existem no
 * calendário (31/02) retornam null.
 */
export const normalizarData = (raw: string | null): string | null => {
  const s = limparTexto(raw);
  if (s === null) return null;

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (iso) {
    const candidato = `${iso[1]}-${iso[2]!.padStart(2, "0")}-${iso[3]!.padStart(2, "0")}`;
    return isDataISO(candidato) ? candidato : null;
  }

  // Formato brasileiro: SEMPRE dia primeiro.
  const br = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s);
  if (br) {
    const dia = br[1]!.padStart(2, "0");
    const mes = br[2]!.padStart(2, "0");
    const anoRaw = br[3]!;
    const ano = anoRaw.length === 2 ? String(expandirAno(Number(anoRaw))) : anoRaw;
    const candidato = `${ano}-${mes}-${dia}`;
    return isDataISO(candidato) ? candidato : null;
  }

  // Data por extenso — os rodapés dessas notificações são prosa
  // ("Salvador, 14 de agosto de 2025"), e o modelo pode repassá-la assim.
  const extenso = /(\d{1,2})\s+de\s+([a-zç]+)\s+de\s+(\d{4})/i.exec(semAcento(s));
  if (extenso) {
    const mes = MESES_PT[extenso[2]!];
    if (mes !== undefined) {
      const candidato =
        `${extenso[3]}-${String(mes).padStart(2, "0")}-${extenso[1]!.padStart(2, "0")}`;
      return isDataISO(candidato) ? candidato : null;
    }
  }

  return null;
};

/** "14:35", "14h35", "14h", "1435", "14:35:00" → "14:35". */
export const normalizarHora = (raw: string | null): string | null => {
  const s = limparTexto(raw);
  if (s === null) return null;

  const m = /^(\d{1,2})\s*(?:[:h.]\s*(\d{2}))?(?::\d{2})?\s*$/i.exec(s);
  if (m) {
    const h = Number(m[1]);
    const min = m[2] === undefined ? 0 : Number(m[2]);
    if (h <= 23 && min <= 59) {
      return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
    }
    return null;
  }

  // "1435" sem separador
  const compacto = /^(\d{2})(\d{2})$/.exec(s);
  if (compacto) {
    const h = Number(compacto[1]);
    const min = Number(compacto[2]);
    if (h <= 23 && min <= 59) return `${compacto[1]}:${compacto[2]}`;
  }

  return null;
};

/** Caixa alta, sem hífens/espaços. Não "conserta" letra/dígito — isso seria adivinhar. */
export const normalizarPlaca = (raw: string | null): string | null => {
  const s = limparTexto(raw);
  if (s === null) return null;
  const limpa = s.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return limpa.length === 0 ? null : limpa;
};

type Campo<T> = { value: T | null; confidence: number; source_text: string | null };

/**
 * Aplica uma normalização a um campo. Se o valor não sobrevive, o campo é
 * rebaixado (`value: null`, `confidence: 0`) e a razão vai para `issues` —
 * a extração inteira continua válida.
 */
function normalizarCampo<TIn, TOut>(
  field: CampoNome,
  campo: Campo<TIn>,
  transform: (v: TIn) => TOut | null,
  reason: string,
  issues: FieldIssue[],
): Campo<TOut> {
  const source_text = limparTexto(campo.source_text);
  const confidence = clampConfidence(campo.confidence);

  if (campo.value === null) {
    // Ausência declarada pelo modelo — preserva a confiança (regra 7 do prompt:
    // "confidently absent" não é o mesmo que ilegível).
    return { value: null, confidence, source_text };
  }

  const normalizado = transform(campo.value);
  if (normalizado === null) {
    issues.push({
      field,
      reason,
      raw_value: campo.value as string | number,
    });
    return { value: null, confidence: 0, source_text: source_text ?? String(campo.value) };
  }

  return { value: normalizado, confidence, source_text };
}

const normalizarTexto = (
  field: CampoNome,
  campo: Campo<string>,
  issues: FieldIssue[],
): Campo<string> =>
  normalizarCampo(field, campo, limparTexto, "campo vazio após limpeza", issues);

const normalizarNumeroNaoNegativo = (
  field: CampoNome,
  campo: Campo<number>,
  issues: FieldIssue[],
): Campo<number> =>
  normalizarCampo(
    field,
    campo,
    (v) => (Number.isFinite(v) && v >= 0 ? v : null),
    "número inválido ou negativo",
    issues,
  );

export type NormalizeResult = {
  data: NotificacaoExtraida;
  issues: FieldIssue[];
};

/**
 * Converte a resposta crua do modelo na forma canônica estrita, rebaixando
 * campo a campo o que não passar. O resultado sempre satisfaz
 * `NotificacaoExtraida` por construção.
 */
export function normalizeExtraction(raw: NotificacaoExtraidaRaw): NormalizeResult {
  const issues: FieldIssue[] = [];

  const data: NotificacaoExtraida = {
    document_type: raw.document_type,
    orgao_autuador: normalizarTexto("orgao_autuador", raw.orgao_autuador, issues),
    numero_ait: normalizarTexto("numero_ait", raw.numero_ait, issues),
    placa: normalizarCampo(
      "placa",
      raw.placa,
      (v) => {
        const p = normalizarPlaca(v);
        return p !== null && PLACA_REGEX.test(p) ? p : null;
      },
      "placa não corresponde aos formatos AAA9999 ou AAA9A99",
      issues,
    ),
    data_infracao: normalizarCampo(
      "data_infracao",
      raw.data_infracao,
      normalizarData,
      "data não reconhecida",
      issues,
    ),
    hora_infracao: normalizarCampo(
      "hora_infracao",
      raw.hora_infracao,
      normalizarHora,
      "hora não reconhecida",
      issues,
    ),
    local_infracao: normalizarTexto("local_infracao", raw.local_infracao, issues),
    municipio_uf: normalizarTexto("municipio_uf", raw.municipio_uf, issues),
    codigo_enquadramento: normalizarTexto(
      "codigo_enquadramento",
      raw.codigo_enquadramento,
      issues,
    ),
    descricao_infracao: normalizarTexto("descricao_infracao", raw.descricao_infracao, issues),
    data_expedicao_notificacao: normalizarCampo(
      "data_expedicao_notificacao",
      raw.data_expedicao_notificacao,
      normalizarData,
      "data não reconhecida",
      issues,
    ),
    data_limite_defesa: normalizarCampo(
      "data_limite_defesa",
      raw.data_limite_defesa,
      normalizarData,
      "data não reconhecida",
      issues,
    ),
    equipamento: normalizarTexto("equipamento", raw.equipamento, issues),
    data_afericao_equipamento: normalizarCampo(
      "data_afericao_equipamento",
      raw.data_afericao_equipamento,
      normalizarData,
      "data não reconhecida",
      issues,
    ),
    velocidade_medida_kmh: normalizarNumeroNaoNegativo(
      "velocidade_medida_kmh",
      raw.velocidade_medida_kmh,
      issues,
    ),
    velocidade_limite_kmh: normalizarNumeroNaoNegativo(
      "velocidade_limite_kmh",
      raw.velocidade_limite_kmh,
      issues,
    ),
    valor_multa_brl: normalizarNumeroNaoNegativo(
      "valor_multa_brl",
      raw.valor_multa_brl,
      issues,
    ),
    overall_confidence: clampConfidence(raw.overall_confidence),
    legibility_issues: raw.legibility_issues.map((s) => s.trim()).filter((s) => s.length > 0),
  };

  // `document_type: "outro"` significa que nenhum campo deve ser levado adiante.
  if (data.document_type === "outro") {
    for (const nome of CAMPOS_EXTRAIDOS) {
      data[nome] = { value: null, confidence: 1, source_text: null } as never;
    }
  }

  return { data, issues };
}
