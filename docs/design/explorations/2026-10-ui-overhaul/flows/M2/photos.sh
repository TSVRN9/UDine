#!/bin/bash
# Re-encodes assets/*.jpg into build/*.jpg small enough to embed (budget lifted: artifact limit is 16MB).
# No retouching: the photos are used as UMass Dining publishes them; grading happens in CSS (duotone, gradients, position).
set -e
cd "$(dirname "$0")"; mkdir -p build
magick assets/worcester.jpg -strip -interlace JPEG -sampling-factor 4:2:0 -quality 82 build/worcester.jpg
for n in franklin berkshire hampshire; do
  magick assets/$n.jpg -strip -interlace JPEG -sampling-factor 4:2:0 -quality 82 build/$n.jpg
done
for f in assets/ev/*.*; do b=$(basename "${f%.*}"); magick "$f" -resize 840x -strip -interlace JPEG -quality 78 build/ev-$b.jpg; done
magick assets/worcester-food.jpg -resize 840x -strip -interlace JPEG -quality 78 build/worcester-food.jpg
mkdir -p build/retail
python3 -c "
import json
from PIL import Image
for n,v in json.load(open('assets/retail/index.json')).items():
    Image.open(v['file']).convert('RGB').save('build/retail/'+v['file'].split('/')[-1].rsplit('.',1)[0]+'.jpg','JPEG',quality=80,optimize=True,progressive=True)
"
rm -f build/chk.png
ls -la build
