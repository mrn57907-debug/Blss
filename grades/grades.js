/**
 * ══════════════════════════════════════════
 *   GRADES MODULE — درجاتي
 *   المرحلة 5: الرسوم البيانية والمؤشرات
 * ══════════════════════════════════════════
 *
 *  الشاشات:
 *  "home"     → الرئيسية (السجل الأكاديمي)
 *  "stats"    → الرسوم البيانية ← جديد
 *  "form"     → نموذج البيانات
 *  "subjects" → المواد والتقديرات
 */

(function () {
  "use strict";

  if (window.__gradesModuleLoaded) return;
  window.__gradesModuleLoaded = true;

  /* ─────────────────────────────────────────
     ثوابت
  ───────────────────────────────────────── */
  const GRADE_MAP = {
    "A+": { pct:"95-100", desc:"ممتاز مرتفع جداً", color:"#22c55e", mid:97 },
    "A":  { pct:"90-94",  desc:"ممتاز",             color:"#22c55e", mid:92 },
    "B+": { pct:"85-89",  desc:"جيد جداً مرتفع",    color:"#3b82f6", mid:87 },
    "B":  { pct:"80-84",  desc:"جيد جداً",          color:"#3b82f6", mid:82 },
    "C+": { pct:"75-79",  desc:"جيد مرتفع",         color:"#14b8a6", mid:77 },
    "C":  { pct:"70-74",  desc:"جيد",               color:"#14b8a6", mid:72 },
    "C-": { pct:"65-69",  desc:"مقبول مرتفع",       color:"#f59e0b", mid:67 },
    "D+": { pct:"60-64",  desc:"مقبول",             color:"#f97316", mid:62 },
    "D":  { pct:"55-59",  desc:"نجاح بالحد الأدنى", color:"#f97316", mid:57 },
    "D-": { pct:"50-54",  desc:"نجاح منخفض",        color:"#fb923c", mid:52 },
    "F":  { pct:"0-49",   desc:"راسب",              color:"#ef4444", mid:25 },
    "غ":  { pct:"—",      desc:"غياب",              color:"#8b5cf6", mid:0  },
    "FX": { pct:"—",      desc:"غير مكتمل",         color:"#6b7280", mid:0  },
  };
  const GRADES_LIST = Object.keys(GRADE_MAP);
  const FAIL_GRADES = new Set(["F","غ","FX"]);

  const SPECIALIZATIONS = [
    "علوم إدارية","نظم معلومات الأعمال",
    "لغات وترجمة فورية","محاسبة","تجارة",
  ];
  const YEARS  = ["الفرقة الأولى","الفرقة الثانية","الفرقة الثالثة","الفرقة الرابعة"];
  const TERMS  = ["الترم الأول","الترم الثاني","سمر كورس"];

  /* ─────────────────────────────────────────
     الحالة
  ───────────────────────────────────────── */
  let _state = {
    screen:"home", allRecords:null, expandedYears:{}, editing:false,
    fullName:"", specialization:"", year:"", term:"",
    subjectCount:0, subjects:[], isSaving:false, isLoading:false,
  };

  /* ─────────────────────────────────────────
     Firebase
  ───────────────────────────────────────── */
  const _FB = "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
  async function _getFS() {
    const db = window.db;
    if (!db) throw new Error("Firebase غير متاح");
    return { db, ...(await import(_FB)) };
  }
  function _key(year,term) {
    return (year+"__"+term).replace(/\s+/g,"_").replace(/[^a-zA-Z0-9_\u0600-\u06FF]/g,"");
  }

  async function _loadAll() {
    const user = window.currentUser;
    if (!user?.uid) return [];
    try {
      const { db, collection, getDocs, orderBy, query } = await _getFS();
      const snap = await getDocs(query(
        collection(db,"grades",user.uid,"records"),
        orderBy("updatedAt","desc")
      ));
      return snap.docs.map(d=>d.data());
    } catch(e) { console.error("[Grades] loadAll:",e); return []; }
  }

  async function _saveRecord() {
    const user = window.currentUser;
    if (!user?.uid) { _toast("يجب تسجيل الدخول أولاً","warn"); return; }
    if (_state.isSaving) return;
    _state.isSaving = true; _setSaveBtnState(true);
    try {
      const { db, doc, setDoc } = await _getFS();
      await setDoc(doc(db,"grades",user.uid,"records",_key(_state.year,_state.term)),{
        fullName:_state.fullName, specialization:_state.specialization,
        year:_state.year, term:_state.term, subjectCount:_state.subjectCount,
        subjects:_state.subjects.map(s=>({name:s.name||"",grade:s.grade||"",pct:s.pct||"",desc:s.desc||""})),
        updatedAt:Date.now(), uid:user.uid,
      },{ merge:false });
      _state.allRecords = null;
      _toast("تم الحفظ بنجاح ✓","success");
    } catch(e) { console.error("[Grades] save:",e); _toast("فشل الحفظ — حاول مرة أخرى","error"); }
    finally { _state.isSaving=false; _setSaveBtnState(false); }
  }

  /* ─────────────────────────────────────────
     حسابات الإحصاء — تُستخدم في المرحلتين 5 و6
  ───────────────────────────────────────── */
  function _calcRecord(r) {
    const subs  = (r.subjects||[]).filter(s=>s.grade);
    const total = subs.length;
    const passed= subs.filter(s=>!FAIL_GRADES.has(s.grade)).length;
    const failed= subs.filter(s=>s.grade==="F").length;
    const absent= subs.filter(s=>s.grade==="غ"||s.grade==="FX").length;
    const passRate = total>0 ? Math.round((passed/total)*100) : 0;
    const avgMid = total>0
      ? Math.round(subs.reduce((a,s)=>a+(GRADE_MAP[s.grade]?.mid||0),0)/total)
      : 0;
    return { total, passed, failed, absent, passRate, avgMid };
  }

  function _calcAll(records) {
    const allSubs = records.flatMap(r=>(r.subjects||[]).filter(s=>s.grade));
    const total   = allSubs.length;
    const passed  = allSubs.filter(s=>!FAIL_GRADES.has(s.grade)).length;
    const failed  = allSubs.filter(s=>s.grade==="F").length;
    const passRate= total>0 ? Math.round((passed/total)*100) : 0;
    const avgMid  = total>0
      ? Math.round(allSubs.reduce((a,s)=>a+(GRADE_MAP[s.grade]?.mid||0),0)/total)
      : 0;
    // توزيع التقديرات
    const dist={};
    GRADES_LIST.forEach(g=>{ dist[g]=0; });
    allSubs.forEach(s=>{ if(dist[s.grade]!==undefined) dist[s.grade]++; });
    return { total, passed, failed, passRate, avgMid, dist };
  }

  function _perfLabel(avg) {
    if (avg>=90) return { label:"ممتاز",    color:"#22c55e" };
    if (avg>=80) return { label:"جيد جداً", color:"#3b82f6" };
    if (avg>=70) return { label:"جيد",      color:"#14b8a6" };
    if (avg>=60) return { label:"مقبول",    color:"#f97316" };
    if (avg>=50) return { label:"نجاح",     color:"#fb923c" };
    return               { label:"ضعيف",    color:"#ef4444" };
  }

  /* ─────────────────────────────────────────
     مساعدات UI
  ───────────────────────────────────────── */
  function _toast(msg,type){ if(typeof window.toast==="function") window.toast(msg,type); }
  function _root(){ return document.getElementById("grades-app-root"); }
  function _setSaveBtnState(loading){
    const btn=document.getElementById("gr-save-btn"); if(!btn) return;
    btn.disabled=loading;
    btn.innerHTML=loading
      ?`<i class="fa-solid fa-spinner fa-spin"></i> جارٍ الحفظ...`
      :`<i class="fa-solid fa-floppy-disk"></i> حفظ البيانات`;
  }
  function _gradeTag(grade){
    if(!grade) return "";
    const info=GRADE_MAP[grade]; if(!info) return "";
    return `<span class="grades-grade-tag" style="--gtc:${info.color}">
      <span class="grades-grade-tag-letter">${grade}</span>
      <span class="grades-grade-tag-pct">${info.pct}${info.pct!=="—"?"%":""}</span>
      <span class="grades-grade-tag-desc">${info.desc}</span>
    </span>`;
  }
  function _applyData(data){
    if(!data) return;
    _state.fullName=data.fullName||""; _state.specialization=data.specialization||"";
    _state.year=data.year||""; _state.term=data.term||"";
    _state.subjectCount=data.subjectCount||0;
    _state.subjects=(data.subjects||[]).map(s=>({
      name:s.name||"", grade:s.grade||"",
      pct: s.pct||(GRADE_MAP[s.grade]?.pct||""),
      desc:s.desc||(GRADE_MAP[s.grade]?.desc||""),
    }));
  }
  function _refTableHtml(){
    return `<div class="grades-ref-table">${GRADES_LIST.map(g=>{
      const i=GRADE_MAP[g];
      return `<div class="grades-ref-row">
        <div class="grades-ref-grade" style="color:${i.color}">${g}</div>
        <div class="grades-ref-pct">${i.pct}${i.pct!=="—"?"%":""}</div>
        <div class="grades-ref-desc">${i.desc}</div>
      </div>`;
    }).join("")}</div>`;
  }
  function _refModalHtml(){
    return `<div id="gr-ref-modal" class="grades-ref-modal" style="display:none"
         onclick="if(event.target===this)window.GradesModule._closeRef()">
      <div class="grades-ref-sheet">
        <div class="grades-ref-header">
          <div class="grades-ref-title"><i class="fa-solid fa-table-list"></i> مرجع التقديرات</div>
          <button class="grades-back-btn" onclick="window.GradesModule._closeRef()"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="grades-ref-body">${_refTableHtml()}</div>
      </div>
    </div>`;
  }

  /* شريط التقدم SVG دائري */
  function _ring(pct, color, size=72) {
    const r=26, cx=size/2, cy=size/2;
    const circ=2*Math.PI*r;
    const dash=Math.min(pct,100)/100*circ;
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="5"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="5"
        stroke-dasharray="${dash} ${circ}" stroke-dashoffset="${circ/4}"
        stroke-linecap="round" style="transition:stroke-dasharray .6s ease"/>
      <text x="${cx}" y="${cy+5}" text-anchor="middle" fill="${color}"
        font-size="13" font-weight="900" font-family="inherit">${pct}%</text>
    </svg>`;
  }

  /* شريط أفقي */
  function _bar(label, val, max, color) {
    const pct = max>0 ? Math.round((val/max)*100) : 0;
    return `<div class="gr-bar-row">
      <div class="gr-bar-label">${label}</div>
      <div class="gr-bar-track">
        <div class="gr-bar-fill" style="width:${pct}%;background:${color}"></div>
      </div>
      <div class="gr-bar-val" style="color:${color}">${val}</div>
    </div>`;
  }

  /* رسم توزيع التقديرات بـ SVG أعمدة */
  function _distChart(dist) {
    const entries = GRADES_LIST.map(g=>({ g, v:dist[g]||0, c:GRADE_MAP[g].color }))
                               .filter(e=>e.v>0);
    if (!entries.length) return `<div class="gr-nodata">لا توجد بيانات كافية</div>`;
    const maxV = Math.max(...entries.map(e=>e.v));
    const W=100, barW=Math.min(14, Math.floor(W/entries.length)-2);
    const H=60;
    const cols = entries.map((e,i)=>{
      const bh = maxV>0 ? Math.round((e.v/maxV)*(H-16)) : 0;
      const x  = (i/(entries.length))*W + (W/entries.length/2) - barW/2;
      const y  = H-bh-1;
      return `<g>
        <rect x="${x}" y="${y}" width="${barW}" height="${bh}" rx="3" fill="${e.c}" opacity=".85"/>
        <text x="${x+barW/2}" y="${H+10}" text-anchor="middle" fill="#5a7499"
          font-size="8" font-family="inherit">${e.g}</text>
        ${e.v>0?`<text x="${x+barW/2}" y="${y-3}" text-anchor="middle" fill="${e.c}"
          font-size="7.5" font-weight="700" font-family="inherit">${e.v}</text>`:""}
      </g>`;
    }).join("");
    return `<svg viewBox="0 0 ${W} ${H+14}" class="gr-dist-svg"
      style="width:100%;height:80px;overflow:visible">${cols}</svg>`;
  }

  /* رسم تطور الأداء بين الترمات */
  function _trendChart(records) {
    // ترتيب السجلات زمنياً حسب الفرقة والترم
    const order = [];
    YEARS.forEach(y=>{ TERMS.forEach(t=>{ order.push(y+"__"+t); }); });
    const sorted = [...records].sort((a,b)=>
      order.indexOf(_key(a.year,a.term)) - order.indexOf(_key(b.year,b.term))
    ).filter(r=>_calcRecord(r).total>0);
    if (sorted.length<2) return `<div class="gr-nodata">تحتاج سجلين على الأقل لعرض التطور</div>`;

    const pts = sorted.map(r=>_calcRecord(r).avgMid);
    const W=100, H=55, pad=8;
    const minV=Math.max(0,Math.min(...pts)-10);
    const maxV=Math.min(100,Math.max(...pts)+10);
    const range=maxV-minV||1;

    const coords = pts.map((v,i)=>{
      const x = pad + (i/(pts.length-1))*(W-2*pad);
      const y = H - pad - ((v-minV)/range)*(H-2*pad);
      return [x,y,v,sorted[i]];
    });

    const polyline = coords.map(([x,y])=>`${x},${y}`).join(" ");
    const area = `${coords[0][0]},${H-pad} ` + coords.map(([x,y])=>`${x},${y}`).join(" ") + ` ${coords[coords.length-1][0]},${H-pad}`;

    const dots = coords.map(([x,y,v,r])=>`
      <circle cx="${x}" cy="${y}" r="3.5" fill="${_perfLabel(v).color}" stroke="#0c1528" stroke-width="1.5"/>
      <text x="${x}" y="${y-7}" text-anchor="middle" fill="${_perfLabel(v).color}"
        font-size="7" font-weight="700" font-family="inherit">${v}%</text>
    `).join("");

    const labels = coords.map(([x,,, r],i)=>`
      <text x="${x}" y="${H+2}" text-anchor="middle" fill="#5a7499"
        font-size="6.5" font-family="inherit"
      >${r.term.replace("الترم ","ت").replace("سمر كورس","سمر")}</text>
    `).join("");

    return `<svg viewBox="0 0 ${W} ${H+8}" class="gr-trend-svg"
      style="width:100%;height:90px;overflow:visible">
      <defs>
        <linearGradient id="gr-area-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#3b82f6" stop-opacity=".25"/>
          <stop offset="100%" stop-color="#3b82f6" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <polygon points="${area}" fill="url(#gr-area-grad)"/>
      <polyline points="${polyline}" fill="none" stroke="#3b82f6" stroke-width="1.8"
        stroke-linejoin="round" stroke-linecap="round"/>
      ${dots}${labels}
    </svg>`;
  }

  /* شاشة تحميل مؤقتة */
  function _renderLoading(root, msg) {
    root.innerHTML = `
      <div class="grades-overlay" onclick="window.GradesModule.close()"></div>
      <div class="grades-sheet">
        <div class="grades-sheet-header">
          <button class="grades-back-btn" onclick="window.GradesModule._goHome()">
            <i class="fa-solid fa-arrow-right"></i> رجوع
          </button>
          <div class="grades-sheet-title"><i class="fa-solid fa-graduation-cap"></i> درجاتي</div>
          <div style="width:60px"></div>
        </div>
        <div class="grades-sheet-body">
          <div class="grades-loading-state">
            <div class="grades-spinner"></div>
            <div class="grades-loading-text">${msg}</div>
          </div>
        </div>
      </div>`;
  }

  /* ─────────────────────────────────────────
     حسابات المرحلة 6
  ───────────────────────────────────────── */
  function _calcAcadStats(records) {
    const validRecs = records.filter(r => (r.subjects||[]).some(s=>s.grade));

    /* ملخص سريع */
    const totalRecords  = records.length;
    const yearsSet      = new Set(records.map(r=>r.year));
    const termsSet      = new Set(records.map(r=>r.term));
    const totalYears    = yearsSet.size;
    const totalTerms    = termsSet.size;

    /* إجمالي المواد */
    const allSubs = records.flatMap(r=>(r.subjects||[]).filter(s=>s.grade));
    const total   = allSubs.length;
    const passed  = allSubs.filter(s=>!FAIL_GRADES.has(s.grade)).length;
    const failed  = allSubs.filter(s=>s.grade==="F").length;
    const absent  = allSubs.filter(s=>s.grade==="غ").length;
    const fx      = allSubs.filter(s=>s.grade==="FX").length;

    /* توزيع التقديرات */
    const dist={};
    GRADES_LIST.forEach(g=>{ dist[g]=0; });
    allSubs.forEach(s=>{ if(dist[s.grade]!==undefined) dist[s.grade]++; });

    /* أفضل ترم */
    let bestTerm=null, bestTermRate=-1;
    validRecs.forEach(r=>{
      const c=_calcRecord(r);
      if(c.total>0 && c.passRate>bestTermRate){ bestTermRate=c.passRate; bestTerm=r; }
    });

    /* أفضل سنة */
    let bestYear=null, bestYearRate=-1;
    YEARS.forEach(y=>{
      const recs=validRecs.filter(r=>r.year===y);
      if(!recs.length) return;
      const ys=_calcAll(recs);
      if(ys.total>0 && ys.passRate>bestYearRate){ bestYearRate=ys.passRate; bestYear=y; }
    });

    /* تطور الأداء */
    const order=[];
    YEARS.forEach(y=>TERMS.forEach(t=>order.push(_key(y,t))));
    const sorted=[...validRecs].sort((a,b)=>order.indexOf(_key(a.year,a.term))-order.indexOf(_key(b.year,b.term)));
    let trend="لا توجد بيانات كافية", trendColor="#5a7499", trendIcon="fa-minus";
    if(sorted.length>=2){
      const pts=sorted.map(r=>_calcRecord(r).avgMid);
      const first=pts.slice(0,Math.ceil(pts.length/2));
      const last =pts.slice(Math.floor(pts.length/2));
      const avgFirst=first.reduce((a,v)=>a+v,0)/first.length;
      const avgLast =last.reduce((a,v)=>a+v,0)/last.length;
      const diff=avgLast-avgFirst;
      if(diff>3)      { trend="الأداء يتحسن ↑";    trendColor="#22c55e"; trendIcon="fa-arrow-trend-up"; }
      else if(diff<-3){ trend="الأداء يتراجع ↓";   trendColor="#ef4444"; trendIcon="fa-arrow-trend-down"; }
      else            { trend="الأداء ثابت ←";      trendColor="#f59e0b"; trendIcon="fa-minus"; }
    }

    return {
      totalRecords,totalYears,totalTerms,
      total,passed,failed,absent,fx,
      dist,
      bestTerm,bestTermRate,
      bestYear,bestYearRate,
      trend,trendColor,trendIcon,
    };
  }

  /* ─────────────────────────────────────────
     شاشة الإحصائيات الأكاديمية (المرحلة 6)
  ───────────────────────────────────────── */
  function _renderAcadStats(root) {
    const records = _state.allRecords || [];
    const s       = _calcAcadStats(records);

    const distRows = GRADES_LIST.filter(g=>s.dist[g]>0).map(g=>{
      const info=GRADE_MAP[g];
      const pct=s.total>0?Math.round((s.dist[g]/s.total)*100):0;
      return `<div class="gr-dist-row">
        <div class="gr-dist-grade" style="color:${info.color}">${g}</div>
        <div class="gr-dist-bar-wrap">
          <div class="gr-dist-bar-fill" style="width:${pct}%;background:${info.color}"></div>
        </div>
        <div class="gr-dist-count" style="color:${info.color}">${s.dist[g]}</div>
        <div class="gr-dist-pct">${pct}%</div>
      </div>`;
    }).join("") || `<div class="gr-nodata">لا توجد بيانات</div>`;

    root.innerHTML = `
      <div class="grades-overlay" onclick="window.GradesModule.close()"></div>
      <div class="grades-sheet">
        <div class="grades-sheet-header">
          <button class="grades-back-btn" onclick="window.GradesModule._goHome()">
            <i class="fa-solid fa-arrow-right"></i> رجوع
          </button>
          <div class="grades-sheet-title">
            <i class="fa-solid fa-square-poll-vertical"></i> الإحصائيات الأكاديمية
          </div>
          <button class="grades-ref-btn" onclick="window.GradesModule._openRef()">
            <i class="fa-solid fa-table-list"></i> مرجع
          </button>
        </div>
        <div class="grades-sheet-body">

          ${records.length===0 ? `
            <div class="grades-empty-state">
              <div class="grades-empty-icon"><i class="fa-solid fa-square-poll-vertical"></i></div>
              <div class="grades-empty-title">لا توجد بيانات بعد</div>
              <div class="grades-empty-sub">أضف سجلاتك الأكاديمية أولاً لعرض الإحصائيات</div>
            </div>
          ` : `

          <!-- ملخص سريع -->
          <div class="grades-section-label"><i class="fa-solid fa-bolt"></i> ملخص سريع</div>
          <div class="gr-quick-grid">
            <div class="gr-quick-card">
              <div class="gr-quick-num">${s.totalRecords}</div>
              <div class="gr-quick-label">إجمالي السجلات</div>
            </div>
            <div class="gr-quick-card">
              <div class="gr-quick-num">${s.totalYears}</div>
              <div class="gr-quick-label">سنوات مسجلة</div>
            </div>
            <div class="gr-quick-card">
              <div class="gr-quick-num">${s.totalTerms}</div>
              <div class="gr-quick-label">ترمات مسجلة</div>
            </div>
          </div>

          <!-- إحصائيات عامة -->
          <div class="grades-section-label"><i class="fa-solid fa-chart-pie"></i> إحصائيات المواد</div>
          <div class="gr-stats-grid">
            <div class="gr-stat-card">
              <div class="gr-stat-num">${s.total}</div>
              <div class="gr-stat-label">إجمالي المواد</div>
            </div>
            <div class="gr-stat-card gr-stat-pass">
              <div class="gr-stat-num" style="color:#22c55e">${s.passed}</div>
              <div class="gr-stat-label">ناجحة</div>
            </div>
            <div class="gr-stat-card gr-stat-fail">
              <div class="gr-stat-num" style="color:#ef4444">${s.failed}</div>
              <div class="gr-stat-label">راسبة</div>
            </div>
            <div class="gr-stat-card">
              <div class="gr-stat-num" style="color:#8b5cf6">${s.absent}</div>
              <div class="gr-stat-label">غياب</div>
            </div>
            <div class="gr-stat-card">
              <div class="gr-stat-num" style="color:#6b7280">${s.fx}</div>
              <div class="gr-stat-label">غير مكتمل</div>
            </div>
          </div>

          <!-- مؤشر التطور -->
          <div class="grades-section-label"><i class="fa-solid fa-chart-line"></i> متابعة التطور</div>
          <div class="gr-trend-banner" style="border-color:${s.trendColor}30;background:${s.trendColor}0d">
            <i class="fa-solid ${s.trendIcon}" style="color:${s.trendColor};font-size:22px;flex-shrink:0"></i>
            <div class="gr-trend-text" style="color:${s.trendColor}">${s.trend}</div>
          </div>

          <!-- أفضل أداء -->
          ${(s.bestTerm||s.bestYear)?`
          <div class="grades-section-label"><i class="fa-solid fa-trophy"></i> أفضل أداء</div>
          <div class="gr-best-grid">
            ${s.bestTerm?`<div class="gr-best-card">
              <div class="gr-best-icon"><i class="fa-solid fa-calendar-check"></i></div>
              <div class="gr-best-info">
                <div class="gr-best-title">أفضل ترم</div>
                <div class="gr-best-val">${_escHtml(s.bestTerm.term)}</div>
                <div class="gr-best-sub">${_escHtml(s.bestTerm.year)}</div>
                <div class="gr-best-rate" style="color:#22c55e">${s.bestTermRate}% نجاح</div>
              </div>
            </div>`:""}
            ${s.bestYear?`<div class="gr-best-card">
              <div class="gr-best-icon"><i class="fa-solid fa-layer-group"></i></div>
              <div class="gr-best-info">
                <div class="gr-best-title">أفضل سنة</div>
                <div class="gr-best-val">${_escHtml(s.bestYear)}</div>
                <div class="gr-best-rate" style="color:#22c55e">${s.bestYearRate}% نجاح</div>
              </div>
            </div>`:""}
          </div>
          `:""}

          <!-- تحليل التقديرات -->
          <div class="grades-section-label"><i class="fa-solid fa-list-ol"></i> تحليل التقديرات</div>
          <div class="gr-dist-list">${distRows}</div>

          `}
        </div>
      </div>
      ${_refModalHtml()}
    `;
  }

  /* ─────────────────────────────────────────
     المرحلة 7 — التقرير الأكاديمي النهائي
  ───────────────────────────────────────── */

  /* بناء بيانات التقرير — نقطة التصدير المستقبلية (PDF/Excel) */
  function _buildReportData(records) {
    const s   = _calcAcadStats(records);
    const all = _calcAll(records.filter(r=>_calcRecord(r).total>0));
    const latest = [...records].sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0))[0] || {};
    const avgMid   = all.avgMid   || 0;
    const passRate = all.passRate || 0;

    let perfText = "";
    if (s.totalRecords === 0) {
      perfText = "لا توجد بيانات كافية لتقييم الأداء.";
    } else if (avgMid >= 90 && passRate >= 95) {
      perfText = "الأداء الأكاديمي ممتاز ومستقر بشكل لافت على مدار المسيرة الدراسية.";
    } else if (avgMid >= 80 && passRate >= 85) {
      perfText = "الأداء الأكاديمي جيد جداً مع تميز واضح في أغلب الفصول الدراسية.";
    } else if (avgMid >= 70 && passRate >= 75) {
      perfText = s.trendIcon==="fa-arrow-trend-up"
        ? "الأداء الأكاديمي جيد مع تحسن ملحوظ في الفصول الأخيرة."
        : "الأداء الأكاديمي جيد بشكل عام مع وجود مجال للتطور.";
    } else if (avgMid >= 60 && passRate >= 60) {
      perfText = s.trendIcon==="fa-arrow-trend-down"
        ? "الأداء الأكاديمي مقبول لكنه يشهد تراجعاً يستوجب الانتباه."
        : "الأداء الأكاديمي مقبول ويحتاج إلى جهد إضافي لرفع المستوى.";
    } else if (passRate >= 50) {
      perfText = "الأداء الأكاديمي متذبذب بين الفصول الدراسية ويحتاج إلى تحسين مستمر.";
    } else {
      perfText = "الأداء الأكاديمي يحتاج إلى مراجعة جدية واهتمام أكبر بالمواد الدراسية.";
    }

    return { latest, s, all, avgMid, passRate, perfText };
    /* ── جاهز للتوسع مستقبلاً: exportPDF(data) / exportExcel(data) ── */
  }

  function _reportHtml(data) {
    const { latest, s, all, avgMid, passRate, perfText } = data;
    const perf = _perfLabel(avgMid);
    const now  = new Date().toLocaleDateString("ar-EG",{year:"numeric",month:"long",day:"numeric"});

    const distRows = GRADES_LIST.map(g=>{
      const count = s.dist[g]||0; if(!count) return "";
      const info  = GRADE_MAP[g];
      const pct   = s.total>0 ? Math.round((count/s.total)*100) : 0;
      return `<tr>
        <td style="font-weight:900;color:${info.color};text-align:center">${g}</td>
        <td>${info.desc}</td>
        <td style="text-align:center;font-weight:800">${count}</td>
        <td style="text-align:center">${pct}%</td>
      </tr>`;
    }).join("") || `<tr><td colspan="4" style="text-align:center;color:#5a7499">لا توجد بيانات</td></tr>`;

    return `<div class="gr-report-wrap" id="gr-report-printable">

      <!-- رأس التقرير -->
      <div class="gr-report-header">
        <div class="gr-report-logo"><i class="fa-solid fa-graduation-cap"></i></div>
        <div class="gr-report-title-block">
          <div class="gr-report-title">التقرير الأكاديمي النهائي</div>
          <div class="gr-report-date">${now}</div>
        </div>
      </div>

      <!-- ملخص الطالب -->
      <div class="gr-report-section">
        <div class="gr-report-section-title"><i class="fa-solid fa-user-graduate"></i> ملخص الطالب</div>
        <div class="gr-report-info-grid">
          <div class="gr-report-info-row"><span class="gr-ri-label">الاسم</span><span class="gr-ri-val">${_escHtml(latest.fullName)||"—"}</span></div>
          <div class="gr-report-info-row"><span class="gr-ri-label">التخصص</span><span class="gr-ri-val">${_escHtml(latest.specialization)||"—"}</span></div>
          <div class="gr-report-info-row"><span class="gr-ri-label">السنوات المسجلة</span><span class="gr-ri-val">${s.totalYears}</span></div>
          <div class="gr-report-info-row"><span class="gr-ri-label">الترمات المسجلة</span><span class="gr-ri-val">${s.totalTerms}</span></div>
          <div class="gr-report-info-row"><span class="gr-ri-label">إجمالي المواد</span><span class="gr-ri-val">${s.total}</span></div>
        </div>
      </div>

      <!-- ملخص النتائج -->
      <div class="gr-report-section">
        <div class="gr-report-section-title"><i class="fa-solid fa-chart-pie"></i> ملخص النتائج</div>
        <div class="gr-report-results-grid">
          <div class="gr-report-result-card gr-rrc-pass"><div class="gr-rrc-num">${s.passed}</div><div class="gr-rrc-label">ناجحة</div></div>
          <div class="gr-report-result-card gr-rrc-fail"><div class="gr-rrc-num">${s.failed}</div><div class="gr-rrc-label">راسبة</div></div>
          <div class="gr-report-result-card gr-rrc-absent"><div class="gr-rrc-num">${s.absent}</div><div class="gr-rrc-label">غياب</div></div>
          <div class="gr-report-result-card gr-rrc-fx"><div class="gr-rrc-num">${s.fx}</div><div class="gr-rrc-label">غير مكتمل</div></div>
        </div>
        <div class="gr-report-pass-bar-wrap">
          <div class="gr-report-pass-bar-label">نسبة النجاح الكلية</div>
          <div class="gr-report-pass-bar-track">
            <div class="gr-report-pass-bar-fill" style="width:${passRate}%;background:${perf.color}"></div>
          </div>
          <div class="gr-report-pass-bar-pct" style="color:${perf.color}">${passRate}%</div>
        </div>
      </div>

      <!-- توزيع التقديرات -->
      <div class="gr-report-section">
        <div class="gr-report-section-title"><i class="fa-solid fa-list-ol"></i> توزيع التقديرات</div>
        <table class="gr-report-table">
          <thead><tr><th>التقدير</th><th>الوصف</th><th>العدد</th><th>النسبة</th></tr></thead>
          <tbody>${distRows}</tbody>
        </table>
      </div>

      <!-- أفضل النتائج -->
      ${(s.bestTerm||s.bestYear)?`
      <div class="gr-report-section">
        <div class="gr-report-section-title"><i class="fa-solid fa-trophy"></i> أفضل النتائج</div>
        <div class="gr-report-best-grid">
          ${s.bestYear?`<div class="gr-report-best-card">
            <div class="gr-rbc-icon"><i class="fa-solid fa-layer-group"></i></div>
            <div class="gr-rbc-info">
              <div class="gr-rbc-label">أفضل سنة دراسية</div>
              <div class="gr-rbc-val">${_escHtml(s.bestYear)}</div>
              <div class="gr-rbc-rate">${s.bestYearRate}% نسبة نجاح</div>
            </div>
          </div>`:""}
          ${s.bestTerm?`<div class="gr-report-best-card">
            <div class="gr-rbc-icon"><i class="fa-solid fa-calendar-check"></i></div>
            <div class="gr-rbc-info">
              <div class="gr-rbc-label">أفضل ترم دراسي</div>
              <div class="gr-rbc-val">${_escHtml(s.bestTerm.term)}</div>
              <div class="gr-rbc-sub">${_escHtml(s.bestTerm.year)}</div>
              <div class="gr-rbc-rate">${s.bestTermRate}% أعلى نسبة نجاح</div>
            </div>
          </div>`:""}
        </div>
      </div>`:""}

      <!-- ملخص الأداء النصي -->
      <div class="gr-report-section">
        <div class="gr-report-section-title"><i class="fa-solid fa-pen-nib"></i> ملخص الأداء</div>
        <div class="gr-report-perf-block" style="border-color:${perf.color}40;background:${perf.color}0a">
          <div class="gr-report-perf-badge" style="color:${perf.color};background:${perf.color}15;border-color:${perf.color}30">
            ${perf.label} — ${avgMid}%
          </div>
          <div class="gr-report-perf-text">${perfText}</div>
        </div>
      </div>

      <!-- تذييل -->
      <div class="gr-report-footer">تم إنشاء هذا التقرير بواسطة نظام درجاتي — ${now}</div>
    </div>`;
  }

  function _renderReport(root) {
    const records = _state.allRecords || [];
    root.innerHTML = `
      <div class="grades-overlay" onclick="window.GradesModule.close()"></div>
      <div class="grades-sheet">
        <div class="grades-sheet-header">
          <button class="grades-back-btn" onclick="window.GradesModule._goHome()">
            <i class="fa-solid fa-arrow-right"></i> رجوع
          </button>
          <div class="grades-sheet-title">
            <i class="fa-solid fa-file-lines"></i> التقرير النهائي
          </div>
          ${records.length>0
            ? `<button class="gr-print-btn" onclick="window.GradesModule._printReport()">
                 <i class="fa-solid fa-print"></i> طباعة
               </button>`
            : `<div style="width:70px"></div>`}
        </div>
        <div class="grades-sheet-body">
          ${records.length===0
            ? `<div class="grades-empty-state">
                 <div class="grades-empty-icon"><i class="fa-solid fa-file-lines"></i></div>
                 <div class="grades-empty-title">لا توجد بيانات بعد</div>
                 <div class="grades-empty-sub">أضف سجلاتك الأكاديمية أولاً لإنشاء التقرير</div>
               </div>`
            : _reportHtml(_buildReportData(records))}
        </div>
      </div>
      ${_refModalHtml()}
    `;
  }

  function _renderStats(root) {
    const records = (_state.allRecords||[]).filter(r=>_calcRecord(r).total>0);
    const stats   = _calcAll(records);
    const perf    = _perfLabel(stats.avgMid);

    /* بطاقات الفرق مع أشرطة التقدم */
    const yearCards = YEARS.map(year=>{
      const recs = records.filter(r=>r.year===year);
      if (!recs.length) return "";
      const ys = _calcAll(recs);
      const yp = _perfLabel(ys.avgMid);
      return `<div class="gr-year-stat-card">
        <div class="gr-ysc-header">
          <div class="gr-ysc-title">${year}</div>
          <span class="gr-perf-badge" style="color:${yp.color};border-color:${yp.color}20;background:${yp.color}12">${yp.label}</span>
        </div>
        <div class="gr-ysc-bars">
          ${_bar("ناجح",ys.passed,ys.total,"#22c55e")}
          ${_bar("راسب",ys.failed,ys.total,"#ef4444")}
        </div>
        <div class="gr-ysc-rate">نسبة النجاح <strong style="color:${yp.color}">${ys.passRate}%</strong></div>
      </div>`;
    }).filter(Boolean).join("");

    root.innerHTML = `
      <div class="grades-overlay" onclick="window.GradesModule.close()"></div>
      <div class="grades-sheet">
        <div class="grades-sheet-header">
          <button class="grades-back-btn" onclick="window.GradesModule._goHome()">
            <i class="fa-solid fa-arrow-right"></i> رجوع
          </button>
          <div class="grades-sheet-title">
            <i class="fa-solid fa-chart-line"></i> المؤشرات البيانية
          </div>
          <button class="grades-ref-btn" onclick="window.GradesModule._openRef()">
            <i class="fa-solid fa-table-list"></i> مرجع
          </button>
        </div>

        <div class="grades-sheet-body">

          ${records.length===0 ? `
            <div class="grades-empty-state">
              <div class="grades-empty-icon"><i class="fa-solid fa-chart-line"></i></div>
              <div class="grades-empty-title">لا توجد بيانات بعد</div>
              <div class="grades-empty-sub">أضف سجلاتك الأكاديمية أولاً لعرض المؤشرات</div>
            </div>
          ` : `

          <!-- بطاقات المؤشرات الرئيسية -->
          <div class="gr-kpi-grid">
            <div class="gr-kpi-card">
              ${_ring(stats.passRate, "#22c55e")}
              <div class="gr-kpi-label">نسبة النجاح</div>
            </div>
            <div class="gr-kpi-card">
              ${_ring(stats.avgMid, perf.color)}
              <div class="gr-kpi-label">متوسط الأداء</div>
            </div>
            <div class="gr-kpi-card gr-kpi-count">
              <div class="gr-kpi-num">${stats.total}</div>
              <div class="gr-kpi-label">إجمالي المواد</div>
            </div>
            <div class="gr-kpi-card gr-kpi-count">
              <div class="gr-kpi-num" style="color:#22c55e">${stats.passed}</div>
              <div class="gr-kpi-label">مواد ناجحة</div>
            </div>
            <div class="gr-kpi-card gr-kpi-count">
              <div class="gr-kpi-num" style="color:#ef4444">${stats.failed}</div>
              <div class="gr-kpi-label">مواد راسبة</div>
            </div>
            <div class="gr-kpi-card gr-kpi-count">
              <div class="gr-kpi-num" style="color:#8b5cf6">${stats.dist["غ"]+(stats.dist["FX"]||0)}</div>
              <div class="gr-kpi-label">غياب/FX</div>
            </div>
          </div>

          <!-- مستوى الأداء العام -->
          <div class="gr-perf-banner" style="border-color:${perf.color}30;background:${perf.color}0d">
            <i class="fa-solid fa-trophy" style="color:${perf.color}"></i>
            <div>
              <div class="gr-perf-main" style="color:${perf.color}">${perf.label}</div>
              <div class="gr-perf-sub">مستوى الأداء الأكاديمي العام</div>
            </div>
            <div class="gr-perf-avg" style="color:${perf.color}">${stats.avgMid}%</div>
          </div>

          <!-- توزيع التقديرات -->
          <div class="gr-chart-card">
            <div class="gr-chart-title">
              <i class="fa-solid fa-chart-bar"></i> توزيع التقديرات
            </div>
            ${_distChart(stats.dist)}
          </div>

          <!-- تطور الأداء -->
          <div class="gr-chart-card">
            <div class="gr-chart-title">
              <i class="fa-solid fa-chart-line"></i> تطور الأداء بين الترمات
            </div>
            ${_trendChart(records)}
          </div>

          <!-- أداء كل فرقة -->
          ${yearCards ? `
          <div class="grades-section-label">
            <i class="fa-solid fa-layer-group"></i> أداء كل فرقة
          </div>
          <div class="gr-year-stats">${yearCards}</div>
          ` : ""}

          `}

        </div>
      </div>
      ${_refModalHtml()}
    `;
  }

  /* ─────────────────────────────────────────
     شاشة الرئيسية
  ───────────────────────────────────────── */
  function _renderHome(root) {
    const records = _state.allRecords || [];
    const byYear  = {};
    YEARS.forEach(y=>{ byYear[y]=[]; });
    records.forEach(r=>{ if(byYear[r.year]) byYear[r.year].push(r); });
    const hasAny = records.length > 0;

    const yearsHtml = YEARS.map(year=>{
      const recs=byYear[year], count=recs.length;
      const isOpen=_state.expandedYears[year]!==false;
      const termsHtml = count===0 ? "" : recs.map(r=>{
        const c=_calcRecord(r);
        return `<div class="grades-arc-record"
          onclick="window.GradesModule._openRecord('${_escAttr(r.year)}','${_escAttr(r.term)}')">
          <div class="grades-arc-record-info">
            <div class="grades-arc-record-term"><i class="fa-solid fa-calendar-days"></i> ${_escHtml(r.term)}</div>
            <div class="grades-arc-record-meta">
              <span>${r.subjectCount||0} مادة</span>
              ${c.passed>0?`<span class="gr-pass">${c.passed} ناجح</span>`:""}
              ${c.failed>0?`<span class="gr-fail">${c.failed} راسب</span>`:""}
            </div>
          </div>
          <div class="grades-arc-record-arrow"><i class="fa-solid fa-chevron-left"></i></div>
        </div>`;
      }).join("");
      return `<div class="grades-arc-year ${count>0?"has-records":"empty"}">
        <button class="grades-arc-year-header"
                onclick="window.GradesModule._toggleYear('${_escAttr(year)}')">
          <div class="grades-arc-year-title"><i class="fa-solid fa-layer-group"></i> ${year}</div>
          <div class="grades-arc-year-right">
            <span class="grades-arc-count">${count>0?count+" سجل":"لا يوجد"}</span>
            <i class="fa-solid fa-chevron-down grades-arc-chevron ${isOpen&&count>0?"open":""}"></i>
          </div>
        </button>
        ${count>0&&isOpen?`<div class="grades-arc-records">${termsHtml}</div>`:""}
      </div>`;
    }).join("");

    root.innerHTML = `
      <div class="grades-overlay" onclick="window.GradesModule.close()"></div>
      <div class="grades-sheet">
        <div class="grades-sheet-header">
          <button class="grades-back-btn" onclick="window.GradesModule.close()">
            <i class="fa-solid fa-arrow-right"></i> رجوع
          </button>
          <div class="grades-sheet-title">
            <i class="fa-solid fa-graduation-cap"></i> درجاتي
          </div>
          <button class="grades-ref-btn" onclick="window.GradesModule._openRef()">
            <i class="fa-solid fa-table-list"></i> مرجع
          </button>
        </div>
        <div class="grades-sheet-body">
          <div class="gr-home-actions">
            <button class="grades-btn-primary grades-btn-new"
                    onclick="window.GradesModule._startNew()">
              <i class="fa-solid fa-plus"></i>
              ${hasAny?"إضافة سجل جديد":"إنشاء أول سجل أكاديمي"}
            </button>
            ${hasAny?`<button class="gr-btn-stats"
                onclick="window.GradesModule._goStats()">
              <i class="fa-solid fa-chart-line"></i> المؤشرات
            </button>
            <button class="gr-btn-acadstats"
                onclick="window.GradesModule._goAcadStats()">
              <i class="fa-solid fa-square-poll-vertical"></i>
            </button>
            <button class="gr-btn-acadstats gr-btn-report"
                onclick="window.GradesModule._goReport()">
              <i class="fa-solid fa-file-lines"></i>
            </button>`:""}
          </div>
          ${hasAny?`
          <div class="grades-section-label">
            <i class="fa-solid fa-archive"></i> السجل الأكاديمي
            <span class="grades-arc-total">${records.length} سجل</span>
          </div>
          ${yearsHtml}
          `:`<div class="grades-empty-state">
            <div class="grades-empty-icon"><i class="fa-solid fa-graduation-cap"></i></div>
            <div class="grades-empty-title">لا يوجد سجلات بعد</div>
            <div class="grades-empty-sub">ابدأ بإنشاء أول سجل أكاديمي لك</div>
          </div>`}
        </div>
      </div>
      ${_refModalHtml()}
    `;

    if (_state.allRecords===null) {
      _state.allRecords=[];
      _loadAll().then(recs=>{ _state.allRecords=recs; if(_state.screen==="home") _renderHome(_root()); });
    }
  }

  /* ─────────────────────────────────────────
     شاشة النموذج
  ───────────────────────────────────────── */
  function _renderForm(root) {
    root.innerHTML = `
      <div class="grades-overlay" onclick="window.GradesModule.close()"></div>
      <div class="grades-sheet">
        <div class="grades-sheet-header">
          <button class="grades-back-btn" onclick="window.GradesModule._goHome()">
            <i class="fa-solid fa-arrow-right"></i> رجوع
          </button>
          <div class="grades-sheet-title">
            <i class="fa-solid fa-pen-to-square"></i>
            ${_state.editing?"تعديل السجل":"سجل جديد"}
          </div>
          <button class="grades-ref-btn" onclick="window.GradesModule._openRef()">
            <i class="fa-solid fa-table-list"></i> مرجع
          </button>
        </div>
        <div class="grades-sheet-body">
          <div class="grades-section-label"><i class="fa-solid fa-user-graduate"></i> البيانات الأساسية</div>
          <div class="grades-field">
            <label class="grades-label">الاسم الثلاثي</label>
            <input id="gr-fullName" class="grades-input" type="text"
              placeholder="أدخل اسمك الثلاثي" maxlength="80" value="${_escHtml(_state.fullName)}" />
          </div>
          <div class="grades-field">
            <label class="grades-label">التخصص</label>
            <div class="grades-chips">
              ${SPECIALIZATIONS.map(s=>`<button
                class="grades-chip${_state.specialization===s?" active":""}"
                onclick="window.GradesModule._pick('specialization','${_escAttr(s)}',this)"
              >${s}</button>`).join("")}
            </div>
          </div>
          <div class="grades-field">
            <label class="grades-label">الفرقة الدراسية</label>
            <div class="grades-chips">
              ${YEARS.map(y=>`<button
                class="grades-chip${_state.year===y?" active":""}${_state.editing?" disabled":""}"
                ${_state.editing?"disabled":""}
                onclick="window.GradesModule._pick('year','${_escAttr(y)}',this)"
              >${y}</button>`).join("")}
            </div>
            ${_state.editing?`<div class="grades-edit-note"><i class="fa-solid fa-lock"></i> لا يمكن تغيير الفرقة عند التعديل</div>`:""}
          </div>
          <div class="grades-field">
            <label class="grades-label">الترم</label>
            <div class="grades-chips">
              ${TERMS.map(t=>`<button
                class="grades-chip${_state.term===t?" active":""}${_state.editing?" disabled":""}"
                ${_state.editing?"disabled":""}
                onclick="window.GradesModule._pick('term','${_escAttr(t)}',this)"
              >${t}</button>`).join("")}
            </div>
            ${_state.editing?`<div class="grades-edit-note"><i class="fa-solid fa-lock"></i> لا يمكن تغيير الترم عند التعديل</div>`:""}
          </div>
          <div class="grades-field">
            <label class="grades-label">عدد المواد</label>
            <div class="grades-count-row">
              <button class="grades-count-btn" onclick="window.GradesModule._changeCount(-1)"><i class="fa-solid fa-minus"></i></button>
              <span id="gr-count-display" class="grades-count-val">${_state.subjectCount}</span>
              <button class="grades-count-btn" onclick="window.GradesModule._changeCount(1)"><i class="fa-solid fa-plus"></i></button>
            </div>
          </div>
          <button class="grades-btn-primary" onclick="window.GradesModule._goToSubjects()">
            <i class="fa-solid fa-arrow-left"></i> التالي — إدخال المواد
          </button>
        </div>
      </div>
      ${_refModalHtml()}
    `;
  }

  /* ─────────────────────────────────────────
     شاشة المواد
  ───────────────────────────────────────── */
  function _renderSubjects(root) {
    const subjectsHtml = _state.subjects.map((s,i)=>`
      <div class="grades-subject-card">
        <div class="grades-subject-num">${i+1}</div>
        <div class="grades-subject-fields">
          <input class="grades-input" type="text" placeholder="اسم المادة" maxlength="60"
            value="${_escHtml(s.name)}"
            oninput="window.GradesModule._updateSubject(${i},'name',this.value)" />
          <select class="grades-select" onchange="window.GradesModule._pickGrade(${i},this.value)">
            <option value="">— اختر التقدير —</option>
            ${GRADES_LIST.map(g=>`<option value="${g}"${s.grade===g?" selected":""}>${g}</option>`).join("")}
          </select>
          <div id="gr-gtag-${i}" class="grades-grade-preview">${s.grade?_gradeTag(s.grade):""}</div>
        </div>
      </div>`).join("");

    root.innerHTML = `
      <div class="grades-overlay" onclick="window.GradesModule.close()"></div>
      <div class="grades-sheet">
        <div class="grades-sheet-header">
          <button class="grades-back-btn" onclick="window.GradesModule._backToForm()">
            <i class="fa-solid fa-arrow-right"></i> رجوع
          </button>
          <div class="grades-sheet-title"><i class="fa-solid fa-list-check"></i> المواد والتقديرات</div>
          <button class="grades-ref-btn" onclick="window.GradesModule._openRef()">
            <i class="fa-solid fa-table-list"></i> مرجع
          </button>
        </div>
        <div class="grades-sheet-body">
          <div class="grades-summary-bar">
            <span><i class="fa-solid fa-user"></i> ${_escHtml(_state.fullName)||"—"}</span>
            <span><i class="fa-solid fa-building-columns"></i> ${_escHtml(_state.specialization)||"—"}</span>
            <span><i class="fa-solid fa-layer-group"></i> ${_escHtml(_state.year)||"—"}</span>
            <span><i class="fa-solid fa-calendar"></i> ${_escHtml(_state.term)||"—"}</span>
          </div>
          <div class="grades-section-label"><i class="fa-solid fa-book"></i> المواد (${_state.subjectCount})</div>
          <div id="gr-subjects-list">${subjectsHtml}</div>
          <button id="gr-save-btn" class="grades-btn-primary grades-btn-save"
            onclick="window.GradesModule._save()">
            <i class="fa-solid fa-floppy-disk"></i> حفظ البيانات
          </button>
        </div>
      </div>
      ${_refModalHtml()}
    `;
  }

  /* ─────────────────────────────────────────
     الوحدة الرئيسية
  ───────────────────────────────────────── */
  const GradesModule = {
    version:"7.0.0",

    open: async function(){
      const root=_root(); if(!root) return;
      if(!window.currentUser?.uid){ _toast("يجب تسجيل الدخول أولاً","warn"); return; }
      _state.screen="home"; _state.allRecords=null; _state.expandedYears={};
      root.classList.add("grades-open"); root.style.display="flex";
      _renderHome(root);
    },

    close: function(){
      const root=_root(); if(!root) return;
      root.classList.remove("grades-open"); root.style.display="none"; root.innerHTML="";
    },

    _goHome: function(){
      _state.screen="home"; _state.allRecords=null; _renderHome(_root());
    },

    _goStats: function(){
      _state.screen="stats";
      const root=_root();
      if(_state.allRecords===null){
        _renderLoading(root,"جارٍ تحميل البيانات...");
        _loadAll().then(recs=>{ _state.allRecords=recs; if(_state.screen==="stats") _renderStats(_root()); });
      } else { _renderStats(root); }
    },

    _goAcadStats: function(){
      _state.screen="acadstats";
      const root=_root();
      if(_state.allRecords===null){
        _renderLoading(root,"جارٍ تحميل البيانات...");
        _loadAll().then(recs=>{ _state.allRecords=recs; if(_state.screen==="acadstats") _renderAcadStats(_root()); });
      } else { _renderAcadStats(root); }
    },

    _startNew: function(){
      _state.screen="form"; _state.editing=false;
      _state.fullName=""; _state.specialization=""; _state.year=""; _state.term="";
      _state.subjectCount=0; _state.subjects=[];
      _renderForm(_root());
    },

    _openRecord: async function(year,term){
      const root=_root();
      const body=root.querySelector(".grades-sheet-body");
      if(body) body.innerHTML=`<div class="grades-loading-state"><div class="grades-spinner"></div><div class="grades-loading-text">جارٍ تحميل السجل...</div></div>`;
      try {
        const { db, doc, getDoc } = await _getFS();
        const snap = await getDoc(doc(db,"grades",window.currentUser.uid,"records",_key(year,term)));
        if(!snap.exists()){ _toast("السجل غير موجود","warn"); _renderHome(root); return; }
        _applyData(snap.data()); _state.editing=true; _state.screen="form"; _renderForm(root);
      } catch(e){ console.error("[Grades] openRecord:",e); _toast("فشل تحميل السجل","error"); _renderHome(root); }
    },

    _toggleYear: function(year){
      _state.expandedYears[year]=!(_state.expandedYears[year]!==false);
      if(_state.screen==="home") _renderHome(_root());
    },

    _goToSubjects: function(){
      const inp=document.getElementById("gr-fullName"); if(inp) _state.fullName=inp.value.trim();
      if(!_state.fullName)       { _shake("gr-fullName"); _toast("أدخل الاسم الثلاثي","warn"); return; }
      if(!_state.specialization) { _toast("اختر التخصص","warn"); return; }
      if(!_state.year)           { _toast("اختر الفرقة الدراسية","warn"); return; }
      if(!_state.term)           { _toast("اختر الترم","warn"); return; }
      if(_state.subjectCount<1)  { _toast("حدد عدد المواد (1 على الأقل)","warn"); return; }
      const ex=_state.subjects;
      _state.subjects=Array.from({length:_state.subjectCount},(_,i)=>{
        const e=ex[i]; return {
          name:e?.name||"", grade:e?.grade||"",
          pct: e?.pct ||(GRADE_MAP[e?.grade]?.pct||""),
          desc:e?.desc||(GRADE_MAP[e?.grade]?.desc||""),
        };
      });
      _state.screen="subjects"; _renderSubjects(_root());
    },

    _backToForm: function(){ _state.screen="form"; _renderForm(_root()); },

    _pick: function(field,value,btn){
      _state[field]=value;
      const g=btn.closest(".grades-chips");
      if(g){ g.querySelectorAll(".grades-chip").forEach(c=>c.classList.remove("active")); btn.classList.add("active"); }
    },

    _pickGrade: function(index,grade){
      if(!_state.subjects[index]) return;
      const info=GRADE_MAP[grade]||{};
      Object.assign(_state.subjects[index],{grade,pct:info.pct||"",desc:info.desc||""});
      const el=document.getElementById(`gr-gtag-${index}`);
      if(el) el.innerHTML=grade?_gradeTag(grade):"";
    },

    _changeCount: function(delta){
      const v=Math.max(0,Math.min(20,_state.subjectCount+delta));
      _state.subjectCount=v;
      const d=document.getElementById("gr-count-display"); if(d) d.textContent=v;
    },

    _updateSubject: function(i,field,val){ if(_state.subjects[i]) _state.subjects[i][field]=val; },

    _save: async function(){
      await _saveRecord();
      if(!_state.isSaving)
        setTimeout(()=>{ _state.screen="home"; _state.allRecords=null; _renderHome(_root()); },600);
    },

    _goReport: function(){
      _state.screen="report";
      const root=_root();
      if(_state.allRecords===null){
        _renderLoading(root,"جارٍ إنشاء التقرير...");
        _loadAll().then(recs=>{ _state.allRecords=recs; if(_state.screen==="report") _renderReport(_root()); });
      } else { _renderReport(root); }
    },

    _printReport: function(){
      const el = document.getElementById("gr-report-printable");
      if(!el){ _toast("لم يتم تحميل التقرير","warn"); return; }
      const style = document.getElementById("gr-print-style") || (()=>{
        const s=document.createElement("style"); s.id="gr-print-style";
        s.textContent=`@media print{
          body > *:not(#grades-app-root){ display:none!important; }
          #grades-app-root .grades-overlay,
          #grades-app-root .grades-sheet-header{ display:none!important; }
          #grades-app-root{ position:static!important;background:#fff!important; }
          #grades-app-root .grades-sheet{ max-height:none!important;border-radius:0!important;border:none!important;box-shadow:none!important; }
          #grades-app-root .grades-sheet-body{ overflow:visible!important;padding:0!important; }
          .gr-report-wrap{ color:#000!important; }
          .gr-report-table th,.gr-report-table td{ border-color:#ccc!important; }
          .gr-report-section{ border-color:#ddd!important; }
        }`;
        document.head.appendChild(s); return s;
      })();
      window.print();
    },


    _closeRef: function(){ const m=document.getElementById("gr-ref-modal"); if(m) m.style.display="none"; },

    _init: function(){
      if(!document.getElementById("grades-app-root")){ console.error("[Grades] grades-app-root غير موجود"); return; }
      console.log("[Grades] ✓ المرحلة 7 جاهزة");
    },
  };

  /* ─────────────────────────────────────────
     دوال مساعدة
  ───────────────────────────────────────── */
  function _escHtml(s){ if(!s) return ""; return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
  function _escAttr(s){ return s?String(s).replace(/'/g,"\\'"):""; }
  function _shake(id){ const el=document.getElementById(id); if(!el) return; el.classList.add("grades-shake"); setTimeout(()=>el.classList.remove("grades-shake"),500); }

  window.GradesModule = GradesModule;
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",()=>GradesModule._init());
  else GradesModule._init();

})();
