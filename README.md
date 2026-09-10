# RecorreAgora

Auditoria gratuita de multas de trânsito. Mobile-first: a carta chegou, a pessoa
está com ela na mão e o celular na outra.

Estado atual: **passos 1 e 2** do plano — scaffold e motor de extração. As telas
de captura/conferência (passo 4) ainda não existem.

## Rodando

```bash
cp .env.example .env.local     # preencha ANTHROPIC_API_KEY
npm install
npm run dev
```

## Testando a extração

Precisa de um servidor de pé (`npm run dev`) e de uma foto de notificação:

```bash
npm run extract -- fixtures/notificacoes/detran-sp-01.jpg
npm run extract -- pagina1.jpg pagina2.jpg   # páginas do MESMO documento
```

Ou direto via curl:

```bash
curl -X POST http://localhost:3000/api/extract \
  -F "imagens=@notificacao.jpg" | jq
```

`fixtures/notificacoes/` está no `.gitignore` — são documentos reais com dados
pessoais e não entram no repositório.

## Avaliação contra gabarito

`fixtures/sinteticas/` tem quatro modelos demonstrativos (BA, MS, RJ, SP) com o
gabarito de cada campo. Com as imagens no lugar:

```bash
npm run eval
```

O runner separa erro perigoso de degradação aceitável — `NULO` (o usuário
digita) não reprova, `ERRADO` e `INVENTADO` num campo de data reprovam. É a
automação do critério de aceite 3: data correta ou `null`, **nunca errada**.

Veja `fixtures/sinteticas/README.md` para o que cada fixture testa e para o
buraco de cobertura do conjunto atual.

## Verificação

```bash
npm run verify   # typecheck + testes + build (o build roda o check de segredos)
```

## Arquitetura da extração

```
imagens (memória)
   │
   ▼
app/api/extract/route.ts        rate limit, Turnstile, limites de tamanho,
   │                            sniff de magic bytes
   ▼
lib/extraction/extract.ts       Messages API com structured outputs
   │
   ▼
lib/schemas/extraction-raw.ts   schema PERMISSIVO — descreve a forma, não julga
   │                            o conteúdo
   ▼
lib/extraction/normalize.ts     data BR→ISO, placa, hora, moeda;
   │                            rebaixa campo a campo o que não passar
   ▼
lib/schemas/notificacao.ts      schema ESTRITO — a forma canônica
```

### Por que dois schemas

Um schema estrito aplicado direto na resposta do modelo faz **uma** placa mal
lida derrubar os outros 15 campos que vieram certos, e o usuário cai no
formulário manual sem necessidade. Aqui um campo que não sobrevive à
normalização vira `value: null, confidence: 0` mais uma entrada em
`field_issues` — a tela de conferência destaca só aquele campo e pede que a
pessoa digite, usando o `source_text` como dica.

### Decisões que divergem do spec original

| Spec | Implementado | Motivo |
|---|---|---|
| `temperature: 0` | omitido | Retorna 400 nos modelos atuais — o parâmetro foi removido |
| "strip fences defensivamente" + retry no erro do Zod | structured outputs (`zodOutputFormat`) | A API garante a forma; elimina a classe inteira de bug "o modelo escreveu um preâmbulo" |
| Zod estrito na resposta do LLM | dois schemas + normalização | Ver acima |
| PDF→imagem no server | pdf.js no client (passo 4) | `poppler`/`canvas` são binários nativos hostis ao serverless |
| — | rate limit, Turnstile, limites de tamanho, sniff | A rota é pública e cara; sem trava, um script queima a conta da Anthropic |

### Modelo

`EXTRACTION_MODEL` (default `claude-sonnet-5`) fixa o modelo por env, então
trocar é deploy e não code change. Se o critério de aceite 3 —
`data_expedicao_notificacao` correta ou `null`, **nunca errada**, em 10/10
notificações reais — não bater, o primeiro ajuste a testar é `claude-opus-5`:
esse campo sozinho sustenta a tese jurídica do produto.

## Privacidade

A imagem **não é persistida**. Entra em memória, é enviada para a extração, e
sai de escopo com a requisição. O que sobra é o JSON extraído (seção 6 do spec).
