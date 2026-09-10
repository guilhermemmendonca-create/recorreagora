/**
 * Testa o motor de extração ponta a ponta contra a rota real.
 *
 *   npm run dev                                   # em outro terminal
 *   npm run extract -- fixtures/notificacoes/detran-sp-01.jpg
 *   npm run extract -- pagina1.jpg pagina2.jpg    # páginas do mesmo documento
 *
 * Bate no HTTP de propósito: assim o teste cobre validação de tamanho, sniff de
 * formato e rate limit — não só a chamada ao modelo.
 */
import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";

const BASE = process.env.EXTRACT_BASE_URL ?? "http://localhost:3000";

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

async function main() {
  const caminhos = process.argv.slice(2);
  if (caminhos.length === 0) {
    console.error("uso: npm run extract -- <imagem> [imagem...]");
    process.exit(1);
  }

  const form = new FormData();
  for (const caminho of caminhos) {
    const bytes = await readFile(caminho);
    const tipo = MIME[extname(caminho).toLowerCase()];
    if (!tipo) {
      console.error(`formato não suportado: ${caminho}`);
      process.exit(1);
    }
    form.append("imagens", new File([bytes], basename(caminho), { type: tipo }));
  }

  const inicio = Date.now();
  const resposta = await fetch(`${BASE}/api/extract`, { method: "POST", body: form });
  const corpo = await resposta.json();
  const decorrido = ((Date.now() - inicio) / 1000).toFixed(1);

  console.log(JSON.stringify(corpo, null, 2));
  console.log(`\nHTTP ${resposta.status} em ${decorrido}s`);

  if (!resposta.ok) process.exit(1);

  // O campo que sustenta a tese dos 30 dias merece destaque no output.
  const expedicao = corpo?.data?.data_expedicao_notificacao;
  if (expedicao) {
    console.log(
      `data_expedicao_notificacao: ${expedicao.value ?? "null"} ` +
        `(confiança ${expedicao.confidence}) — lido como: ${expedicao.source_text ?? "—"}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
