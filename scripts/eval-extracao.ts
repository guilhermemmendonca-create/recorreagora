/**
 * Avalia o motor de extração contra os fixtures com gabarito.
 *
 *   npm run dev            # em outro terminal
 *   npm run eval
 *
 * Para cada fixture em fixtures/sinteticas/*.json procura a imagem de mesmo
 * nome-base, manda para /api/extract e compara campo a campo com o gabarito.
 *
 * A classificação separa erro perigoso de degradação aceitável:
 *   OK         valor bate com o gabarito
 *   NULO       gabarito tem valor, veio null — o fluxo pede para o usuário
 *              digitar; ruim para conversão, mas seguro
 *   ERRADO     veio um valor diferente do gabarito — perigoso
 *   INVENTADO  gabarito é null (o documento não imprime), veio um valor —
 *              o pior caso: um dado que não existe no papel
 *
 * ERRADO ou INVENTADO num campo de data reprova a rodada: é exatamente o
 * critério de aceite 3 ("correta ou null — nunca errada").
 */
import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, extname, join } from "node:path";

import { comparar, ehFalhaCritica, type Veredito } from "@/lib/eval/comparar";

const BASE = process.env.EXTRACT_BASE_URL ?? "http://localhost:3000";
const DIR = "fixtures/sinteticas";

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

type Esperado = Record<string, unknown>;
type Fixture = { arquivo: string; origem: string; notas?: string[]; esperado: Esperado };

const mostrar = (v: unknown): string =>
  v === null ? "null" : Array.isArray(v) ? String(v[0]) : String(v);

const SIMBOLO: Record<Veredito, string> = {
  OK: "  ok  ",
  NULO: " nulo ",
  ERRADO: "ERRADO",
  INVENTADO: "INVENT",
};

async function acharImagem(fixtureArquivo: string): Promise<string | null> {
  const semExt = basename(fixtureArquivo, extname(fixtureArquivo));
  for (const ext of Object.keys(MIME)) {
    const caminho = join(DIR, semExt + ext);
    if (existsSync(caminho)) return caminho;
  }
  return null;
}

async function avaliarUm(fixture: Fixture) {
  const imagem = await acharImagem(fixture.arquivo);
  if (!imagem) {
    console.log(`\n### ${fixture.arquivo} — IMAGEM AUSENTE`);
    console.log(`    coloque o arquivo em ${DIR}/ para avaliar este fixture`);
    return { critico: 0, ok: 0, total: 0, pulado: true };
  }

  const bytes = await readFile(imagem);
  const form = new FormData();
  form.append(
    "imagens",
    new File([bytes], basename(imagem), { type: MIME[extname(imagem).toLowerCase()]! }),
  );

  const inicio = Date.now();
  const resposta = await fetch(`${BASE}/api/extract`, { method: "POST", body: form });
  const corpo = (await resposta.json()) as {
    ok?: boolean;
    data?: Record<string, { value: unknown; confidence: number }>;
    mensagem?: string;
  };
  const segundos = ((Date.now() - inicio) / 1000).toFixed(1);

  console.log(`\n### ${basename(imagem)}  (${segundos}s)`);

  if (!resposta.ok || !corpo.ok || !corpo.data) {
    console.log(`    FALHA HTTP ${resposta.status}: ${corpo.mensagem ?? "sem corpo"}`);
    return { critico: 1, ok: 0, total: 1, pulado: false };
  }

  const dados = corpo.data;
  let critico = 0;
  let acertos = 0;
  let total = 0;

  for (const [campo, esperado] of Object.entries(fixture.esperado)) {
    total += 1;
    const obtido =
      campo === "document_type" ? dados[campo] : (dados[campo] as { value: unknown })?.value ?? null;

    const veredito = comparar(esperado, obtido);
    if (veredito === "OK") acertos += 1;

    const falhaCritica = ehFalhaCritica(campo, veredito);
    if (falhaCritica) critico += 1;

    const marca = falhaCritica ? " <<< CRÍTICO" : "";
    if (veredito !== "OK") {
      console.log(
        `  [${SIMBOLO[veredito]}] ${campo.padEnd(28)} ` +
          `esperado=${mostrar(esperado)}  obtido=${mostrar(obtido)}${marca}`,
      );
    }
  }

  console.log(`  ${acertos}/${total} campos corretos` + (critico ? `, ${critico} CRÍTICOS` : ""));
  return { critico, ok: acertos, total, pulado: false };
}

async function main() {
  const nomes = (await readdir(DIR)).filter((n) => n.endsWith(".json")).sort();
  if (nomes.length === 0) {
    console.error(`nenhum fixture em ${DIR}`);
    process.exit(1);
  }

  let criticos = 0;
  let acertos = 0;
  let campos = 0;
  let avaliados = 0;

  for (const nome of nomes) {
    const fixture = JSON.parse(await readFile(join(DIR, nome), "utf8")) as Fixture;
    const r = await avaliarUm(fixture);
    if (r.pulado) continue;
    avaliados += 1;
    criticos += r.critico;
    acertos += r.ok;
    campos += r.total;
  }

  console.log("\n" + "=".repeat(64));
  if (avaliados === 0) {
    console.log("Nenhum fixture avaliado — faltam as imagens.");
    process.exit(1);
  }

  const pct = ((acertos / campos) * 100).toFixed(1);
  console.log(`${avaliados} documento(s) · ${acertos}/${campos} campos corretos (${pct}%)`);

  if (criticos > 0) {
    console.log(`\nREPROVADO: ${criticos} erro(s) de data.`);
    console.log("Critério de aceite 3: data correta ou null — NUNCA errada.");
    process.exit(1);
  }

  console.log("\nAPROVADO no critério de datas: nenhuma data errada ou inventada.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
