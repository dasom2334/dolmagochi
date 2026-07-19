import numpy as np

g2 = np.load('refgrid_v2.npy').astype(float)   # 디라이팅 그리드 (잔광 있음)

def box_blur1(a, r):
    for axis in (0,1):
        pad = [(r,r) if i==axis else (0,0) for i in range(2)]
        ap = np.pad(a, pad, mode='edge')
        c = np.cumsum(ap, axis=axis)
        n = 2*r+1
        sl0=[slice(None)]*2; sl1=[slice(None)]*2
        sl0[axis]=slice(n-1,None); sl1[axis]=slice(None,-n)
        z=list(c.shape); z[axis]=1
        a = (c[tuple(sl0)] - np.concatenate([np.zeros(z), c[tuple(sl1)]],axis=axis))/n
    return a

lum = g2.mean(2)
L = box_blur1(box_blur1(lum, 3), 3)
ratio = np.clip(lum/np.maximum(L,15), 0.62, 1.45)
chroma = g2 - lum[:,:,None]

# 중립 타깃: 판자 밴드 2톤 교차 + 러그 마룬
def hexc(h): return np.array([int(h[i:i+2],16) for i in (1,3,5)], float)
WOOD=[hexc('#52404b'), hexc('#5b4854')]
RUG = hexc('#6f3c4e')
bands=[(49,3),(52,4),(56,5),(61,6),(67,5)]
def band_idx(y):
    for i,(y0,h) in enumerate(bands):
        if y0<=y<y0+h: return i%2
    return 0
def in_rug(y,x):
    if not (53<=y<=66): return False
    t=(y-53)/13
    return round(30-8*t)<=x<=round(66+5*t)
def is_prop(y,x):
    r=g2[y,x,0]
    if 57<=y<=61 and 10<=x<=21 and r>140: return True
    if 58<=y<=63 and 24<=x<=29 and r>140: return True
    return False

out = g2.copy()
for y in range(49,72):
    for x in range(96):
        if is_prop(y,x): continue
        tgt = RUG if in_rug(y,x) else WOOD[band_idx(y)]
        out[y,x] = tgt*ratio[y,x] + chroma[y,x]*0.35
out = np.clip(out,0,255).astype(np.uint8)
np.save('refgrid_v3.npy', out)

from PIL import Image
Image.fromarray(out).resize((960,720), Image.NEAREST).save('ref_v3.png')
print('ok — floor sample:', out[55,10], out[58,48], '(rug)', out[60,50])
