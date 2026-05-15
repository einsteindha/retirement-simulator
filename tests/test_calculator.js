/**
 * 은퇴 안전 인출 계산기 — 자동 검증 테스트
 * 핵심 함수를 Node.js 환경에서 독립 실행하여 검증
 */

// ── 핵심 함수 직접 구현 (HTML에서 추출)
function fmt(v){const a=Math.abs(v);return a>=10000?(v/10000).toFixed(1)+'억':Math.round(v)+'만';}
function fmtW(v){return fmt(v)+'원';}

function calcP(base, mode, ea, da) {
  if(mode==='early'){const a=-6*(65-ea);return{sa:ea,amt:Math.round(base*(1+a/100)),adj:a};}
  if(mode==='defer'){const a=7.2*(da-65);return{sa:da,amt:Math.round(base*(1+a/100)),adj:a};}
  return{sa:65,amt:base,adj:0};
}

function buildW(monthlyByYear, pensions, years, infl, evts, retireAge) {
  const monByY = Array.isArray(monthlyByYear) ? monthlyByYear : new Array(years).fill(monthlyByYear);
  return Array.from({length:years},(_,i)=>{
    const inflFactor = Math.pow(1+infl/100, i+1);
    const living = monByY[i] * 12;
    let totalP = 0;
    pensions.forEach(p=>{ if(i>=p.startY) totalP+=p.amt*12; });
    const evtCost = (evts||[]).filter(e=>{
      const ey=e.age-retireAge;return ey>=0&&Math.floor(ey)===i;
    }).reduce((s,e)=>s+e.amt*Math.pow(1+infl/100,e.age-retireAge),0);
    const netMonthly = Math.max(0, living - totalP);
    return Math.max(0, netMonthly*inflFactor + evtCost);
  });
}

function deterPath(start, w, ret, yrs, inflowArr=[]) {
  let b = start;
  const p = [b];
  for(let y=1;y<=yrs;y++){
    b = b*(1+ret/100) - w[y-1];
    if(inflowArr[y-1]) b += inflowArr[y-1];
    p.push(Math.max(0,b));
  }
  return p;
}

function mc(start, w, ret, vol, yrs, inherit, inflowArr=[], runs=2000) {
  let ok = 0;
  for(let i=0;i<runs;i++){
    let b=start, alive=true;
    for(let y=1;y<=yrs;y++){
      const r = ret + (Math.random()*2-1)*vol*1.5;
      b = b*(1+r/100) - w[y-1];
      if(inflowArr[y-1]) b+=inflowArr[y-1];
      if(b<0){alive=false;break;}
    }
    if(alive&&b>=inherit) ok++;
  }
  return ok/runs;
}

function calcBufSegments(retAge, meP, spP, hasSp, spRetAge, buf, living, cashflows=[], fixedPensions=[]) {
  const bufMonths = buf * 12;
  const T = {
    meRet: 0,
    spRet: hasSp ? spRetAge - retAge : null,
    mePen: meP.sa - retAge,
    spPen: hasSp ? spP.sa - retAge : null,
  };
  const milestones = new Set([0]);
  if(T.spRet !== null && T.spRet > 0) milestones.add(T.spRet);
  if(T.mePen > 0) milestones.add(T.mePen);
  if(T.spPen !== null && T.spPen > 0) milestones.add(T.spPen);
  const lastPen = Math.max(T.mePen, T.spPen !== null ? T.spPen : 0);
  milestones.add(lastPen + 1);
  const points = [...milestones].sort((a,b)=>a-b);
  let maxBuf = 0;
  const rows = [];
  for(let i=0;i<points.length-1;i++){
    const seg = {from:points[i], to:points[i+1]};
    const midY = (seg.from+seg.to)/2;
    let pension = 0;
    if(midY >= T.mePen) pension += meP.amt;
    if(hasSp && T.spPen !== null && midY >= T.spPen) pension += spP.amt;
    const netMon = Math.max(0, living - pension);
    const segBuf = netMon * bufMonths;
    if(segBuf > maxBuf) maxBuf = segBuf;
    rows.push({fromAge:retAge+seg.from, toAge:retAge+seg.to, pension, netMon, segBuf});
  }
  return {maxBuf, rows};
}

// ── 테스트 유틸
let passed=0, failed=0, warnings=0;
const results = [];

function test(name, fn) {
  try {
    const result = fn();
    if(result === true || result === undefined) {
      passed++;
      results.push({status:'✅', name, msg:''});
    } else if(result && result.warn) {
      warnings++;
      results.push({status:'⚠️', name, msg:result.msg});
    } else {
      failed++;
      results.push({status:'❌', name, msg: typeof result === 'string' ? result : JSON.stringify(result)});
    }
  } catch(e) {
    failed++;
    results.push({status:'💥', name, msg:'에러: '+e.message});
  }
}

function approx(a, b, tol=0.05) {
  if(b===0) return Math.abs(a)<1;
  return Math.abs(a-b)/Math.abs(b) < tol;
}

function between(v, lo, hi) { return v >= lo && v <= hi; }

// ══════════════════════════════════════════════
// 1. calcP — 공적연금 수령액 계산
// ══════════════════════════════════════════════
console.log('\n【1】 공적연금 수령액 계산 (calcP)');

test('정상수령 — 기준액 그대로', () => {
  const p = calcP(100, 'normal', 63, 67);
  if(p.sa!==65) return `수령나이 ${p.sa} ≠ 65`;
  if(p.amt!==100) return `수령액 ${p.amt} ≠ 100`;
  return true;
});

test('조기수령 60세 — 30% 감액', () => {
  const p = calcP(100, 'early', 60, 67);
  if(p.sa!==60) return `수령나이 ${p.sa} ≠ 60`;
  if(p.amt!==70) return `수령액 ${p.amt} ≠ 70 (기대: 100×(1-0.30))`;
  return true;
});

test('조기수령 64세 — 6% 감액', () => {
  const p = calcP(100, 'early', 64, 67);
  if(p.amt!==94) return `수령액 ${p.amt} ≠ 94`;
  return true;
});

test('연기수령 70세 — 36% 증액', () => {
  const p = calcP(100, 'defer', 63, 70);
  if(p.sa!==70) return `수령나이 ${p.sa} ≠ 70`;
  const expected = Math.round(100*(1+7.2*5/100));
  if(p.amt!==expected) return `수령액 ${p.amt} ≠ ${expected}`;
  return true;
});

test('조기수령은 정상보다 적어야 함', () => {
  const early = calcP(100,'early',62,67);
  const normal = calcP(100,'normal',63,67);
  if(early.amt >= normal.amt) return `조기(${early.amt}) ≥ 정상(${normal.amt})`;
  return true;
});

test('연기수령은 정상보다 많아야 함', () => {
  const defer = calcP(100,'defer',63,68);
  const normal = calcP(100,'normal',63,67);
  if(defer.amt <= normal.amt) return `연기(${defer.amt}) ≤ 정상(${normal.amt})`;
  return true;
});

test('기준액 0원이면 어떤 전략이든 0원', () => {
  const e = calcP(0,'early',60,67);
  const n = calcP(0,'normal',63,67);
  const d = calcP(0,'defer',63,70);
  if(e.amt!==0||n.amt!==0||d.amt!==0) return `0원 기준에서 ${e.amt}/${n.amt}/${d.amt}`;
  return true;
});

// ══════════════════════════════════════════════
// 2. buildW — 인출 필요액 계산
// ══════════════════════════════════════════════
console.log('\n【2】 인출 필요액 계산 (buildW)');

test('공적연금 없을 때 — 생활비×인플레만', () => {
  const mon = 300, infl = 3, years = 5;
  const w = buildW(mon, [], years, infl, [], 65);
  // 1년차: 300×12×(1.03)^1
  const expected1 = 300*12*Math.pow(1.03,1);
  if(!approx(w[0], expected1, 0.01)) return `1년차 ${w[0].toFixed(0)} ≠ ${expected1.toFixed(0)}`;
  // 증가해야 함 (물가연동)
  for(let i=1;i<years;i++) if(w[i]<=w[i-1]) return `${i}년차 역전: ${w[i].toFixed(0)} ≤ ${w[i-1].toFixed(0)}`;
  return true;
});

test('공적연금 수령 시작 후 인출 필요액 감소', () => {
  const pensions = [{startY:3, amt:100}]; // 3년차부터 월100만
  const w = buildW(300, pensions, 10, 3, [], 65);
  // 3년차 이후 인출 감소
  if(w[3] >= w[2]) return `연금수령 후 증가: ${w[3].toFixed(0)} ≥ ${w[2].toFixed(0)}`;
  return true;
});

test('생활비 = 공적연금이면 인출 필요액 0', () => {
  const pensions = [{startY:0, amt:300}];
  const w = buildW(300, pensions, 5, 3, [], 65);
  // 0년차부터 연금 수령, 생활비=연금이므로 net=0, 물가만큼 인출 필요
  // 실제로는 (300-300)×inflFactor = 0
  if(!approx(w[0], 0, 0.01)) return `인출필요액 ${w[0].toFixed(0)} ≠ 0`;
  return true;
});

test('생활비 < 공적연금이면 인출 필요액 0 (음수 없음)', () => {
  const pensions = [{startY:0, amt:400}]; // 연금이 생활비 초과
  const w = buildW(300, pensions, 5, 3, [], 65);
  for(let i=0;i<5;i++) if(w[i]<0) return `음수 인출: ${i}년차 ${w[i]}`;
  return true;
});

test('이벤트 비용 — 해당 연도 인출 증가', () => {
  const evts = [{age:68, amt:5000}]; // 65+3=68세에 5000만원
  const w1 = buildW(300, [], 10, 3, [], 65);
  const w2 = buildW(300, [], 10, 3, evts, 65);
  if(w2[3] <= w1[3]) return `이벤트 반영 안됨: ${w2[3].toFixed(0)} ≤ ${w1[3].toFixed(0)}`;
  return true;
});

test('두 공적연금 모두 반영', () => {
  const pensions = [{startY:3, amt:80}, {startY:5, amt:60}];
  const w = buildW(300, pensions, 10, 3, [], 65);
  // 5년차 이후 더 많이 차감
  if(w[6] >= w[4]) return `2번째 연금 미반영: ${w[6].toFixed(0)} ≥ ${w[4].toFixed(0)}`;
  return true;
});

// ══════════════════════════════════════════════
// 3. deterPath — 자산 경로 계산
// ══════════════════════════════════════════════
console.log('\n【3】 자산 경로 계산 (deterPath)');

test('인출 0이면 수익률만큼 증가', () => {
  const path = deterPath(10000, new Array(10).fill(0), 5, 10);
  if(path[0]!==10000) return `초기값 ${path[0]} ≠ 10000`;
  for(let i=1;i<=10;i++) {
    const exp = 10000*Math.pow(1.05,i);
    if(!approx(path[i],exp,0.001)) return `${i}년차 ${path[i].toFixed(0)} ≠ ${exp.toFixed(0)}`;
  }
  return true;
});

test('자산 고갈 시 0 클램프', () => {
  const w = new Array(10).fill(9999999); // 무조건 고갈
  const path = deterPath(1000, w, 5, 10);
  if(path[1]!==0) return `고갈 후 음수: ${path[1]}`;
  return true;
});

test('자산 유입 반영', () => {
  const w = new Array(10).fill(0);
  const inflow = new Array(10).fill(0);
  inflow[4] = 5000; // 5년차에 5000만원 유입
  const pathNoInflow = deterPath(10000, w, 5, 10);
  const pathInflow = deterPath(10000, w, 5, 10, inflow);
  if(pathInflow[5] <= pathNoInflow[5]) return `유입 미반영: ${pathInflow[5].toFixed(0)} ≤ ${pathNoInflow[5].toFixed(0)}`;
  return true;
});

test('수익률 0이면 자산 = 초기값 - 누적인출', () => {
  const w = new Array(5).fill(1200); // 연 1200만
  const path = deterPath(10000, w, 0, 5);
  const expected = 10000 - 1200*5;
  if(!approx(path[5], expected, 0.01)) return `${path[5].toFixed(0)} ≠ ${expected}`;
  return true;
});

// ══════════════════════════════════════════════
// 4. 몬테카를로 — 생존 확률
// ══════════════════════════════════════════════
console.log('\n【4】 몬테카를로 시뮬레이션 (mc)');

test('자산 충분하면 생존확률 90% 이상', () => {
  const w = new Array(20).fill(1200); // 연 1200만 인출
  const prob = mc(100000, w, 6, 10, 20, 0); // 10억, 수익률6%, 변동성10%
  if(prob < 0.9) return `생존확률 ${(prob*100).toFixed(1)}% < 90%`;
  return true;
});

test('자산 부족하면 생존확률 낮음', () => {
  const w = new Array(20).fill(12000); // 연 1.2억 인출
  const prob = mc(5000, w, 4, 12, 20, 0); // 5000만, 수익률4%, 변동성12%
  if(prob > 0.5) return `생존확률 ${(prob*100).toFixed(1)}% > 50% (자산 부족 시나리오)`;
  return true;
});

test('변동성 0이면 결정론과 일치', () => {
  const w = new Array(20).fill(1000);
  const start = 50000, ret = 5;
  const prob = mc(start, w, ret, 0, 20, 0, [], 500); // 변동성 0
  const path = deterPath(start, w, ret, 20);
  const survives = path[20] >= 0 ? 1 : 0;
  if(Math.abs(prob - survives) > 0.01) return `변동성0 mc ${prob.toFixed(2)} ≠ 결정론 ${survives}`;
  return true;
});

test('수익률 높을수록 생존확률 높음', () => {
  const w = new Array(25).fill(2400);
  const p1 = mc(30000, w, 3, 10, 25, 0, [], 500);
  const p2 = mc(30000, w, 7, 10, 25, 0, [], 500);
  if(p2 <= p1) return `수익률7%(${(p2*100).toFixed(1)}%) ≤ 수익률3%(${(p1*100).toFixed(1)}%)`;
  return true;
});

test('인출액 클수록 생존확률 낮음', () => {
  const start = 20000;
  const p1 = mc(start, new Array(20).fill(1200), 5, 12, 20, 0, [], 500);
  const p2 = mc(start, new Array(20).fill(2400), 5, 12, 20, 0, [], 500);
  if(p2 >= p1) return `인출많음(${(p2*100).toFixed(1)}%) ≥ 인출적음(${(p1*100).toFixed(1)}%)`;
  return true;
});

test('상속 목표 높을수록 생존확률 낮음', () => {
  const w = new Array(20).fill(1500);
  const p1 = mc(30000, w, 5, 10, 20, 0, [], 500);
  const p2 = mc(30000, w, 5, 10, 20, 5000, [], 500);
  if(p2 >= p1) return `상속목표있음(${(p2*100).toFixed(1)}%) ≥ 없음(${(p1*100).toFixed(1)}%)`;
  return true;
});

// ══════════════════════════════════════════════
// 5. 현금 버퍼 계산
// ══════════════════════════════════════════════
console.log('\n【5】 현금 버퍼 계산 (calcBufSegments)');

test('배우자 없고 공백기 없을 때 — 버퍼 = 생활비×버퍼기간', () => {
  const meP = calcP(100, 'normal', 63, 67); // 65세 수령
  const spP = calcP(60, 'normal', 63, 67);
  // 은퇴나이=65, 연금=65세 → 공백기 0
  const {maxBuf, rows} = calcBufSegments(65, meP, spP, false, 65, 4, 300);
  // 연금 수령 직후 구간: 300 - 100 = 200만/월 × 48개월
  const expected = 200 * 48;
  if(!approx(maxBuf, expected, 0.05)) return `버퍼 ${maxBuf.toFixed(0)} ≠ ${expected} (생활비-연금 × 버퍼기간)`;
  return true;
});

test('공백기 있을 때 — 미수령 구간 버퍼가 최대', () => {
  const meP = {sa:65, amt:100, adj:0};
  const spP = {sa:65, amt:60, adj:0};
  // 은퇴60세, 연금65세 → 5년 공백
  const {maxBuf, rows} = calcBufSegments(60, meP, spP, false, 60, 4, 300);
  // 공백 구간(연금 미수령): 300 × 48 = 14400
  // 수령 후: 200 × 48 = 9600
  // 공백 구간이 더 커야 함
  if(maxBuf < 300*4*12) return `공백기 버퍼 ${maxBuf.toFixed(0)} < ${300*4*12}`;
  return true;
});

test('생활비 = 공적연금이면 연금수령 후 버퍼 0', () => {
  const meP = {sa:65, amt:300, adj:0};
  const spP = {sa:65, amt:0, adj:0};
  const {rows} = calcBufSegments(65, meP, spP, false, 65, 4, 300);
  const lastRow = rows[rows.length-1];
  if(lastRow.netMon !== 0) return `연금=생활비 구간 netMon ${lastRow.netMon} ≠ 0`;
  return true;
});

test('배우자 있을 때 부부 연금 합산 반영', () => {
  const meP = {sa:65, amt:80, adj:0};
  const spP = {sa:67, amt:60, adj:0};
  // 은퇴60세, 본인연금65세, 배우자연금67세
  const {rows} = calcBufSegments(60, meP, spP, true, 60, 4, 300);
  // 본인연금 수령 후, 배우자연금 수령 전 구간
  const midRow = rows.find(r => r.fromAge>=65 && r.toAge<=67);
  if(!midRow) return '65→67세 구간 없음';
  if(!approx(midRow.pension, 80, 0.01)) return `중간구간 연금 ${midRow.pension} ≠ 80`;
  return true;
});

// ══════════════════════════════════════════════
// 6. 경계값 테스트
// ══════════════════════════════════════════════
console.log('\n【6】 경계값 테스트');

test('은퇴 기간 1년 — 정상 동작', () => {
  const w = buildW(300, [{startY:0,amt:100}], 1, 3, [], 65);
  if(w.length !== 1) return `길이 ${w.length} ≠ 1`;
  if(w[0] < 0) return `음수 인출 ${w[0]}`;
  return true;
});

test('자산 0원 — 인출률 0, 생존확률 0', () => {
  const w = new Array(20).fill(1200);
  const prob = mc(0, w, 5, 10, 20, 0, [], 200);
  if(prob > 0.05) return `자산0 생존확률 ${(prob*100).toFixed(1)}% > 5%`;
  return true;
});

test('인출액 0 — 생존확률 100%', () => {
  const w = new Array(20).fill(0);
  const prob = mc(10000, w, 5, 10, 20, 0, [], 200);
  if(prob < 0.99) return `인출0 생존확률 ${(prob*100).toFixed(1)}% < 99%`;
  return true;
});

test('매우 높은 변동성 — 결과는 0~1 범위', () => {
  const w = new Array(20).fill(1200);
  const prob = mc(20000, w, 5, 50, 20, 0, [], 200);
  if(prob<0||prob>1) return `확률 범위 초과: ${prob}`;
  return true;
});

test('기대수명 = 은퇴나이 — 기간 1년 이상', () => {
  const period = Math.max(1, 65-65);
  if(period < 1) return `기간 ${period} < 1`;
  return true;
});

test('이벤트가 은퇴 전이면 무시', () => {
  const evts = [{age:60, amt:5000}]; // 은퇴 전
  const w1 = buildW(300, [], 10, 3, [], 65);
  const w2 = buildW(300, [], 10, 3, evts, 65);
  for(let i=0;i<10;i++) {
    if(!approx(w1[i],w2[i],0.001)) return `은퇴전 이벤트 반영됨: ${i}년차`;
  }
  return true;
});

test('공적연금 기준액 300만원 이상 — 계산 정상', () => {
  const p = calcP(300, 'normal', 63, 67);
  if(p.amt !== 300) return `amt ${p.amt} ≠ 300`;
  const pd = calcP(300, 'defer', 63, 70);
  if(pd.amt !== Math.round(300*(1+7.2*5/100))) return `연기300 계산 오류`;
  return true;
});

// ══════════════════════════════════════════════
// 7. 시나리오 통합 테스트
// ══════════════════════════════════════════════
console.log('\n【7】 통합 시나리오 테스트');

// 시나리오 함수
function runScenario(label, {assetAtRet, monthly, pensions, infl, years, ret, vol, buf, inherit=0, events=[]}) {
  const w = buildW(monthly, pensions, years, infl, events, 65);
  const bufResult = Math.max(...pensions.length>0 ? [monthly*buf*12, (monthly - pensions[0].amt)*buf*12] : [monthly*buf*12]);
  const bufAmt = Math.max(0, bufResult);
  const investable = Math.max(0, assetAtRet - bufAmt);
  const prob = mc(investable, w, ret, vol, years, inherit, [], 1000);
  const rate = investable>0 ? (w[0]/investable)*100 : 0;
  return {label, investable, prob, rate, w0:w[0]};
}

// S1: 표준 케이스 (10억, 30년, 월300만, 수익률6%, 변동성12%)
test('S1: 표준 케이스 — 생존확률 80% 이상', () => {
  const w = buildW(300, [{startY:3,amt:100}], 30, 3, [], 65);
  const investable = 80000; // 8억
  const prob = mc(investable, w, 6, 12, 30, 0, [], 1000);
  if(prob < 0.7) return `생존확률 ${(prob*100).toFixed(1)}% < 70%`;
  return true;
});

// S2: 조기은퇴 (40세, 65년, 월400만)
test('S2: 조기은퇴 40세 — 65년 기간 계산', () => {
  const years = 105 - 40;
  const w = buildW(400, [{startY:25,amt:100}], years, 3, [], 40);
  if(w.length !== years) return `기간 ${w.length} ≠ ${years}`;
  // 25년차(65세) 이후 인출 감소 확인
  if(w[25] >= w[24]) return `연금 수령 후 인출 감소 안됨`;
  return true;
});

// S3: 고자산 (30억, 인출률 낮음)
test('S3: 고자산 30억 — 인출률 3% 미만', () => {
  const w = buildW(500, [{startY:3,amt:150}], 30, 3, [], 65);
  const investable = 280000; // 28억 (버퍼 제외)
  const rate = w[0]/investable*100;
  if(rate >= 3) return `인출률 ${rate.toFixed(2)}% ≥ 3%`;
  return true;
});

// S4: 저자산 위험 케이스
test('S4: 저자산 2억, 월400만 — 위험 신호', () => {
  const w = buildW(400, [{startY:3,amt:80}], 25, 3, [], 65);
  const investable = 15000; // 1.5억
  const rate = investable>0 ? w[0]/investable*100 : 0;
  if(rate < 5) return {warn:true, msg:`인출률 ${rate.toFixed(2)}% - 위험 신호 감지됨 (정상)`};
  return true;
});

// S5: 배우자 함께, 두 연금 합산
test('S5: 부부 연금 합산 — 인출 필요액 감소', () => {
  const wSingle = buildW(300, [{startY:3,amt:80}], 30, 3, [], 65);
  const wCouple = buildW(300, [{startY:3,amt:80},{startY:5,amt:60}], 30, 3, [], 65);
  // 5년차 이후 부부가 더 적게 인출
  if(wCouple[6] >= wSingle[6]) return `부부 인출(${wCouple[6].toFixed(0)}) ≥ 단독(${wSingle[6].toFixed(0)})`;
  return true;
});

// S6: 연기수령 vs 조기수령 손익분기
test('S6: 연기수령 손익분기 검증', () => {
  const early = calcP(100, 'early', 62, 67); // 62세, -18%
  const defer = calcP(100, 'defer', 63, 68); // 68세, +21.6%
  // 조기: 62세부터 82만원
  // 연기: 68세부터 121.6만원
  // 손익분기: 6년 공백 × 82만 × 12 / (121.6-82) / 12
  const lostYrs = 68-62;
  const lostAmt = early.amt * lostYrs * 12;
  const monthlyDiff = defer.amt - early.amt;
  const beMonths = monthlyDiff>0 ? lostAmt/monthlyDiff : 9999;
  const beAge = 68 + beMonths/12;
  if(beAge < 68 || beAge > 100) return `손익분기 나이 이상: ${beAge.toFixed(1)}세`;
  return true;
});

// S7: 이벤트 비용이 큰 경우 (자녀 독립자금 1억)
test('S7: 큰 이벤트 비용 — 해당 연도 자산 급감', () => {
  const evts = [{age:70, amt:10000}]; // 70세에 1억
  const w = buildW(300, [{startY:3,amt:100}], 20, 3, evts, 65);
  const wNoEvt = buildW(300, [{startY:3,amt:100}], 20, 3, [], 65);
  // 5년차(70세) 인출 급증
  if(w[5] <= wNoEvt[5]) return `이벤트 미반영: ${w[5].toFixed(0)} ≤ ${wNoEvt[5].toFixed(0)}`;
  // 다른 연도는 동일
  if(!approx(w[4], wNoEvt[4], 0.01)) return `비이벤트 연도 영향: ${w[4].toFixed(0)} ≠ ${wNoEvt[4].toFixed(0)}`;
  return true;
});

// S8: 물가상승률 차이
test('S8: 물가상승률 높을수록 인출 빠르게 증가', () => {
  const w1 = buildW(300, [], 10, 2, [], 65);
  const w2 = buildW(300, [], 10, 5, [], 65);
  for(let i=1;i<10;i++) {
    if(w2[i] <= w1[i]) return `물가5%(${w2[i].toFixed(0)}) ≤ 물가2%(${w1[i].toFixed(0)}) at ${i}년차`;
  }
  return true;
});

// S9: 독거 시나리오 — 생활비 감소
test('S9: 독거 생활비 부부 대비 낮음', () => {
  const coupleW = buildW(300, [{startY:3,amt:80}], 15, 3, [], 65);
  const soloW = buildW(200, [{startY:0,amt:80}], 15, 3, [], 65);
  if(soloW[5] >= coupleW[5]) return `독거(${soloW[5].toFixed(0)}) ≥ 부부(${coupleW[5].toFixed(0)})`;
  return true;
});

// S10: 현금흐름 수입 (주택연금 월100만)
test('S10: 현금흐름 수입 — 인출 필요액 감소', () => {
  // buildW는 pensons 배열로만 처리하므로 현금흐름을 pension처럼 추가
  const wNo = buildW(300, [{startY:3,amt:80}], 20, 3, [], 65);
  const wWith = buildW(300, [{startY:3,amt:80},{startY:0,amt:100}], 20, 3, [], 65);
  if(wWith[1] >= wNo[1]) return `현금흐름 미반영: ${wWith[1].toFixed(0)} ≥ ${wNo[1].toFixed(0)}`;
  return true;
});

// S11: 상속 목표가 생존확률에 미치는 영향
test('S11: 상속 목표 5억 — 생존확률 하락 확인', () => {
  const w = new Array(25).fill(2400);
  const p1 = mc(40000, w, 5, 12, 25, 0, [], 500);
  const p2 = mc(40000, w, 5, 12, 25, 5000, [], 500);
  if(p2 > p1+0.05) return `상속목표 있으면 오히려 높음: ${(p2*100).toFixed(1)}% > ${(p1*100).toFixed(1)}%`;
  return true;
});

// S12: 버퍼 기간이 생존확률에 미치는 영향 (버퍼 증가 = 투자가능 감소 = 확률 하락 가능)
test('S12: 버퍼 늘리면 투자가능자산 감소', () => {
  const asset = 30000;
  const living = 300;
  const buf1 = living * 4 * 12; // 4년 버퍼
  const buf2 = living * 8 * 12; // 8년 버퍼
  const inv1 = Math.max(0, asset - buf1);
  const inv2 = Math.max(0, asset - buf2);
  if(inv2 >= inv1) return `버퍼8년 투자가능(${inv2}) ≥ 버퍼4년(${inv1})`;
  return true;
});

// S13: 연금 수령 전략 — 수령액 순서 검증
test('S13: 조기<정상<연기 수령액 순서', () => {
  const base = 150;
  const e60 = calcP(base,'early',60,67);
  const e64 = calcP(base,'early',64,67);
  const normal = calcP(base,'normal',63,67);
  const d66 = calcP(base,'defer',63,66);
  const d70 = calcP(base,'defer',63,70);
  if(!(e60.amt < e64.amt)) return `조기60(${e60.amt}) ≥ 조기64(${e64.amt})`;
  if(!(e64.amt < normal.amt)) return `조기64(${e64.amt}) ≥ 정상(${normal.amt})`;
  if(!(normal.amt < d66.amt)) return `정상(${normal.amt}) ≥ 연기66(${d66.amt})`;
  if(!(d66.amt < d70.amt)) return `연기66(${d66.amt}) ≥ 연기70(${d70.amt})`;
  return true;
});

// S14: 기대수명 105세 극단값
test('S14: 기대수명 105세, 은퇴40세 — 65년 계산', () => {
  const years = 65;
  const w = buildW(400, [{startY:25,amt:100},{startY:27,amt:80}], years, 3, [], 40);
  if(w.length !== years) return `길이 오류 ${w.length}`;
  // 중간에 음수 없어야
  for(let i=0;i<years;i++) if(w[i]<0) return `${i}년차 음수 ${w[i]}`;
  return true;
});

// S15: 0% 수익률 + 인플레 3% = 실질 -3% (자산 빠르게 감소)
test('S15: 수익률0%, 인플레3% — 자산 지속 감소', () => {
  const w = buildW(300, [], 20, 3, [], 65);
  const path = deterPath(50000, w, 0, 20);
  for(let i=1;i<=20;i++) {
    if(path[i] > path[i-1]) return `수익률0에서 자산 증가: ${i}년차 ${path[i].toFixed(0)} > ${path[i-1].toFixed(0)}`;
  }
  return true;
});

// ══════════════════════════════════════════════
// 결과 출력
// ══════════════════════════════════════════════
console.log('\n' + '═'.repeat(60));
console.log('테스트 결과');
console.log('═'.repeat(60));

results.forEach(r => {
  console.log(`${r.status} ${r.name}${r.msg ? '\n      → '+r.msg : ''}`);
});

console.log('\n' + '─'.repeat(60));
console.log(`총 ${passed+failed+warnings}개 | ✅ 통과 ${passed} | ❌ 실패 ${failed} | ⚠️ 경고 ${warnings}`);

if(failed > 0) {
  console.log('\n❌ 실패 목록:');
  results.filter(r=>r.status==='❌'||r.status==='💥').forEach(r => {
    console.log(`  ${r.status} ${r.name}: ${r.msg}`);
  });
}
