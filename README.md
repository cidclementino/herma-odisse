# Herma

Leitura pública e gratuita do potencial construtivo dos lotes de João Pessoa. Um projeto do **Odisse, Estúdio de Arquitetura & Design**.

Na Grécia antiga, as hermas eram pilares com a cabeça de Hermes que orientavam viajantes e marcavam limites. A Herma orienta quem procura terreno e marca o limite do que a lei permite construir. A partir dela, o interessado pede ao Odisse o estudo aprofundado do terreno, que é pago.

**Versão 0.1 · piloto Jardim Oceania** (1.726 lotes, 266 vagos, 1.307 na faixa de 500 m da orla).

## O que o site faz

| Área | Conteúdo |
|---|---|
| Mapa | Lotes coloridos por altura máxima, pavimentos, área estimada, zona ou situação. Linhas de gabarito a cada 50 m. Base: ruas, desenho ou satélite. 2D e 3D. |
| Estudo do lote | Ficha no formato do Nível 1 do estudo de viabilidade: 1.1 Terreno, 1.2 Parâmetros, 1.3 Gabarito da orla (com corte), 1.4 Envelope legal por pavimento (com 3D no mapa), 1.6 Fator limitante, 1.7 Riscos. |
| Filtros | Vagos, faixa da orla, zona, área, pavimentos mínimos; lista ordenável dos resultados. |
| Salvos | Lotes guardados no navegador, comparados lado a lado. |
| Bairro | Mercado (FipeZap, DataZAP, Consult) e números do território. |
| Solicitar estudo | Formulário que abre o WhatsApp ou o e-mail do Odisse já com os dados do(s) lote(s) e os níveis de interesse. Nada é armazenado no site. |

Cada lote tem link próprio: `…/#lote=030770479`.

## Como a leitura é calculada

`ferramentas/processar.py` faz todo o cálculo e grava o resultado em `dados/jardim-oceania/`. O site só lê.

1. **Testadas e divisas.** Lados do lote encostados em outro lote (a menos de 1 m) são divisas; os demais, testadas.
2. **Zona.** Zoneamento 2024, pela maior sobreposição com o lote.
3. **Distância à orla (D).** Até a borda voltada ao mar da 1ª faixa da camada `digeoc:faixas`, que corresponde à testada da 1ª quadra.
4. **Gabarito.** `H = 12,90 + 0,0442 × D`, até 35 m em D = 500 m (Decreto 9.718/2021, art. 54, § 2º). Pavimento n é admitido onde a tangente supera a metade do seu pé-direito: `0,15 + 2,80 × (n − 1) + 1,40`.
5. **Envelope.** Por pavimento: lote menos 5 m nas testadas, menos o afastamento lateral nas divisas (1,50 m até o 3º, 3,00 m no 4º, 3,0 + 0,30 × (n − 4) depois), recortado pela distância mínima do pavimento. Cada pavimento conta no máximo a projeção da taxa de ocupação; a soma para no índice máximo.
6. **Fator limitante.** Altura, índice ou afastamentos, conforme o que encerrou o empilhamento.

**Conferência.** O lote 479 da quadra 77 (estudo `evem-potencial-construtivo-lote479`, v01) dá D = 81,1 m (estudo: 80,6 m), 6 pavimentos + 1 parcial, índice efetivo 3,36 (estudo: 3,35) e altura como fator limitante. A área difere na mesma proporção da área do lote: 3.292 m² medidos no cadastro contra 3.170 m² declarados.

### Versão da norma

Os parâmetros ficam em `dados/normas.json`, com uma chave por versão (`jp-2026-11`). Todo arquivo gerado registra a norma usada e o site mostra o selo da versão. Quando a regra mudar (art. 62 restabelecido, nova redação, Plano Diretor revisado), crie uma nova versão, reprocesse e mantenha a anterior registrada.

Só a **ZH-3** tem parâmetros conferidos (vindos do estudo do lote 479, com o Anexo V marcado para conferência). Na ZCS-3 e na ZH-1 a ficha mostra só a altura e os pavimentos admitidos por ela. A ZEPA-1 aparece como não edificável.

## Dados

- Fonte: **Filipeia/SEPLAN/PMJP** — `digeoc:Lotes`, `digeoc:zoneamento2024`, `digeoc:faixas`, `digeoc:Bairros`, `digeoc:quadras_gerais` (SIRGAS 2000 / UTM 25S, EPSG:31985).
- Os termos de uso vedam a alienação onerosa dos arquivos. O repositório guarda só dados **derivados** (leitura de cada lote e geometria simplificada), sempre com a citação da fonte. O pacote bruto da extração fica fora do git (`ferramentas/.blob-local.txt`) e na pasta local do projeto.
- A geometria é cadastral; nos estudos pagos, conferir com a matrícula.

### Atualizar ou levar para outro bairro

O GeoServer não envia CORS, falha em consultas grandes e com `BBOX` sobre a camada de lotes. Por isso a extração roda no navegador:

1. Abra `https://filipeia.joaopessoa.pb.gov.br/geoserver/ows` e o console do navegador.
2. Ajuste `BAIRRO` e `BBOX` em `ferramentas/extrair-filipeia.js`, cole e rode. Ele baixa o pacote `herma-<bairro>-blob.txt`.
3. `pip install shapely pyproj` e `python ferramentas/processar.py herma-<bairro>-blob.txt`.

`digeoc:EDIFICACOES` (número de pavimentos existentes) ainda não pôde ser extraída: o servidor responde com falta de espaço em disco. Fica para a v0.2.

## Rodar localmente

```bash
python3 -m http.server 8000
# abrir http://localhost:8000
```

Publicação: GitHub Pages, branch `main`, pasta raiz. Não há etapa de build.

## Estrutura

```
index.html                 página única: trilho, painel, mapa, diálogo de solicitação
assets/css/herma.css       interface (sistema gráfico do Odisse)
assets/js/herma.js         mapa, ficha, filtros, salvos, busca, solicitação
assets/fonts/              Inter variável com eixo óptico (do marketing-odisse)
assets/marca/              selo da Herma e logotipo do Odisse
dados/normas.json          parâmetros versionados
dados/jardim-oceania/      lotes.geojson · envelopes.json · contexto.geojson · resumo.json
ferramentas/               extrair-filipeia.js · processar.py · blob.py
vendor/maplibre/           MapLibre GL JS 4.7.1 (BSD-3)
```

## Próximos passos

- Conferir o Anexo V da LUOS (ZH-3, ZCS-3, ZH-1) e abrir o envelope nas outras zonas.
- Cenários normativos na ficha (art. 62 restabelecido, minuta de março de 2026).
- Edificações existentes (pavimentos atuais) para separar lotes com potencial ocioso.
- Formulário com registro de pedidos (hoje vai por WhatsApp/e-mail).
- Domínio e registro de marca (INPI) para "Herma".
- Expansão: Bessa, depois a orla.

---

Odisse, Estúdio de Arquitetura & Design · João Pessoa · contato@odisse.com.br
