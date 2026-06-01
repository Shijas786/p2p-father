
function W6e({
user:e
}
){
var q,
K,
se,
ee,
ne,
de;
const[t,
n]=U.useState(null),
[r,
s]=U.useState(!1),
[i,
o]=U.useState([]),
[a,
c]=U.useState(73434.19),
[l,
u]=U.useState(73429.99),
[d,
h]=U.useState({
mins:"04",
secs:"22"
}
),
[p,
m]=U.useState("4:40-4:45 AM ET"),
[g,
b]=U.useState(-1),
[y,
v]=U.useState("buy"),
[w,
x]=U.useState("UP"),
[E,
N]=U.useState("5"),
[A,
T]=U.useState(!1),
P=U.useRef(null),
B=U.useRef(null),
F=async()=>{
s(!0);
try{

const X=await nt.predictions.getAIAnalysis();
n(X);

const _e=await nt.predictions.getHistory();
if(_e&&_e.history){

const ce=_e.history.map(ye=>({
time:ye.time,
open:ye.open,
close:ye.close,
outcome:ye.outcome,
timestamp:ye.timestamp,
priceToBeat:ye.open
}
));
o(ce),
ce.length>0&&u(ce[0].close||ce[0].open)
}

}
catch(X){
console.error("[Predict] Failed to load data:",
X)
}
finally{
s(!1)
}

}
;
U.useEffect(()=>{

const X=()=>{

const ce=new Date,
ye=Math.floor(ce.getMinutes()/5)*5,
ke=(ye+5)%60,
Ue=ce.getHours(),
ct=(rn,
Vt)=>{

const $n=rn>=12?"PM":"AM",
Sr=rn%12||12,
kn=Vt.toString().padStart(2,
"0");
return`${
Sr
}
:${
kn
}
 ${
$n
}
`
}
,
ft=ct(Ue,
ye),
Ke=ct(ke===0?(Ue+1)%24:Ue,
ke);
m(`${
ft
}
-${
Ke
}
 ET`);

const Tn=new Date(Math.ceil(ce.getTime()/(5*60*1e3))*(5*60*1e3)).getTime()-ce.getTime(),
Jr=Math.floor(Tn/6e4),
dn=Math.floor(Tn%6e4/1e3);
h({
mins:Jr.toString().padStart(2,
"0"),
secs:dn.toString().padStart(2,
"0")
}
)
}
;
X();

const _e=setInterval(X,
1e3);
return()=>clearInterval(_e)
}
,
[]),
U.useEffect(()=>{

const X=async()=>{
try{

const ye=await(await fetch("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT")).json();
ye&&ye.price&&c(parseFloat(ye.price))
}
catch(ce){
console.error("[Predict] Price fetch error:",
ce)
}

}
;
X();

const _e=setInterval(X,
2e3);
return()=>clearInterval(_e)
}
,
[]),
U.useEffect(()=>{
F()
}
,
[]),
U.useEffect(()=>{
if(!P.current)return;

const X=document.createElement("script");

return X.src="https://s3.tradingview.com/tv.js",
X.async=!0,
X.onload=()=>{
typeof window.TradingView<"u"&&P.current&&(B.current=new window.TradingView.widget({
autosize:!0,
symbol:"BINANCE:BTCUSDT",
interval:"5",
timezone:"Etc/UTC",
theme:"dark",
style:"1",
locale:"en",
enable_publishing:!1,
backgroundColor:"#131722",
gridColor:"rgba(255,
 255,
 255,
 0.03)",
hide_top_toolbar:!0,
hide_legend:!0,
save_image:!1,
container_id:P.current.id
}
))
}
,
document.body.appendChild(X),
()=>{
X.parentNode&&document.body.removeChild(X)
}

}
,
[]);

const W=async()=>{
re("medium"),
T(!0);
try{
await new Promise(X=>setTimeout(X,
1500)),
alert(`Prediction placed: $${
E
}
 on ${
w
}
!`)
}
catch(X){
console.error(X)
}
finally{
T(!1)
}

}
,
L=g===-1?a:((q=i[g])==null?void 0:q.close)||((K=i[g])==null?void 0:K.open)||0,
M=g===-1?l:((se=i[g])==null?void 0:se.open)||0,
C=L-M,
_=C>=0,
O=`${
_?"▲":"▼"
}
 $${
Math.abs(C).toFixed(2)
}
`,
$=X=>{
re("light"),
N(X.toString())
}
,
R=[{
label:"+ $5",
value:5,
type:"up"
}
,
{
label:"+ $10",
value:10,
type:"up"
}
,
{
label:"+ $1",
value:1,
type:"down"
}
,
{
label:"+ $25",
value:25,
type:"up"
}
,
{
label:"+ $3",
value:3,
type:"down"
}
],
D=i.slice(0,
5);

return f.jsxs("div",
{
className:"predict-page-container fade-in",
children:[f.jsxs("header",
{
className:"predict-top-nav",
children:[f.jsxs("div",
{
className:"nav-metric",
children:[f.jsx("span",
{
className:"metric-lbl",
children:"PORTFOLIO"
}
),
f.jsxs("span",
{
className:"metric-val text-green",
children:["$",
parseFloat((e==null?void 0:e.balance)||"0.00").toFixed(2)]
}
)]
}
),
f.jsxs("div",
{
className:"nav-metric",
children:[f.jsx("span",
{
className:"metric-lbl",
children:"CASH"
}
),
f.jsx("span",
{
className:"metric-val text-green",
children:"$0.00"
}
)]
}
),
f.jsx("button",
{
className:"btn-deposit",
onClick:()=>re("selection"),
children:"Deposit"
}
),
f.jsxs("div",
{
className:"nav-icons-group",
children:[f.jsx("button",
{
className:"nav-icon-btn",
onClick:()=>re("light"),
children:f.jsxs("svg",
{
width:"20",
height:"20",
viewBox:"0 0 24 24",
fill:"none",
stroke:"currentColor",
strokeWidth:"2",
strokeLinecap:"round",
strokeLinejoin:"round",
children:[f.jsx("polyline",
{
points:"20 12 20 22 4 22 4 12"
}
),
f.jsx("rect",
{
x:"2",
y:"7",
width:"20",
height:"5"
}
),
f.jsx("line",
{
x1:"12",
y1:"22",
x2:"12",
y2:"7"
}
),
f.jsx("path",
{
d:"M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"
}
),
f.jsx("path",
{
d:"M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"
}
)]
}
)
}
),
f.jsxs("button",
{
className:"nav-icon-btn notification-bell",
onClick:()=>re("light"),
children:[f.jsxs("svg",
{
width:"20",
height:"20",
viewBox:"0 0 24 24",
fill:"none",
stroke:"currentColor",
strokeWidth:"2",
strokeLinecap:"round",
strokeLinejoin:"round",
children:[f.jsx("path",
{
d:"M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"
}
),
f.jsx("path",
{
d:"M13.73 21a2 2 0 0 1-3.46 0"
}
)]
}
),
f.jsx("span",
{
className:"bell-badge"
}
)]
}
),
f.jsxs("div",
{
className:"user-profile-trigger",
onClick:()=>re("light"),
children:[f.jsx("div",
{
className:"profile-dot-gradient"
}
),
f.jsx("svg",
{
width:"10",
height:"6",
viewBox:"0 0 10 6",
fill:"none",
stroke:"#848e9c",
strokeWidth:"1.5",
children:f.jsx("path",
{
d:"M1 1l4 4 4-4"
}
)
}
)]
}
)]
}
)]
}
),
f.jsxs("div",
{
className:"prediction-main-card",
children:[f.jsxs("div",
{
className:"card-header-row",
children:[f.jsxs("div",
{
className:"card-title-group",
children:[f.jsx(u$,
{
size:24
}
),
f.jsxs("div",
{
children:[f.jsx("h2",
{
children:"BTC Up or Down 5m"
}
),
f.jsx("p",
{
className:"subtitle",
children:g===-1?p:`${
(ee=i[g])==null?void 0:ee.time
}
 Round`
}
)]
}
)]
}
),
f.jsxs("div",
{
className:"card-actions-group",
children:[f.jsx("button",
{
className:"action-circle-btn",
onClick:()=>re("light"),
children:f.jsxs("svg",
{
width:"14",
height:"14",
viewBox:"0 0 24 24",
fill:"none",
stroke:"currentColor",
strokeWidth:"2",
children:[f.jsx("polyline",
{
points:"16 18 22 12 16 6"
}
),
f.jsx("polyline",
{
points:"8 6 2 12 8 18"
}
)]
}
)
}
),
f.jsx("button",
{
className:"action-circle-btn",
onClick:()=>{
re("light")
}
,
children:f.jsx(UM,
{
size:14
}
)
}
),
f.jsx("button",
{
className:"action-circle-btn",
onClick:()=>re("light"),
children:f.jsx("svg",
{
width:"14",
height:"14",
viewBox:"0 0 24 24",
fill:"none",
stroke:"currentColor",
strokeWidth:"2",
children:f.jsx("path",
{
d:"M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"
}
)
}
)
}
),
f.jsx("button",
{
className:"btn-refresh",
onClick:()=>{
re("selection"),
F()
}
,
disabled:r,
children:f.jsx(jM,
{
size:14,
className:r?"spin":""
}
)
}
)]
}
)]
}
),
f.jsxs("div",
{
className:"price-metrics-row",
children:[f.jsxs("div",
{
className:"metric-box",
children:[f.jsx("span",
{
className:"metric-label",
children:"PRICE TO BEAT"
}
),
f.jsxs("span",
{
className:"metric-value font-mono",
children:["$",
M.toLocaleString(void 0,
{
minimumFractionDigits:2,
maximumFractionDigits:2
}
)]
}
)]
}
),
f.jsxs("div",
{
className:"metric-box",
children:[f.jsx("span",
{
className:"metric-label active-label",
children:"CURRENT PRICE"
}
),
f.jsxs("div",
{
className:"current-price-wrap",
children:[f.jsxs("span",
{
className:"metric-value font-mono text-yellow",
children:["$",
L.toLocaleString(void 0,
{
minimumFractionDigits:2,
maximumFractionDigits:2
}
)]
}
),
f.jsx("span",
{
className:`price-delta-badge ${
_?"delta-up":"delta-down"
}
`,
children:O
}
)]
}
)]
}
),
f.jsx("div",
{
className:"countdown-timer-box",
children:g===-1?f.jsx(f.Fragment,
{
children:f.jsxs("div",
{
className:"timer-digits",
children:[f.jsxs("div",
{
className:"digit-col",
children:[f.jsx("span",
{
className:"digit-val",
children:d.mins
}
),
f.jsx("span",
{
className:"digit-lbl",
children:"MINS"
}
)]
}
),
f.jsxs("div",
{
className:"digit-col",
children:[f.jsx("span",
{
className:"digit-val",
children:d.secs
}
),
f.jsx("span",
{
className:"digit-lbl",
children:"SECS"
}
)]
}
)]
}
)
}
):f.jsxs("div",
{
className:"round-status-badge",
children:[f.jsx("span",
{
className:"status-lbl",
children:"OUTCOME"
}
),
f.jsx("span",
{
className:`status-val ${
((ne=i[g])==null?void 0:ne.outcome)==="UP"?"text-green":"text-red"
}
`,
children:(de=i[g])==null?void 0:de.outcome
}
)]
}
)
}
)]
}
),
f.jsxs("div",
{
className:"chart-workspace",
children:[f.jsx("div",
{
className:"chart-bets-overlay",
children:R.map((X,
_e)=>f.jsx("button",
{
className:`bet-badge-item ${
X.type==="up"?"badge-up":"badge-down"
}
`,
onClick:()=>$(X.value),
children:X.label
}
,
_e))
}
),
f.jsx("div",
{
id:"predict-tv-chart",
ref:P,
className:"tradingview-container"
}
)]
}
)]
}
),
f.jsxs("div",
{
className:"rounds-timeline-container",
children:[f.jsxs("div",
{
className:"rounds-scroll-row",
children:[f.jsxs("button",
{
className:"timeline-pill past-dropdown",
onClick:()=>re("light"),
children:["Past ",
f.jsx("span",
{
className:"arrow-down",
children:"v"
}
)]
}
),
f.jsxs("button",
{
className:`timeline-round-pill ${
g===-1?"active-round":""
}
`,
onClick:()=>{
re("selection"),
b(-1)
}
,
children:[f.jsx("span",
{
className:"live-pulse"
}
),
"Active"]
}
),
D.map((X,
_e)=>f.jsxs("button",
{
className:`timeline-round-pill ${
g===_e?"active-historical-round":""
}
`,
onClick:()=>{
re("selection"),
b(_e)
}
,
children:[f.jsx("span",
{
className:`round-indicator ${
X.outcome==="UP"?"indicator-up":"indicator-down"
}
`,
children:X.outcome==="UP"?"▲":"▼"
}
),
X.time]
}
,
_e)),
f.jsxs("button",
{
className:"timeline-pill more-dropdown",
onClick:()=>re("light"),
children:["More ",
f.jsx("span",
{
className:"arrow-down",
children:"v"
}
)]
}
)]
}
),
f.jsx("div",
{
className:"rounds-subbar-row",
children:f.jsxs("div",
{
className:"subbar-left-group",
children:[f.jsx("button",
{
className:"subbar-icon-btn",
onClick:()=>re("light"),
children:f.jsx("svg",
{
width:"18",
height:"12",
viewBox:"0 0 18 12",
fill:"none",
stroke:"currentColor",
strokeWidth:"2",
children:f.jsx("path",
{
d:"M1 8l4-4 4 4 8-6",
strokeLinecap:"round",
strokeLinejoin:"round"
}
)
}
)
}
),
f.jsx("button",
{
className:"subbar-icon-btn",
onClick:()=>re("light"),
children:f.jsx("span",
{
className:"btc-symbol",
children:"₿"
}
)
}
),
f.jsx("button",
{
className:"subbar-icon-btn active-icon",
onClick:()=>re("light"),
children:f.jsx("svg",
{
width:"16",
height:"16",
viewBox:"0 0 16 16",
fill:"currentColor",
children:f.jsx("path",
{
d:"M3 5h2v6H3V5zm7-2h2v10h-2V3zM4 1v4H3V1h1zm0 10v4H3v-4h1zm7-10v2h-1V1h1zm0 12v2h-1v-2h1z"
}
)
}
)
}
)]
}
)
}
)]
}
),
f.jsxs("div",
{
className:"predict-summary-card",
children:[f.jsxs("div",
{
className:"summary-title-row",
children:[f.jsx(u$,
{
size:20
}
),
f.jsx("span",
{
children:"BTC Up or Down 5m"
}
)]
}
),
f.jsx("div",
{
className:"summary-status-row",
children:f.jsx("span",
{
className:`outcome-text ${
_?"text-green":"text-red"
}
`,
children:_?"Up":"Down"
}
)
}
)]
}
),
f.jsxs("div",
{
className:"fathers-take-section",
children:[f.jsxs("div",
{
className:"fathers-take-header-row",
children:[f.jsx("h3",
{
children:"💡 Father's Take (AI Predict Engine)"
}
),
f.jsx("span",
{
className:"version-pill",
children:"v2.1"
}
)]
}
),
r?f.jsxs("div",
{
className:"ai-loading-box",
children:[f.jsx("div",
{
className:"spinner-sm"
}
),
f.jsx("span",
{
children:"Scanning k-NN fractals from history..."
}
)]
}
):t?f.jsxs("div",
{
className:"ai-details-body",
children:[f.jsxs("p",
{
className:"ai-desc",
children:["Analyzed ",
t.analyzed_epochs,
" candles. Finding closest historical sequences to current Binance close data."]
}
),
f.jsxs("div",
{
className:"ai-probability-bar-container",
children:[f.jsxs("div",
{
className:"probability-labels",
children:[f.jsxs("span",
{
children:["UP (",
t.ai_up_prob,
"%)"]
}
),
f.jsxs("span",
{
children:["DOWN (",
t.ai_down_prob,
"%)"]
}
)]
}
),
f.jsxs("div",
{
className:"probability-bar",
children:[f.jsx("div",
{
className:"prob-fill-green",
style:{
width:`${
t.ai_up_prob
}
%`
}

}
),
f.jsx("div",
{
className:"prob-fill-red",
style:{
width:`${
t.ai_down_prob
}
%`
}

}
)]
}
)]
}
),
f.jsxs("div",
{
className:"ai-stats-row",
children:[f.jsxs("div",
{
className:"ai-stat-box",
children:[f.jsx("span",
{
className:"stat-label",
children:"Matches Found"
}
),
f.jsx("span",
{
className:"stat-val font-mono",
children:t.top_matches_found
}
)]
}
),
f.jsxs("div",
{
className:"ai-stat-box",
children:[f.jsx("span",
{
className:"stat-label",
children:"AI Accuracy (Last 100)"
}
),
f.jsx("span",
{
className:"stat-val font-mono text-green",
children:"74.5%"
}
)]
}
)]
}
)]
}
):f.jsx("div",
{
className:"ai-error-box",
children:"⚠️ Unable to load live AI prediction matrix."
}
)]
}
),
f.jsxs("div",
{
className:"predict-execution-card",
children:[f.jsxs("div",
{
className:"execution-tabs-row",
children:[f.jsxs("div",
{
className:"exec-tabs",
children:[f.jsx("button",
{
className:`exec-tab ${
y==="buy"?"active-buy":""
}
`,
onClick:()=>{
re("selection"),
v("buy"),
x("UP")
}
,
children:"Buy"
}
),
f.jsx("button",
{
className:`exec-tab ${
y==="sell"?"active-sell":""
}
`,
onClick:()=>{
re("selection"),
v("sell"),
x("DOWN")
}
,
children:"Sell"
}
)]
}
),
f.jsxs("button",
{
className:"exec-type-dropdown",
onClick:()=>re("light"),
children:["Market ",
f.jsx("span",
{
className:"arrow-down",
children:"v"
}
)]
}
)]
}
),
f.jsxs("div",
{
className:"execution-form-body",
children:[f.jsxs("div",
{
className:"bet-direction-selector",
children:[f.jsx("button",
{
className:`dir-pill yes-pill ${
w==="UP"?"selected-yes":""
}
`,
onClick:()=>{
re("selection"),
x("UP")
}
,
children:"UP (YES)"
}
),
f.jsx("button",
{
className:`dir-pill no-pill ${
w==="DOWN"?"selected-no":""
}
`,
onClick:()=>{
re("selection"),
x("DOWN")
}
,
children:"DOWN (NO)"
}
)]
}
),
f.jsxs("div",
{
className:"bet-amount-input-row",
children:[f.jsx("span",
{
className:"input-prefix",
children:"$"
}
),
f.jsx("input",
{
type:"number",
value:E,
onChange:X=>N(X.target.value),
placeholder:"0.00",
className:"font-mono"
}
),
f.jsx("span",
{
className:"input-currency",
children:"USDT"
}
)]
}
),
f.jsx("div",
{
className:"quick-amount-buttons",
children:["5",
"10",
"25",
"50",
"100"].map(X=>f.jsxs("button",
{
className:`quick-amt-btn ${
E===X?"selected-quick":""
}
`,
onClick:()=>{
re("light"),
N(X)
}
,
children:["$",
X]
}
,
X))
}
),
f.jsxs("div",
{
className:"payout-metrics-container",
children:[f.jsxs("div",
{
className:"payout-row",
children:[f.jsx("span",
{
children:"Balance Available"
}
),
f.jsxs("span",
{
className:"font-mono font-bold",
children:["$",
parseFloat((e==null?void 0:e.balance)||"0.00").toFixed(2)]
}
)]
}
),
f.jsxs("div",
{
className:"payout-row",
children:[f.jsx("span",
{
children:"Potential Payout"
}
),
f.jsxs("span",
{
className:"font-mono text-green font-bold",
children:["$",
(parseFloat(E||"0")*1.95).toFixed(2),
" USDT"]
}
)]
}
)]
}
),
f.jsx("button",
{
className:`btn-execute-prediction ${
w==="UP"?"exec-up":"exec-down"
}
`,
disabled:A||!E||parseFloat(E)<=0,
onClick:W,
children:A?"Processing...":`Predict ${
w
}
`
}
)]
}
)]
}
)]
}
)
}
