"""Leitura do pacote compacto extraído do WFS Filipeia (delta base36, decímetros, origem 296500/9215000, EPSG:31985)."""
O = (296500.0, 9215000.0)
def dec(s):
    pts=[];x=y=0
    for tok in s.split(' '):
        a,b=tok.split(',');x+=int(a,36);y+=int(b,36);pts.append((O[0]+x/10,O[1]+y/10))
    return pts
def ler(path):
    sec={};cur=None
    for l in open(path,encoding='utf-8').read().split('\n'):
        if l.startswith('#'):cur=l[1:];sec[cur]=[];continue
        if not l:continue
        parts=l.split(';');geo=parts[-1]
        rings=[dec(r) for r in geo.split('|') if r]
        sec[cur].append((parts[:-1],rings))
    return sec
