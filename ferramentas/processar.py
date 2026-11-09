"""Herma — processamento do piloto Jardim Oceania.

Lê o pacote extraído do WFS Filipeia (SEPLAN/PMJP) e gera os dados derivados
que o site usa: leitura de cada lote (zona, distância à orla, gabarito,
envelope legal estimado por pavimento) e as camadas de contexto.

Uso:  python ferramentas/processar.py ferramentas/.blob-local.txt
Saída: dados/jardim-oceania/*.json

Os dados brutos não são redistribuídos: o repositório guarda apenas o
resultado derivado, com geometria simplificada, citando a fonte.
"""
import json, math, sys, os
from collections import Counter
sys.path.insert(0, os.path.dirname(__file__))
from blob import ler
from shapely.geometry import Polygon, LineString, Point, MultiPolygon, box
from shapely.ops import unary_union, transform
from shapely.strtree import STRtree
from shapely.validation import make_valid
from pyproj import Transformer

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NORMAS = json.load(open(os.path.join(RAIZ, 'dados', 'normas.json'), encoding='utf-8'))
V = NORMAS['vigente']; N = NORMAS['versoes'][V]
G = N['gabarito_orla']; PAV = N['pavimento']
TOWGS = Transformer.from_crs(31985, 4326, always_xy=True).transform

MINUSC = {'de', 'da', 'do', 'das', 'dos', 'e', 'di', 'du'}
def nome_rua(s):
    ps = s.strip().title().split()
    return ' '.join(w.lower() if (i and w.lower() in MINUSC) else w for i, w in enumerate(ps))

def poly(rings):
    ps = [make_valid(Polygon(r)) for r in rings if len(r) >= 3]
    g = unary_union(ps)
    if g.geom_type == 'GeometryCollection':
        g = unary_union([x for x in g.geoms if x.area > 0])
    return g

def polys(g):
    if g.is_empty: return []
    if g.geom_type == 'Polygon': return [g]
    if g.geom_type in ('MultiPolygon', 'GeometryCollection'):
        return [x for x in g.geoms if x.geom_type == 'Polygon' and x.area > 0.5]
    return []

def wgs(g, nd=6):
    out = []
    for p in polys(g):
        p = transform(TOWGS, p)
        out.append([[ [round(x, nd), round(y, nd)] for x, y in p.exterior.coords ]])
    return out

def feat(g, props, nd=6):
    cs = wgs(g, nd)
    if not cs: return None
    geom = {'type': 'Polygon', 'coordinates': cs[0]} if len(cs) == 1 else {'type': 'MultiPolygon', 'coordinates': cs}
    return {'type': 'Feature', 'properties': props, 'geometry': geom}

def altura(D):
    """Gabarito da orla na distância D (m). None fora da faixa."""
    if D > G['faixa']: return None
    return min(G['hmax'], G['h0'] + G['inclinacao'] * D)

def laje(n):  # cota da laje de cobertura do pavimento n (1 = térreo)
    return PAV['soleira'] + PAV['piso_a_piso'] * n

def d_minimo_pav(n):
    """Distância à orla a partir da qual o pavimento n é admitido (regra do meio pé-direito)."""
    h = laje(n - 1) + PAV['piso_a_piso'] / 2
    if h > G['hmax']: return math.inf
    return max(0.0, (h - G['h0']) / G['inclinacao'])

def lateral(z, n):
    lat = z['afast_lateral']
    if n <= len(lat): return lat[n - 1]
    base, passo = z['progressivo']
    return base + (n - 4) * passo

def main(path):
    S = ler(path)
    # ---------- linha de referência: borda voltada ao mar da 1ª faixa ----------
    F = [poly(rs) for _, rs in S['FAIXAS']]
    sea = [p for p in S['FAIXAS'][0][1][0] if Point(p).distance(F[1]) > 1.0]
    sea.sort(key=lambda p: p[1])
    REF = LineString(sea)
    FAIXA500 = unary_union(F)

    zonas = [(p[0], poly(rs)) for p, rs in S['ZON']]
    bairros = {p[0]: poly(rs) for p, rs in S['BAIRROS']}
    JO = bairros['JARDIM OCEANIA']

    lotes = []
    for p, rs in S['LOTES']:
        g = poly(rs)
        if g.is_empty or g.area < 5: continue
        lotes.append(dict(id=p[0], logr=nome_rua(p[1]), num=p[2], tipo=p[3], g=g))
    tree = STRtree([l['g'] for l in lotes])

    saida, envelopes = [], {}
    for i, l in enumerate(lotes):
        g = l['g']; A = g.area
        c = g.representative_point()
        # zona por maior sobreposição
        zs = sorted(((z.intersection(g).area, s) for s, z in zonas if z.intersects(g)), reverse=True)
        zona = zs[0][1] if zs else None
        zona_parcial = len([1 for a, s in zs if a > 0.05 * A and s != zona]) > 0
        # vizinhos e testadas
        viz = [lotes[j]['g'] for j in tree.query(g.buffer(1.0)) if j != i]
        vizu = unary_union(viz) if viz else Polygon()
        testadas, divisas = [], []
        for pg in polys(g):
            cs = list(pg.exterior.coords)
            for a, b in zip(cs[:-1], cs[1:]):
                seg = LineString([a, b])
                if seg.length < 0.3: continue
                m = seg.interpolate(0.5, normalized=True)
                (divisas if (not vizu.is_empty and m.distance(vizu) < 1.0) else testadas).append(seg)
        n_testadas = len(unary_union(testadas).geoms) if len(testadas) > 1 and unary_union(testadas).geom_type == 'MultiLineString' else (1 if testadas else 0)
        dmin = REF.distance(g); dmax = max(REF.distance(Point(x)) for pg in polys(g) for x in pg.exterior.coords)
        na_faixa = dmin <= G['faixa']
        hmin = altura(dmin); hmax = altura(min(dmax, G['faixa'])) if na_faixa else None
        # faixa (art. 62, só para referência)
        faixa_n = None
        for k, f in enumerate(F):
            if f.contains(c): faixa_n = k + 1
        props = dict(id=l['id'], setor=l['id'][0:2], quadra=l['id'][2:5], lote=l['id'][5:], logr=l['logr'], num=l['num'],
                     vago=l['tipo'] == 'T', area=round(A), zona=zona, zona_parcial=zona_parcial,
                     dmin=round(dmin, 1), dmax=round(dmax, 1), na_faixa=na_faixa,
                     h_testada=round(hmin, 2) if hmin else None, h_fundo=round(hmax, 2) if hmax else None,
                     faixa62=faixa_n)
        if na_faixa:  # pavimentos admitidos só pela altura, na face frontal edificável (testada + 5 m) e no fundo
            hf = altura(min(dmin + 5, G['faixa'])); hb = altura(min(dmax - 5, G['faixa'])) if dmax - 5 > dmin + 5 else hf
            nf = lambda h: int((h - PAV['soleira'] - PAV['piso_a_piso'] / 2) // PAV['piso_a_piso']) + 1
            props.update(pav_alt_frente=nf(hf), pav_alt_fundo=nf(hb))
        # ---------- envelope legal (zonas com parâmetros conferidos) ----------
        z = N['zonas'].get(zona or '', {})
        if z.get('conferido') and not z.get('nao_edificante'):
            proj_to = z['to'] * A
            teto_ia = z['ia_maximo'] * A
            tbuf = unary_union([s.buffer(z['afast_frontal'], cap_style=2) for s in testadas]) if testadas else Polygon()
            andares = []; total_env = 0; total_to = 0; limitante = None
            for n in range(1, 60):
                lat = lateral(z, n)
                dbuf = unary_union([s.buffer(lat, cap_style=2) for s in divisas]) if divisas else Polygon()
                fp = g.difference(tbuf).difference(dbuf)
                fp_geo = fp
                cortado = False
                if na_faixa:
                    dn = d_minimo_pav(n)
                    if dn == math.inf: limitante = limitante or 'altura'; break
                    if dn > 0:
                        corte = fp.difference(REF.buffer(dn, resolution=24))
                        cortado = corte.area < fp.area - 1
                        fp = corte
                fp = unary_union([p for p in polys(fp) if p.area > 8]) if polys(fp) else Polygon()
                if fp.is_empty or fp.area < 25:
                    if na_faixa and cortado: limitante = limitante or 'altura'
                    else: limitante = limitante or 'afastamentos'
                    break
                a_to = min(fp.area, proj_to)
                if total_to + a_to >= teto_ia:
                    a_to = teto_ia - total_to; limitante = 'índice'
                    andares.append(dict(n=n, env=round(fp.area), to=round(a_to), parcial=True, g=fp, lat=lat))
                    total_env += fp.area; total_to += a_to
                    break
                andares.append(dict(n=n, env=round(fp.area), to=round(a_to), parcial=cortado, g=fp, lat=lat))
                total_env += fp.area; total_to += a_to
            completos = len([a for a in andares if not a['parcial']])
            parciais = len(andares) - completos
            props.update(pav=len(andares), pav_completos=completos, pav_parciais=parciais,
                         area_envelope=round(total_env, -1), area_to=round(total_to, -1),
                         area_basica=round(z['ia_basico'] * A, -1), area_maxima=round(teto_ia, -1),
                         ia_efetivo=round(total_to / A, 2) if A else 0,
                         projecao_to=round(proj_to), limitante=limitante or 'altura',
                         acima_basico=round(max(0, total_to - z['ia_basico'] * A), -1))
            geoms, pav = [], []
            for a in andares:
                gg = wgs(a['g'].simplify(0.3), 6)
                if not geoms or geoms[-1] != gg: geoms.append(gg)
                pav.append([a['n'], a['env'], a['to'], 1 if a['parcial'] else 0, len(geoms) - 1])
            envelopes[l['id']] = {'g': geoms, 'p': pav}
        saida.append(feat(g.simplify(0.2), props, 6))

    saida = [f for f in saida if f]
    out = os.path.join(RAIZ, 'dados', 'jardim-oceania'); os.makedirs(out, exist_ok=True)
    dump = lambda nome, obj: json.dump(obj, open(os.path.join(out, nome), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    dump('lotes.geojson', {'type': 'FeatureCollection', 'norma': V, 'features': saida})
    dump('envelopes.json', {'norma': V, 'lotes': envelopes})
    # contexto
    vista = box(*JO.buffer(250).bounds)
    ctx = []
    for s, z in zonas:
        zz = z.intersection(vista)
        f = feat(zz.simplify(1), {'camada': 'zona', 'sigla': s}, 6)
        if f: ctx.append(f)
    for k, f in enumerate(F):
        x = feat(f.intersection(vista).simplify(1), {'camada': 'faixa', 'n': k + 1,
                 'h_ini': round(altura(REF.distance(f.exterior) if False else 0) or 0, 2)}, 6)
        if x: ctx.append(x)
    for nome, b in bairros.items():
        x = feat(b.simplify(1), {'camada': 'bairro', 'nome': nome.title()}, 6)
        if x: ctx.append(x)
    # mar: tudo a leste da linha de referência
    xs, ys = zip(*REF.coords)
    mar = Polygon(list(REF.coords) + [(max(xs) + 3000, ys[-1] + 400), (max(xs) + 3000, ys[0] - 400)])
    mar = mar.difference(FAIXA500).buffer(0)
    x = feat(mar.simplify(1), {'camada': 'mar'}, 6)
    if x: ctx.append(x)
    # isolinhas de gabarito a cada 50 m
    for d in range(0, G['faixa'] + 1, 50):
        ln = REF.parallel_offset(d, 'left', join_style=2) if d else REF
        if ln.is_empty: continue
        ln = transform(TOWGS, ln)
        lines = [ln] if ln.geom_type == 'LineString' else list(ln.geoms)
        for L in lines:
            ctx.append({'type': 'Feature', 'properties': {'camada': 'iso', 'd': d, 'h': round(altura(d), 1)},
                        'geometry': {'type': 'LineString', 'coordinates': [[round(a, 6), round(b, 6)] for a, b in L.coords]}})
    dump('contexto.geojson', {'type': 'FeatureCollection', 'features': ctx})

    # síntese do piloto
    dentro = [f['properties'] for f in saida if JO.contains(Point(0, 0)) or True]
    P = [f['properties'] for f in saida]
    resumo = dict(
        bairro='Jardim Oceania', norma=V, gerado=N['data'],
        lotes=len(P), vagos=sum(p['vago'] for p in P),
        na_faixa=sum(p['na_faixa'] for p in P), vagos_na_faixa=sum(p['vago'] and p['na_faixa'] for p in P),
        zonas=dict(Counter(p['zona'] for p in P)),
        area_vagos=round(sum(p['area'] for p in P if p['vago'])),
        centro=list(map(lambda v: round(v, 6), TOWGS(*JO.centroid.coords[0]))),
        limites=[round(v, 6) for v in (*TOWGS(*JO.bounds[:2]), *TOWGS(*JO.bounds[2:]))],
    )
    dump('resumo.json', resumo)
    print(json.dumps(resumo, ensure_ascii=False, indent=1))
    t = [f['properties'] for f in saida if f['properties']['id'] == '030770479']
    print(json.dumps(t, ensure_ascii=False, indent=1))
    print('envelope 479:', envelopes.get('030770479', {}).get('p'))
    for nome in ('lotes.geojson', 'envelopes.json', 'contexto.geojson'):
        print(nome, os.path.getsize(os.path.join(out, nome)) // 1024, 'KB')

if __name__ == '__main__':
    main(sys.argv[1])
