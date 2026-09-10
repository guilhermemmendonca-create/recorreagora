import "server-only";

/**
 * Configuração server-side. Importa `server-only`, então qualquer tentativa de
 * puxar este módulo para um Client Component quebra o build — é a primeira
 * linha de defesa do critério de aceite 5 (chave fora do bundle client).
 */

const num = (raw: string | undefined, fallback: number): number => {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const env = {
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",

  /** Fixado por env para que trocar de modelo seja um deploy, não um code change. */
  extractionModel: process.env.EXTRACTION_MODEL ?? "claude-sonnet-5",
  extractionEffort: (process.env.EXTRACTION_EFFORT ?? "medium") as
    | "low"
    | "medium"
    | "high"
    | "xhigh"
    | "max",

  /** Limites de upload — a rota é pública, então o tamanho é a primeira trava de custo. */
  maxImages: num(process.env.MAX_IMAGES, 6),
  maxImageBytes: num(process.env.MAX_IMAGE_BYTES, 6 * 1024 * 1024),
  maxTotalBytes: num(process.env.MAX_TOTAL_BYTES, 20 * 1024 * 1024),

  /** Rate limit por IP. Upstash quando configurado; senão, in-memory por instância. */
  rateLimitMax: num(process.env.RATE_LIMIT_MAX, 5),
  rateLimitWindowSec: num(process.env.RATE_LIMIT_WINDOW_SEC, 60 * 60),
  upstashUrl: process.env.UPSTASH_REDIS_REST_URL ?? "",
  upstashToken: process.env.UPSTASH_REDIS_REST_TOKEN ?? "",

  /** Turnstile: só é exigido quando a secret está configurada. */
  turnstileSecret: process.env.TURNSTILE_SECRET_KEY ?? "",
} as const;

export function assertServerEnv(): void {
  if (!env.anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY não configurada");
  }
}
