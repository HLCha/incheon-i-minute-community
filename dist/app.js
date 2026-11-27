const $=id=>document.getElementById(id), periods=[['WD_Day','평일 · 주간','평일 낮'],['WD_Peak','평일 · 첨두','첨두'],['WD_Night','평일 · 야간','평일 밤'],['WE_Day','주말 · 주간','주말 낮'],['WE_Night','주말 · 야간','주말 밤'],['0609_Day','연휴 · 주간','연휴 낮'],['0609_Night','연휴 · 야간','연휴 밤']];
const map=L.map('map',{zoomControl:false,preferCanvas:true,minZoom:7,maxZoom:18}).setView([37.49,126.61],11);

const light=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap 기여자',maxZoom:19});light.addTo(map);map.getPane('tilePane').classList.add('light-tiles');
let view='square';let focusLayer=null,displayGeometry=null;const geometryCache=new Map();
let scenario='Walk15',period='WD_Day',grid,current,layer,selected=null,hover=null,byId=new Map(),paths=new Map(),allowed=new Set(),revision=0,detailRev=0;const cache=new Map();
const fmt=n=>Number(n).toLocaleString('ko-KR'),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function getData(s,p){let k=s+'_'+p;if(!cache.has(k))cache.set(k,fetch('data/'+k+'.json').then(r=>{if(!r.ok)throw Error('데이터를 불러오지 못했습니다.');return r.json()}));return cache.get(k)}
function region(c){return c.dongs[0]?.[0].split(' ').slice(-1)[0]||'커뮤니티'}
function style(id){
 const c=byId.get(id),visible=allowed.has(id),sel=id===selected,hov=id===hover,dim=selected!==null&&!sel;
 const fillOpacity=!visible?0:dim?(hov?.48:.36):sel?.92:hov?Math.min(1,+$('opacity').value/100+.10):+$('opacity').value/100;
 return {fillColor:c?.color||'#ddd',fillOpacity,color:'#ffffff',weight:visible?(sel?1.5:dim?.65:.85):0,opacity:visible?(dim?.65:1):0};
}
function repaintAll(){layer?.eachLayer(p=>p.setStyle(style(p.feature.properties.id)))}
function updateFocus(){
 if(focusLayer){map.removeLayer(focusLayer);focusLayer=null}
 repaintAll();
 if(selected===null||!displayGeometry)return;
 const c=byId.get(selected);
 focusLayer=L.geoJSON({type:'FeatureCollection',features:displayGeometry.features.filter(f=>f.properties.id===selected)},{pane:'focus',renderer:focusRenderer,interactive:false,style:{fillColor:c.color,fillOpacity:.95,color:'#fff',weight:1.8,opacity:1}}).addTo(map);
}
function clearSelection(){if(selected===null)return;selected=null;hover=null;detailRev++;$('detail').hidden=true;updateFocus();renderList()}
map.createPane('focus');map.getPane('focus').style.zIndex=440;map.getPane('focus').style.pointerEvents='none';map.getPane('focus').classList.add('focus-pane');const focusRenderer=L.svg({pane:'focus'});
map.on('click',clearSelection);document.addEventListener('keydown',e=>{if(e.key==='Escape')clearSelection()});
const scaleControl=L.control({position:'bottomright'});let scaleElement;
scaleControl.onAdd=()=>{scaleElement=L.DomUtil.create('div','atlas-scale');scaleElement.innerHTML='<div class="scale-labels"><span>0</span><span class="scale-mid"></span><span class="scale-end"></span></div><div class="scale-track"><i></i><i></i></div>';scaleElement.setAttribute('role','img');return scaleElement};scaleControl.addTo(map);
function updateScale(){
 const center=map.getSize().divideBy(2),max=map.distance(map.containerPointToLatLng(center),map.containerPointToLatLng(center.add([140,0])));
 if(!max||!Number.isFinite(max))return;const power=10**Math.floor(Math.log10(max)),n=max/power,distance=(n>=5?5:n>=2?2:1)*power,width=140*distance/max,km=distance>=1000;
 scaleElement.style.width=width+'px';scaleElement.querySelector('.scale-mid').textContent=String(km?distance/2000:distance/2);scaleElement.querySelector('.scale-end').textContent=(km?distance/1000:distance)+(km?' ㎞':' m');scaleElement.setAttribute('aria-label','축척 '+distance+'미터');
}
map.on('zoomend moveend resize',updateScale);updateScale();
function repaint(id){for(const p of paths.get(id)||[])p.setStyle(style(id))}
function renderList(){let q=$('search').value.trim().toLowerCase();let rows=current.communities.filter(c=>allowed.has(c.id)&&(!q||String(c.id).includes(q)||c.dongs.some(d=>d[0].toLowerCase().includes(q))));$('count').textContent=fmt(rows.length)+'개 커뮤니티';$('list').innerHTML=rows.slice(0,150).map(c=>`<button class="community ${selected===c.id?'selected':''}" data-id="${c.id}"><i class="dot" style="background:${c.color}"></i><span class="name">${esc(region(c))} <small>· ${c.id}</small></span><small>${fmt(c.n)}</small></button>`).join('')||'<p class="note">검색 결과 없음</p>';}
function updateDataInfo(){
 if(!current)return;
 const groups=current.communities.filter(c=>allowed.has(c.id));
 $('totalC').textContent=fmt(groups.length);
 $('totalG').textContent=fmt(groups.reduce((n,c)=>n+c.n,0));
 $('totalA').textContent=groups.reduce((n,c)=>n+c.area,0).toLocaleString('ko-KR',{maximumFractionDigits:1})+' ㎢';
}
function updateFilter(){allowed=new Set(current.communities.filter(c=>c.n>=+$('mincells').value).map(c=>c.id));if(selected!==null&&!allowed.has(selected)){selected=null;$('detail').hidden=true}updateFocus();renderList();updateDataInfo()}
async function load(){let rev=++revision;detailRev++;$('loading').style.display='flex';$('detail').hidden=true;selected=null;hover=null;if(focusLayer){map.removeLayer(focusLayer);focusLayer=null}try{const data=await getData(scenario,period);const geometryKey=data.key+'_'+view;if(!geometryCache.has(geometryKey))geometryCache.set(geometryKey,fetch('data/'+geometryKey+'.json?v=4').then(r=>{if(!r.ok)throw Error('표현 자료를 불러오지 못했습니다.');return r.json()}));const geometry=await geometryCache.get(geometryKey);if(rev!==revision)return;current=data;displayGeometry=geometry;byId=new Map(data.communities.map(c=>[c.id,c]));paths=new Map();if(layer)map.removeLayer(layer);allowed=new Set(data.communities.filter(c=>c.n>=+$('mincells').value).map(c=>c.id));layer=L.geoJSON(geometry,{bubblingMouseEvents:false,style:f=>style(f.properties.id),onEachFeature:(f,p)=>{let id=f.properties.id;if(!paths.has(id))paths.set(id,[]);paths.get(id).push(p);p.on({mouseover:e=>{if(!allowed.has(id))return;if(hover!==id){let old=hover;hover=id;repaint(old);repaint(id)}let c=byId.get(id);p.bindTooltip(`<b>${esc(region(c))} · ${id}</b><small>${fmt(c.n)} 격자 &nbsp; ${c.area.toFixed(2)} ㎢</small>`,{sticky:true}).openTooltip(e.latlng)},mouseout:()=>{const old=hover;hover=null;repaint(old);p.closeTooltip()},click:()=>{if(allowed.has(id)){if(selected===id)clearSelection();else inspect(id,false)}}})}}).addTo(map);updateFilter();$('loading').style.display='none'}catch(e){$('loading').textContent=e.message}}
function selectButton(container,value,attr){document.querySelectorAll(container+' button').forEach(b=>b.classList.toggle('active',b.dataset[attr]===value))}
async function inspect(id,zoom=false){let rev=++detailRev,old=selected;selected=id;hover=null;updateFocus();renderList();const c=byId.get(id);$('detail').hidden=false;if(zoom){let b=c.bounds;map.stop();map.fitBounds([[b[1],b[0]],[b[3],b[2]]],{paddingTopLeft:[innerWidth>850?320:30,120],paddingBottomRight:[innerWidth>850?340:30,innerWidth>850?120:370],maxZoom:12,animate:false})}
$('detail').innerHTML=`<button class="close" id="closeDetail" aria-label="닫기">×</button><div class="tag"><i class="dot" style="display:inline-block;background:${c.color};margin-right:8px"></i>커뮤니티 ${c.id}</div><h2>${esc(region(c))}</h2><div class="metrics"><div><b>${fmt(c.n)}</b><small>격자</small></div><div><b>${c.area.toFixed(2)}</b><small>㎢</small></div></div><div class="section-label">주요 동 <span style="float:right">격자 비율</span></div>${c.dongs.map(d=>`<div class="barrow"><div class="labels"><span>${esc(d[0].replace('인천광역시 ',''))}</span><span>${Math.round(d[1]/c.n*100)}%</span></div><div class="track"><i style="width:${d[1]/c.n*100}%;background:${c.color}"></i></div></div>`).join('')}<div class="section-label">시간대별 공간 중첩 <span style="float:right">중첩률</span></div><div id="timechart" class="timechart">비교 중…</div><div class="rule"></div><div class="sub">원본 행 ${fmt(c.rows)} · ${esc(c.stable||'색상 대응표 미포함')}</div><button id="download" class="download">공간자료 내려받기</button>`;
$('closeDetail').onclick=clearSelection;$('download').onclick=()=>download(id);
const ids=[];current.assignments.forEach((v,i)=>{if(v===id)ids.push(i)});const sourceScenario=scenario;
try{let values=await Promise.all(periods.map(async([p])=>{let d=await getData(sourceScenario,p),hits=new Map();ids.forEach(i=>{let v=d.assignments[i];if(v!==null)hits.set(v,(hits.get(v)||0)+1)});let max=0;for(let c of d.communities){let n=hits.get(c.id)||0;max=Math.max(max,n/(ids.length+c.n-n))}return max}));if(rev!==detailRev||selected!==id)return;$('timechart').innerHTML=values.map((v,i)=>`<div class="timecol ${periods[i][0]===period?'active':''}" title="${periods[i][1]}: ${(v*100).toFixed(1)}%"><b>${Math.round(v*100)}%</b><i style="height:${Math.max(2,v*52)}px"></i>${periods[i][2]}</div>`).join('')}catch(e){if(rev===detailRev)$('timechart').textContent='비교 자료를 불러오지 못했습니다.'}}
function download(id){let c=byId.get(id),data={type:'FeatureCollection',metadata:{source:current.file,community:c,area_crs:'EPSG:5179'},features:grid.features.filter(f=>current.assignments[f.properties.i]===id).map(f=>({...f,properties:{community:id}}))};let url=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/geo+json'})),a=document.createElement('a');a.href=url;a.download=current.key+'_community_'+id+'.geojson';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
let dayGroup='WD';
function renderPeriods(){
 const visible=periods.filter(([p])=>p.startsWith(dayGroup+'_'));
 $('periods').innerHTML=visible.map(([p,label])=>`<button data-p="${p}" aria-pressed="${p===period}" class="${p===period?'active':''}">${label.split(' · ')[1]}</button>`).join('');
 document.querySelectorAll('#dayGroups button').forEach(b=>{const active=b.dataset.group===dayGroup;b.classList.toggle('active',active);b.setAttribute('aria-selected',active)});
}
$('dayGroups').onclick=e=>{const b=e.target.closest('[data-group]');if(!b||b.dataset.group===dayGroup)return;dayGroup=b.dataset.group;const time=period.split('_')[1];period=dayGroup+'_'+time;if(!periods.some(([p])=>p===period))period=dayGroup+'_Day';renderPeriods();load()};
$('dayGroups').onkeydown=e=>{const b=e.target.closest('[data-group]');if(!b||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const buttons=[...document.querySelectorAll('#dayGroups button')];let i=buttons.indexOf(b);i=e.key==='Home'?0:e.key==='End'?2:(i+(e.key==='ArrowRight'?1:2))%3;buttons[i].focus();buttons[i].click()};
renderPeriods();
$('periods').onclick=e=>{let b=e.target.closest('button');if(!b)return;period=b.dataset.p;renderPeriods();load()};
$('scenarios').onclick=e=>{let b=e.target.closest('button');if(!b)return;scenario=b.dataset.s;selectButton('#scenarios',scenario,'s');load()};$('opacity').oninput=updateFocus;$('mincells').onchange=updateFilter;$('search').oninput=()=>current&&renderList();$('list').onclick=e=>{let b=e.target.closest('[data-id]');if(b)inspect(+b.dataset.id,true)};$('basemap').onchange=()=>{if($('basemap').value==='none'){map.removeLayer(light)}else{light.addTo(map)}map.getPane('tilePane').classList.toggle('regular-tiles',$('basemap').value==='street')};
$('baseOpacity').oninput=()=>map.getPane('tilePane').style.opacity=+$('baseOpacity').value/100;
$('views').onclick=e=>{let b=e.target.closest('button');if(!b||b.dataset.view===view)return;view=b.dataset.view;selectButton('#views',view,'view');load()};
function home(){map.stop();map.fitBounds([[37.30,126.32],[37.67,126.84]],{paddingTopLeft:[innerWidth>850?300:195,90],paddingBottomRight:[30,100],animate:false})}$('home').onclick=home;$('full').onclick=()=>{if(layer)map.fitBounds(layer.getBounds(),{paddingTopLeft:[innerWidth>850?320:200,100],paddingBottomRight:[50,120],animate:false})};$('zoomIn').onclick=()=>map.zoomIn();$('zoomOut').onclick=()=>map.zoomOut();
fetch('data/grid.json').then(r=>{if(!r.ok)throw Error('격자 자료를 불러오지 못했습니다.');return r.json()}).then(g=>{grid=g;home();load()}).catch(e=>{$('loading').textContent=e.message});

$('info').onclick=()=>{updateDataInfo();$('about').showModal()};$('closeAbout').onclick=()=>$('about').close();$('about').addEventListener('click',e=>{if(e.target===$('about')){const b=$('about').getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)$('about').close()}});
