"""Regular display tessellations in Web Mercator; never change source statistics.

Square sides approximate 250 ground metres at 37.5 N. Hexagons have the
same display area, horizontal sides/vertices, and regular screen proportions.
Each display cell takes the community with largest overlap with source cells.
Downloads and all metrics retain source geometry and assignments.
"""
from pathlib import Path
import json, math
import numpy as np
import pandas as pd
import geopandas as gpd
import shapely
from pyproj import Transformer
from shapely.ops import transform

out=Path(__file__).parent/'dist/data'
base=gpd.GeoDataFrame.from_features(json.loads((out/'grid.json').read_text()),crs=4326).to_crs(3857)
geoms=np.array(base.geometry); tree=shapely.STRtree(geoms)
size=250/math.cos(math.radians(37.5))
radius=math.sqrt(size**2/(1.5*math.sqrt(3)))
height=math.sqrt(3)*radius
back=Transformer.from_crs(3857,4326,always_xy=True).transform
entries=json.loads((out/'manifest.json').read_text())
assignments={e['key']:np.array([-1 if c is None else c for c in json.loads((out/(e['key']+'.json')).read_text(encoding='utf8'))['assignments']]) for e in entries}

for view in ['square','hex']:
 keys=set()
 for g in geoms:
  x0,y0,x1,y1=g.bounds
  if view=='square':
   for x in range(math.floor(x0/size),math.floor(x1/size)+1):
    for y in range(math.floor(y0/size),math.floor(y1/size)+1):keys.add((x,y))
  else:
   for q in range(math.floor(x0/(1.5*radius))-1,math.floor(x1/(1.5*radius))+2):
    for r in range(math.floor(y0/height)-1,math.floor(y1/height)+2):keys.add((q,r))
 keys=sorted(keys)
 if view=='square':
  tiles=np.array([shapely.box(x*size,y*size,(x+1)*size,(y+1)*size) for x,y in keys])
 else:
  angles=np.arange(6)*math.pi/3
  tiles=np.array([shapely.Polygon([(1.5*radius*q+radius*math.cos(a),height*(r+.5*(q%2))+radius*math.sin(a)) for a in angles]) for q,r in keys])
 pairs=tree.query(tiles,predicate='intersects')
 weights=shapely.area(shapely.intersection(tiles[pairs[0]],geoms[pairs[1]]))
 valid=weights>1;pairs=pairs[:,valid];weights=weights[valid]
 assert abs((tiles[0].bounds[2]-tiles[0].bounds[0])/(tiles[0].bounds[3]-tiles[0].bounds[1])-(1 if view=='square' else 2/math.sqrt(3)))<1e-7
 for e in entries:
  key=e['key'];a=assignments[key]
  table=pd.DataFrame({'tile':pairs[0],'comm':a[pairs[1]],'weight':weights})
  table=table[table.comm>=0].groupby(['tile','comm'],as_index=False).weight.sum()
  table=table.sort_values(['tile','weight','comm'],ascending=[True,False,True]).drop_duplicates('tile')
  features=[]
  for comm,sub in table.groupby('comm'):
   geom=shapely.union_all(tiles[sub.tile.to_numpy()],grid_size=.01)
   geom=transform(back,geom)
   features.append({'type':'Feature','properties':{'id':int(comm)},'geometry':json.loads(shapely.to_geojson(geom))})
  data={'type':'FeatureCollection','metadata':{'display_crs':'EPSG:3857','source_statistics_unchanged':True,'square_ground_size_m_at_37_5N':250,'allocation':'largest_source_overlap'},'features':features}
  (out/(key+'_'+view+'.json')).write_text(json.dumps(data,separators=(',',':')),encoding='utf8')
  print(key,view,'ready',flush=True)
