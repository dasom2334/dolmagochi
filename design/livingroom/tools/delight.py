import numpy as np
from PIL import Image

g = np.load('refgrid.npy').astype(float)

def box_blur(a, r):
    for axis in (0,1):
        pad = [(r,r) if i==axis else (0,0) for i in range(2)]
        if a.ndim==3: pad += [(0,0)]
        ap = np.pad(a, pad, mode='edge')
        c = np.cumsum(ap, axis=axis)
        n = 2*r+1
        sl0 = [slice(None)]*a.ndim; sl1 = [slice(None)]*a.ndim
        sl0[axis] = slice(n-1, None); sl1[axis] = slice(None, -n)
        zshape = list(c.shape); zshape[axis] = 1
        a = (c[tuple(sl0)] - np.concatenate([np.zeros(zshape), c[tuple(sl1)]], axis=axis))/n
    return a

# 1) 휘도만 플랫필드: 광 웅덩이·글로우·비네트 제거, 색상(hue) 보존
lum = g.mean(axis=2)
L = lum.copy()
for _ in range(3): L = box_blur(L, 6)
L = np.maximum(L, 25)
target_lum = L.mean() * 1.12
albedo = g * (target_lum / L)[:, :, None]

# 2) 전역 웜캐스트 부분 중화 (노을이 곱한 색을 60%만 되돌림)
W = albedo.reshape(-1,3).mean(0)
W = W / W.mean()                    # 채널 상대 게인
albedo = albedo / (W[None,None,:] ** 0.6)

# 3) 소폭 채도 감소
l2 = albedo.mean(axis=2, keepdims=True)
albedo = l2 + (albedo - l2) * 0.88
albedo = np.clip(albedo, 0, 255)

np.save('refgrid_v2.npy', albedo.astype(np.uint8))
Image.fromarray(albedo.astype(np.uint8)).resize((960,720), Image.NEAREST).save('ref_delit.png')
print('wall:', albedo[20,10].astype(int), 'floor(중앙):', albedo[58,48].astype(int),
      'floor(가장자리):', albedo[58,5].astype(int), 'rug:', albedo[60,45].astype(int),
      'stone:', albedo[30,57].astype(int))
