import React, { useState, useEffect, useRef, useCallback } from "react";

// ─── Design Tokens ────────────────────────────────────────────────────────────
const C = {
  bg: "#08080f", surface: "#0f0f1e", card: "#131325",
  cardHover: "#1a1a30", accent: "#ff66aa", accentDim: "#c63d7f",
  purple: "#9966ff", purpleDim: "#6633cc", text: "#ddddf5",
  textMuted: "#5a5a88", border: "#1e1e38", success: "#33dd99",
  warning: "#ffaa33", info: "#44aaff", danger: "#ff4455",
  gold: "#ffd700",
};

const STATUS_INFO = {
  ranked:    { color: "#4dabf7", bg: "rgba(77,171,247,.18)",  label: "Ranked"    },
  loved:     { color: "#ff66aa", bg: "rgba(255,102,170,.18)", label: "Loved"     },
  graveyard: { color: "#6668a0", bg: "rgba(102,104,160,.15)", label: "Graveyard" },
  pending:   { color: "#ffa94d", bg: "rgba(255,169,77,.18)",  label: "Pending"   },
  qualified: { color: "#51cf66", bg: "rgba(81,207,102,.18)",  label: "Qualified" },
  approved:  { color: "#94e044", bg: "rgba(148,224,68,.18)",  label: "Approved"  },
  wip:       { color: "#bb77ff", bg: "rgba(187,119,255,.18)", label: "WIP"       },
};

// ─── Community PP Farm Maps ───────────────────────────────────────────────────
const COMMUNITY_PP_MAPS = [
  { id:39804,   title:"Airman ga Taosenai",       artist:"NU-KO",                 mapper:"Snow Note",     diff:"Insane",            sr:5.03, bpm:140, pp:280,  status:"ranked" },
  { id:655530,  title:"Blue Zenith",               artist:"xi",                    mapper:"Sotarks",       diff:"FOUR DIMENSIONS",   sr:7.96, bpm:200, pp:727,  status:"ranked" },
  { id:360749,  title:"FREEDOM DiVE",              artist:"xi",                    mapper:"rustbell",      diff:"FOUR DIMENSIONS",   sr:8.82, bpm:222, pp:900,  status:"ranked" },
  { id:1028849, title:"Harumachi Clover",          artist:"Swing Holic",           mapper:"Sotarks",       diff:"Sotarks' Extra",    sr:5.87, bpm:175, pp:380,  status:"ranked" },
  { id:585913,  title:"Sayonara Heaven",           artist:"Mitsuhiro Oikawa",      mapper:"Sotarks",       diff:"Extra",             sr:6.28, bpm:172, pp:450,  status:"ranked" },
  { id:855183,  title:"Flame's End",               artist:"Camellia",              mapper:"Sotarks",       diff:"Extra",             sr:6.70, bpm:200, pp:520,  status:"ranked" },
  { id:693123,  title:"Hana ni Bourei",            artist:"FELT",                  mapper:"Sotarks",       diff:"Extra",             sr:5.50, bpm:155, pp:320,  status:"ranked" },
  { id:1149990, title:"Singularity",               artist:"xi",                    mapper:"Nakagawa-Kanon",diff:"Extra",             sr:7.20, bpm:194, pp:620,  status:"ranked" },
  { id:1207500, title:"conflict",                  artist:"Camellia",              mapper:"Monstrata",     diff:"INFINITE CONFLICT", sr:8.30, bpm:210, pp:800,  status:"ranked" },
  { id:847764,  title:"Kira Kira Beat",            artist:"xi",                    mapper:"Sotarks",       diff:"Extra",             sr:5.10, bpm:163, pp:300,  status:"ranked" },
  { id:1002681, title:"Furioso Melodia",           artist:"Lunatic Sounds",        mapper:"kriers",        diff:"Expert",            sr:6.40, bpm:193, pp:480,  status:"ranked" },
  { id:728276,  title:"Ascension to Heaven",       artist:"Demetori",              mapper:"Sotarks",       diff:"Extra",             sr:6.90, bpm:180, pp:550,  status:"ranked" },
  { id:417401,  title:"Platinum",                  artist:"Kagamine Rin",          mapper:"Pho",           diff:"Extra",             sr:4.80, bpm:140, pp:240,  status:"ranked" },
  { id:1101755, title:"CHAOS",                     artist:"Camellia",              mapper:"ProfessionalBox",diff:"Halpas Collab",    sr:7.50, bpm:180, pp:660,  status:"ranked" },
  { id:503969,  title:"Atama no Taisou",           artist:"LiSA",                  mapper:"Sotarks",       diff:"Extreme",           sr:5.62, bpm:170, pp:340,  status:"ranked" },
];

// ─── Globals ──────────────────────────────────────────────────────────────────
let gAudio = null;
const OSU_TOKEN_URL = "/oauth/token";
const OSU_API = "/api/v2";

// ─── Storage (Secure Local Storage) ───────────────────────────────────────────
const store = {
  async get(k) { 
    try { 
      const val = localStorage.getItem(k);
      return val ? JSON.parse(val) : null; 
    } catch { 
      return null; 
    } 
  },
  async set(k, v) { 
    try { 
      localStorage.setItem(k, JSON.stringify(v)); 
    } catch {} 
  },
};

// ─── API Abstraction ──────────────────────────────────────────────────────────
const apiGetToken = async (id, secret) => {
  const r = await fetch(OSU_TOKEN_URL, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: parseInt(id), client_secret: secret, grant_type: "client_credentials", scope: "public" }),
  });
  if (!r.ok) { const e = await r.json().catch(()=>({})); throw new Error(e.message || `HTTP ${r.status}`); }
  return r.json();
};

const apiSearch = async (token, { q="", status="any", sort="plays_desc", cursor=null } = {}) => {
  const p = new URLSearchParams({ sort, m: 0 }); 
  if (q) p.set("q", q);
  if (status && status !== "any") p.set("s", status);
  if (cursor) p.set("cursor_string", cursor);
  
  const r = await fetch(`${OSU_API}/beatmapsets/search?${p.toString()}`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  
  if (!r.ok) throw new Error(`API returned ${r.status}. Check your proxy settings.`);
  const data = await r.json();
  
  // Enforce strict deduplication by ID just in case the osu! API returns duplicates
  const uniqueBeatmaps = [];
  const seenIds = new Set();
  for (const bs of (data.beatmapsets || [])) {
    if (!seenIds.has(bs.id)) {
      seenIds.add(bs.id);
      uniqueBeatmaps.push(bs);
    }
  }
  
  return {
    maps: uniqueBeatmaps,
    cursor: data.cursor_string // Save the cursor for the "Load More" pagination
  };
};

const mapBS = (bs) => {
  const diffs = [...(bs.beatmaps||[])].sort((a,b) => b.difficulty_rating - a.difficulty_rating);
  const top = diffs[0] || {};
  return {
    id: bs.id, title: bs.title, artist: bs.artist,
    mapper: bs.creator, status: bs.status,
    cover: bs.covers?.cover || `https://assets.ppy.sh/beatmaps/${bs.id}/covers/cover.jpg`,
    previewAudio: `https://b.ppy.sh/preview/${bs.id}.mp3`,
    bpm: bs.bpm || 0, difficulty: top.version || "", sr: top.difficulty_rating || 0,
    duration: top.total_length || 0,
    downloadUrl: `https://osu.ppy.sh/beatmapsets/${bs.id}#osu/${top.id||""}`,
    pageUrl: `https://osu.ppy.sh/beatmapsets/${bs.id}`,
  };
};

// ─── Audio engine ─────────────────────────────────────────────────────────────
const playPreview = (url, onProgress) => {
  if (gAudio) { gAudio.pause(); gAudio.src = ""; gAudio = null; }
  const a = new Audio(url);
  a.volume = 0; gAudio = a;
  a.addEventListener("timeupdate", () => onProgress && onProgress(a.currentTime, a.duration||1));
  a.addEventListener("error", () => {});
  a.play().catch(()=>{});
  let v = 0;
  const fi = setInterval(() => { if (!gAudio || gAudio !== a) { clearInterval(fi); return; } v = Math.min(1, v+0.06); a.volume = v; if (v>=1) clearInterval(fi); }, 50);
  return a;
};
const stopAudio = () => {
  if (!gAudio) return;
  const a = gAudio; let v = a.volume;
  const fo = setInterval(() => { v = Math.max(0, v-0.12); a.volume = v; if (v<=0) { a.pause(); a.src=""; if (gAudio===a) gAudio=null; clearInterval(fo); } }, 40);
};

// ─── Mini components ──────────────────────────────────────────────────────────
const Badge = ({ status }) => {
  const s = STATUS_INFO[status] || { color:"#888", bg:"rgba(136,136,136,.15)", label: status };
  return <span style={{ padding:"2px 8px", borderRadius:4, fontSize:10, fontWeight:800, color:s.color, background:s.bg, letterSpacing:".8px", textTransform:"uppercase" }}>{s.label}</span>;
};

const Stars = ({ sr }) => {
  const c = sr>=7?"#ff5555":sr>=5.5?"#ff9933":sr>=4?"#ffd700":"#55cc88";
  return <span style={{ color:c, fontWeight:700, fontSize:13 }}>★ {Number(sr).toFixed(2)}</span>;
};

function Btn({ children, onClick, v="primary", sm=false, disabled=false, sx={} }) {
  const [h, sH] = useState(false);
  const vs = {
    primary:   { bg:C.accent,          hov:C.accentDim,               col:"#fff" },
    secondary: { bg:C.purple,          hov:C.purpleDim,               col:"#fff" },
    outline:   { bg:"transparent",     hov:"rgba(255,102,170,.12)",   col:C.accent,   brd:`1px solid ${C.accent}` },
    ghost:     { bg:"transparent",     hov:"rgba(255,255,255,.06)",   col:C.textMuted },
    success:   { bg:"rgba(51,221,153,.15)", hov:"rgba(51,221,153,.28)", col:C.success },
    danger:    { bg:"rgba(255,68,85,.15)",  hov:"rgba(255,68,85,.28)",  col:C.danger  },
    gold:      { bg:"rgba(255,215,0,.15)",  hov:"rgba(255,215,0,.28)",  col:C.gold    },
  };
  const s = vs[v] || vs.primary;
  return (
    <button onClick={disabled?undefined:onClick} onMouseEnter={()=>sH(true)} onMouseLeave={()=>sH(false)} disabled={disabled}
      style={{ padding:sm?"4px 11px":"8px 18px", borderRadius:7, border:s.brd||"none",
        background:h&&!disabled?s.hov:s.bg, color:disabled?"#333":s.col,
        fontFamily:"Outfit,sans-serif", fontWeight:600, fontSize:sm?11:13, cursor:disabled?"not-allowed":"pointer",
        transition:"all .15s", opacity:disabled?.45:1, whiteSpace:"nowrap", ...sx }}>
      {children}
    </button>
  );
}

function Input({ label, value, onChange, type="text", placeholder="", min, max, step }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
      {label && <label style={{ fontSize:11, color:C.textMuted, letterSpacing:".6px", textTransform:"uppercase", fontWeight:600 }}>{label}</label>}
      <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} min={min} max={max} step={step}
        style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, padding:"10px 14px",
          color:C.text, fontFamily:"Outfit,sans-serif", fontSize:14, outline:"none",
          transition:"border .15s" }}
        onFocus={e=>e.target.style.borderColor=C.accent}
        onBlur={e=>e.target.style.borderColor=C.border}
      />
    </div>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
      {label && <label style={{ fontSize:11, color:C.textMuted, letterSpacing:".6px", textTransform:"uppercase", fontWeight:600 }}>{label}</label>}
      <select value={value} onChange={e=>onChange(e.target.value)}
        style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, padding:"10px 14px",
          color:C.text, fontFamily:"Outfit,sans-serif", fontSize:14, outline:"none", cursor:"pointer" }}>
        {options.map(o => <option key={o.value||o} value={o.value||o}>{o.label||o}</option>)}
      </select>
    </div>
  );
}

function Toast({ msg, type="info" }) {
  const col = type==="error"?C.danger:type==="success"?C.success:C.info;
  return (
    <div style={{ position:"fixed", bottom:24, right:24, background:C.card, border:`1px solid ${col}`,
      borderRadius:10, padding:"12px 20px", color:C.text, fontWeight:600, fontSize:14, zIndex:9999,
      boxShadow:"0 8px 32px rgba(0,0,0,.6)", animation:"slideUp .3s ease" }}>
      <span style={{ color:col, marginRight:8 }}>{type==="error"?"✗":type==="success"?"✓":"ℹ"}</span>{msg}
    </div>
  );
}

// ─── Audio Progress Bar ───────────────────────────────────────────────────────
function AudioBar({ progress }) {
  const pct = Math.min(100, (progress.cur/(progress.tot||1))*100);
  return (
    <div style={{ width:"100%", height:3, background:"rgba(255,255,255,.1)", borderRadius:2, marginTop:4, overflow:"hidden" }}>
      <div style={{ height:"100%", width:`${pct}%`, background:C.accent, transition:"width .5s linear", borderRadius:2 }}/>
    </div>
  );
}

// ─── Beatmap Card ─────────────────────────────────────────────────────────────
function BeatCard({ map, playingId, onPlay, onStop, audioProgress, onDownload, onAction, actionLabel, actionV="secondary", extraActions }) {
  const [hov, sHov] = useState(false);
  const isPlaying = playingId === map.id;
  const cover = map.cover || `https://assets.ppy.sh/beatmaps/${map.id}/covers/cover.jpg`;
  return (
    <div onMouseEnter={()=>sHov(true)} onMouseLeave={()=>sHov(false)}
      style={{ background: hov?C.cardHover:C.card, border:`1px solid ${hov?C.accent+"44":C.border}`,
        borderRadius:12, overflow:"hidden", transition:"all .2s", display:"flex", flexDirection:"column",
        boxShadow: hov?"0 6px 28px rgba(0,0,0,.5)":"0 2px 8px rgba(0,0,0,.3)" }}>
      {/* Cover */}
      <div style={{ position:"relative", height:100, overflow:"hidden", flexShrink:0 }}>
        <img src={cover} alt="" style={{ width:"100%", height:"100%", objectFit:"cover", display:"block",
          filter: isPlaying?"brightness(0.7)":"brightness(0.6)", transition:"filter .3s" }}
          onError={e=>{ e.target.style.display="none"; }} />
        <div style={{ position:"absolute", inset:0, background:"linear-gradient(to bottom, transparent 40%, rgba(0,0,0,.85))" }}/>
        <div style={{ position:"absolute", top:8, left:8 }}><Badge status={map.status}/></div>
        {/* Preview button overlay */}
        <button onClick={isPlaying ? onStop : ()=>onPlay(map)}
          style={{ position:"absolute", inset:0, background:"transparent", border:"none", cursor:"pointer",
            display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ width:36, height:36, borderRadius:"50%", background:"rgba(0,0,0,.6)",
            border:`2px solid ${isPlaying?C.accent:"rgba(255,255,255,.5)"}`,
            display:"flex", alignItems:"center", justifyContent:"center",
            opacity: hov||isPlaying?1:0, transition:"opacity .2s",
            color: isPlaying?C.accent:"#fff", fontSize:14 }}>
            {isPlaying?"■":"▶"}
          </div>
        </button>
        {map.sr > 0 && <div style={{ position:"absolute", bottom:8, right:8 }}><Stars sr={map.sr}/></div>}
      </div>
      {/* Audio progress */}
      {isPlaying && <AudioBar progress={audioProgress}/>}
      {/* Info */}
      <div style={{ padding:"10px 12px", flex:1, display:"flex", flexDirection:"column", gap:4 }}>
        <div style={{ fontSize:13, fontWeight:700, color:C.text, lineHeight:1.3, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{map.title}</div>
        <div style={{ fontSize:11, color:C.textMuted, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{map.artist}</div>
        <div style={{ fontSize:11, color:C.textMuted }}>by <span style={{ color:C.purple }}>{map.mapper}</span></div>
        {map.difficulty && <div style={{ fontSize:11, color:C.textMuted, fontStyle:"italic", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{map.difficulty}</div>}
        {(map.bpm > 0 || map.sr > 0) && (
          <div style={{ display:"flex", gap:10, marginTop:2 }}>
            {map.bpm > 0 && <span style={{ fontSize:11, color:C.textMuted }}>🎵 {Math.round(map.bpm)} BPM</span>}
          </div>
        )}
        {/* PP tag for farm */}
        {map.pp && <div style={{ fontSize:12, fontWeight:700, color:C.gold }}>~{map.pp} PP</div>}
        {/* Actions */}
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:6 }}>
          <Btn sm onClick={()=>window.open(map.downloadUrl||map.pageUrl,"_blank")} v="outline">⬇ Download</Btn>
          {onAction && <Btn sm onClick={()=>onAction(map)} v={actionV}>{actionLabel}</Btn>}
          {extraActions?.map((a,i)=><Btn key={i} sm onClick={()=>a.fn(map)} v={a.v||"ghost"}>{a.label}</Btn>)}
        </div>
      </div>
    </div>
  );
}

// ─── Nav Bar ──────────────────────────────────────────────────────────────────
function NavBar({ screen, setScreen, practicePool, ppStack }) {
  const tabs = [
    { key:"discovery", label:"◉ Discovery" },
    { key:"search",    label:"⊕ Search" },
    { key:"pool",      label:`◈ Pool ${practicePool.length}/15` },
    { key:"farm",      label:`◆ PP Farm ${ppStack.length}` },
  ];
  return (
    <div style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center",
      padding:"0 20px", height:52, gap:4, position:"sticky", top:0, zIndex:100 }}>
      <div style={{ fontFamily:"Syne,sans-serif", fontWeight:800, fontSize:18, color:C.accent, marginRight:16, letterSpacing:"-0.5px" }}>
        osu!map
      </div>
      {tabs.map(t => (
        <button key={t.key} onClick={()=>setScreen(t.key)}
          style={{ padding:"6px 16px", borderRadius:8, border:"none",
            background: screen===t.key?"rgba(255,102,170,.15)":"transparent",
            color: screen===t.key?C.accent:C.textMuted,
            fontFamily:"Outfit,sans-serif", fontWeight:600, fontSize:13, cursor:"pointer",
            transition:"all .15s", borderBottom: screen===t.key?`2px solid ${C.accent}`:"2px solid transparent" }}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ─── Clean API Setup GUI ──────────────────────────────────────────────────────
function SetupScreen({ onComplete }) {
  const [cid, sCid] = useState("");
  const [cs, sCs] = useState("");
  const [loading, sLoad] = useState(false);
  const [err, sErr] = useState("");
  const [tested, sTested] = useState(false);

  const testAndSave = async () => {
    if (!cid || !cs) { sErr("Please fill in both fields."); return; }
    sLoad(true); sErr("");
    try {
      const tok = await apiGetToken(cid, cs);
      if (!tok.access_token) throw new Error("No token received");
      sTested(true); sErr("");
      
      // Auto-save & progress once authenticated successfully
      await store.set("creds", { clientId: cid, clientSecret: cs });
      onComplete({ clientId: cid, clientSecret: cs }, tok.access_token);
    } catch(e) { 
      sErr(`Auth failed: ${e.message}. Is your local proxy running?`); 
      sTested(false); 
    } finally { 
      sLoad(false); 
    }
  };

  return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ maxWidth:480, width:"100%", animation:"slideUp .4s ease" }}>
        <div style={{ textAlign:"center", marginBottom:36 }}>
          <div style={{ fontFamily:"Syne,sans-serif", fontWeight:800, fontSize:42, color:C.accent, letterSpacing:"-1px" }}>osu!map</div>
          <div style={{ color:C.textMuted, fontSize:14, marginTop:6 }}>Internal osu! API Integration</div>
        </div>
        <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:16, padding:32 }}>
          <h2 style={{ fontFamily:"Syne,sans-serif", color:C.text, fontSize:20, marginBottom:8 }}>Link osu! Account</h2>
          <p style={{ color:C.textMuted, fontSize:13, lineHeight:1.6, marginBottom:24 }}>
            To fetch beatmaps directly, provide your osu! OAuth application credentials.<br/>
            Get them at <a href="https://osu.ppy.sh/home/account/edit#new-oauth-application" target="_blank" rel="noreferrer"
              style={{ color:C.accent, textDecoration:"none" }}>osu.ppy.sh → Account → OAuth</a>.
          </p>
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            <Input label="Client ID" value={cid} onChange={sCid} placeholder="e.g. 12345"/>
            <Input label="Client Secret" value={cs} onChange={sCs} type="password" placeholder="Enter your secret"/>
          </div>
          {err && <div style={{ marginTop:12, padding:"10px 14px", background:"rgba(255,68,85,.12)", border:`1px solid ${C.danger}`, borderRadius:8, color:C.danger, fontSize:13 }}>{err}</div>}
          <div style={{ display:"flex", gap:10, marginTop:20 }}>
            <Btn onClick={testAndSave} v="primary" disabled={loading} sx={{ width: "100%" }}>
              {loading ? "Authenticating..." : "Authenticate & Enter App"}
            </Btn>
          </div>
        </div>
        <p style={{ textAlign:"center", color:C.textMuted, fontSize:11, marginTop:16 }}>
          Your credentials are only stored securely in your browser's local storage.
        </p>
      </div>
    </div>
  );
}

// ─── Startup Screen ───────────────────────────────────────────────────────────
function StartupScreen({ onChoice, onReconfigure }) {
  return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ maxWidth:600, width:"100%", animation:"slideUp .4s ease" }}>
        <div style={{ textAlign:"center", marginBottom:48 }}>
          <div style={{ fontFamily:"Syne,sans-serif", fontWeight:800, fontSize:52, color:C.accent, letterSpacing:"-2px" }}>osu!map</div>
          <div style={{ color:C.textMuted, fontSize:15, marginTop:8, letterSpacing:".5px" }}>Ready. What would you like to do?</div>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
          {[
            { key:"discovery", icon:"◉", title:"Browse Music", sub:"Discover popular beatmaps visually. Preview, explore, and download.", grad:`linear-gradient(135deg, ${C.accent}22, ${C.accent}08)`, brd:C.accent },
            { key:"search",    icon:"⊕", title:"Strict Search", sub:"Jump straight to beatmap search with strict SR & BPM filters.",  grad:`linear-gradient(135deg, ${C.purple}22, ${C.purple}08)`, brd:C.purple },
          ].map(opt => (
            <button key={opt.key} onClick={()=>onChoice(opt.key)}
              style={{ background:opt.grad, border:`1px solid ${opt.brd}44`, borderRadius:16, padding:"32px 24px",
                cursor:"pointer", textAlign:"left", transition:"all .2s",
                fontFamily:"Outfit,sans-serif" }}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=opt.brd; e.currentTarget.style.transform="translateY(-3px)";}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor=opt.brd+"44"; e.currentTarget.style.transform="translateY(0)";}}>
              <div style={{ fontSize:32, marginBottom:12 }}>{opt.icon}</div>
              <div style={{ fontSize:18, fontWeight:800, color:C.text, fontFamily:"Syne,sans-serif", marginBottom:8 }}>{opt.title}</div>
              <div style={{ fontSize:13, color:C.textMuted, lineHeight:1.6 }}>{opt.sub}</div>
            </button>
          ))}
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", marginTop:20, alignItems:"center" }}>
          <div style={{ display:"flex", gap:8 }}>
            <Btn v="ghost" sm onClick={()=>onChoice("pool")}>◈ Practice Pool</Btn>
            <Btn v="ghost" sm onClick={()=>onChoice("farm")}>◆ PP Farm</Btn>
          </div>
          <Btn v="ghost" sm onClick={onReconfigure}>⚙ Configure API</Btn>
        </div>
      </div>
    </div>
  );
}

// ─── Music Discovery (With Pagination) ────────────────────────────────────────
function DiscoveryScreen({ token, playingId, onPlay, onStop, audioProgress, onUseMusic, onAddToPool, practicePool }) {
  const [maps, sMaps] = useState([]);
  const [loading, sLoad] = useState(false);
  const [err, sErr] = useState("");
  const [status, sStatus] = useState("ranked");
  const [cursor, setCursor] = useState(null);

  const fetchData = async (isLoadMore = false) => {
    sLoad(true); 
    if (!isLoadMore) {
      sErr("");
      sMaps([]);
    }
    
    try {
      const res = await apiSearch(token, { status, sort:"plays_desc", cursor: isLoadMore ? cursor : null });
      const newMaps = res.maps.map(mapBS);
      
      sMaps(prev => {
        if (!isLoadMore) return newMaps;
        // Deduplicate against existing pages
        const existingIds = new Set(prev.map(p => p.id));
        return [...prev, ...newMaps.filter(m => !existingIds.has(m.id))];
      });
      setCursor(res.cursor); // Save the cursor for the next page
    } catch(e) { 
      sErr(`Data fetch failed: ${e.message}`); 
    } finally { 
      sLoad(false); 
    }
  };

  // FILTER LOGIC: Auto-hide maps the instant they are added to the Practice Pool
  const displayMaps = maps.filter(m => !practicePool.some(p => p.id === m.id));

  return (
    <div style={{ padding:"24px 20px" }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:24, flexWrap:"wrap" }}>
        <div>
          <h1 style={{ fontFamily:"Syne,sans-serif", fontSize:24, color:C.text, letterSpacing:"-0.5px" }}>Music Discovery</h1>
          <p style={{ color:C.textMuted, fontSize:13, marginTop:2 }}>Browse top played maps · Preview · Download</p>
        </div>
        <div style={{ marginLeft:"auto", display:"flex", gap:10, alignItems:"flex-end", flexWrap:"wrap" }}>
          <Select label="Status" value={status} onChange={sStatus} options={["any","ranked","loved","graveyard","pending","qualified","approved","wip"]}/>
          <Btn onClick={() => fetchData(false)} v="primary" disabled={loading}>{loading && maps.length === 0 ? "Loading Maps…" : "◎ Refresh Music"}</Btn>
        </div>
      </div>
      
      {err && <div style={{ padding:"12px 16px", background:"rgba(255,68,85,.12)", border:`1px solid ${C.danger}`, borderRadius:8, color:C.danger, fontSize:13, marginBottom:16 }}>{err}</div>}
      
      {!loading && maps.length > 0 && displayMaps.length === 0 && (
        <div style={{ textAlign:"center", padding:"40px 20px", color:C.textMuted }}>
          <div style={{ fontSize:14, marginBottom:8, color:C.success }}>✓ All these maps have been added to your pool!</div>
          <div style={{ fontSize:12 }}>Click Load More to keep discovering.</div>
        </div>
      )}

      {!loading && maps.length===0 && (
        <div style={{ textAlign:"center", padding:"80px 20px", color:C.textMuted }}>
          <div style={{ fontSize:48, marginBottom:16 }}>◉</div>
          <div style={{ fontSize:16, marginBottom:8, color:C.text }}>No beatmaps loaded</div>
          <div style={{ fontSize:13 }}>Click <strong>Refresh Music</strong> to fetch data directly via API</div>
        </div>
      )}

      {displayMaps.length > 0 && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:14 }}>
          {displayMaps.map(m => (
            <BeatCard key={m.id} map={m} playingId={playingId} onPlay={onPlay} onStop={onStop} audioProgress={audioProgress}
              onDownload={()=>window.open(m.downloadUrl,"_blank")}
              onAction={onUseMusic} actionLabel="Use This Music" actionV="primary"
              extraActions={[{ label:"+ Pool", fn:onAddToPool, v:"secondary" }]}/>
          ))}
        </div>
      )}

      {loading && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:14, marginTop: displayMaps.length > 0 ? 14 : 0 }}>
          {Array(8).fill(0).map((_,i)=>(
            <div key={`loading-${i}`} style={{ background:C.card, borderRadius:12, height:240, animation:"pulse 1.5s ease infinite", animationDelay:`${i*0.08}s` }}/>
          ))}
        </div>
      )}

      {cursor && displayMaps.length > 0 && (
        <div style={{ textAlign: "center", marginTop: 32 }}>
          <Btn onClick={() => fetchData(true)} v="outline" disabled={loading}>
            {loading ? "Loading Page..." : "↓ Load More Beatmaps"}
          </Btn>
        </div>
      )}
    </div>
  );
}

// ─── Direct Search w/ Strict Filtering Logic & Pagination ─────────────────────
function SearchScreen({ token, selectedMusic, onClearMusic, playingId, onPlay, onStop, audioProgress, onAddToPool, sr, sSR, bpm, sBPM, practicePool }) {
  const [results, sResults] = useState([]);
  const [loading, sLoad] = useState(false);
  const [err, sErr] = useState("");
  const [status, sStatus] = useState("any");
  const [query, sQuery] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [cursor, setCursor] = useState(null);

  const fetchStrictData = async (isLoadMore = false) => {
    sLoad(true); 
    if (!isLoadMore) { 
      sErr(""); 
      setHasSearched(true); 
      sResults([]); 
    }
    
    try {
      let baseQuery = selectedMusic ? selectedMusic.title : query;
      let apiQuery = baseQuery;
      
      // Send hints to API to get maps close to our bounds
      if (sr > 0) apiQuery += ` stars>=${(sr - 0.5).toFixed(2)} stars<=${(sr + 0.5).toFixed(2)}`;
      if (bpm > 0) apiQuery += ` bpm>=${bpm - 5} bpm<=${bpm + 5}`;
      
      const res = await apiSearch(token, { q: apiQuery.trim(), status, sort: "plays_desc", cursor: isLoadMore ? cursor : null });
      let mapped = res.maps.map(mapBS);

      // Strict Local Enforcement
      if (sr > 0) {
        mapped = mapped.filter(m => m.sr >= sr - 0.5 && m.sr <= sr + 0.5);
      }
      if (bpm > 0) {
        mapped = mapped.filter(m => m.bpm >= bpm - 5 && m.bpm <= bpm + 5);
      }

      sResults(prev => {
        if (!isLoadMore) return mapped;
        const existingIds = new Set(prev.map(p => p.id));
        return [...prev, ...mapped.filter(m => !existingIds.has(m.id))];
      });
      
      setCursor(res.cursor); // Save pagination cursor
    } catch(e) { 
      sErr(`Failed: ${e.message}`); 
    } finally { 
      sLoad(false); 
    }
  };

  // FILTER LOGIC: Auto-hide maps already added to the Practice Pool
  const displayMaps = results.filter(m => !practicePool.some(p => p.id === m.id));

  return (
    <div style={{ padding:"24px 20px" }}>
      <div style={{ marginBottom:20 }}>
        <h1 style={{ fontFamily:"Syne,sans-serif", fontSize:24, color:C.text, letterSpacing:"-0.5px" }}>Direct Strict Search</h1>
        <p style={{ color:C.textMuted, fontSize:13, marginTop:2 }}>Abstracted local filtering for SR and BPM conditions</p>
      </div>
      
      {selectedMusic && (
        <div style={{ background:`linear-gradient(135deg, ${C.accent}18, ${C.accent}08)`, border:`1px solid ${C.accent}44`,
          borderRadius:12, padding:"12px 16px", marginBottom:16, display:"flex", alignItems:"center", gap:12 }}>
          <img src={selectedMusic.cover} alt="" style={{ width:44, height:44, borderRadius:8, objectFit:"cover" }} onError={e=>e.target.style.display="none"}/>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13, color:C.textMuted }}>Searching maps for</div>
            <div style={{ fontSize:15, fontWeight:700, color:C.text }}>{selectedMusic.title}</div>
            <div style={{ fontSize:12, color:C.textMuted }}>{selectedMusic.artist}</div>
          </div>
          <Btn sm v="ghost" onClick={onClearMusic}>✕ Clear</Btn>
        </div>
      )}
      
      <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:"16px 20px", marginBottom:20 }}>
        <div style={{ display:"flex", gap:12, flexWrap:"wrap", alignItems:"flex-end" }}>
          {!selectedMusic && (
            <div style={{ flex:1, minWidth:160 }}>
              <Input label="Search Query (optional)" value={query} onChange={sQuery} placeholder="Song title, artist…"/>
            </div>
          )}
          <div>
            <Input label="Strict SR" value={sr} onChange={v=>sSR(parseFloat(v)||0)} type="number" min="0" max="12" step="0.5"/>
          </div>
          <div>
            <Input label="Strict BPM" value={bpm} onChange={v=>sBPM(parseInt(v)||0)} type="number" min="1" max="400" step="10"/>
          </div>
          <Select label="Status" value={status} onChange={sStatus} options={["any","ranked","loved","graveyard","pending","qualified","approved","wip"]}/>
          <Btn onClick={() => fetchStrictData(false)} v="primary" disabled={loading}>{loading && results.length === 0 ? "Fetching…" : "⊕ Fetch Beatmaps"}</Btn>
        </div>
        
        <div style={{ marginTop:12, padding:"8px 12px", background:"rgba(255,255,255,.05)", borderRadius:8, fontSize:12, color:C.textMuted, display:"inline-block" }}>
          <strong style={{ color:C.text }}>Local Hard Filters Enforced:</strong><br/>
          Star Rating (SR): {sr > 0 ? `${(sr - 0.5).toFixed(1)} to ${(sr + 0.5).toFixed(1)}` : "Any"} · 
          BPM: {bpm > 0 ? `${bpm - 5} to ${bpm + 5}` : "Any"}
        </div>
      </div>
      
      {err && <div style={{ padding:"12px 16px", background:"rgba(255,68,85,.12)", border:`1px solid ${C.danger}`, borderRadius:8, color:C.danger, fontSize:13, marginBottom:16 }}>{err}</div>}
      
      {!loading && results.length > 0 && displayMaps.length === 0 && (
         <div style={{ textAlign:"center", padding:"40px 20px", color:C.textMuted }}>
           <div style={{ fontSize:14, marginBottom:8, color:C.success }}>✓ You've already added all matched maps to your pool!</div>
           <div style={{ fontSize:12 }}>Click Load More to find more matching maps.</div>
         </div>
      )}

      {!loading && results.length === 0 && hasSearched && (
        <div style={{ textAlign:"center", padding:"40px 20px", color:C.textMuted }}>
          <div style={{ fontSize:14, marginBottom:8 }}>No maps on this page survived the strict filtering condition.</div>
          <div style={{ fontSize:12 }}>Try widening your Search Query, adjusting SR/BPM, or loading the next page of results.</div>
        </div>
      )}

      {!loading && results.length === 0 && !hasSearched && (
        <div style={{ textAlign:"center", padding:"60px 20px", color:C.textMuted }}>
          <div style={{ fontSize:48, marginBottom:16 }}>⊕</div>
          <div style={{ fontSize:16, color:C.text, marginBottom:8 }}>Ready to search</div>
          <div style={{ fontSize:13 }}>Set your strict filters and click <strong>Fetch Beatmaps</strong></div>
        </div>
      )}
      
      {displayMaps.length > 0 && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:14 }}>
          {displayMaps.map(m=>(
            <BeatCard key={m.id} map={m} playingId={playingId} onPlay={onPlay} onStop={onStop} audioProgress={audioProgress}
              onAction={onAddToPool} actionLabel="+ Add to Pool" actionV="secondary"/>
          ))}
        </div>
      )}

      {loading && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:14, marginTop: displayMaps.length > 0 ? 14 : 0 }}>
          {Array(8).fill(0).map((_,i)=><div key={`loading-${i}`} style={{ background:C.card, borderRadius:12, height:240, animation:"pulse 1.5s ease infinite", animationDelay:`${i*0.08}s` }}/>)}
        </div>
      )}

      {cursor && (results.length > 0 || hasSearched) && (
        <div style={{ textAlign: "center", marginTop: 32 }}>
          <Btn onClick={() => fetchStrictData(true)} v="outline" disabled={loading}>
            {loading ? "Scanning deeper..." : "↓ Load Next Page to Find More Matches"}
          </Btn>
        </div>
      )}
    </div>
  );
}

// ─── Practice Pool ────────────────────────────────────────────────────────────
function PoolScreen({ pool, onRemove, onToggleDone, onClear }) {
  const done = pool.filter(p=>p.done).length;
  return (
    <div style={{ padding:"24px 20px" }}>
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:24, flexWrap:"wrap", gap:12 }}>
        <div>
          <h1 style={{ fontFamily:"Syne,sans-serif", fontSize:24, color:C.text, letterSpacing:"-0.5px" }}>Practice Pool</h1>
          <p style={{ color:C.textMuted, fontSize:13, marginTop:2 }}>Track your practice maps. Max 15.</p>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ textAlign:"right" }}>
            <div style={{ fontFamily:"Syne,sans-serif", fontSize:28, fontWeight:800, color:C.accent }}>{pool.length}<span style={{color:C.textMuted,fontSize:16}}>/15</span></div>
            <div style={{ fontSize:12, color:C.textMuted }}>{done} completed</div>
          </div>
          {/* Progress circle */}
          <svg width={52} height={52} viewBox="0 0 52 52">
            <circle cx={26} cy={26} r={22} fill="none" stroke={C.border} strokeWidth={4}/>
            <circle cx={26} cy={26} r={22} fill="none" stroke={C.accent} strokeWidth={4}
              strokeDasharray={`${(pool.length/15)*138.2} 138.2`}
              strokeLinecap="round" transform="rotate(-90 26 26)"/>
          </svg>
        </div>
      </div>
      {/* Progress bar */}
      <div style={{ height:6, background:C.surface, borderRadius:3, marginBottom:24, overflow:"hidden" }}>
        <div style={{ height:"100%", width:`${(pool.length/15)*100}%`, background:`linear-gradient(90deg, ${C.accent}, ${C.purple})`, borderRadius:3, transition:"width .4s" }}/>
      </div>
      {pool.length===0 ? (
        <div style={{ textAlign:"center", padding:"60px 20px", color:C.textMuted }}>
          <div style={{ fontSize:48, marginBottom:16 }}>◈</div>
          <div style={{ fontSize:16, color:C.text, marginBottom:8 }}>Pool is empty</div>
          <div style={{ fontSize:13 }}>Add beatmaps from Discovery or Search to start tracking practice</div>
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {pool.map((item, i) => (
            <div key={item.id} style={{ background:item.done?`linear-gradient(135deg, ${C.success}0f, ${C.surface})`:"transparent",
              border:`1px solid ${item.done?C.success+"44":C.border}`,
              borderRadius:12, padding:"14px 16px", display:"flex", alignItems:"center", gap:14,
              transition:"all .2s", animation:`slideUp .3s ease ${i*0.04}s both` }}>
              {/* Cover */}
              <img src={item.cover||`https://assets.ppy.sh/beatmaps/${item.id}/covers/cover.jpg`} alt=""
                style={{ width:52, height:52, borderRadius:8, objectFit:"cover", flexShrink:0 }}
                onError={e=>{e.target.style.background=C.card; e.target.style.display="block";}}/>
              {/* Info */}
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:700, color:item.done?C.success:C.text, fontSize:14, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{item.title}</div>
                <div style={{ fontSize:12, color:C.textMuted }}>{item.artist} · by {item.mapper}</div>
                <div style={{ display:"flex", gap:8, marginTop:4, flexWrap:"wrap" }}>
                  <Badge status={item.status}/>
                  {item.sr>0 && <Stars sr={item.sr}/>}
                  {item.done && <span style={{ fontSize:11, color:C.success, fontWeight:700 }}>✓ Completed</span>}
                </div>
              </div>
              {/* Actions */}
              <div style={{ display:"flex", gap:6, flexShrink:0, flexWrap:"wrap" }}>
                <Btn sm v={item.done?"success":"outline"} onClick={()=>onToggleDone(item.id)}>
                  {item.done?"✓ Done":"Mark Done"}
                </Btn>
                <Btn sm v="ghost" onClick={()=>window.open(item.downloadUrl||item.pageUrl||`https://osu.ppy.sh/beatmapsets/${item.id}`,"_blank")}>⬇</Btn>
                <Btn sm v="danger" onClick={()=>onRemove(item.id)}>✕</Btn>
              </div>
            </div>
          ))}
        </div>
      )}
      {pool.length>0 && (
        <div style={{ marginTop:16, textAlign:"right" }}>
          <Btn v="danger" sm onClick={onClear}>Clear All</Btn>
        </div>
      )}
    </div>
  );
}

// ─── PP Farm ──────────────────────────────────────────────────────────────────
function FarmScreen({ stack, onAddToStack, onRemove, onToggleDone, sr, sSR }) {
  const [tab, sTab] = useState("recommended");
  
  const recMaps = COMMUNITY_PP_MAPS
    .filter(m => m.sr >= Math.max(1, sr - 0.5) && m.sr <= sr + 1.8)
    .sort((a,b) => b.pp - a.pp);
  const allMaps = COMMUNITY_PP_MAPS.sort((a,b) => a.sr - b.sr);

  // FILTER LOGIC: Hide maps that are already inside the Farm Stack
  const displayMaps = (tab === "recommended" ? recMaps : allMaps)
    .filter(m => !stack.some(s => s.id === m.id));

  const stackDone = stack.filter(s=>s.done).length;

  return (
    <div style={{ padding:"24px 20px" }}>
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:20, flexWrap:"wrap", gap:12 }}>
        <div>
          <h1 style={{ fontFamily:"Syne,sans-serif", fontSize:24, color:C.text, letterSpacing:"-0.5px" }}>PP Farm Stack</h1>
          <p style={{ color:C.textMuted, fontSize:13, marginTop:2 }}>Community-suggested maps filtered locally</p>
        </div>
        <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:"12px 16px", display:"flex", gap:16, alignItems:"center" }}>
          <div>
            <div style={{ fontSize:11, color:C.textMuted, textTransform:"uppercase", letterSpacing:".6px" }}>Strict SR Baseline</div>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:4 }}>
              <input type="number" value={sr} onChange={e=>sSR(parseFloat(e.target.value)||1)} min="1" max="12" step="0.5"
                style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:6, padding:"6px 10px", color:C.text, width:70, fontFamily:"Outfit,sans-serif", fontSize:14, outline:"none" }}/>
            </div>
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ fontFamily:"Syne,sans-serif", fontSize:22, fontWeight:800, color:C.gold }}>{stack.length}</div>
            <div style={{ fontSize:11, color:C.textMuted }}>in stack · {stackDone} done</div>
          </div>
        </div>
      </div>

      {/* Stack section */}
      {stack.length>0 && (
        <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:"16px 20px", marginBottom:24 }}>
          <h3 style={{ fontSize:14, fontWeight:700, color:C.gold, marginBottom:14 }}>◆ Your PP Stack ({stack.length})</h3>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {stack.map(item=>(
              <div key={item.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"8px 12px",
                background:item.done?"rgba(51,221,153,.08)":C.surface, borderRadius:8, border:`1px solid ${item.done?C.success+"33":C.border}` }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:item.done?C.success:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{item.title}</div>
                  <div style={{ fontSize:11, color:C.textMuted }}>{item.artist} · {item.diff} · <Stars sr={item.sr}/> · <span style={{color:C.gold}}>~{item.pp} PP</span></div>
                </div>
                <Btn sm v={item.done?"success":"outline"} onClick={()=>onToggleDone(item.id)}>{item.done?"✓ Done":"Done"}</Btn>
                <Btn sm v="ghost" onClick={()=>window.open(`https://osu.ppy.sh/beatmapsets/${item.id}`,"_blank")}>⬇</Btn>
                <Btn sm v="danger" onClick={()=>onRemove(item.id)}>✕</Btn>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Map list */}
      <div style={{ display:"flex", gap:8, marginBottom:16 }}>
        {[["recommended","◆ Recommend for SR Baseline"],["all","All Community Maps"]].map(([k,l])=>(
          <button key={k} onClick={()=>sTab(k)}
            style={{ padding:"7px 16px", borderRadius:8, border:"none",
              background:tab===k?"rgba(255,215,0,.15)":"transparent",
              color:tab===k?C.gold:C.textMuted, fontFamily:"Outfit,sans-serif",
              fontWeight:600, fontSize:13, cursor:"pointer", transition:"all .15s",
              borderBottom:tab===k?`2px solid ${C.gold}`:"2px solid transparent" }}>
            {l}
          </button>
        ))}
      </div>

      {displayMaps.length===0 && tab==="recommended" ? (
        <div style={{ textAlign:"center", padding:"40px 20px", color:C.textMuted }}>
          <div style={{ fontSize:14, marginBottom:8 }}>No maps available for SR {sr.toFixed(1)}.</div>
          <div style={{ fontSize:12 }}>They are either all in your stack, or you need to adjust your SR baseline.</div>
        </div>
      ) : (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:14 }}>
          {displayMaps.map(m=>(
            <div key={m.id} style={{ background:C.card, border:`1px solid ${C.border}`,
              borderRadius:12, overflow:"hidden", transition:"all .2s" }}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=C.accent+"44"; e.currentTarget.style.transform="translateY(-2px)";}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border; e.currentTarget.style.transform="translateY(0)";}}>
              {/* Cover */}
              <div style={{ height:90, overflow:"hidden", position:"relative" }}>
                <img src={`https://assets.ppy.sh/beatmaps/${m.id}/covers/cover.jpg`} alt=""
                  style={{ width:"100%", height:"100%", objectFit:"cover", filter:"brightness(0.55)" }}
                  onError={e=>{e.target.style.display="none";}}/>
                <div style={{ position:"absolute", inset:0, background:"linear-gradient(to bottom, transparent, rgba(0,0,0,.8))" }}/>
                <div style={{ position:"absolute", top:8, left:8 }}><Badge status={m.status}/></div>
                <div style={{ position:"absolute", bottom:8, right:8 }}>
                  <span style={{ fontFamily:"Syne,sans-serif", fontWeight:800, fontSize:16, color:C.gold }}>~{m.pp} PP</span>
                </div>
              </div>
              {/* Info */}
              <div style={{ padding:"10px 12px" }}>
                <div style={{ fontSize:13, fontWeight:700, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{m.title}</div>
                <div style={{ fontSize:11, color:C.textMuted, marginTop:2 }}>{m.artist}</div>
                <div style={{ fontSize:11, color:C.textMuted }}>by <span style={{color:C.purple}}>{m.mapper}</span></div>
                <div style={{ fontSize:11, color:C.textMuted, fontStyle:"italic", marginTop:2 }}>{m.diff}</div>
                <div style={{ display:"flex", gap:10, marginTop:4 }}>
                  <Stars sr={m.sr}/>
                  <span style={{ fontSize:11, color:C.textMuted }}>🎵 {m.bpm} BPM</span>
                </div>
                <div style={{ display:"flex", gap:6, marginTop:10 }}>
                  <Btn sm v="outline" onClick={()=>window.open(`https://osu.ppy.sh/beatmapsets/${m.id}`,"_blank")}>⬇</Btn>
                  <Btn sm v="secondary" onClick={()=>onAddToStack(m)}>+ Add to Stack</Btn>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main App Architecture ────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState("loading");
  const [creds, setCreds] = useState(null);
  const [token, setToken] = useState(null);
  const [selectedMusic, setSelectedMusic] = useState(null);
  const [practicePool, setPracticePool] = useState([]);
  const [ppStack, setPPStack] = useState([]);
  const [sr, setSR] = useState(2.0);
  const [bpm, setBPM] = useState(60);
  const [playingId, setPlayingId] = useState(null);
  const [audioProgress, setAudioProgress] = useState({ cur:0, tot:1 });
  const [toast, setToast] = useState(null);

  // ── CSS injection ────────────────────────────────────────────────────────────
  useEffect(() => {
    const s = document.createElement("style");
    s.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=Syne:wght@700;800&display=swap');
      *, *::before, *::after { box-sizing: border-box; }
      body { margin:0; background:#08080f; }
      ::-webkit-scrollbar { width:6px; }
      ::-webkit-scrollbar-track { background:#0b0b16; }
      ::-webkit-scrollbar-thumb { background:#2a2a44; border-radius:3px; }
      @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
      @keyframes slideUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
      @keyframes fadeIn { from{opacity:0} to{opacity:1} }
      @keyframes spin { to{transform:rotate(360deg)} }
      select option { background:#131325; }
    `;
    document.head.appendChild(s);
    return () => document.head.removeChild(s);
  }, []);

  // ── Application Initialization & Token Handling ───────────────────────────────
  useEffect(() => {
    (async () => {
      const [c, pool, farm, prefs] = await Promise.all([
        store.get("creds"), store.get("pool"), store.get("farm"), store.get("prefs")
      ]);
      if (pool) setPracticePool(pool);
      if (farm) setPPStack(farm);
      if (prefs) { if(prefs.sr) setSR(prefs.sr); if(prefs.bpm) setBPM(prefs.bpm); }
      
      if (c?.clientId && c?.clientSecret) {
        setCreds(c);
        try {
          const tok = await apiGetToken(c.clientId, c.clientSecret);
          setToken(tok.access_token);
          setScreen("startup");
        } catch(e) { 
          console.warn("Token refresh failed. Proxy offline?", e.message); 
          setScreen("setup");
        }
      } else {
        setScreen("setup");
      }
    })();
  }, []);

  // ── Persist Local State ──────────────────────────────────────────────────────
  useEffect(() => { store.set("pool", practicePool); }, [practicePool]);
  useEffect(() => { store.set("farm", ppStack); }, [ppStack]);
  useEffect(() => { store.set("prefs", { sr, bpm }); }, [sr, bpm]);

  const showToast = (msg, type="info") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // ── Audio handlers ───────────────────────────────────────────────────────────
  const handlePlay = useCallback((map) => {
    setPlayingId(map.id);
    setAudioProgress({ cur:0, tot:1 });
    playPreview(map.previewAudio, (cur, tot) => setAudioProgress({ cur, tot }));
  }, []);

  const handleStop = useCallback(() => {
    stopAudio(); setPlayingId(null); setAudioProgress({ cur:0, tot:1 });
  }, []);

  // ── Pool & Farm handlers ────────────────────────────────────────────────────
  const addToPool = (map) => {
    if (practicePool.length >= 15) { showToast("Pool is full! (max 15)", "error"); return; }
    setPracticePool(prev=>[...prev, { ...map, done:false }]);
    showToast(`Added "${map.title}" to pool`, "success");
  };

  const removeFromPool = (id) => setPracticePool(prev=>prev.filter(p=>p.id!==id));
  const togglePoolDone = (id) => setPracticePool(prev=>prev.map(p=>p.id===id?{...p,done:!p.done}:p));

  const addToStack = (map) => {
    setPPStack(prev=>[...prev, { ...map, done:false }]);
    showToast(`Added "${map.title}" to PP stack`, "success");
  };
  const removeFromStack = (id) => setPPStack(prev=>prev.filter(s=>s.id!==id));
  const toggleStackDone = (id) => setPPStack(prev=>prev.map(s=>s.id===id?{...s,done:!s.done}:s));

  // ── GUI Navigation ───────────────────────────────────────────────────────────
  const useMusic = (map) => { setSelectedMusic(map); setScreen("search"); showToast(`"${map.title}" loaded into Search`, "success"); };
  const reconfigure = async () => { await store.set("creds", null); setCreds(null); setToken(null); setScreen("setup"); };
  
  const handleSetupComplete = (c, newToken) => {
    setCreds(c);
    setToken(newToken);
    setScreen("startup");
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  if (screen === "loading") {
    return (
      <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"Outfit,sans-serif" }}>
        <div style={{ textAlign:"center" }}>
          <div style={{ fontFamily:"Syne,sans-serif", fontSize:40, color:C.accent, fontWeight:800 }}>osu!map</div>
          <div style={{ color:C.textMuted, marginTop:12, animation:"pulse 1.5s ease infinite" }}>Initializing API Connection…</div>
        </div>
      </div>
    );
  }

  const appStyle = { fontFamily:"Outfit,sans-serif", minHeight:"100vh", background:C.bg, color:C.text };

  if (screen === "setup") return <div style={appStyle}><SetupScreen onComplete={handleSetupComplete}/></div>;
  if (screen === "startup") return <div style={appStyle}><StartupScreen onChoice={setScreen} onReconfigure={reconfigure}/></div>;

  return (
    <div style={appStyle}>
      <NavBar screen={screen} setScreen={setScreen} practicePool={practicePool} ppStack={ppStack}/>
      <div style={{ maxWidth:1400, margin:"0 auto" }}>
        {screen==="discovery" && (
          <DiscoveryScreen token={token} playingId={playingId} onPlay={handlePlay} onStop={handleStop}
            audioProgress={audioProgress} onUseMusic={useMusic} onAddToPool={addToPool} practicePool={practicePool} />
        )}
        {screen==="search" && (
          <SearchScreen token={token} selectedMusic={selectedMusic} onClearMusic={()=>setSelectedMusic(null)}
            playingId={playingId} onPlay={handlePlay} onStop={handleStop} audioProgress={audioProgress}
            onAddToPool={addToPool} sr={sr} sSR={setSR} bpm={bpm} sBPM={setBPM} practicePool={practicePool} />
        )}
        {screen==="pool" && (
          <PoolScreen pool={practicePool} onRemove={removeFromPool} onToggleDone={togglePoolDone}
            onClear={()=>setPracticePool([])}/>
        )}
        {screen==="farm" && (
          <FarmScreen stack={ppStack} onAddToStack={addToStack} onRemove={removeFromStack}
            onToggleDone={toggleStackDone} sr={sr} sSR={setSR}/>
        )}
      </div>
      {/* Footer Navigation */}
      <div style={{ position:"fixed", bottom:16, left:16, opacity:.4 }}>
        <Btn v="ghost" sm onClick={()=>setScreen("startup")}>← App Home</Btn>
      </div>
      <div style={{ position:"fixed", bottom:16, right:16, opacity:.4 }}>
        <Btn v="ghost" sm onClick={reconfigure}>⚙ Reset API Link</Btn>
      </div>
      {/* Toast */}
      {toast && <Toast msg={toast.msg} type={toast.type}/>}
    </div>
  );
}