// Herma — extração do WFS Filipeia (SEPLAN/PMJP).
//
// O GeoServer da Prefeitura não envia CORS e falha em consultas grandes
// ("Não há espaço disponível no dispositivo") ou com BBOX sobre geometria 3D.
// O caminho que funciona: rodar este script no console do navegador, com uma
// aba aberta em https://filipeia.joaopessoa.pb.gov.br/geoserver/ows, buscando
// os lotes quadra a quadra (CQL_FILTER por CODI_CART).
//
// Resultado: baixa "herma-<bairro>-blob.txt", que entra em
//   python ferramentas/processar.py <arquivo>
//
// Formato do pacote: seções #LOTES, #ZON, #FAIXAS, #BAIRROS; cada linha tem
// atributos separados por ";" e, no fim, os anéis ("|") com coordenadas em
// decímetros, delta-codificadas em base 36, a partir de 296500 / 9215000
// (SIRGAS 2000 / UTM 25S, EPSG:31985).

(async () => {
  const BAIRRO = 'JARDIM OCEANIA';
  const BBOX = '296500,9215000,297950,9218050'; // envoltória do bairro, em EPSG:31985
  const O = [296500, 9215000];
  const W = '/geoserver/ows?service=WFS&version=1.0.0&request=GetFeature&outputFormat=application/json';
  const get = (q) => fetch(W + q).then((r) => r.json());

  const bairros = await get('&typeName=digeoc:Bairros&CQL_FILTER=' + encodeURIComponent(`N_BAIRRO LIKE '%OCEANIA%' OR N_BAIRRO LIKE '%BESSA%'`));
  const zon = await get('&typeName=digeoc:zoneamento2024&BBOX=' + BBOX);
  const faixas = await get('&typeName=digeoc:faixas&BBOX=' + BBOX);
  const quadras = await get('&typeName=digeoc:quadras_gerais&BBOX=' + BBOX);

  const chaves = [...new Set(quadras.features.map((f) => f.properties.setor + f.properties.qd_atual))];
  const lotes = []; let i = 0;
  await Promise.all([0, 1, 2, 3].map(async () => {
    while (i < chaves.length) {
      const k = chaves[i++];
      for (let t = 0; t < 3; t++) {
        try { lotes.push(...(await get('&typeName=digeoc:Lotes&CQL_FILTER=' + encodeURIComponent(`CODI_CART LIKE '${k}%'`))).features); break; } catch (e) { /* tenta de novo */ }
      }
    }
  }));

  const aneis = (g) => (!g ? [] : g.type === 'Polygon' ? g.coordinates : g.coordinates.flat());
  const BB = BBOX.split(',').map(Number);
  const recorta = (r) => { // Sutherland–Hodgman na envoltória
    let out = r.map((c) => [c[0], c[1]]);
    for (const [ax, v, s] of [[0, BB[0], 1], [0, BB[2], -1], [1, BB[1], 1], [1, BB[3], -1]]) {
      const inp = out; out = []; if (!inp.length) break;
      for (let j = 0; j < inp.length; j++) {
        const a = inp[j], b = inp[(j + 1) % inp.length], ia = (a[ax] - v) * s >= 0, ib = (b[ax] - v) * s >= 0;
        if (ia) out.push(a);
        if (ia !== ib) { const t = (v - a[ax]) / (b[ax] - a[ax]); out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]); }
      }
    }
    return out;
  };
  const cod = (r) => { let px = 0, py = 0; return r.map((c) => { const x = Math.round((c[0] - O[0]) * 10), y = Math.round((c[1] - O[1]) * 10); const s = (x - px).toString(36) + ',' + (y - py).toString(36); px = x; py = y; return s; }).join(' '); };
  const pip = (x, y, r) => { let c = false; for (let a = 0, b = r.length - 1; a < r.length; b = a++) { const [xi, yi] = r[a], [xj, yj] = r[b]; if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) c = !c; } return c; };
  const alvo = aneis(bairros.features.find((f) => f.properties.N_BAIRRO === BAIRRO).geometry);

  const vistos = new Set();
  const L = lotes.filter((f) => !vistos.has(f.properties.CODI_CART) && vistos.add(f.properties.CODI_CART)).filter((f) => {
    const r = aneis(f.geometry)[0]; const cx = r.reduce((s, c) => s + c[0], 0) / r.length, cy = r.reduce((s, c) => s + c[1], 0) / r.length;
    return alvo.some((R) => pip(cx, cy, R));
  }).map((f) => { const p = f.properties; return [p.CODI_CART, p.DESC_LOGR || '', p.NUME_IMOV === 'S/N' ? '' : (p.NUME_IMOV || ''), p.TIPO_IMOVE === 'TERRITORIAL' ? 'T' : 'P', aneis(f.geometry).map((r) => cod(r.slice(0, -1))).join('|')].join(';'); });
  const camada = (fc, rot) => fc.features.map((f) => { const rs = aneis(f.geometry).map(recorta).filter((r) => r.length > 2); return rs.length ? rot(f.properties) + ';' + rs.map(cod).join('|') : null; }).filter(Boolean).join('\n');

  const texto = ['#LOTES', L.join('\n'), '#ZON', camada(zon, (p) => p.sigla), '#FAIXAS', camada(faixas, (p) => p.Faixas), '#BAIRROS', camada(bairros, (p) => p.N_BAIRRO)].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([texto], { type: 'text/plain' }));
  a.download = `herma-${BAIRRO.toLowerCase().replace(/\s+/g, '-')}-blob.txt`;
  a.click();
  console.log(`Herma: ${L.length} lotes de ${chaves.length} quadras.`);
})();
