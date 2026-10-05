// Layout follows the user's world-map reference, not its game UI or resource values.
export const RADIUS = 1.32;
export const COLS = 43;
export const ROWS = 33;
export const WIDTH = Math.sqrt(3) * RADIUS * COLS;
export const DEPTH = 1.5 * RADIUS * ROWS;
export const regions = {
  xuantian: { name:'玄天宗', en:'XUANTIAN', color:'#93c5a0', ink:'#416c52', emblem:'玄', terrain:'山林 · 瀑布 · 宗门', u:.24,v:.25, description:'青岚群峰之间，宗门依山而立。苍木林海向南铺展，碧落湖与群山中的水系相连。', places:'青岚山脉 / 苍木林海 / 碧落湖' },
  tianyan: { name:'天衍宗', en:'TIANYAN', color:'#9cbfdf', ink:'#718fa1', emblem:'衍', terrain:'浮岛 · 云海 · 平原', u:.76,v:.20, description:'东北云海之上，浮空殿宇与悬桥相连。下方是云梦、星海平原，远处群岛散入星辰海。', places:'星辰海 / 星海平原 / 流云山脉' },
  diyuan: { name:'地元宗', en:'DIYUAN', color:'#db987f', ink:'#774f46', emblem:'元', terrain:'火山 · 熔岩 · 峡谷', u:.22,v:.66, description:'西南山地被熔岩与裂谷分割。地元宗坐落于万岳群峰之中，赤炎荒原一路延向炼狱山脉。', places:'万岳山脉 / 赤炎荒原 / 九曲谷' },
  huangting: { name:'黄庭宗', en:'HUANGTING', color:'#dfc280', ink:'#b09962', emblem:'庭', terrain:'沙漠 · 绿洲 · 古道', u:.79,v:.70, description:'金乌大漠间，金沙绿洲环绕黄庭宗。古道穿过千岩戈壁，与北方平原、南部沙海相接。', places:'金乌大漠 / 金沙绿洲 / 黄沙山脉' },
  academy: { name:'上仙院', en:'SHANGXIAN', color:'#f1dfb0', ink:'#b7ac8c', emblem:'仙', terrain:'高山 · 环水 · 中央殿群', u:.51,v:.47, description:'位于四方之间的中央高地。层叠的白石殿群立于群峰，水路环绕山体，向南汇入归墟海。', places:'中央高地 / 环山水道 / 归墟海' },
  wild: { name:'山海之间', en:'WILDERNESS', color:'#c1c7ae', ink:'#778779', emblem:'山', terrain:'平原 · 山脉 · 水域', description:'四宗之间的山川、水域与开阔平原。点击六边形地块，查看这一处的地貌与所属区域。', places:'云梦平原 / 天玄岭 / 归墟海' }
};
export const labels = [
 ['青岚山脉',.15,.09],['苍木林海',.23,.39],['碧落湖',.345,.465],['流云山脉',.50,.10],
 ['天玄岭',.40,.235],['云梦平原',.52,.27],['星海平原',.735,.355],['星辰海',.91,.12],
 ['万岳山脉',.12,.52],['赤炎荒原',.27,.76],['九曲谷',.36,.865],['炼狱山脉',.18,.91],
 ['金乌大漠',.855,.56],['千岩戈壁',.665,.57],['金沙绿洲',.80,.78],['大漠古道',.70,.86],
 ['黄沙山脉',.83,.94],['归墟海',.515,.85]
];
export const types = {
 forest:{name:'林海',color:'#547856'}, meadow:{name:'平原',color:'#899b63'}, mountain:{name:'山脉',color:'#92968a'},
 snow:{name:'雪岭',color:'#b9c6bf'}, volcanic:{name:'熔岩山地',color:'#585453'}, ash:{name:'荒原',color:'#79645a'},
 desert:{name:'沙漠',color:'#c9ad72'}, mesa:{name:'戈壁山地',color:'#a88c62'}, oasis:{name:'绿洲',color:'#639575'},
 water:{name:'水域',color:'#367d91'}, academy:{name:'中央高地',color:'#99a590'}
};
export function random(x,y=0) { const n=Math.sin(x*127.1+y*311.7)*43758.5453; return n-Math.floor(n); }
export function worldPoint(u,v) {return {x:(u-.5)*WIDTH,z:(v-.5)*DEPTH};}
export function normalized(x,z) {return {u:x/WIDTH+.5,v:z/DEPTH+.5};}
const ellipse=(u,v,x,y,a,b)=>((u-x)/a)**2+((v-y)/b)**2;
export function classify(u,v) {
 const island=ellipse(u,v,.51,.47,.112,.15);
 const ring=ellipse(u,v,.51,.47,.147,.189);
 const lake=ellipse(u,v,.33,.455,.066,.074);
 const seaAxis=.49+.042*Math.sin(v*11);
 const sea=v>.61 && Math.abs(u-seaAxis)<.035+(v-.60)*.22;
 const riverNorth=v>.12&&v<.31&&Math.abs(u-(.48+.029*Math.sin(v*38)))<.012;
 const riverEast=u>.59&&u<.89&&Math.abs(v-(.375+.021*Math.sin(u*36)))<.009;
 const water=(ring<1&&island>1)||lake<1||sea||riverNorth||riverEast;
 const region=island<1?'academy':u<.45?(v<.49?'xuantian':'diyuan'):v<.43?(u>.65?'tianyan':'wild'):'huangting';
 const n=random(Math.floor(u*43),Math.floor(v*33));
 if(water) return {type:'water',region:'wild'};
 if(island<1) return {type:island<.26?'academy':'mountain',region};
 if(u>.7 && v<.21) return {type:'water',region:'tianyan'};
 if(region==='xuantian') return {type:v<.16||u<.12||n>.80?'mountain':n>.22?'forest':'meadow',region};
 if(region==='diyuan') return {type:n>.25?'volcanic':'ash',region};
 if(region==='huangting') {
  if(ellipse(u,v,.79,.715,.080,.087)<1) return {type:n>.20?'oasis':'water',region};
  return {type:(v>.86||u>.88||n>.79)?'mesa':'desert',region};
 }
 if(v<.15) return {type:'snow',region};
 return {type:n>.87?'mountain':n>.68?'forest':'meadow',region};
}
export function corners(x,z,r=RADIUS) {return Array.from({length:6},(_,i)=>({x:x+Math.cos(Math.PI/6+i*Math.PI/3)*r,z:z+Math.sin(Math.PI/6+i*Math.PI/3)*r}));}
export function makeTiles() {
 const tiles=[];
 for(let row=0;row<ROWS;row++) for(let col=0;col<COLS;col++) {
  const x=(col-(COLS-1)/2+(row%2)*.5)*Math.sqrt(3)*RADIUS;
  const z=(row-(ROWS-1)/2)*1.5*RADIUS;
  const {u,v}=normalized(x,z);
  if(ellipse(u,v,.50,.50,.54,.57)>1.04+random(col,row)*.05) continue;
  tiles.push({id:`${col}:${row}`,col,row,x,z,u,v,...classify(u,v)});
 }
 return tiles;
}
