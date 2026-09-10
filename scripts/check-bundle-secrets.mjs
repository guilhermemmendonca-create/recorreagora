/**
 * Critério de aceite 5: a chave da Anthropic não pode estar no bundle client.
 *
 * Roda depois de `next build` e varre .next/static procurando tanto o valor
 * literal da chave quanto qualquer referência a variáveis server-side.
 * Sai com código 1 se achar — falha o build no CI.
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const DIR = ".next/static";

if (!existsSync(DIR)) {
  console.error(`${DIR} não existe — rode \`npm run build\` antes.`);
  process.exit(1);
}

const chave = process.env.ANTHROPIC_API_KEY;
const proibidos = [
  ...(chave && chave.length > 12 ? [chave] : []),
  "ANTHROPIC_API_KEY",
  "TURNSTILE_SECRET_KEY",
  "UPSTASH_REDIS_REST_TOKEN",
];

function* arquivos(dir) {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) yield* arquivos(caminho);
    else if (/\.(js|mjs|css|map)$/.test(nome)) yield caminho;
  }
}

const achados = [];
for (const caminho of arquivos(DIR)) {
  const conteudo = readFileSync(caminho, "utf8");
  for (const termo of proibidos) {
    if (conteudo.includes(termo)) achados.push({ caminho, termo });
  }
}

if (achados.length > 0) {
  console.error("SEGREDO VAZOU PARA O BUNDLE CLIENT:");
  for (const { caminho, termo } of achados) console.error(`  ${caminho} contém ${termo}`);
  process.exit(1);
}

console.log(`OK — nenhum segredo em ${DIR} (${proibidos.length} termos verificados).`);
