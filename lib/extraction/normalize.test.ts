import { describe, expect, it } from "vitest";

import type { NotificacaoExtraidaRaw } from "@/lib/schemas/extraction-raw";
import {
  normalizarData,
  normalizarHora,
  normalizarPlaca,
  normalizeExtraction,
} from "./normalize";

describe("normalizarData", () => {
  it("aceita ISO já normalizado pelo modelo", () => {
    expect(normalizarData("2026-03-14")).toBe("2026-03-14");
  });

  it("converte o formato brasileiro tratando o dia primeiro", () => {
    expect(normalizarData("14/03/2026")).toBe("2026-03-14");
    // 03/04 é 3 de abril no Brasil, não 4 de março.
    expect(normalizarData("03/04/2026")).toBe("2026-04-03");
  });

  it("aceita separadores alternativos e ano de dois dígitos", () => {
    expect(normalizarData("14-03-2026")).toBe("2026-03-14");
    expect(normalizarData("14.03.2026")).toBe("2026-03-14");
    expect(normalizarData("14/03/26")).toBe("2026-03-14");
  });

  it("rejeita datas que não existem no calendário", () => {
    expect(normalizarData("31/02/2026")).toBeNull();
    expect(normalizarData("2026-02-31")).toBeNull();
    expect(normalizarData("00/01/2026")).toBeNull();
  });

  it("rejeita lixo em vez de adivinhar", () => {
    expect(normalizarData("expedida em ___")).toBeNull();
    expect(normalizarData("")).toBeNull();
    expect(normalizarData(null)).toBeNull();
  });
});

describe("normalizarHora", () => {
  it("normaliza as grafias comuns em notificações", () => {
    expect(normalizarHora("14:35")).toBe("14:35");
    expect(normalizarHora("14h35")).toBe("14:35");
    expect(normalizarHora("14:35:00")).toBe("14:35");
    expect(normalizarHora("1435")).toBe("14:35");
    expect(normalizarHora("8:05")).toBe("08:05");
  });

  it("rejeita horas impossíveis", () => {
    expect(normalizarHora("25:00")).toBeNull();
    expect(normalizarHora("14:75")).toBeNull();
  });
});

describe("normalizarPlaca", () => {
  it("normaliza sem tentar consertar caracteres", () => {
    expect(normalizarPlaca("abc-1234")).toBe("ABC1234");
    expect(normalizarPlaca(" abc 1d34 ")).toBe("ABC1D34");
  });
});

/** Fábrica de resposta crua, para cada teste sobrescrever só o que importa. */
function raw(over: Partial<NotificacaoExtraidaRaw> = {}): NotificacaoExtraidaRaw {
  const texto = { value: null, confidence: 0, source_text: null };
  const numero = { value: null, confidence: 0, source_text: null };
  return {
    document_type: "notificacao_autuacao",
    orgao_autuador: texto,
    numero_ait: texto,
    placa: texto,
    data_infracao: texto,
    hora_infracao: texto,
    local_infracao: texto,
    municipio_uf: texto,
    codigo_enquadramento: texto,
    descricao_infracao: texto,
    data_expedicao_notificacao: texto,
    data_limite_defesa: texto,
    equipamento: texto,
    data_afericao_equipamento: texto,
    velocidade_medida_kmh: numero,
    velocidade_limite_kmh: numero,
    valor_multa_brl: numero,
    overall_confidence: 0.9,
    legibility_issues: [],
    ...over,
  };
}

describe("normalizeExtraction", () => {
  it("um campo inválido não derruba os outros — a razão de existirem dois schemas", () => {
    const { data, issues } = normalizeExtraction(
      raw({
        placa: { value: "ABC-12", confidence: 0.9, source_text: "ABC-12" },
        data_expedicao_notificacao: {
          value: "10/04/2026",
          confidence: 0.95,
          source_text: "Expedida em 10/04/2026",
        },
        orgao_autuador: { value: "  DETRAN-SP ", confidence: 0.99, source_text: "DETRAN/SP" },
      }),
    );

    // A placa quebrada é rebaixada...
    expect(data.placa.value).toBeNull();
    expect(data.placa.confidence).toBe(0);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.field).toBe("placa");
    expect(issues[0]?.raw_value).toBe("ABC-12");

    // ...e os demais campos seguem intactos.
    expect(data.data_expedicao_notificacao.value).toBe("2026-04-10");
    expect(data.orgao_autuador.value).toBe("DETRAN-SP");
  });

  it("preserva o source_text do campo rebaixado para a tela de conferência", () => {
    const { data } = normalizeExtraction(
      raw({ data_infracao: { value: "31/02/2026", confidence: 0.8, source_text: "31/02/2026" } }),
    );
    expect(data.data_infracao.value).toBeNull();
    expect(data.data_infracao.source_text).toBe("31/02/2026");
  });

  it("distingue ausência confiante de ilegibilidade (regra 7 do prompt)", () => {
    const { data, issues } = normalizeExtraction(
      raw({ velocidade_medida_kmh: { value: null, confidence: 1, source_text: null } }),
    );
    expect(data.velocidade_medida_kmh.value).toBeNull();
    expect(data.velocidade_medida_kmh.confidence).toBe(1);
    expect(issues).toHaveLength(0);
  });

  it("zera todos os campos quando o documento não é uma notificação", () => {
    const { data } = normalizeExtraction(
      raw({
        document_type: "outro",
        placa: { value: "ABC1D34", confidence: 0.9, source_text: "ABC1D34" },
        legibility_issues: ["parece um CRLV"],
      }),
    );
    expect(data.placa.value).toBeNull();
    expect(data.orgao_autuador.value).toBeNull();
    expect(data.legibility_issues).toEqual(["parece um CRLV"]);
  });

  it("limita a confiança ao intervalo válido", () => {
    const { data } = normalizeExtraction(
      raw({
        overall_confidence: 1.4,
        numero_ait: { value: "AB123456", confidence: -0.2, source_text: null },
      }),
    );
    expect(data.overall_confidence).toBe(1);
    expect(data.numero_ait.confidence).toBe(0);
  });

  it("rejeita números negativos", () => {
    const { data, issues } = normalizeExtraction(
      raw({ valor_multa_brl: { value: -195.23, confidence: 0.9, source_text: "R$ 195,23" } }),
    );
    expect(data.valor_multa_brl.value).toBeNull();
    expect(issues.some((i) => i.field === "valor_multa_brl")).toBe(true);
  });
});
