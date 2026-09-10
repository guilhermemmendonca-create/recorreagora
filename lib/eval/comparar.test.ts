import { describe, expect, it } from "vitest";
import { comparar, ehFalhaCritica, textoIgual } from "./comparar";

describe("comparar", () => {
  it("separa ausência segura de valor inventado", () => {
    // Gabarito null = o documento não imprime o campo.
    expect(comparar(null, null)).toBe("OK");
    expect(comparar(null, "2025-09-13")).toBe("INVENTADO");
    // Gabarito com valor, extração vazia: o usuário digita.
    expect(comparar("2025-08-14", null)).toBe("NULO");
  });

  it("aceita qualquer uma das variantes do gabarito", () => {
    expect(comparar(["DETRAN-SP", "DETRAN/SP"], "DETRAN/SP")).toBe("OK");
    expect(comparar(["DETRAN-SP", "DETRAN/SP"], "DETRAN-RJ")).toBe("ERRADO");
  });

  it("compara números por valor exato", () => {
    expect(comparar(195.23, 195.23)).toBe("OK");
    expect(comparar(195.23, 195.2)).toBe("ERRADO");
  });

  it("não confunde tipos", () => {
    expect(comparar(195.23, "195.23")).toBe("ERRADO");
  });
});

describe("textoIgual", () => {
  it("ignora travessão, caixa, espaços e ponto final", () => {
    expect(textoIgual("Av. Brasil, 1500 – Centro", "Av. Brasil, 1500 - Centro")).toBe(true);
    expect(textoIgual("Ultrapassar em local proibido.", "ultrapassar em local proibido")).toBe(true);
    expect(textoIgual("Art. 218, I", "art.  218,  i")).toBe(true);
  });

  it("não ignora diferença de conteúdo", () => {
    expect(textoIgual("Art. 218, I", "Art. 218, II")).toBe(false);
    expect(textoIgual("Salvador/BA", "Salvador/BH")).toBe(false);
  });
});

describe("ehFalhaCritica", () => {
  it("reprova data errada ou inventada", () => {
    expect(ehFalhaCritica("data_expedicao_notificacao", "ERRADO")).toBe(true);
    expect(ehFalhaCritica("data_limite_defesa", "INVENTADO")).toBe(true);
  });

  it("não reprova data ausente — null é o comportamento correto sob dúvida", () => {
    expect(ehFalhaCritica("data_expedicao_notificacao", "NULO")).toBe(false);
  });

  it("não reprova campo não-crítico errado", () => {
    expect(ehFalhaCritica("descricao_infracao", "ERRADO")).toBe(false);
  });
});
