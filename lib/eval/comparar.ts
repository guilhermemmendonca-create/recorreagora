/**
 * Comparação de um campo extraído contra o gabarito.
 *
 * Fica fora de `scripts/` porque é esta lógica que decide se uma rodada passa
 * no critério de aceite 3 — um falso "OK" aqui esconderia exatamente o erro
 * que o critério existe para pegar. Por isso tem teste.
 */

export type Veredito =
  /** Bate com o gabarito. */
  | "OK"
  /** Gabarito tem valor, veio null: o usuário digita. Ruim, mas seguro. */
  | "NULO"
  /** Veio valor diferente do gabarito. Perigoso. */
  | "ERRADO"
  /** Gabarito é null (não impresso no papel), veio valor. O pior caso. */
  | "INVENTADO";

/** Um valor errado nestes campos vira um prazo legal errado para o usuário. */
export const CAMPOS_CRITICOS = new Set([
  "data_infracao",
  "data_expedicao_notificacao",
  "data_limite_defesa",
  "data_afericao_equipamento",
]);

/** Tolera variação tipográfica que não muda o significado (travessão, caixa, ponto final). */
export const textoIgual = (a: string, b: string): boolean => {
  const n = (s: string) =>
    s
      .normalize("NFC")
      .replace(/[–—]/g, "-")
      .replace(/\s+/g, " ")
      .replace(/[.,;]+$/, "")
      .trim()
      .toLowerCase();
  return n(a) === n(b);
};

/**
 * `esperado` pode ser um literal, um array de valores aceitáveis, ou null.
 */
export function comparar(esperado: unknown, obtido: unknown): Veredito {
  if (esperado === null) return obtido === null ? "OK" : "INVENTADO";
  if (obtido === null) return "NULO";

  const candidatos = Array.isArray(esperado) ? esperado : [esperado];
  for (const c of candidatos) {
    if (typeof c === "number" && typeof obtido === "number" && c === obtido) return "OK";
    if (typeof c === "string" && typeof obtido === "string" && textoIgual(c, obtido)) return "OK";
  }
  return "ERRADO";
}

export const ehFalhaCritica = (campo: string, v: Veredito): boolean =>
  CAMPOS_CRITICOS.has(campo) && (v === "ERRADO" || v === "INVENTADO");
