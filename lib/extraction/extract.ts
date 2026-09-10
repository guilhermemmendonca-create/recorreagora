import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { env } from "@/lib/env";
import { NotificacaoExtraidaRaw } from "@/lib/schemas/extraction-raw";
import { NotificacaoExtraida } from "@/lib/schemas/notificacao";
import { EXTRACTION_SYSTEM_PROMPT, EXTRACTION_USER_TEXT } from "./prompt";
import { normalizeExtraction, type FieldIssue } from "./normalize";

/** Formatos de imagem que a Messages API aceita. */
export const MEDIA_TYPES_ACEITOS = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;
export type MediaTypeAceito = (typeof MEDIA_TYPES_ACEITOS)[number];

export type PaginaImagem = {
  mediaType: MediaTypeAceito;
  /** Conteúdo em base64, sem o prefixo `data:`. */
  base64: string;
};

export type ExtractionMeta = {
  model: string;
  tentativas: number;
  latenciaMs: number;
  inputTokens: number;
  outputTokens: number;
};

export type ExtractionOutcome =
  | {
      ok: true;
      data: NotificacaoExtraida;
      issues: FieldIssue[];
      meta: ExtractionMeta;
    }
  | {
      ok: false;
      /**
       * `recusado`  — classificador de segurança barrou o pedido
       * `sem_saida` — modelo respondeu mas sem output estruturado
       * `api`       — erro HTTP/rede após os retries do SDK
       */
      erro: "recusado" | "sem_saida" | "api";
      mensagem: string;
      status: number;
      meta: Pick<ExtractionMeta, "model" | "tentativas" | "latenciaMs">;
    };

let clienteCache: Anthropic | null = null;

function cliente(): Anthropic {
  if (!clienteCache) {
    clienteCache = new Anthropic({
      apiKey: env.anthropicApiKey,
      // Abaixo do teto de execução da Vercel: preferimos devolver o formulário
      // manual a estourar a função e perder a requisição inteira.
      timeout: 120_000,
      maxRetries: 2,
    });
  }
  return clienteCache;
}

/**
 * Uma passada: monta a mensagem multimodal e devolve a resposta já parseada
 * contra o schema permissivo. Structured outputs garante a FORMA — a validação
 * de CONTEÚDO acontece depois, na normalização.
 */
async function chamarModelo(paginas: PaginaImagem[]) {
  return cliente().messages.parse({
    model: env.extractionModel,
    max_tokens: 8000,
    system: EXTRACTION_SYSTEM_PROMPT,
    // `temperature` foi removida nos modelos atuais (retorna 400) — não definir.
    output_config: {
      effort: env.extractionEffort,
      format: zodOutputFormat(NotificacaoExtraidaRaw),
    },
    messages: [
      {
        role: "user",
        content: [
          // Múltiplas imagens = páginas do mesmo documento (regra 9 do prompt).
          ...paginas.map((p) => ({
            type: "image" as const,
            source: {
              type: "base64" as const,
              media_type: p.mediaType,
              data: p.base64,
            },
          })),
          { type: "text" as const, text: EXTRACTION_USER_TEXT },
        ],
      },
    ],
  });
}

/**
 * Extrai os campos de uma notificação a partir de 1..N imagens.
 *
 * A imagem nunca é persistida: entra como base64 em memória, é enviada, e sai
 * de escopo junto com a requisição (seção 6 do spec — superfície LGPD mínima).
 */
export async function extrairNotificacao(
  paginas: PaginaImagem[],
): Promise<ExtractionOutcome> {
  const inicio = Date.now();
  const model = env.extractionModel;
  let tentativas = 0;
  let ultimoErro = "";
  let ultimoStatus = 502;

  // Uma repetição: structured outputs torna a falha de forma quase impossível,
  // mas um `parsed_output` vazio ou um erro transitório ainda acontecem.
  while (tentativas < 2) {
    tentativas += 1;
    try {
      const resposta = await chamarModelo(paginas);

      if (resposta.stop_reason === "refusal") {
        return {
          ok: false,
          erro: "recusado",
          mensagem:
            resposta.stop_details?.explanation ??
            "O pedido foi recusado pelos classificadores de segurança.",
          status: 422,
          meta: { model, tentativas, latenciaMs: Date.now() - inicio },
        };
      }

      if (!resposta.parsed_output) {
        ultimoErro = "O modelo não devolveu a saída estruturada.";
        ultimoStatus = 502;
        continue;
      }

      const { data, issues } = normalizeExtraction(resposta.parsed_output);

      // Cinto e suspensório: a normalização constrói um objeto que já satisfaz
      // o schema estrito. Se não satisfizer, é bug nosso, não do modelo.
      const conferencia = NotificacaoExtraida.safeParse(data);
      if (!conferencia.success) {
        throw new Error(
          `normalizeExtraction produziu um objeto inválido: ${conferencia.error.message}`,
        );
      }

      return {
        ok: true,
        data: conferencia.data,
        issues,
        meta: {
          model,
          tentativas,
          latenciaMs: Date.now() - inicio,
          inputTokens: resposta.usage.input_tokens,
          outputTokens: resposta.usage.output_tokens,
        },
      };
    } catch (e) {
      if (e instanceof Anthropic.APIError) {
        // 4xx que não seja 429 não melhora repetindo.
        const status = e.status ?? 502;
        if (status !== 429 && status >= 400 && status < 500) {
          return {
            ok: false,
            erro: "api",
            mensagem: e.message,
            status,
            meta: { model, tentativas, latenciaMs: Date.now() - inicio },
          };
        }
        ultimoErro = e.message;
        ultimoStatus = status;
        continue;
      }
      throw e;
    }
  }

  return {
    ok: false,
    erro: ultimoStatus === 502 ? "sem_saida" : "api",
    mensagem: ultimoErro || "Falha ao extrair os dados.",
    status: ultimoStatus,
    meta: { model, tentativas, latenciaMs: Date.now() - inicio },
  };
}
