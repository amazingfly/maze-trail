"""Bake seamless hedge leaves and fractured rock for the 3D maze."""
from pathlib import Path
import math
import random

import numpy as np
from PIL import Image, ImageDraw
from scipy.spatial import cKDTree
from scipy.ndimage import gaussian_filter

out = Path(__file__).resolve().parents[1] / 'site/3d/environment'
rng = np.random.default_rng(908)
rand = random.Random(908)
size = 768
y, x = np.mgrid[:size, :size]
def noise(radius):
    data = gaussian_filter(rng.normal(size=x.shape), radius, mode='wrap')
    return data / data.std()

sites = rng.random((67, 2))
points = np.stack(((x+7*noise(19)+2*noise(4))/size, (y+8*noise(17))/size), axis=-1) % 1
dist, index = cKDTree(sites, boxsize=1).query(points, k=2)
edge = (dist[:,:,1]-dist[:,:,0])*size
facet = rng.uniform(-17, 17, len(sites))[index[:,:,0]]
shade = facet + 9*noise(13) + 4*noise(2) + 4*noise(.6)
shade += 12*np.exp(-abs(edge-7)/4) - 55*np.exp(-edge/3.5)
lichen = np.clip(noise(19)*.7 + noise(2)*.35-.45,0,1)
rgb = [138,127,99]+shade[:,:,None]+lichen[:,:,None]*[-24,5,-28]
Image.fromarray(rgb.clip(0,255).astype('uint8')).save(out/'fracture.webp', quality=90)

im = Image.new('RGB',(size,size),(23,47,34))
d = ImageDraw.Draw(im)
for i in range(4800):
    cx,cy = rand.randrange(size),rand.randrange(size)
    angle = .8*math.sin(cx*math.tau/size)+rand.uniform(-1.45,1.45)
    length = rand.uniform(11,32)
    width = length*rand.uniform(.26,.49)
    dx,dy = math.sin(angle),math.cos(angle)
    value = rand.uniform(.58,1.20)*(.66+.34*i/4800)
    green = rand.choice([(85,130,59),(58,108,68),(117,144,63),(76,124,72)])
    def color(light):
        return tuple(int(c*value*light) for c in green)
    for ox in ([0,size] if cx<35 else [0,-size] if cx>size-35 else [0]):
        for oy in ([0,size] if cy<35 else [0,-size] if cy>size-35 else [0]):
            def pt(t,w):
                return cx+ox+dx*t*length+dy*w*width, cy+oy+dy*t*length-dx*w*width
            for side, light in [(-1,.79),(1,1.1)]:
                d.polygon([pt(-.5,0),pt(-.34,.62*side),pt(-.04,side),pt(.24,.69*side),pt(.62,0)], fill=color(light))
            d.line([pt(-.47,0),pt(.43,0)], fill=color(1.19),width=1)
im.save(out/'hedge.webp',quality=90)
