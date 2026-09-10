import "server-only";
import { env } from "@/lib/env";

/**
 * Verificação do Cloudflare Turnstile. Só entra em vigor quando
 * TURNSTILE_SECRET_KEY está configurada — assim dev e os testes de curl seguem
 * funcionando sem widget, e produção pode ligar a trava sem mudar código.
 */
export async function turnstileValido(token: string | null, ip: string): Promise<boolean> {
  if (!env.turnstileSecret) return true;
  if (!token) return false;

  try {
    const corpo = new URLSearchParams({
      secret: env.turnstileSecret,
      response: token,
      remoteip: ip,
    });

    const resposta = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      { method: "POST", body: corpo, cache: "no-store" },
    );

    if (!resposta.ok) return false;
    const dados = (await resposta.json()) as { success?: boolean };
    return dados.success === true;
  } catch {
    // Cloudflare fora do ar não pode bloquear o produto inteiro.
    return true;
  }
}
