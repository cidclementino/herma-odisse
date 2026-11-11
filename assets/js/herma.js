// Herma — leitura pública de lotes. Piloto: Jardim Oceania (João Pessoa).
// Odisse, Estúdio de Arquitetura & Design. Dados derivados de Filipeia/SEPLAN/PMJP.

const DADOS = 'dados/jardim-oceania/';
const COR = {
  ardosia: '#3F4B57', ardosia2: '#5B6773', papel: '#FAFAF7', areia: '#E3D9C6', nevoa: '#E6E8EB',
  ocre: '#BB8248', ambar: '#ECC28F', terra: '#4A3726', linha: '#C3C8CD', mar: '#D5DEE3',
};
const ZONAS_COR = { ZH3: '#E3D9C6', ZCS3: '#C7D2DA', ZH1: '#D8DFCD', ZEPA1: '#A9BD9A' };
const WHATS = '5583991223088';
const EMAIL = 'contato@odisse.com.br';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const fmt = (v, d = 0) => v == null || Number.isNaN(v) ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const m2 = (v) => `${fmt(v)} m²`;
const m = (v, d = 2) => `${fmt(v, d)} m`;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sem armazenamento */ } };
const ler = (k, padrao) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : padrao; } catch (e) { return padrao; } };

const S = {
  lotes: null, porId: new Map(), contexto: null, resumo: null, normas: null, norma: null,
  envelopes: null, selecionado: null, tema: 'altura', salvos: new Set(ler('herma.salvos', [])),
  filtro: null, filtrados: [], mostrar: 40, base: ler('herma.base', 'ruas'),
};

// ------------------------------------------------------------------ início
async function iniciar() {
  const [lotes, contexto, resumo, normas] = await Promise.all(
    ['lotes.geojson', 'contexto.geojson', 'resumo.json'].map((f) => fetch(DADOS + f).then((r) => r.json()))
      .concat(fetch('dados/normas.json').then((r) => r.json())),
  );
  S.lotes = lotes; S.contexto = contexto; S.resumo = resumo; S.normas = normas;
  S.norma = normas.versoes[lotes.norma || normas.vigente];
  lotes.features.forEach((f) => S.porId.set(f.properties.id, f));

  preencherInicio(); preencherBairro(); preencherSobre(); montarFiltros(); montarCamadas(); montarBusca(); montarDialogo();
  atualizarSalvos();
  ligarTrilho();
  const h = lerHash();
  const comLote = h.lote && S.porId.has(h.lote);
  abrirAba(comLote ? 'lote' : (window.innerWidth > 820 ? 'inicio' : null));
  await montarMapa();
  if (comLote) selecionar(h.lote, { voar: true });
}

// ------------------------------------------------------------------ trilho e painel
function ligarTrilho() {
  $$('.trilho [data-aba]').forEach((b) => b.addEventListener('click', (e) => {
    e.preventDefault();
    const aba = b.dataset.aba;
    const ativa = $('.aba.ativa')?.dataset.aba;
    if (aba === ativa && !document.body.classList.contains('painel-fechado')) fecharPainel();
    else abrirAba(aba);
  }));
  $('#painelFechar').addEventListener('click', () => (document.body.classList.contains('painel-fechado') ? abrirAba($('.aba.ativa')?.dataset.aba || 'inicio') : fecharPainel()));
}
function abrirAba(aba) {
  if (!aba) { fecharPainel(); return; }
  $$('.aba').forEach((a) => a.classList.toggle('ativa', a.dataset.aba === aba));
  $$('.trilho-bt').forEach((b) => b.classList.toggle('ativo', b.dataset.aba === aba));
  document.body.classList.remove('painel-fechado');
  setTimeout(() => S.mapa?.resize(), 260);
}
function fecharPainel() {
  document.body.classList.add('painel-fechado');
  $$('.trilho-bt').forEach((b) => b.classList.remove('ativo'));
  setTimeout(() => S.mapa?.resize(), 260);
}

// ------------------------------------------------------------------ mapa
function estiloBase() {
  return {
    version: 8,
    sources: {
      ruas: { type: 'raster', tileSize: 256, maxzoom: 20,
        tiles: ['a', 'b', 'c', 'd'].map((s) => `https://${s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png`),
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · © <a href="https://carto.com/attributions">CARTO</a>' },
      satelite: { type: 'raster', tileSize: 256, maxzoom: 19,
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        attribution: 'Imagem: Esri, Maxar' },
    },
    layers: [
      { id: 'fundo', type: 'background', paint: { 'background-color': '#EDEEEA' } },
      { id: 'base-ruas', type: 'raster', source: 'ruas', paint: { 'raster-opacity': 0.9, 'raster-saturation': -0.6 }, layout: { visibility: 'none' } },
      { id: 'base-satelite', type: 'raster', source: 'satelite', paint: { 'raster-opacity': 0.92, 'raster-saturation': -0.25 }, layout: { visibility: 'none' } },
    ],
  };
}

function corTema(tema) {
  const p = (k) => ['to-number', ['get', k], -1];
  switch (tema) {
    case 'pav': return ['case', ['!', ['get', 'na_faixa']], '#C9CFD4',
      ['interpolate', ['linear'], p('pav_alt_frente'), 4, '#F3E9D6', 6, COR.ambar, 9, COR.ocre, 12, '#7A5434', 14, COR.terra]];
    case 'area_to': return ['case', ['!', ['has', 'area_to']], '#DADDDF',
      ['interpolate', ['linear'], p('area_to'), 0, '#F3E9D6', 2000, COR.ambar, 6000, COR.ocre, 15000, COR.terra]];
    case 'zona': return ['match', ['get', 'zona'], 'ZH3', ZONAS_COR.ZH3, 'ZCS3', ZONAS_COR.ZCS3, 'ZH1', ZONAS_COR.ZH1, 'ZEPA1', ZONAS_COR.ZEPA1, '#DDD'];
    case 'vago': return ['case', ['get', 'vago'], COR.ocre, '#D3D7DA'];
    default: return ['case', ['!', ['get', 'na_faixa']], '#C9CFD4',
      ['interpolate', ['linear'], p('h_testada'), 12.9, '#F3E9D6', 18, COR.ambar, 25, COR.ocre, 31, '#7A5434', 35, COR.terra]];
  }
}

function montarMapa() {
  let pronto; const promessa = new Promise((r) => { pronto = r; });
  const mapa = new maplibregl.Map({
    container: 'mapa', style: estiloBase(), center: S.resumo.centro, zoom: 15.2, minZoom: 13, maxZoom: 20,
    maxPitch: 70, attributionControl: false, hash: false,
    maxBounds: [[S.resumo.limites[0] - 0.03, S.resumo.limites[1] - 0.03], [S.resumo.limites[2] + 0.03, S.resumo.limites[3] + 0.03]],
  });
  S.mapa = mapa;
  mapa.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: 'Lotes: Filipeia/SEPLAN/PMJP' }), 'bottom-right');
  mapa.addControl(new maplibregl.NavigationControl({ visualizePitch: true, showCompass: true }), 'bottom-right');
  mapa.on('load', () => {
    const ctx = (c) => ({ type: 'FeatureCollection', features: S.contexto.features.filter((f) => f.properties.camada === c) });
    mapa.addSource('mar', { type: 'geojson', data: ctx('mar') });
    mapa.addSource('zonas', { type: 'geojson', data: ctx('zona') });
    mapa.addSource('faixas', { type: 'geojson', data: ctx('faixa') });
    mapa.addSource('iso', { type: 'geojson', data: ctx('iso') });
    mapa.addSource('bairros', { type: 'geojson', data: ctx('bairro') });
    mapa.addSource('lotes', { type: 'geojson', data: S.lotes, promoteId: 'id' });
    mapa.addSource('envelope', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });

    mapa.addLayer({ id: 'mar', type: 'fill', source: 'mar', paint: { 'fill-color': COR.mar, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0.0, 15, 0.0] } });
    mapa.addLayer({ id: 'faixa62', type: 'line', source: 'faixas', layout: { visibility: 'none' }, paint: { 'line-color': COR.ardosia2, 'line-width': 1, 'line-dasharray': [3, 2] } });
    mapa.addLayer({ id: 'bairro', type: 'line', source: 'bairros', filter: ['==', ['get', 'nome'], 'Jardim Oceania'], paint: { 'line-color': COR.ardosia, 'line-width': 2, 'line-opacity': 0.55, 'line-dasharray': [4, 2] } });
    mapa.addLayer({ id: 'lotes', type: 'fill', source: 'lotes', paint: {
      'fill-color': corTema(S.tema),
      'fill-opacity': ['case', ['boolean', ['feature-state', 'fora'], false], 0.12, 0.88],
    } });
    mapa.addLayer({ id: 'lotes-linha', type: 'line', source: 'lotes', paint: {
      'line-color': ['case', ['boolean', ['feature-state', 'fora'], false], 'rgba(63,75,87,.18)', 'rgba(63,75,87,.55)'],
      'line-width': ['interpolate', ['linear'], ['zoom'], 14, 0.2, 17, 0.8, 19, 1.2],
    } });
    mapa.addLayer({ id: 'lotes-vagos', type: 'line', source: 'lotes', filter: ['get', 'vago'], paint: {
      'line-color': COR.terra, 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 0.6, 18, 1.8],
      'line-opacity': ['case', ['boolean', ['feature-state', 'fora'], false], 0.15, 0.8],
    } });
    mapa.addLayer({ id: 'iso', type: 'line', source: 'iso', paint: { 'line-color': COR.ocre, 'line-width': 1.1, 'line-dasharray': [1, 2.2], 'line-opacity': 0.9 } });
    mapa.addLayer({ id: 'volumes', type: 'fill-extrusion', source: 'lotes', layout: { visibility: 'none' },
      filter: ['all', ['get', 'na_faixa'], ['!=', ['get', 'zona'], 'ZEPA1']], paint: {
        'fill-extrusion-color': corTema('altura'),
        'fill-extrusion-height': ['to-number', ['get', 'h_testada'], 0],
        'fill-extrusion-opacity': 0.72,
      } });
    mapa.addLayer({ id: 'lote-sel', type: 'line', source: 'lotes', filter: ['==', ['get', 'id'], ''], paint: { 'line-color': COR.ardosia, 'line-width': 3 } });
    mapa.addLayer({ id: 'lote-hover', type: 'line', source: 'lotes', filter: ['==', ['get', 'id'], ''], paint: { 'line-color': COR.ardosia, 'line-width': 1.6 } });
    mapa.addLayer({ id: 'envelope', type: 'fill-extrusion', source: 'envelope', paint: {
      'fill-extrusion-color': ['case', ['get', 'parcial'], COR.ambar, ['get', 'cor']],
      'fill-extrusion-base': ['get', 'base'], 'fill-extrusion-height': ['get', 'topo'], 'fill-extrusion-opacity': 0.9,
    } });

    trocarBase(S.base);
    rotularIso();
    desenharLegenda();
    aplicarFiltro();

    // interação
    const dica = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'popup-dica', offset: 10 });
    mapa.on('mousemove', 'lotes', (e) => {
      const p = e.features[0].properties;
      mapa.getCanvas().style.cursor = 'pointer';
      mapa.setFilter('lote-hover', ['==', ['get', 'id'], p.id]);
      if (matchMedia('(hover: hover)').matches) {
        dica.setLngLat(e.lngLat).setHTML(`<div class="dica">${esc(p.logr)}${p.num ? ', ' + esc(p.num) : ''}<small>${m2(p.area)} · ${p.na_faixa ? 'até ' + m(p.h_testada, 1) + ' na testada' : 'fora da faixa da orla'}</small></div>`).addTo(mapa);
      }
    });
    mapa.on('mouseleave', 'lotes', () => { mapa.getCanvas().style.cursor = ''; mapa.setFilter('lote-hover', ['==', ['get', 'id'], '']); dica.remove(); });
    mapa.on('click', 'lotes', (e) => { dica.remove(); selecionar(e.features[0].properties.id); });
    pronto();
  });

  $('#bt3d').addEventListener('click', () => alternar3D());
  $('#btNorte').addEventListener('click', () => mapa.flyTo({ center: S.resumo.centro, zoom: 15.2, pitch: 0, bearing: 0 }));
  mapa.on('pitchend', () => $('#bt3d').classList.toggle('ativo', mapa.getPitch() > 5));
  return promessa;
}

function alternar3D(forcar) {
  const em3d = forcar ?? S.mapa.getPitch() < 5;
  S.mapa.easeTo({ pitch: em3d ? 58 : 0, bearing: em3d ? -18 : 0, duration: 700 });
}

function trocarBase(base) {
  S.base = base; guardar('herma.base', base);
  const m = S.mapa;
  m.setLayoutProperty('base-ruas', 'visibility', base === 'ruas' ? 'visible' : 'none');
  m.setLayoutProperty('base-satelite', 'visibility', base === 'satelite' ? 'visible' : 'none');
  m.setPaintProperty('mar', 'fill-opacity', base === 'desenho' ? 1 : 0);
  m.setPaintProperty('lotes', 'fill-opacity', ['case', ['boolean', ['feature-state', 'fora'], false], 0.1, base === 'satelite' ? 0.62 : 0.88]);
  $$('#segBase button').forEach((b) => b.classList.toggle('ativo', b.dataset.base === base));
}

function rotularIso() {
  (S.isoMarcas || []).forEach((mk) => mk.remove());
  S.isoMarcas = [];
  if (S.mapa.getLayoutProperty('iso', 'visibility') === 'none') return;
  const vistos = new Set();
  S.contexto.features.filter((f) => f.properties.camada === 'iso').forEach((f) => {
    const { d, h } = f.properties;
    if (vistos.has(d) || d % 100) return; vistos.add(d);
    const cs = f.geometry.coordinates;
    // rótulos alinhados numa mesma latitude, como uma régua sobre o bairro
    const alvo = S.resumo.centro[1] - 0.0045;
    const c = cs.reduce((a, b) => (Math.abs(b[1] - alvo) < Math.abs(a[1] - alvo) ? b : a));
    const el = document.createElement('div'); el.className = 'rotulo-iso';
    el.textContent = d === 0 ? '12,9 m' : `${fmt(h, 1)} m`; el.title = d === 0 ? 'Testada da 1ª quadra' : `${d} m da orla`;
    S.isoMarcas.push(new maplibregl.Marker({ element: el }).setLngLat(c).addTo(S.mapa));
  });
}

function desenharLegenda() {
  const L = $('#legenda');
  const rampa = (cores, a, b, titulo, extra = '') => `<p class="rotulo">${titulo}</p>
    <div class="rampa" style="background:linear-gradient(90deg,${cores.join(',')})"></div>
    <div class="escala"><span>${a}</span><span>${b}</span></div>${extra}`;
  const fora = `<div class="cat" style="margin-top:8px"><span><i style="background:#C9CFD4"></i>fora da faixa de 500 m</span><span><i style="background:transparent;box-shadow:inset 0 0 0 1.5px ${COR.terra}"></i>vago</span></div>`;
  const r = ['#F3E9D6', COR.ambar, COR.ocre, '#7A5434', COR.terra];
  const T = {
    altura: rampa(r, '12,9 m', '35 m', 'Altura máxima na testada', fora),
    pav: rampa(r, '4 pav.', '14 pav.', 'Pavimentos admitidos pela altura', fora),
    area_to: rampa(r.slice(0, 4).concat(COR.terra), '0', '15.000 m²', 'Área construída estimada (ZH-3)', `<div class="cat" style="margin-top:8px"><span><i style="background:#DADDDF"></i>zona em conferência</span></div>`),
    zona: `<p class="rotulo">Zoneamento 2024</p><div class="cat">${Object.entries(ZONAS_COR).map(([k, c]) => `<span><i style="background:${c}"></i>${k.replace(/(\D+)(\d)/, '$1-$2')}</span>`).join('')}</div>`,
    vago: `<p class="rotulo">Cadastro municipal</p><div class="cat"><span><i style="background:${COR.ocre}"></i>vago (territorial)</span><span><i style="background:#D3D7DA"></i>edificado (predial)</span></div>`,
  };
  L.innerHTML = T[S.tema];
  $('#seloNorma').innerHTML = `<b>Norma ${esc(S.lotes.norma)}</b> · ${esc(S.norma.gabarito_orla.regra)}. Estimativas; confira antes de decidir.`;
}

// ------------------------------------------------------------------ seleção e ficha
async function carregarEnvelopes() {
  if (!S.envelopes) S.envelopes = fetch(DADOS + 'envelopes.json').then((r) => r.json()).then((j) => j.lotes);
  return S.envelopes;
}

async function selecionar(id, { voar = true } = {}) {
  const f = S.porId.get(id); if (!f) return;
  S.selecionado = id;
  history.replaceState(null, '', `#lote=${id}`);
  S.mapa.setFilter('lote-sel', ['==', ['get', 'id'], id]);
  abrirAba('lote');
  const env = (await carregarEnvelopes())[id];
  renderFicha(f.properties, env);
  // envelope 3D
  const feats = [];
  if (env) {
    const cores = ['#7E8A95', '#6E7A85', '#5E6A75'];
    env.p.forEach(([n, area, to, parcial, gi]) => {
      const g = env.g[gi]; if (!g) return;
      const base = 0.15 + 2.8 * (n - 1), topo = 0.15 + 2.8 * n - 0.25;
      g.forEach((poly) => feats.push({ type: 'Feature', properties: { n, base, topo, parcial: !!parcial, cor: cores[n % 3] }, geometry: { type: 'Polygon', coordinates: poly } }));
    });
  }
  S.mapa.getSource('envelope').setData({ type: 'FeatureCollection', features: feats });
  if (voar) {
    const b = limites(f.geometry);
    const padL = window.innerWidth > 820 ? 60 : 30;
    S.mapa.fitBounds(b, { padding: { top: 90, bottom: window.innerWidth > 820 ? 90 : window.innerHeight * 0.62, left: padL, right: 80 }, maxZoom: 18.2, pitch: env ? 55 : S.mapa.getPitch(), bearing: env ? -20 : S.mapa.getBearing(), duration: 900 });
  }
}

function limites(g) {
  let a = [180, 90, -180, -90];
  JSON.stringify(g.coordinates).replace(/\[(-?[\d.]+),(-?[\d.]+)\]/g, (_, x, y) => { x = +x; y = +y; a = [Math.min(a[0], x), Math.min(a[1], y), Math.max(a[2], x), Math.max(a[3], y)]; });
  return [[a[0], a[1]], [a[2], a[3]]];
}

const NIVEIS = [
  { n: 1, nome: 'Potencial Construtivo', pergunta: 'O que a legislação permite construir neste terreno?', acresce: 'Matrícula e área real, poligonal, topografia, consulta prévia, envelope em 3D com corte, cenários normativos.' },
  { n: 2, nome: 'Viabilidade Arquitetônica', pergunta: 'O que construir aqui, e como?', acresce: 'Partido e implantação, cenários de massa, planta-tipo, mix de unidades, vagas, eficiência e quadro de áreas (NBR 12721).' },
  { n: 3, nome: 'Viabilidade Econômico-Financeira', pergunta: 'O empreendimento vale a pena, e por quanto?', acresce: 'Preço por m² por comparáveis, custo de obra, VGV, resultado, valor residual do terreno, sensibilidade e riscos.' },
  { n: 4, nome: 'Análise de Contexto Urbano', pergunta: 'O que o lugar oferece e pede ao empreendimento?', acresce: 'Morfologia recente, apropriação diurna e noturna, origem-destino, ecossistema, perfil de público e atributos de valor.' },
];

function renderFicha(p, env) {
  const z = S.norma.zonas[p.zona] || {};
  const G = S.norma.gabarito_orla;
  const salvo = S.salvos.has(p.id);
  const end = `${p.logr}${p.num ? ', ' + p.num : ''}`;
  const temEnv = !!(env && p.area_to);
  const etqs = [
    p.vago ? '<span class="etq vago">Vago</span>' : '<span class="etq">Edificado</span>',
    p.zona ? `<span class="etq">${esc(p.zona.replace(/(\D+)(\d)/, '$1-$2'))}</span>` : '',
    p.na_faixa ? '<span class="etq faixa">Faixa de 500 m da orla</span>' : '<span class="etq">Fora da faixa da orla</span>',
    p.zona_parcial ? '<span class="etq alerta">Mais de uma zona</span>' : '',
    p.area < 360 ? '<span class="etq alerta">Lote pequeno</span>' : '',
  ].join('');

  let sintese;
  if (z.nao_edificante) {
    sintese = `<div class="sintese"><p class="rotulo">Leitura Herma</p><div class="grande">Não edificável</div><p>O lote está em ${esc(z.nome)}. A ocupação depende de regras ambientais específicas.</p></div>`;
  } else if (temEnv) {
    const pv = `${p.pav_completos}${p.pav_parciais ? ' + ' + p.pav_parciais + ' parcial' : ''}`;
    const lim = { altura: 'a altura (gabarito da orla)', 'índice': 'o índice de aproveitamento máximo', afastamentos: 'os afastamentos, pela forma do lote' }[p.limitante];
    sintese = `<div class="sintese"><p class="rotulo">Leitura Herma · estimativa</p>
      <div class="grande">${fmt(p.area_to)}<small>m² construídos</small></div>
      <p>Acima do solo, em ${pv} pavimentos, com taxa de ocupação de ${fmt(z.to * 100)}%. Quem limita é ${lim}.</p>
      <div class="trio"><div><b>${pv}</b><span>pavimentos</span></div><div><b>${fmt(p.ia_efetivo, 2)}</b><span>índice efetivo</span></div><div><b>${p.h_testada ? m(p.h_testada, 1) : '—'}</b><span>altura na testada</span></div></div></div>`;
  } else {
    sintese = `<div class="sintese"><p class="rotulo">Leitura Herma · estimativa</p>
      <div class="grande">${p.na_faixa ? `${p.pav_alt_frente}${p.pav_alt_fundo > p.pav_alt_frente ? '–' + p.pav_alt_fundo : ''}<small>pavimentos pela altura</small>` : 'Fora da faixa'}</div>
      <p>${p.na_faixa ? `A altura máxima vai de ${m(p.h_testada, 1)} na testada a ${m(p.h_fundo, 1)} no fundo do lote.` : 'A altura não é limitada pelo gabarito da orla; outros parâmetros decidem.'} Os parâmetros da ${esc(z.nome || p.zona)} ainda estão em conferência; por isso a área construída não é estimada aqui.</p></div>`;
  }

  const parametros = z.conferido ? `
    <dl class="linhas">
      <div><dt>Zona</dt><dd>${esc(p.zona.replace(/(\D+)(\d)/, '$1-$2'))}, ${esc(z.nome)}</dd></div>
      <div><dt>Índice básico</dt><dd>${fmt(z.ia_basico, 1)} · ${m2(p.area_basica)}<small>Gratuito</small></dd></div>
      <div><dt>Índice máximo</dt><dd>${fmt(z.ia_maximo, 1)} · ${m2(p.area_maxima)}<small>Acima do básico, por outorga onerosa ou transferência do direito de construir</small></dd></div>
      <div><dt>Taxa de ocupação</dt><dd>${fmt(z.to * 100)}% · ${m2(p.projecao_to)} de projeção</dd></div>
      <div><dt>Área permeável</dt><dd>${fmt(z.permeavel * 100)}% · ${m2(p.area * z.permeavel)}</dd></div>
      <div><dt>Afastamentos</dt><dd>Frontal ${m(z.afast_frontal, 2)} nas testadas<small>Lateral 1,50 m até o 3º pav., 3,00 m no 4º, depois 3,0 + 0,30 por pavimento</small></dd></div>
    </dl><p class="nota">${esc(z.base_legal)}. ${esc(z.status)}.</p>`
    : `<dl class="linhas"><div><dt>Zona</dt><dd>${esc((p.zona || '—').replace(/(\D+)(\d)/, '$1-$2'))}${z.nome ? ', ' + esc(z.nome) : ''}<small>Parâmetros em conferência pela Odisse</small></dd></div></dl>`;

  const gabarito = p.na_faixa ? `
    <dl class="linhas">
      <div><dt>Distância à orla</dt><dd>${m(p.dmin, 1)} a ${m(p.dmax, 1)}<small>Da testada mais próxima ao ponto mais distante, até a 1ª quadra</small></dd></div>
      <div><dt>Altura máxima</dt><dd>${m(p.h_testada)} a ${m(p.h_fundo)}<small>${esc(G.formula)}</small></dd></div>
      <div><dt>Pavimentos</dt><dd>${p.pav_alt_frente} na frente${p.pav_alt_fundo > p.pav_alt_frente ? `, ${p.pav_alt_fundo} no fundo` : ''}<small>Piso a piso de 2,80 m; último pavimento pela regra do meio pé-direito</small></dd></div>
    </dl>${corteSVG(p, env)}`
    : `<p>O lote começa a ${m(p.dmin, 0)} da orla, fora da faixa de 500 m. A altura não é limitada pelo gabarito da orla; restrições aeronáuticas e demais parâmetros devem ser verificados.</p>`;

  let envelope = '';
  if (temEnv) {
    const linhas = env.p.map(([n, a, to, parcial]) => `<tr class="${parcial ? 'parcial' : ''}"><td>${n === 1 ? 'Térreo' : n + 'º'}${parcial ? ' parcial' : ''}</td><td>${m(0.15 + 2.8 * n, 2)}</td><td>${fmt(a)}</td><td>${fmt(to)}</td></tr>`).join('');
    envelope = `<section class="secao"><h3><span class="sec-n">1.4</span>Envelope legal</h3>
      <p>O sólido máximo que afastamentos e altura permitem, pavimento a pavimento. Não é uma proposta de massa.</p>
      <table class="pavs"><thead><tr><th>Pav.</th><th>Laje</th><th>Envelope m²</th><th>Com TO m²</th></tr></thead>
      <tbody>${linhas}</tbody><tfoot><tr><td>Total</td><td></td><td>${fmt(p.area_envelope)}</td><td>${fmt(p.area_to)}</td></tr></tfoot></table></section>`;
    const tetos = [
      ['Índice máximo', p.area_maxima, p.limitante === 'índice'],
      ['Envelope geométrico', p.area_envelope, false],
      ['Envelope com TO', p.area_to, p.limitante !== 'índice'],
      ['Índice básico, gratuito', p.area_basica, false],
    ];
    const mx = Math.max(...tetos.map((t) => t[1]));
    envelope += `<section class="secao"><h3><span class="sec-n">1.6</span>Fator limitante</h3>
      <p>Três tetos incidem sobre a área construída; vale o menor.</p>
      <div class="tetos">${tetos.map(([r, v, l]) => `<div class="teto ${l ? 'limite' : ''}"><div class="rot"><span>${r}</span><b>${m2(v)}</b></div><div class="barra"><i style="width:${(100 * v / mx).toFixed(1)}%"></i></div></div>`).join('')}</div>
      <p class="nota">${p.acima_basico > 0 ? `Até ${m2(p.acima_basico)} acima do índice básico dependem de outorga onerosa ou transferência do direito de construir. ` : ''}Garagem em subsolo fica fora desse total. Área não computável (art. 55) depende do projeto.</p></section>`;
  }

  const riscos = [
    p.na_faixa ? ['alto', 'Regime de altura da orla em disputa: o art. 62 da LUOS foi anulado pelo TJPB e o tema está em revisão no Plano Diretor.'] : null,
    ['medio', 'Geometria cadastral: área real, poligonal e testadas dependem de matrícula e levantamento.'],
    z.conferido ? ['medio', 'Índice máximo e quadros do Anexo V a conferir na versão consolidada da LUOS.'] : ['medio', 'Parâmetros desta zona ainda não conferidos pela Odisse.'],
    p.zona_parcial ? ['medio', 'O lote toca mais de uma zona; a leitura usou a predominante.'] : null,
    ['baixo', 'Restrições aeronáuticas, ambientais e de alargamento viário não verificadas.'],
  ].filter(Boolean);

  $('#ficha').className = '';
  $('#ficha').innerHTML = `
    <header class="aba-cab">
      <div class="ficha-topo">
        <p class="rotulo">Estudo do lote · ${esc(p.setor)}.${esc(p.quadra)}.${esc(p.lote)}</p>
        <div class="ficha-acoes">
          <button class="ico-bt ${salvo ? 'on' : ''}" id="btSalvar" title="${salvo ? 'Remover dos salvos' : 'Salvar lote'}" aria-pressed="${salvo}"><svg viewBox="0 0 24 24"><path d="M6 3h12v18l-6-4-6 4z"/></svg></button>
          <button class="ico-bt" id="btCompartilhar" title="Copiar link do lote"><svg viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg></button>
        </div>
      </div>
      <h2 class="titulo-m">${esc(end)}.</h2>
      <p class="lead">Lote ${esc(p.lote)}, quadra ${esc(p.quadra)}, setor ${esc(p.setor)} · Jardim Oceania · ${m2(p.area)} cadastrais.</p>
      <div class="etiquetas">${etqs}</div>
    </header>
    ${sintese}
    <section class="secao"><h3><span class="sec-n">1.1</span>Terreno</h3>
      <dl class="linhas">
        <div><dt>Cadastro</dt><dd>Setor ${esc(p.setor)} · quadra ${esc(p.quadra)} · lote ${esc(p.lote)}</dd></div>
        <div><dt>Endereço</dt><dd>${esc(end)}</dd></div>
        <div><dt>Área</dt><dd>${m2(p.area)}<small>Medida na geometria cadastral; confrontar com a matrícula</small></dd></div>
        <div><dt>Situação</dt><dd>${p.vago ? 'Territorial (sem edificação no cadastro)' : 'Predial (com edificação no cadastro)'}</dd></div>
      </dl></section>
    <section class="secao"><h3><span class="sec-n">1.2</span>Parâmetros</h3>${parametros}</section>
    <section class="secao"><h3><span class="sec-n">1.3</span>Gabarito da orla</h3>${gabarito}</section>
    ${envelope}
    <section class="secao"><h3><span class="sec-n">1.7</span>Riscos</h3>
      <div class="riscos">${riscos.map(([g, t]) => `<div class="risco"><span class="grau ${g}">${{ alto: 'Alto', medio: 'Médio', baixo: 'Baixo' }[g]}</span><span>${esc(t)}</span></div>`).join('')}</div>
      <p class="nota">Norma ${esc(S.lotes.norma)} · ${esc(S.norma.rotulo)}. ${esc(G.nota)}</p></section>
    <section class="secao"><h3>Para ir além da leitura</h3>
      <p>A Herma mostra uma prévia do primeiro nível. O estudo do Odisse é um documento único, com capítulos que crescem a cada nível contratado.</p>
      <div class="funil">
        <div class="nivel livre"><span class="nn">0</span><div><b>Leitura Herma <span class="tag">Gratuita</span></b><span>Zona, gabarito, envelope e área estimados a partir do cadastro. Esta ficha.</span></div></div>
        ${NIVEIS.map((n) => `<div class="nivel"><span class="nn">${n.n}</span><div><b>${n.nome}</b><span>${n.acresce}</span></div></div>`).join('')}
      </div></section>
    <div class="cta"><button class="bt forte" id="btSolicitar">Solicitar estudo deste terreno</button></div>`;

  $('#btSalvar').addEventListener('click', () => { alternarSalvo(p.id); renderFicha(p, env); });
  $('#btCompartilhar').addEventListener('click', async (e) => {
    const url = location.href.split('#')[0] + '#lote=' + p.id;
    try { await navigator.clipboard.writeText(url); e.currentTarget.title = 'Link copiado'; e.currentTarget.classList.add('on'); } catch (err) { prompt('Link do lote:', url); }
  });
  $('#btSolicitar').addEventListener('click', () => abrirDialogo([p.id]));
  $('#ficha').closest('.aba').scrollTop = 0;
}

function corteSVG(p, env) {
  // corte esquemático perpendicular à orla: distância × altura
  const G = S.norma.gabarito_orla;
  const W = 320, H = 150, ml = 26, mr = 8, mt = 10, mb = 22;
  const d0 = Math.max(0, p.dmin - 12), d1 = Math.min(p.dmax + 12, p.dmin + 260);
  const hTop = Math.max(p.h_fundo || 0, 0.15 + 2.8 * ((env?.p.length) || p.pav_alt_fundo || 1)) + 4;
  const x = (d) => ml + (d - d0) / (d1 - d0) * (W - ml - mr);
  const y = (h) => H - mb - h / hTop * (H - mt - mb);
  const alt = (d) => Math.min(G.hmax, G.h0 + G.inclinacao * d);
  const frente = p.dmin + 5, fundo = Math.min(p.dmax - 5, d1);
  let pav = '';
  const nPav = env ? env.p.length : (p.pav_alt_fundo || 0);
  for (let n = 1; n <= nPav; n++) {
    const meio = 0.15 + 2.8 * (n - 1) + 1.4;
    const dn = Math.max(frente, (meio - G.h0) / G.inclinacao);
    if (dn >= fundo) continue;
    const parcial = dn > frente + 0.5;
    pav += `<rect x="${x(dn).toFixed(1)}" y="${y(0.15 + 2.8 * n).toFixed(1)}" width="${(x(fundo) - x(dn)).toFixed(1)}" height="${(y(0.15 + 2.8 * (n - 1)) - y(0.15 + 2.8 * n) - 1).toFixed(1)}" fill="${parcial ? COR.ambar : '#8A949D'}" />`;
  }
  const ticks = [0, 10, 20, 30].filter((h) => h < hTop).map((h) => `<line x1="${ml}" x2="${W - mr}" y1="${y(h)}" y2="${y(h)}" stroke="#D7DADD" stroke-width=".6"/><text x="${ml - 4}" y="${y(h) + 3}" text-anchor="end">${h}</text>`).join('');
  return `<figure class="corte"><svg viewBox="0 0 ${W} ${H}" font-family="Inter" font-size="8.5" fill="${COR.ardosia2}" role="img" aria-label="Corte esquemático do gabarito">
    ${ticks}
    <rect x="${x(p.dmin)}" y="${y(0)}" width="${x(p.dmax > d1 ? d1 : p.dmax) - x(p.dmin)}" height="4" fill="${COR.ardosia}"/>
    ${pav}
    <line x1="${x(d0)}" y1="${y(alt(d0))}" x2="${x(d1)}" y2="${y(alt(d1))}" stroke="${COR.ocre}" stroke-width="1.6" stroke-dasharray="4 3"/>
    <line x1="${x(frente)}" x2="${x(frente)}" y1="${y(0)}" y2="${mt}" stroke="${COR.ardosia}" stroke-width=".6" stroke-dasharray="2 2"/>
    <text x="${x(d1) - 2}" y="${y(alt(d1)) - 5}" text-anchor="end" fill="${COR.ocre}" font-weight="600">gabarito ${fmt(alt(d1), 1)} m</text>
    <text x="${x(p.dmin)}" y="${H - 6}">testada · ${fmt(p.dmin, 0)} m da orla</text>
    <text x="${W - mr}" y="${H - 6}" text-anchor="end">← mar</text>
  </svg><figcaption>Corte esquemático, perpendicular à orla. Barras: pavimentos admitidos; em âmbar, parciais. Tracejado: afastamento frontal de 5 m.</figcaption></figure>`;
}

// ------------------------------------------------------------------ salvos
function alternarSalvo(id) {
  S.salvos.has(id) ? S.salvos.delete(id) : S.salvos.add(id);
  guardar('herma.salvos', [...S.salvos]);
  atualizarSalvos();
}
function atualizarSalvos() {
  const c = $('#contSalvos'); c.hidden = !S.salvos.size; c.textContent = S.salvos.size;
  const L = $('#listaSalvos');
  const ids = [...S.salvos].filter((id) => S.porId.has(id));
  if (!S.porId.size) return;
  if (!ids.length) { L.innerHTML = '<p class="vazio">Nenhum lote salvo ainda. Use o marcador na ficha do lote.</p>'; return; }
  const P = ids.map((id) => S.porId.get(id).properties);
  const linha = (rot, fn) => `<tr><td>${rot}</td>${P.map((p) => `<td>${fn(p)}</td>`).join('')}</tr>`;
  L.innerHTML = `<div style="overflow-x:auto"><table class="cmp"><thead><tr><th></th>${P.map((p) => `<th><button data-ir="${p.id}">${esc(p.quadra)}.${esc(p.lote)}</button><br><a href="#" class="rm" data-rm="${p.id}">remover</a></th>`).join('')}</tr></thead><tbody>
    ${linha('Endereço', (p) => esc(p.logr) + (p.num ? ', ' + esc(p.num) : ''))}
    ${linha('Área', (p) => m2(p.area))}
    ${linha('Zona', (p) => esc(p.zona || '—'))}
    ${linha('Situação', (p) => (p.vago ? 'Vago' : 'Edificado'))}
    ${linha('Altura na testada', (p) => (p.h_testada ? m(p.h_testada, 1) : 'fora da faixa'))}
    ${linha('Pavimentos', (p) => (p.pav ? `${p.pav_completos}${p.pav_parciais ? '+' + p.pav_parciais : ''}` : p.pav_alt_frente || '—'))}
    ${linha('Área estimada', (p) => (p.area_to ? m2(p.area_to) : '—'))}
    ${linha('Índice efetivo', (p) => (p.ia_efetivo ? fmt(p.ia_efetivo, 2) : '—'))}
  </tbody></table></div>
  <button class="bt forte" id="btSolicitarSalvos" style="width:100%">Solicitar estudo dos ${ids.length} lotes</button>
  <p class="nota">Com mais de um lote, o estudo traz um anexo de síntese comparativa.</p>`;
  $$('[data-ir]', L).forEach((b) => b.addEventListener('click', () => selecionar(b.dataset.ir)));
  $$('[data-rm]', L).forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); alternarSalvo(b.dataset.rm); }));
  $('#btSolicitarSalvos').addEventListener('click', () => abrirDialogo(ids));
}

// ------------------------------------------------------------------ filtros
function montarFiltros() {
  const zonas = [...new Set(S.lotes.features.map((f) => f.properties.zona).filter(Boolean))].sort();
  $('#chipsZona').innerHTML = zonas.map((z) => `<label><input type="checkbox" name="zona" value="${z}"><span>${z.replace(/(\D+)(\d)/, '$1-$2')}</span></label>`).join('');
  const F = $('#formFiltros');
  const ler = () => {
    const d = new FormData(F);
    const pav = +d.get('pav');
    $('#outPav').textContent = pav ? `${pav} ou mais` : 'qualquer';
    S.filtro = { vago: d.has('vago'), faixa: d.has('faixa'), zonas: d.getAll('zona'), amin: +d.get('amin') || 0, amax: +d.get('amax') || Infinity, pav, ordem: d.get('ordem') };
    S.mostrar = 40; aplicarFiltro();
  };
  F.addEventListener('input', ler);
  F.addEventListener('reset', () => setTimeout(ler));
  ler();
}
function passa(p, f) {
  if (!f) return true;
  if (f.vago && !p.vago) return false;
  if (f.faixa && !p.na_faixa) return false;
  if (f.zonas.length && !f.zonas.includes(p.zona)) return false;
  if (p.area < f.amin || p.area > f.amax) return false;
  if (f.pav && ((p.pav || p.pav_alt_frente || 0) < f.pav)) return false;
  return true;
}
function aplicarFiltro() {
  const f = S.filtro;
  const ativo = f && (f.vago || f.faixa || f.zonas.length || f.amin || f.amax < Infinity || f.pav);
  const res = [];
  S.lotes.features.forEach((ft) => {
    const p = ft.properties; const ok = passa(p, f);
    if (ok) res.push(p);
    S.mapa?.getSource('lotes') && S.mapa.setFeatureState({ source: 'lotes', id: p.id }, { fora: ativo && !ok });
  });
  const o = f?.ordem || 'area_to';
  res.sort((a, b) => (o === 'dmin' ? (a.dmin - b.dmin) : ((b[o] ?? -1) - (a[o] ?? -1))));
  S.filtrados = res;
  $('#nResultados').textContent = fmt(res.length);
  const L = $('#listaResultados');
  const val = (p) => o === 'area' ? m2(p.area) : o === 'h_testada' ? (p.h_testada ? m(p.h_testada, 1) : '—') : o === 'dmin' ? m(p.dmin, 0) : (p.area_to ? m2(p.area_to) : '—');
  const rot = { area_to: 'construídos', area: 'de lote', h_testada: 'na testada', dmin: 'da orla' }[o];
  L.innerHTML = res.slice(0, S.mostrar).map((p) => `<li><button data-id="${p.id}"><span class="r1">${esc(p.logr)}${p.num ? ', ' + esc(p.num) : ''}</span><span class="r2">${p.vago ? 'Vago · ' : ''}${m2(p.area)} · ${esc(p.zona || '')} · ${p.quadra}.${p.lote}</span><span class="r3">${val(p)}<small>${rot}</small></span></button></li>`).join('')
    + (res.length > S.mostrar ? `<li><button class="bt mais" id="btMais">Mostrar mais</button></li>` : '');
  $$('button[data-id]', L).forEach((b) => b.addEventListener('click', () => selecionar(b.dataset.id)));
  $('#btMais')?.addEventListener('click', () => { S.mostrar += 60; aplicarFiltro(); });
}

// ------------------------------------------------------------------ camadas
function montarCamadas() {
  $$('#opTema input').forEach((i) => i.addEventListener('change', () => {
    S.tema = i.value; S.mapa.setPaintProperty('lotes', 'fill-color', corTema(S.tema)); desenharLegenda();
  }));
  $$('[data-camada]').forEach((c) => c.addEventListener('change', () => {
    const v = c.checked ? 'visible' : 'none';
    S.mapa.setLayoutProperty(c.dataset.camada, 'visibility', v);
    if (c.dataset.camada === 'iso') rotularIso();
    if (c.dataset.camada === 'volumes' && c.checked && S.mapa.getPitch() < 5) alternar3D(true);
  }));
  $$('#segBase button').forEach((b) => b.addEventListener('click', () => trocarBase(b.dataset.base)));
}

// ------------------------------------------------------------------ busca
function normaliza(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
function montarBusca() {
  const I = $('#busca'), R = $('#buscaRes');
  const idx = S.lotes.features.map((f) => { const p = f.properties; return [normaliza(`${p.logr} ${p.num} ${p.id} ${p.quadra}.${p.lote} lote ${+p.lote} quadra ${+p.quadra}`), p]; });
  let foco = -1;
  const mostrar = () => {
    const q = normaliza(I.value).trim();
    if (q.length < 2) { R.hidden = true; return; }
    const termos = q.split(/\s+/);
    const res = idx.filter(([t]) => termos.every((x) => t.includes(x))).slice(0, 12).map(([, p]) => p);
    R.innerHTML = res.length ? res.map((p) => `<li><button data-id="${p.id}">${esc(p.logr)}${p.num ? ', ' + esc(p.num) : ''}<small>Quadra ${p.quadra}, lote ${p.lote} · ${m2(p.area)}${p.vago ? ' · vago' : ''}</small></button></li>`).join('') : '<li><button disabled>Nenhum lote encontrado no Jardim Oceania.</button></li>';
    R.hidden = false; foco = -1;
    $$('button[data-id]', R).forEach((b) => b.addEventListener('click', () => { selecionar(b.dataset.id); R.hidden = true; I.blur(); }));
  };
  I.addEventListener('input', mostrar);
  I.addEventListener('focus', mostrar);
  I.addEventListener('keydown', (e) => {
    const bs = $$('button[data-id]', R);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); foco = (foco + (e.key === 'ArrowDown' ? 1 : -1) + bs.length) % bs.length; bs.forEach((b, i) => b.classList.toggle('foco', i === foco)); }
    if (e.key === 'Enter' && bs.length) { (bs[foco] || bs[0]).click(); }
    if (e.key === 'Escape') { R.hidden = true; I.blur(); }
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('.busca')) R.hidden = true; });
}

// ------------------------------------------------------------------ solicitar estudo
let lotesPedido = [];
function montarDialogo() {
  $('#niveis').innerHTML = NIVEIS.map((n) => `<label><input type="checkbox" name="nivel" value="${n.n}" ${n.n <= 2 ? 'checked' : ''}><span><b>Nível ${n.n} · ${n.nome}</b><small>${n.pergunta}</small></span></label>`).join('');
  const montar = () => {
    const F = new FormData($('#formEstudo'));
    const niveis = F.getAll('nivel').map((n) => NIVEIS[n - 1].nome);
    const ls = lotesPedido.map((id) => { const p = S.porId.get(id).properties; return `• ${p.logr}${p.num ? ', ' + p.num : ''} (setor ${p.setor}, quadra ${p.quadra}, lote ${p.lote}; ${fmt(p.area)} m²)`; });
    const link = location.href.split('#')[0] + '#lote=' + lotesPedido[0];
    return [
      // o código entre colchetes identifica a origem do pedido no funil do vendas.odisse
      `Olá, Odisse. Vim pela Herma e quero um estudo aprofundado. [Herma ${lotesPedido[0]}${lotesPedido.length > 1 ? ' +' + (lotesPedido.length - 1) : ''}]`,
      '', `Terreno${ls.length > 1 ? 's' : ''} no Jardim Oceania:`, ...ls,
      '', `Níveis de interesse: ${niveis.join('; ') || 'a definir'}`,
      `Nome: ${F.get('nome') || ''}`, `Perfil: ${F.get('perfil')}`,
      F.get('email') ? `E-mail: ${F.get('email')}` : '', F.get('tel') ? `Telefone: ${F.get('tel')}` : '',
      F.get('msg') ? `\n${F.get('msg')}` : '', '', `Leitura Herma (norma ${S.lotes.norma}): ${link}`,
    ].filter((l) => l !== null).join('\n').replace(/\n{3,}/g, '\n\n');
  };
  const valido = () => { const n = $('#formEstudo [name=nome]'); if (!n.value.trim()) { n.reportValidity(); return false; } return true; };
  $('#btWhats').addEventListener('click', () => { if (!valido()) return; window.open(`https://wa.me/${WHATS}?text=${encodeURIComponent(montar())}`, '_blank', 'noopener'); });
  $('#btEmail').addEventListener('click', () => { if (!valido()) return; location.href = `mailto:${EMAIL}?subject=${encodeURIComponent('Herma · estudo de terreno no Jardim Oceania')}&body=${encodeURIComponent(montar())}`; });
}
function abrirDialogo(ids) {
  lotesPedido = ids;
  const p = S.porId.get(ids[0]).properties;
  $('#dlgTitulo').textContent = ids.length > 1 ? `${ids.length} terrenos no Jardim Oceania.` : `${p.logr}${p.num ? ', ' + p.num : ''}.`;
  $('#dlgEstudo').showModal();
}

// ------------------------------------------------------------------ textos
function preencherInicio() {
  const r = S.resumo;
  $('#numerosInicio').innerHTML = [
    [fmt(r.lotes), 'lotes lidos'], [fmt(r.vagos), 'terrenos vagos'],
    [fmt(r.na_faixa), 'na faixa de 500 m da orla'], [fmt(r.area_vagos / 10000, 1) + ' ha', 'em terrenos vagos'],
  ].map(([b, s]) => `<div class="n"><b>${b}</b><span>${s}</span></div>`).join('');
}
function preencherBairro() {
  const r = S.resumo;
  const precos = [['Bessa', 8558], ['Altiplano', 10645], ['Jardim Oceania', 10991, true], ['Cabo Branco', 12516]];
  const mx = 12516;
  $('#bairroConteudo').innerHTML = `
    <section class="secao"><h3>Preço anunciado por m²</h3><p>FipeZap, outubro de 2026.</p>
      <div class="mercado">${precos.map(([n, v, e]) => `<div class="m ${e ? 'este' : ''}"><span>${n}</span><i style="width:${(100 * v / mx).toFixed(0)}%"></i><b>R$ ${fmt(v)}</b></div>`).join('')}</div></section>
    <section class="secao"><h3>Demanda</h3>
      <dl class="linhas">
        <div><dt>Preferência de compra</dt><dd>Bessa, 1º lugar<small>26% dos entrevistados · Consult, 2025</small></dd></div>
        <div><dt>Buscas de compra</dt><dd>Bessa, 1º lugar<small>9,84% das buscas · DataZAP</small></dd></div>
        <div><dt>Vendas, mai/2026</dt><dd>Jardim Oceania, 3º lugar<small>24 de 215 unidades; Bessa em 2º, com 27</small></dd></div>
      </dl></section>
    <section class="secao"><h3>Território</h3>
      <dl class="linhas">
        <div><dt>Lotes</dt><dd>${fmt(r.lotes)}<small>${fmt(r.vagos)} vagos, ${fmt(r.vagos_na_faixa)} deles na faixa da orla</small></dd></div>
        <div><dt>Zonas</dt><dd>${Object.entries(r.zonas).sort((a, b) => b[1] - a[1]).map(([z, n]) => `${z.replace(/(\D+)(\d)/, '$1-$2')}: ${fmt(n)}`).join(' · ')}</dd></div>
        <div><dt>Ponto crítico</dt><dd>Gabarito da orla<small>Na faixa de 500 m, a altura cresce de 12,90 m a 35 m. O cálculo lote a lote é o que a Herma acrescenta.</small></dd></div>
      </dl></section>
    <p class="nota">A Herma começa pelo Jardim Oceania e vai se expandir pelo Bessa e pela orla.</p>`;
}
function preencherSobre() {
  const G = S.norma.gabarito_orla;
  $('#sobreNorma').innerHTML = `Os cálculos desta versão usam a norma <b>${esc(S.lotes.norma)}</b> (${esc(S.norma.rotulo)}): ${esc(G.regra)}. ${esc(G.nota)} Quando a regra mudar, uma nova versão é publicada e a anterior continua registrada.`;
}

function lerHash() { return Object.fromEntries(location.hash.slice(1).split('&').filter(Boolean).map((kv) => kv.split('='))); }
window.addEventListener('hashchange', () => { const h = lerHash(); if (h.lote && h.lote !== S.selecionado) selecionar(h.lote); });

iniciar().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML('beforeend', `<div style="position:fixed;inset:auto 16px 16px auto;background:#A4473B;color:#fff;padding:10px 14px;border-radius:8px;font:13px Inter,sans-serif;z-index:9">Não foi possível carregar os dados da Herma. Abra o site por um servidor (veja o README).</div>`);
});
