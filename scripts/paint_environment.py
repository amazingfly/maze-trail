"""Regenerate the jungle textures with NumPy, SciPy, and Pillow."""
import numpy as np
from scipy.ndimage import map_coordinates
from PIL import Image,ImageDraw
from pathlib import Path
import random
path=Path(__file__).resolve().parents[1] / 'site/3d/environment'; rng=np.random.default_rng(729); random.seed(729)
def field(w,h,n,m):
 y,x=np.mgrid[:h,:w]
 return map_coordinates(rng.uniform(-1,1,(m,n)),[y*m/h,x*n/w],order=3,mode='grid-wrap')
def save(name,rgb):
 Image.fromarray(np.uint8(np.clip(rgb,0,255))).save(path/(name+'.webp'),quality=90)
n=768;y,x=np.mgrid[:n,:n]/n
macro=field(n,n,5,5); grain=field(n,n,100,120); fine=rng.normal(size=(n,n))
warp=y+.035*field(n,n,4,4)+.009*field(n,n,13,8)
layers=warp*7
depth=layers%1
row=np.floor(layers).astype(int)
joint=np.abs(((x*3+.38*np.sin(row%7*2.7)+.047*field(n,n,7,9))%1)-.5)
seam=np.minimum(np.minimum(depth,1-depth),joint*2)
shade=19*macro+9*grain+4*fine-49*np.exp(-seam*38)+12*np.exp(-abs(depth-.05)*28)+5*np.sin(warp*220)+4*np.sin(warp*780)
moss=np.clip((macro+.40*grain-.16)*1.7,0,1)
save('strata',np.array([151,118,85])+shade[:,:,None]+moss[:,:,None]*[-53,-22,-37])
shade=15*field(n,n,5,6)+10*field(n,n,35,32)+6*grain+6*fine
im=Image.fromarray(np.uint8(np.clip(np.array([185,153,110])+shade[:,:,None],0,255)))
d=ImageDraw.Draw(im)
for i in range(1300):
 a,b=random.randrange(n),random.randrange(n);s=random.choice([1,2,3,4,7]);c=random.randrange(98,160)
 d.polygon([(a,b),(a+s,b-1),(a+s+1,b+1),(a+2,b+2)],fill=(c+32,c+6,c-28))
im.save(path/'trail.webp',quality=89)
w,h=2048,1024;y,x=np.mgrid[:h,:w]; elevation=np.cos(y/h*np.pi)
cloud=field(w,h,14,12)+.46*field(w,h,34,25)+.18*field(w,h,80,60)+.08*field(w,h,170,120)
sky=np.array([255,221,169])+(np.array([55,144,184])-np.array([255,221,169]))*np.clip(elevation*2,0,1)[:,:,None]
alpha=np.clip((cloud-.12)*1.8,0,1)*np.clip(elevation*7,0,1)
save('sky',sky*(1-.85*alpha[:,:,None])+np.array([255,245,217])*.85*alpha[:,:,None])
