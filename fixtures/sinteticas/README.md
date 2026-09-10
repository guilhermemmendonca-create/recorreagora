# Fixtures sintéticos

Modelos demonstrativos do DETRAN de BA, MS, RJ e SP, marcados
"SIMULAÇÃO — SEM VALIDADE OFICIAL — DADOS FICTÍCIOS". Não há dado pessoal real,
então **estes ficam versionados** — são a suíte de regressão do motor.

Documentos reais de usuários vão em `fixtures/notificacoes/`, que está no
`.gitignore` e nunca deve ser commitado.

## Como usar

Cada `*.json` é o gabarito de uma imagem de mesmo nome-base (`detran-ba-01.json`
↔ `detran-ba-01.png`). As imagens ainda **não estão no repositório** — coloque-as
aqui e rode:

```bash
npm run dev     # em outro terminal
npm run eval
```

## O que cada fixture testa

| Fixture | Armadilha |
|---|---|
| `detran-ba-01` | Data de emissão cruzada pela marca d'água; só o rodapé por extenso ("Salvador, 14 de agosto de 2025") resolve. Enquadramento em artigo do CTB, não em código NNN-NN. |
| `detran-ms-01` | Mesma obstrução da data; local é rodovia com quilômetro, não via urbana. |
| `detran-rj-01` | **O mais importante.** A linha "Data e Hora" saiu corrompida: `Propr/2025 – 11:37`. A data tem que voltar `null` e a hora `11:37`. Um valor não-nulo aqui é falha crítica — é o modelo inventando um prazo legal. |
| `detran-sp-01` | Infração de velocidade que não imprime velocidade medida, limite nem radar. Os três têm que voltar `null`. |

Nos quatro, o prazo de defesa aparece só como texto ("30 dias a contar da data de
emissão"), sem data impressa: `data_limite_defesa` tem que ser `null`. Se o
modelo somar 30 dias e devolver uma data, ele entrega um prazo calculado como se
tivesse sido lido — o erro mais caro que este produto pode cometer.

## Buraco de cobertura

Nos quatro documentos o intervalo entre infração e emissão é de 3 a 5 dias.
**Nenhum deles dispara a tese central dos 30 dias** (art. 281, §1º, II, CTB), que
é o motivo de o produto existir. Antes do passo 3, o conjunto precisa de:

- ao menos um documento com expedição mais de 30 dias após a infração;
- uma NIP de verdade (com boleto/JARI), para exercitar a classificação
  `notificacao_penalidade` e o prazo de 180 dias;
- um documento não relacionado (CRLV, IPVA) para o caminho `outro`.
