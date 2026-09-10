import { NextResponse } from "next/server";

import { env, assertServerEnv } from "@/lib/env";
import { checarRateLimit, ipDaRequisicao } from "@/lib/security/rate-limit";
import { turnstileValido } from "@/lib/security/turnstile";
import {
  extrairNotificacao,
  MEDIA_TYPES_ACEITOS,
  type MediaTypeAceito,
  type PaginaImagem,
} from "@/lib/extraction/extract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const erro = (status: number, mensagem: string, extra?: Record<string, unknown>) =>
  NextResponse.json({ ok: false, mensagem, ...extra }, { status });

/**
 * Confere os bytes iniciais contra o Content-Type declarado. Um `type` de
 * multipart é só o que o cliente afirmou; isso evita mandar lixo (ou um
 * executável renomeado) para a API de visão.
 */
function sniffMediaType(bytes: Uint8Array): MediaTypeAceito | null {
  const b = (i: number) => bytes[i] ?? -1;

  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return "image/jpeg";
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) return "image/png";
  if (b(0) === 0x47 && b(1) === 0x49 && b(2) === 0x46) return "image/gif";
  // RIFF....WEBP
  if (
    b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46 &&
    b(8) === 0x57 && b(9) === 0x45 && b(10) === 0x42 && b(11) === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

/**
 * POST /api/extract
 *
 * multipart/form-data:
 *   imagens         1..MAX_IMAGES arquivos — páginas do MESMO documento
 *   turnstileToken  obrigatório apenas se TURNSTILE_SECRET_KEY estiver configurada
 *
 * PDFs são convertidos em imagens no client (pdf.js) antes de chegar aqui —
 * nenhuma dependência nativa de renderização roda no serverless.
 *
 * As imagens são processadas em memória e descartadas: nada de storage.
 */
export async function POST(req: Request) {
  try {
    assertServerEnv();
  } catch {
    return erro(500, "Serviço de extração não configurado.");
  }

  const ip = ipDaRequisicao(req);

  // Rejeita uploads grandes pelo header, antes de absorver o corpo.
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > env.maxTotalBytes) {
    return erro(413, "As imagens somam mais do que o limite permitido.");
  }

  const limite = await checarRateLimit(ip);
  if (!limite.allowed) {
    return NextResponse.json(
      { ok: false, mensagem: "Muitas tentativas. Tente novamente mais tarde." },
      { status: 429, headers: { "Retry-After": String(limite.retryAfterSec) } },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return erro(400, "Envie as imagens como multipart/form-data.");
  }

  if (!(await turnstileValido(form.get("turnstileToken") as string | null, ip))) {
    return erro(403, "Não conseguimos confirmar que você é uma pessoa. Recarregue a página.");
  }

  const arquivos = form.getAll("imagens").filter((v): v is File => v instanceof File);
  if (arquivos.length === 0) {
    return erro(400, "Nenhuma imagem recebida.");
  }
  if (arquivos.length > env.maxImages) {
    return erro(400, `Envie no máximo ${env.maxImages} páginas.`);
  }

  const paginas: PaginaImagem[] = [];
  let totalBytes = 0;

  for (const arquivo of arquivos) {
    if (arquivo.size > env.maxImageBytes) {
      return erro(413, "Uma das imagens é grande demais. Comprima antes de enviar.");
    }
    totalBytes += arquivo.size;
    if (totalBytes > env.maxTotalBytes) {
      return erro(413, "As imagens somam mais do que o limite permitido.");
    }

    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    const mediaType = sniffMediaType(bytes);
    if (!mediaType) {
      return erro(
        415,
        `Formato não suportado. Aceitos: ${MEDIA_TYPES_ACEITOS.join(", ")}.`,
      );
    }

    paginas.push({ mediaType, base64: Buffer.from(bytes).toString("base64") });
  }

  const resultado = await extrairNotificacao(paginas);

  if (!resultado.ok) {
    // Mensagem genérica para o usuário; o detalhe fica no log do servidor.
    console.error("[extract] falha", {
      erro: resultado.erro,
      mensagem: resultado.mensagem,
      meta: resultado.meta,
    });
    return erro(
      resultado.status,
      "Não conseguimos ler a notificação automaticamente.",
      { erro: resultado.erro },
    );
  }

  return NextResponse.json({
    ok: true,
    data: resultado.data,
    /** Campos que o modelo leu mas a normalização rebaixou — destacar na conferência. */
    field_issues: resultado.issues,
    meta: resultado.meta,
  });
}
