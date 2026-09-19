from PIL import Image, ImageDraw, ImageFont
import math
S=1024
def P(r,a,cx=S/2,cy=S/2+14): return (cx+r*math.cos(math.radians(a)), cy-r*math.sin(math.radians(a)))
R=S*0.335
H=[P(R,90+60*k) for k in range(6)]          # H0 top, then counter-clockwise
# order by name: top, upper-left, lower-left, bottom, lower-right, upper-right
T,UL,LL,B,LR,UR=H
r=R*0.618
A=P(r,90); BL=P(r,210); BR=P(r,330)
img=Image.new("RGB",(S,S),"#07090e"); d=ImageDraw.Draw(img)
# soft glow
glow=Image.new("RGB",(S,S),"#07090e"); gd=ImageDraw.Draw(glow)
for i in range(60,0,-1):
    c=int(8+i*0.0); 
from PIL import ImageFilter
g=Image.new("L",(S,S),0); ImageDraw.Draw(g).polygon(H,fill=90); g=g.filter(ImageFilter.GaussianBlur(60))
img.paste(Image.new("RGB",(S,S),"#5fd8ff"),(0,0),g.point(lambda v:int(v*0.55)))
d=ImageDraw.Draw(img)
faces={ # face: shade
 (A,BL,BR):"#1c3a4a",
 (A,T,UR):"#16222e",(A,T,UL):"#1a2836",(A,UL,BL):"#141c27",(A,UR,BR):"#18242f",
 (BL,UL,LL):"#10161f",(BR,UR,LR):"#121a24",(BL,LL,B):"#0f141c",(BR,LR,B):"#10161e",(BL,BR,B):"#131b25"}
for f,c in faces.items(): d.polygon(f,fill=c)
edges=[(A,BL),(BL,BR),(BR,A),(A,T),(A,UL),(A,UR),(BL,UL),(BL,LL),(BL,B),(BR,UR),(BR,LR),(BR,B)]
for e in edges: d.line(e,fill="#5fd8ff",width=9)
d.line(H+[H[0]],fill="#5fd8ff",width=16,joint="curve")
font=ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",int(S*0.105))
cx=(A[0]+BL[0]+BR[0])/3; cy=(A[1]+BL[1]+BR[1])/3
d.text((cx,cy+10),"20",font=font,fill="#e8eef7",anchor="mm")
for n in (180,192,512): img.resize((n,n),Image.LANCZOS).save(f"icons/icon-{n}.png",optimize=True)
img.resize((64,64),Image.LANCZOS).save("icons/icon-64.png",optimize=True)
