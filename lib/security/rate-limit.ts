import "server-only";
import { env } from "@/lib/env";

/**
 * Rate limit por IP para uma rota pública e cara.
 *
 * Upstash (REST, via fetch — sem dependência nova) quando configurado: é o único
 * modo que dá um limite real, compartilhado entre as instâncias serverless.
 * Sem Upstash, cai para um contador in-memory que só protege dentro de uma
 * instância — melhor que nada em dev, insuficiente em produção.
 */

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  /** Segundos até a janela reabrir; alimenta o header Retry-After. */
  retryAfterSec: number;
};

const memoria = new Map<string, { count: number; resetAt: number }>();

function limitarEmMemoria(chave: string, max: number, janelaSec: number): RateLimitResult {
  const agora = Date.now();

  // Poda oportunista para a Map não crescer sem limite.
  if (memoria.size > 10_000) {
    for (const [k, v] of memoria) if (v.resetAt <= agora) memoria.delete(k);
  }

  const atual = memoria.get(chave);
  if (!atual || atual.resetAt <= agora) {
    memoria.set(chave, { count: 1, resetAt: agora + janelaSec * 1000 });
    return { allowed: true, remaining: max - 1, retryAfterSec: 0 };
  }

  atual.count += 1;
  const retryAfterSec = Math.ceil((atual.resetAt - agora) / 1000);
  if (atual.count > max) {
    return { allowed: false, remaining: 0, retryAfterSec };
  }
  return { allowed: true, remaining: max - atual.count, retryAfterSec };
}

async function limitarNoUpstash(
  chave: string,
  max: number,
  janelaSec: number,
): Promise<RateLimitResult | null> {
  try {
    // INCR + EXPIRE NX em pipeline: um round-trip, e a janela só é fixada na
    // primeira requisição (NX), então ela não desliza a cada hit.
    const resposta = await fetch(`${env.upstashUrl}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.upstashToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", chave],
        ["EXPIRE", chave, String(janelaSec), "NX"],
        ["TTL", chave],
      ]),
      cache: "no-store",
    });

    if (!resposta.ok) return null;

    const corpo = (await resposta.json()) as Array<{ result?: number; error?: string }>;
    const count = corpo[0]?.result;
    const ttl = corpo[2]?.result;
    if (typeof count !== "number") return null;

    const retryAfterSec = typeof ttl === "number" && ttl > 0 ? ttl : janelaSec;
    return {
      allowed: count <= max,
      remaining: Math.max(0, max - count),
      retryAfterSec: count <= max ? 0 : retryAfterSec,
    };
  } catch {
    return null;
  }
}

export async function checarRateLimit(ip: string): Promise<RateLimitResult> {
  const { rateLimitMax: max, rateLimitWindowSec: janela } = env;
  const chave = `ra:extract:${ip}`;

  if (env.upstashUrl && env.upstashToken) {
    const viaUpstash = await limitarNoUpstash(chave, max, janela);
    // Upstash indisponível não pode derrubar o produto — cai para o in-memory.
    if (viaUpstash) return viaUpstash;
  }

  return limitarEmMemoria(chave, max, janela);
}

/**
 * IP do cliente. Na Vercel, `x-forwarded-for` é definido pela plataforma e o
 * primeiro item é o cliente real. Fora dela o header é falsificável — por isso
 * o rate limit é uma trava de custo, não um controle de segurança.
 */
export function ipDaRequisicao(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const primeiro = xff.split(",")[0]?.trim();
    if (primeiro) return primeiro;
  }
  return req.headers.get("x-real-ip")?.trim() || "desconhecido";
}
