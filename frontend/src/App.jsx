import { useState, useEffect, useRef, useCallback } from "react";

const API_BASE = "http://localhost:9999";

// ── Constants ─────────────────────────────────────────────────────────────
const SITUATIONS = [
  { id:"traffic_stop",  icon:"🚗", label:"Traffic Stop",   desc:"Pulled over by police" },
  { id:"arrest",        icon:"🚨", label:"Arrest",         desc:"Being placed under arrest" },
  { id:"search",        icon:"🔍", label:"Search",         desc:"Officer wants to search" },
  { id:"immigration",   icon:"🛂", label:"Immigration",    desc:"Immigration encounter" },
  { id:"interrogation", icon:"💬", label:"Interrogation",  desc:"Police questioning" },
];
const STATES = ["NY","CA","TX","FL","federal"];
const UX = {
  red:    { bg:"rgba(255,45,45,0.09)",  border:"#ff2d2d", badge:"#ff2d2d", label:"ACT NOW",   dot:"🔴", glow:"0 0 18px rgba(255,45,45,0.35)"  },
  yellow: { bg:"rgba(255,179,0,0.09)",  border:"#ffb300", badge:"#ffb300", label:"CAUTION",   dot:"🟡", glow:"0 0 18px rgba(255,179,0,0.3)"   },
  green:  { bg:"rgba(0,229,118,0.09)",  border:"#00e576", badge:"#00e576", label:"YOU'RE OK", dot:"🟢", glow:"0 0 18px rgba(0,229,118,0.2)"   },
};
const DOC_LABELS = {
  judicial_warrant:"Judicial Warrant", administrative_warrant:"Admin Warrant",
  summons:"Summons", traffic_ticket:"Traffic Ticket", notice:"Notice",
  id_document:"ID Document", other:"Document",
};

// ── API helpers ───────────────────────────────────────────────────────────
const post = (url, body) =>
  fetch(`${API_BASE}${url}`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) })
    .then(r => { if(!r.ok) throw new Error(`${url} → ${r.status}`); return r.json(); });

async function apiPrepare(situation, state, description) {
  return post("/prepare", { situation, state, description });
}
async function apiAnalyze(spoken_text, situation, state, description, conversation_history) {
  return post("/analyze", { spoken_text, situation, state, description, conversation_history });
}
async function apiAnalyzeDocument(image_base64, media_type, state, situation, description) {
  return post("/analyze-document", { image_base64, media_type, state, situation, description });
}
async function apiGenerateReport(body) {
  const res = await fetch(`${API_BASE}/generate-report`, {
    method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`report → ${res.status}`);
  return res.blob();
}

// ── Speech hook ───────────────────────────────────────────────────────────
function useSpeech(onResult) {
  const ref = useRef(null);
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setSupported(false); return; }
    const r = new SR();
    r.continuous = true; r.interimResults = false; r.lang = "en-US";
    r.onresult = e => { const t = e.results[e.results.length-1][0].transcript.trim(); if(t) onResult(t); };
    r.onerror  = e => console.error("[Speech]", e.error);
    r.onend    = () => setListening(false);
    ref.current = r;
  }, [onResult]);

  const start = useCallback(() => { ref.current?.start(); setListening(true); }, []);
  const stop  = useCallback(() => { ref.current?.stop();  setListening(false); }, []);
  return { listening, supported, start, stop };
}

// ── Main App ──────────────────────────────────────────────────────────────
export default function App() {
  // screen: intake | ready | listening | done
  const [screen,      setScreen]      = useState("intake");
  const [situation,   setSituation]   = useState(null);
  const [stateCode,   setStateCode]   = useState(null);
  const [description, setDescription] = useState("");
  const [loadedLaws,  setLoadedLaws]  = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [transcript,  setTranscript]  = useState([]);
  const [history,     setHistory]     = useState([]);
  const [isThinking,  setIsThinking]  = useState(false);
  const [preparing,   setPreparing]   = useState(false);
  const [error,       setError]       = useState(null);
  const [backendOk,   setBackendOk]   = useState(null);
  const [startTime,   setStartTime]   = useState(null);

  // Vision state
  const [showCamera,     setShowCamera]     = useState(false);
  const [scanResult,     setScanResult]     = useState(null);
  const [scanning,       setScanning]       = useState(false);
  const [docFindings,    setDocFindings]    = useState([]);
  const videoRef  = useRef(null);
  const streamRef = useRef(null);
  const canvasRef = useRef(null);

  // Report state
  const [reportLoading, setReportLoading] = useState(false);
  const [reportReady,   setReportReady]   = useState(false);

  const feedEndRef = useRef(null);

  useEffect(() => { feedEndRef.current?.scrollIntoView({ behavior:"smooth" }); }, [suggestions]);

  useEffect(() => {
    fetch(`${API_BASE}/health`)
      .then(r => setBackendOk(r.ok))
      .catch(() => setBackendOk(false));
  }, []);

  // ── Speech handler ────────────────────────────────────────────────────
  const handleSpeech = useCallback(async (text) => {
    const ts = new Date().toLocaleTimeString();
    setTranscript(p => [...p, { text, ts }]);
    const msg = { role:"user", content:`Other party said: "${text}"` };
    const h2  = [...history, msg];
    setHistory(h2);
    if (isThinking) return;
    setIsThinking(true);
    setError(null);
    try {
      const res = await apiAnalyze(text, situation, stateCode, description, h2);
      if (res.suggestion) {
        setHistory(p => [...p, { role:"assistant", content:JSON.stringify(res) }]);
        setSuggestions(p => [...p, { ...res, id:Date.now(), time:ts, trigger:text }]);
      }
    } catch(e) { setError("Analysis failed — is backend running?"); }
    setIsThinking(false);
  }, [situation, stateCode, description, history, isThinking]);

  const { listening, supported, start:startSpeech, stop:stopSpeech } = useSpeech(handleSpeech);

  // ── Prepare ───────────────────────────────────────────────────────────
  async function handlePrepare() {
    setPreparing(true); setError(null);
    try {
      const data = await apiPrepare(situation, stateCode, description);
      setLoadedLaws(data.laws);
      setScreen("ready");
    } catch {
      setLoadedLaws(fallbackLaws(situation, stateCode));
      setScreen("ready");
      setError("Backend offline — using local law cache.");
    } finally { setPreparing(false); }
  }

  // ── Camera ────────────────────────────────────────────────────────────
  async function openCamera() {
    setShowCamera(true); setScanResult(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode:"environment" } });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch { setError("Camera access denied."); setShowCamera(false); }
  }

  function closeCamera() {
    streamRef.current?.getTracks().forEach(t => t.stop());
    setShowCamera(false);
  }

  async function captureAndScan() {
    if (!videoRef.current || !canvasRef.current) return;
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    const dataUrl    = canvas.toDataURL("image/jpeg", 0.85);
    const base64     = dataUrl.split(",")[1];
    const media_type = "image/jpeg";

    setScanning(true);
    try {
      const result = await apiAnalyzeDocument(base64, media_type, stateCode, situation, description);
      setScanResult(result);
      setDocFindings(p => [...p, result]);
      closeCamera();
    } catch { setError("Document scan failed."); }
    setScanning(false);
  }

  // Also allow file upload as fallback
  async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl    = ev.target.result;
      const base64     = dataUrl.split(",")[1];
      const media_type = file.type || "image/jpeg";
      setScanning(true);
      try {
        const result = await apiAnalyzeDocument(base64, media_type, stateCode, situation, description);
        setScanResult(result);
        setDocFindings(p => [...p, result]);
      } catch { setError("Document scan failed."); }
      setScanning(false);
    };
    reader.readAsDataURL(file);
  }

  // ── Listen controls ───────────────────────────────────────────────────
  function startListening() {
    if (!supported) { setError("Speech recognition requires Chrome."); return; }
    setSuggestions([]); setTranscript([]); setHistory([]);
    setDocFindings([]); setScanResult(null);
    setStartTime(Date.now());
    startSpeech();
    setScreen("listening");
  }

  function stopListening() {
    stopSpeech();
    setScreen("done");
  }

  // ── Report ────────────────────────────────────────────────────────────
  async function downloadReport() {
    setReportLoading(true); setError(null);
    try {
      const blob = await apiGenerateReport({
        situation, state: stateCode, description,
        transcript, suggestions, doc_findings: docFindings,
        duration_seconds: startTime ? Math.floor((Date.now() - startTime) / 1000) : 0,
      });
      const url  = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href     = url;
      link.download = `law-coach-report-${Date.now()}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      setReportReady(true);
    } catch { setError("Report generation failed — is backend running?"); }
    setReportLoading(false);
  }

  function reset() {
    setSituation(null); setStateCode(null); setDescription("");
    setSuggestions([]); setTranscript([]); setHistory([]);
    setLoadedLaws([]); setDocFindings([]); setScanResult(null);
    setError(null); setReportReady(false); setScreen("intake");
  }

  // ── RENDER ────────────────────────────────────────────────────────────
  return (
    <div style={C.app}>
      <style>{GCSS}</style>

      {/* HEADER */}
      <header style={C.hdr}>
        <div style={C.hdrL}>
          <span style={{fontSize:20}}>⚖️</span>
          <span style={C.logo}>LAW COACH AI</span>
          <span style={C.beta}>BETA · v2</span>
        </div>
        <div style={C.hdrR}>
          <span style={{...C.dot, background: backendOk===null?"#4b5563":backendOk?"#00e576":"#ff2d2d"}}/>
          <span style={C.statusTxt}>{backendOk===null?"checking...":backendOk?"backend online":"backend offline"}</span>
          <span style={C.notlegal}>NOT LEGAL ADVICE</span>
        </div>
      </header>

      <main style={C.main}>

        {/* ══ INTAKE ══════════════════════════════════════════════════════ */}
        {screen==="intake" && (
          <div className="fi">
            <div style={{marginBottom:32}}>
              <div style={C.h1}>Know Your Rights.</div>
              <div style={C.sub}>Real-time AI coaching during police encounters.<br/>Select your situation to begin.</div>
            </div>

            <Label n="01" t="What's happening?" />
            <div style={C.grid2}>
              {SITUATIONS.map(s => (
                <button key={s.id} className="cb" style={C.sCard(situation===s.id)} onClick={()=>setSituation(s.id)}>
                  <span style={{fontSize:22,marginBottom:4}}>{s.icon}</span>
                  <span style={C.sCardLbl(situation===s.id)}>{s.label}</span>
                  <span style={C.sCardDsc}>{s.desc}</span>
                </button>
              ))}
            </div>

            <Label n="02" t="Which state?" />
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:28}}>
              {STATES.map(st => (
                <button key={st} className="sb" style={C.stBtn(stateCode===st)} onClick={()=>setStateCode(st)}>{st}</button>
              ))}
            </div>

            <Label n="03" t="Briefly describe what's happening" />
            <textarea style={C.ta} placeholder="e.g. Officer pulled me over asking to search my car..."
              value={description} onChange={e=>setDescription(e.target.value)} />

            {error && <ErrBar msg={error} />}
            <button style={C.primBtn(!situation||!stateCode||preparing)} className="pb"
              disabled={!situation||!stateCode||preparing} onClick={handlePrepare}>
              {preparing ? "LOADING LAWS..." : "PREPARE MY COACH →"}
            </button>
          </div>
        )}

        {/* ══ READY ═══════════════════════════════════════════════════════ */}
        {screen==="ready" && (
          <div className="fi">
            <div style={{marginBottom:24}}>
              <div style={C.tag}>READY</div>
              <div style={C.h2}>Your coach is prepared.</div>
              <div style={C.sub2}>{loadedLaws.length} laws loaded · {situation?.replace("_"," ")} · {stateCode}</div>
            </div>
            {error && <ErrBar msg={error} />}

            <div style={C.lawBox}>
              <Label n="" t="Laws loaded for your situation" />
              {loadedLaws.map((l,i) => (
                <div key={l.id||i} style={C.lawRow}>
                  <div style={C.lawTop}>
                    <span>{UX[l.urgency]?.dot||"⚪"}</span>
                    <span style={C.lawTitle}>{l.title}</span>
                    <span style={C.lawSt}>{l.state}</span>
                  </div>
                  <div style={C.lawRef}>{l.law_reference}</div>
                  <div style={C.lawAct}>→ {l.actionable_response}</div>
                </div>
              ))}
            </div>

            <button style={C.listenIdle} className="lbtn" onClick={startListening}>
              <span style={{fontSize:22}}>🎤</span> START LISTENING
            </button>
            <button style={C.backBtn} onClick={()=>setScreen("intake")}>← CHANGE SITUATION</button>
          </div>
        )}

        {/* ══ LISTENING ═══════════════════════════════════════════════════ */}
        {screen==="listening" && (
          <div className="fi">
            {/* Top bar */}
            <div style={C.listenBar}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <span className="pdot" />
                <span style={C.liveLabel}>LISTENING LIVE</span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                {isThinking && <span style={C.thinking}>analyzing...</span>}
                {/* SCAN DOCUMENT BUTTON */}
                <button style={C.scanBtn} onClick={openCamera} title="Scan a document">
                  📷 SCAN DOC
                </button>
              </div>
            </div>

            {error && <ErrBar msg={error} />}

            {/* Doc scan result inline */}
            {scanResult && <DocCard result={scanResult} onDismiss={()=>setScanResult(null)} />}

            {/* Camera modal */}
            {showCamera && (
              <div style={C.cameraModal}>
                <div style={C.cameraBox}>
                  <div style={C.camHeader}>
                    <span style={{fontSize:13,fontWeight:700,letterSpacing:1}}>📷 SCAN DOCUMENT</span>
                    <button style={C.camClose} onClick={closeCamera}>✕</button>
                  </div>
                  <video ref={videoRef} autoPlay playsInline style={C.video} />
                  <canvas ref={canvasRef} style={{display:"none"}} />
                  <div style={{display:"flex",gap:10,padding:12}}>
                    <button style={C.captureBtn} onClick={captureAndScan} disabled={scanning}>
                      {scanning ? "SCANNING..." : "📸 CAPTURE & ANALYZE"}
                    </button>
                    <label style={C.uploadBtn}>
                      📁 UPLOAD
                      <input type="file" accept="image/*" style={{display:"none"}} onChange={handleFileUpload} />
                    </label>
                  </div>
                  {scanning && <div style={C.scanningMsg}>🔍 AI reading document...</div>}
                </div>
              </div>
            )}

            {/* Suggestion feed */}
            <div style={C.feed}>
              {suggestions.length===0 ? (
                <div style={C.empty}>
                  <div style={{fontSize:40,marginBottom:12}}>👂</div>
                  <div style={C.emptyTxt}>Listening for legally significant moments...</div>
                  <div style={C.emptyHint}>Point mic at the conversation · Use 📷 to scan documents</div>
                </div>
              ) : suggestions.map(s => <SugCard key={s.id} s={s} />)}
              <div ref={feedEndRef} />
            </div>

            <button style={C.listenActive} onClick={stopListening}>
              <span>⏹</span> STOP LISTENING
            </button>

            {transcript.length>0 && (
              <div style={C.txBox}>
                <div style={C.txLabel}>HEARD</div>
                {transcript.slice(-5).map((t,i)=>(
                  <div key={i} style={C.txLine}>
                    <span style={C.txTime}>{t.ts}</span>
                    <span>"{t.text}"</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══ DONE ════════════════════════════════════════════════════════ */}
        {screen==="done" && (
          <div className="fi">
            <div style={{marginBottom:24}}>
              <div style={C.tag}>SESSION ENDED</div>
              <div style={C.h2}>Session Summary</div>
            </div>

            {/* Stats */}
            <div style={C.stats}>
              <Stat v={suggestions.length}                                     l="SUGGESTIONS" c="#4f6ef7" />
              <Stat v={suggestions.filter(s=>s.urgency==="red").length}        l="CRITICAL"    c="#ff2d2d" />
              <Stat v={suggestions.filter(s=>s.urgency==="yellow").length}     l="CAUTION"     c="#ffb300" />
              <Stat v={docFindings.length}                                      l="DOCS SCANNED" c="#a78bfa" />
            </div>

            {/* Document findings summary */}
            {docFindings.length > 0 && (
              <div style={{marginBottom:20}}>
                <Label n="" t="Documents Scanned" />
                {docFindings.map((d,i) => <DocCard key={i} result={d} compact />)}
              </div>
            )}

            {/* Suggestions */}
            <div style={{marginBottom:20}}>
              {suggestions.length===0
                ? <div style={C.noSug}>No legally significant moments detected.</div>
                : suggestions.map(s => <SugCard key={s.id} s={s} showTrigger />)
              }
            </div>

            {error && <ErrBar msg={error} />}

            {/* REPORT BUTTON — centerpiece of done screen */}
            <div style={C.reportSection}>
              <div style={C.reportTitle}>📄 POST-ENCOUNTER LEGAL REPORT</div>
              <div style={C.reportSub}>
                AI generates a professional PDF with incident summary, rights assessment,
                timeline, document findings, and recommended next steps for your attorney.
              </div>
              <button
                style={C.reportBtn(reportLoading)}
                disabled={reportLoading}
                onClick={downloadReport}
                className="pb"
              >
                {reportLoading ? "⏳ GENERATING REPORT..." :
                 reportReady   ? "✅ DOWNLOAD AGAIN"      :
                                 "📥 GENERATE & DOWNLOAD PDF REPORT"}
              </button>
            </div>

            <button style={C.primBtn(false)} onClick={reset} className="pb" style2={{marginTop:12}}>
              START NEW SESSION
            </button>

            <div style={C.disclaim}>
              ⚠️ This tool provides general legal information only — not legal advice.<br />
              Always consult a licensed attorney for your specific situation.
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────
function SugCard({ s, showTrigger }) {
  const u = UX[s.urgency] || UX.green;
  return (
    <div className="sc" style={{background:u.bg,border:`1px solid ${u.border}`,borderRadius:10,
      padding:"14px 16px",marginBottom:12,boxShadow:u.glow}}>
      <span style={{display:"inline-block",background:u.badge,borderRadius:3,padding:"2px 8px",
        fontSize:10,fontWeight:700,letterSpacing:1.5,color:"#000",marginBottom:7}}>{u.label}</span>
      <div style={{fontSize:14,fontWeight:600,lineHeight:1.5,marginBottom:5,color:"#e8e6df"}}>{s.suggestion}</div>
      <div style={{fontSize:11,color:"#6b7280"}}>📖 {s.law}</div>
      {showTrigger && s.trigger && <div style={{fontSize:11,color:"#374151",marginTop:3}}>Triggered: "{s.trigger}"</div>}
      <div style={{fontSize:10,color:"#374151",marginTop:2}}>{s.time}</div>
    </div>
  );
}

function PointsBreakdown({ pa }) {
  if (!pa) return null;

  const riskColors = { red:"#ff2d2d", yellow:"#ffb300", green:"#00e576" };
  const riskBg     = { red:"rgba(255,45,45,0.08)", yellow:"rgba(255,179,0,0.08)", green:"rgba(0,229,118,0.08)" };
  const rc = riskColors[pa.risk] || "#ffb300";
  const rb = riskBg[pa.risk]     || "rgba(255,179,0,0.08)";

  const susp = pa.suspension_threshold;
  const pct  = susp ? Math.min(100, Math.round((pa.total_points / susp) * 100)) : 0;
  const barColor = pct >= 100 ? "#ff2d2d" : pct >= 70 ? "#ffb300" : "#4f6ef7";

  return (
    <div style={{background:"#0b0d14",border:`1px solid ${rc}`,borderRadius:10,
      padding:"16px 18px",marginTop:12,boxShadow:`0 0 16px ${rc}33`}}>

      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:18}}>🚗</span>
          <span style={{fontSize:13,fontWeight:700,color:"#e8e6df",letterSpacing:.5}}>DMV POINTS ANALYSIS</span>
        </div>
        <div style={{background:rc,borderRadius:4,padding:"2px 10px",fontSize:10,fontWeight:700,color:"#000",letterSpacing:1}}>
          {pa.state_name.toUpperCase()}
        </div>
      </div>

      {/* Big points number */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:14}}>
        <div style={{background:rb,border:`1px solid ${rc}`,borderRadius:8,padding:"12px 8px",textAlign:"center"}}>
          <div style={{fontSize:34,fontWeight:700,color:rc,lineHeight:1}}>{pa.total_points}</div>
          <div style={{fontSize:9,color:"#6b7280",letterSpacing:1,marginTop:3}}>TOTAL POINTS</div>
        </div>
        <div style={{background:"#0f1118",border:"1px solid #1e2030",borderRadius:8,padding:"12px 8px",textAlign:"center"}}>
          <div style={{fontSize:34,fontWeight:700,color:"#e8e6df",lineHeight:1}}>{susp || "—"}</div>
          <div style={{fontSize:9,color:"#6b7280",letterSpacing:1,marginTop:3}}>SUSPENSION AT</div>
        </div>
        <div style={{background:"#0f1118",border:"1px solid #1e2030",borderRadius:8,padding:"12px 8px",textAlign:"center"}}>
          <div style={{fontSize:34,fontWeight:700,color: pa.points_to_suspension===0?"#ff2d2d":"#00e576",lineHeight:1}}>
            {pa.points_to_suspension !== null ? pa.points_to_suspension : "—"}
          </div>
          <div style={{fontSize:9,color:"#6b7280",letterSpacing:1,marginTop:3}}>POINTS LEFT</div>
        </div>
      </div>

      {/* Progress bar toward suspension */}
      {susp && (
        <div style={{marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
            <span style={{fontSize:10,color:"#4b5563",letterSpacing:1}}>PROGRESS TO SUSPENSION</span>
            <span style={{fontSize:10,color:barColor,fontWeight:700}}>{pct}%</span>
          </div>
          <div style={{background:"#1a1d2e",borderRadius:4,height:8,overflow:"hidden"}}>
            <div style={{width:`${pct}%`,height:"100%",background:barColor,borderRadius:4,
              transition:"width .5s ease",boxShadow:`0 0 8px ${barColor}88`}} />
          </div>
          <div style={{display:"flex",justifyContent:"space-between",marginTop:3}}>
            <span style={{fontSize:9,color:"#374151"}}>0</span>
            <span style={{fontSize:9,color:"#374151"}}>{susp} pts = suspension</span>
          </div>
        </div>
      )}

      {/* Consequence warning */}
      {pa.worst_consequence && (
        <div style={{background:"rgba(255,45,45,0.1)",border:"1px solid #ff2d2d",borderRadius:6,
          padding:"8px 12px",marginBottom:12,fontSize:12,fontWeight:700,color:"#ff2d2d"}}>
          ⚠️ {pa.worst_consequence}
        </div>
      )}

      {/* Next threshold */}
      {pa.next_threshold && !pa.worst_consequence && (
        <div style={{background:"rgba(255,179,0,0.08)",border:"1px solid #ffb300",borderRadius:6,
          padding:"8px 12px",marginBottom:12,fontSize:12,color:"#ffb300"}}>
          ⚡ {pa.next_threshold.points - pa.total_points} more point(s) → {pa.next_threshold.consequence}
        </div>
      )}

      {/* Per-violation breakdown table */}
      <div style={{marginBottom:12}}>
        <div style={{fontSize:10,letterSpacing:1.5,color:"#4b5563",marginBottom:8}}>VIOLATION BREAKDOWN</div>
        {pa.breakdown.map((v,i) => (
          <div key={i} style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",
            padding:"8px 10px",background: i%2===0?"#0f1118":"#0b0d14",
            borderRadius:6,marginBottom:3}}>
            <div style={{flex:1}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2}}>
                <span style={{fontSize:11,fontWeight:700,color:"#a5b4fc",fontFamily:"'DM Mono',monospace"}}>
                  {v.code}
                </span>
                {!v.found_in_db && (
                  <span style={{fontSize:9,background:"#374151",borderRadius:3,padding:"1px 5px",color:"#6b7280"}}>
                    NOT IN DB
                  </span>
                )}
              </div>
              <div style={{fontSize:12,color:"#9ca3af"}}>{v.name}</div>
              {v.note && <div style={{fontSize:10,color:"#4b5563",marginTop:2}}>ℹ {v.note}</div>}
              {v.fine_range && v.fine_range !== "unknown" && (
                <div style={{fontSize:10,color:"#374151",marginTop:2}}>Fine: {v.fine_range}</div>
              )}
            </div>
            <div style={{marginLeft:12,textAlign:"right",flexShrink:0}}>
              <div style={{fontSize:20,fontWeight:700,
                color: v.points===0?"#6b7280":v.points>=6?"#ff2d2d":v.points>=4?"#ffb300":"#ffb300",
                lineHeight:1}}>{v.points}</div>
              <div style={{fontSize:9,color:"#4b5563"}}>pts</div>
            </div>
          </div>
        ))}
        {/* Total row */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
          padding:"10px 10px",background:"#1a1d2e",borderRadius:6,marginTop:4,
          border:`1px solid ${rc}`}}>
          <span style={{fontSize:12,fontWeight:700,color:"#e8e6df",letterSpacing:.5}}>TOTAL</span>
          <div style={{textAlign:"right"}}>
            <span style={{fontSize:22,fontWeight:700,color:rc}}>{pa.total_points}</span>
            <span style={{fontSize:11,color:rc,marginLeft:4}}>pts</span>
          </div>
        </div>
      </div>

      {/* Surcharge info */}
      {pa.surcharge_info && (
        <div style={{fontSize:11,color:"#6b7280",marginBottom:10,padding:"6px 10px",
          background:"#0f1118",borderRadius:6}}>
          💰 Surcharge: {pa.surcharge_info}
        </div>
      )}

      {/* Contest recommendation */}
      {pa.contest_recommended && (
        <div style={{background:"rgba(79,110,247,0.1)",border:"1px solid #4f6ef7",
          borderRadius:6,padding:"10px 12px",fontSize:12,color:"#a5b4fc",lineHeight:1.5}}>
          ⚖️ <strong>Consider contesting:</strong> {pa.contest_reason}
        </div>
      )}

      {/* Duration note */}
      {pa.points_duration && (
        <div style={{fontSize:10,color:"#374151",marginTop:10,textAlign:"center"}}>
          Points stay on record for {pa.points_duration} year(s) in {pa.state_name}
        </div>
      )}
    </div>
  );
}

function DocCard({ result, onDismiss, compact }) {
  const u   = UX[result.urgency] || UX.yellow;
  const typ = DOC_LABELS[result.document_type] || result.document_type || "Document";
  const pa  = result.points_analysis;

  return (
    <div style={{background:u.bg,border:`1px solid ${u.border}`,borderRadius:10,
      padding:compact?"12px 14px":"16px 18px",marginBottom:12,boxShadow:u.glow}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:18}}>📄</span>
          <span style={{fontSize:13,fontWeight:700,color:"#e8e6df"}}>{typ.toUpperCase()}</span>
          <span style={{display:"inline-block",background:u.badge,borderRadius:3,padding:"1px 7px",
            fontSize:10,fontWeight:700,color:"#000"}}>{u.label}</span>
          {/* Points badge on header */}
          {pa && pa.total_points > 0 && (
            <span style={{display:"inline-block",
              background: pa.risk==="red"?"#ff2d2d":pa.risk==="yellow"?"#ffb300":"#00e576",
              borderRadius:3,padding:"1px 7px",fontSize:10,fontWeight:700,color:"#000"}}>
              {pa.total_points} PTS
            </span>
          )}
        </div>
        {onDismiss && (
          <button onClick={onDismiss} style={{background:"none",border:"none",
            color:"#4b5563",cursor:"pointer",fontSize:16}}>✕</button>
        )}
      </div>

      <div style={{fontSize:13,color:"#e8e6df",marginBottom:8,lineHeight:1.5}}>{result.summary}</div>

      {/* Warrant warning */}
      {result.is_judicial_warrant===false && result.document_type?.includes("warrant") && (
        <div style={{background:"rgba(255,45,45,0.15)",border:"1px solid #ff2d2d",borderRadius:6,
          padding:"8px 12px",marginBottom:8,fontSize:12,fontWeight:700,color:"#ff2d2d"}}>
          ⚠️ NOT a judicial warrant — they cannot enter your home without consent.
        </div>
      )}

      {/* Findings */}
      {!compact && result.findings?.length > 0 && (
        <div style={{marginBottom:8}}>
          {result.findings.map((f,i) => (
            <div key={i} style={{fontSize:12,color:"#9ca3af",marginBottom:3}}>• {f}</div>
          ))}
        </div>
      )}

      {/* Actions */}
      {result.actions?.length > 0 && (
        <div style={{marginBottom:8}}>
          <div style={{fontSize:10,letterSpacing:1.5,color:"#4b5563",marginBottom:5}}>WHAT TO DO</div>
          {result.actions.map((a,i) => (
            <div key={i} style={{fontSize:12,color:"#a5b4fc",marginBottom:3,fontWeight:600}}>→ {a}</div>
          ))}
        </div>
      )}

      {/* Recommended next step */}
      {result.recommended_next_step && (
        <div style={{background:"rgba(79,110,247,0.1)",border:"1px solid #4f6ef7",
          borderRadius:6,padding:"7px 10px",fontSize:12,color:"#a5b4fc",marginTop:4}}>
          💡 {result.recommended_next_step}
        </div>
      )}

      {/* Points breakdown — only show if not compact */}
      {!compact && pa && <PointsBreakdown pa={pa} />}

      {/* Compact: just show points total */}
      {compact && pa && pa.total_points > 0 && (
        <div style={{marginTop:8,fontSize:11,color:"#ffb300"}}>
          🚗 {pa.total_points} DMV point(s) · {pa.state_name}
          {pa.worst_consequence && ` · ${pa.worst_consequence}`}
        </div>
      )}
    </div>
  );
}


function Label({ n, t }) {
  return (
    <div style={{fontSize:10,letterSpacing:2,color:"#4b5563",textTransform:"uppercase",marginBottom:12}}>
      {n && <span style={{color:"#4f6ef7",marginRight:8}}>{n}</span>}{t}
    </div>
  );
}

function Stat({ v, l, c }) {
  return (
    <div style={{background:"#0f1118",border:"1px solid #1e2030",borderRadius:8,padding:"14px 8px",textAlign:"center"}}>
      <div style={{fontSize:28,fontWeight:700,color:c,lineHeight:1}}>{v}</div>
      <div style={{fontSize:9,color:"#4b5563",letterSpacing:1,marginTop:4}}>{l}</div>
    </div>
  );
}

function ErrBar({ msg }) {
  return (
    <div style={{background:"rgba(255,179,0,0.08)",border:"1px solid #ffb300",borderRadius:6,
      padding:"9px 13px",fontSize:12,color:"#ffb300",marginBottom:14}}>⚠️ {msg}</div>
  );
}

// Fallback client-side laws if backend offline
function fallbackLaws(situation, state) {
  const F=[
    {id:"f1",state:"federal",situation:"arrest",       title:"Miranda Rights",        law_reference:"Miranda v. Arizona (1966)",  actionable_response:"Say: 'I invoke my right to remain silent. I want a lawyer.'",  urgency:"red"},
    {id:"f2",state:"federal",situation:"search",       title:"4th Amendment",         law_reference:"Fourth Amendment",           actionable_response:"Say: 'I do not consent to this search.'",                        urgency:"yellow"},
    {id:"f3",state:"federal",situation:"traffic_stop", title:"Free To Go?",           law_reference:"Florida v. Bostick (1991)", actionable_response:"Ask: 'Am I being detained or am I free to go?'",                 urgency:"green"},
    {id:"f4",state:"federal",situation:"immigration",  title:"Right to Silence",      law_reference:"Fifth Amendment",            actionable_response:"Say: 'I exercise my right to remain silent.'",                   urgency:"red"},
    {id:"f5",state:"federal",situation:"interrogation","title":"5th Amendment",       law_reference:"Fifth Amendment",            actionable_response:"Say: 'I invoke my Fifth Amendment right.'",                       urgency:"red"},
    {id:"ny",state:"NY",     situation:"traffic_stop", title:"NY Traffic Stop",       law_reference:"NY VTL § 375",               actionable_response:"Provide license/registration. Decline further questions.",         urgency:"yellow"},
    {id:"ca",state:"CA",     situation:"immigration",  title:"CA Sanctuary State",    law_reference:"SB 54",                      actionable_response:"'Under CA Values Act I need not answer immigration questions.'",   urgency:"green"},
    {id:"tx",state:"TX",     situation:"traffic_stop", title:"TX Stop-and-Identify",  law_reference:"TX Penal Code § 38.02",      actionable_response:"Provide name and ID. Decline further questions.",                 urgency:"yellow"},
    {id:"fl",state:"FL",     situation:"arrest",       title:"FL First Appearance",   law_reference:"FL Rule 3.130",              actionable_response:"Say: 'I invoke my right to silence and request an attorney.'",    urgency:"red"},
  ];
  return F.filter(l=>l.situation===situation&&(l.state===state||l.state==="federal")).slice(0,5);
}

// ── Styles ────────────────────────────────────────────────────────────────
const C = {
  app:        { minHeight:"100vh",background:"#08090d",color:"#e8e6df",fontFamily:"'DM Mono','Courier New',monospace",display:"flex",flexDirection:"column",alignItems:"center" },
  hdr:        { width:"100%",borderBottom:"1px solid #1e2030",padding:"15px 26px",display:"flex",alignItems:"center",justifyContent:"space-between",background:"#0b0d14",position:"sticky",top:0,zIndex:100 },
  hdrL:       { display:"flex",alignItems:"center",gap:10 },
  hdrR:       { display:"flex",alignItems:"center",gap:10 },
  logo:       { fontSize:17,fontWeight:700,letterSpacing:-0.3 },
  beta:       { background:"#1a1d2e",border:"1px solid #2a2d45",borderRadius:4,padding:"2px 7px",fontSize:9,color:"#6b7280",letterSpacing:1 },
  dot:        { width:7,height:7,borderRadius:"50%",display:"inline-block" },
  statusTxt:  { fontSize:10,color:"#4b5563" },
  notlegal:   { fontSize:10,color:"#374151" },
  main:       { width:"100%",maxWidth:600,padding:"34px 22px 60px" },
  h1:         { fontSize:26,fontWeight:700,letterSpacing:-0.5,marginBottom:8 },
  h2:         { fontSize:22,fontWeight:700,marginBottom:4 },
  sub:        { fontSize:13,color:"#6b7280",lineHeight:1.7 },
  sub2:       { fontSize:12,color:"#6b7280" },
  tag:        { fontSize:10,color:"#4f6ef7",letterSpacing:2,marginBottom:6 },
  grid2:      { display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:28 },
  sCard:      sel=>({ background:sel?"#1a1d2e":"#0f1118",border:`1px solid ${sel?"#4f6ef7":"#1e2030"}`,borderRadius:10,padding:"15px 12px",cursor:"pointer",display:"flex",flexDirection:"column",gap:3,textAlign:"left",transition:"all .15s" }),
  sCardLbl:   sel=>({ fontSize:13,fontWeight:600,color:sel?"#a5b4fc":"#9ca3af" }),
  sCardDsc:   { fontSize:11,color:"#4b5563" },
  stBtn:      sel=>({ background:sel?"#1a1d2e":"#0f1118",border:`1px solid ${sel?"#4f6ef7":"#1e2030"}`,borderRadius:6,padding:"10px 15px",cursor:"pointer",color:sel?"#a5b4fc":"#6b7280",fontSize:13,fontWeight:600,fontFamily:"'DM Mono',monospace",transition:"all .15s" }),
  ta:         { width:"100%",background:"#0f1118",border:"1px solid #1e2030",borderRadius:8,padding:14,color:"#e8e6df",fontSize:13,fontFamily:"'DM Mono',monospace",resize:"vertical",minHeight:80,outline:"none",boxSizing:"border-box",marginBottom:20 },
  primBtn:    dis=>({ width:"100%",padding:16,background:dis?"#1a1d2e":"#4f6ef7",border:"none",borderRadius:8,color:dis?"#4b5563":"#fff",fontSize:14,fontWeight:700,fontFamily:"'DM Mono',monospace",letterSpacing:.5,cursor:dis?"not-allowed":"pointer",transition:"all .2s" }),
  lawBox:     { background:"#0f1118",border:"1px solid #1e2030",borderRadius:12,padding:20,marginBottom:20 },
  lawRow:     { marginBottom:15,paddingBottom:15,borderBottom:"1px solid #1e2030" },
  lawTop:     { display:"flex",alignItems:"center",gap:8,marginBottom:3 },
  lawTitle:   { fontSize:12,fontWeight:600,flex:1 },
  lawSt:      { fontSize:10,color:"#4b5563",background:"#1a1d2e",borderRadius:3,padding:"1px 6px" },
  lawRef:     { fontSize:11,color:"#4b5563",marginBottom:3 },
  lawAct:     { fontSize:12,color:"#a5b4fc",lineHeight:1.5 },
  listenIdle: { width:"100%",padding:18,background:"#0f1118",border:"2px solid #2a2d45",borderRadius:12,color:"#e8e6df",fontSize:16,fontWeight:700,fontFamily:"'DM Mono',monospace",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:10,marginBottom:10,transition:"all .2s" },
  listenActive:{ width:"100%",padding:18,background:"#ff2d2d",border:"2px solid #ff2d2d",borderRadius:12,color:"#fff",fontSize:16,fontWeight:700,fontFamily:"'DM Mono',monospace",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:10,boxShadow:"0 0 28px rgba(255,45,45,0.4)",marginBottom:10,transition:"all .2s" },
  backBtn:    { width:"100%",padding:11,background:"transparent",border:"1px solid #1e2030",borderRadius:8,color:"#4b5563",fontSize:12,cursor:"pointer",fontFamily:"'DM Mono',monospace" },
  listenBar:  { display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18 },
  liveLabel:  { fontSize:11,letterSpacing:2,color:"#ff2d2d" },
  thinking:   { fontSize:11,color:"#4b5563" },
  scanBtn:    { background:"#1a1d2e",border:"1px solid #4f6ef7",borderRadius:6,padding:"7px 13px",color:"#a5b4fc",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'DM Mono',monospace",letterSpacing:.5 },
  feed:       { minHeight:260,marginBottom:14 },
  empty:      { textAlign:"center",padding:"55px 0",color:"#2a2d45" },
  emptyTxt:   { fontSize:13,letterSpacing:.5,marginBottom:6 },
  emptyHint:  { fontSize:11,color:"#1e2030" },
  txBox:      { background:"#0b0d14",border:"1px solid #1e2030",borderRadius:8,padding:"11px 15px",marginTop:14 },
  txLabel:    { fontSize:10,color:"#374151",letterSpacing:1.5,marginBottom:7 },
  txLine:     { fontSize:11,color:"#4b5563",marginBottom:3,display:"flex",gap:8 },
  txTime:     { color:"#2a2d45",flexShrink:0 },
  stats:      { display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:10,marginBottom:22 },
  noSug:      { textAlign:"center",padding:36,color:"#4b5563",fontSize:13 },
  reportSection: { background:"#0f1118",border:"1px solid #4f6ef7",borderRadius:12,padding:22,marginBottom:16 },
  reportTitle:   { fontSize:14,fontWeight:700,letterSpacing:.5,marginBottom:8,color:"#e8e6df" },
  reportSub:     { fontSize:12,color:"#6b7280",lineHeight:1.7,marginBottom:16 },
  reportBtn:  ld=>({ width:"100%",padding:16,background:ld?"#1a1d2e":"#4f6ef7",border:"none",borderRadius:8,color:ld?"#4b5563":"#fff",fontSize:13,fontWeight:700,fontFamily:"'DM Mono',monospace",letterSpacing:.5,cursor:ld?"not-allowed":"pointer",transition:"all .2s" }),
  disclaim:   { textAlign:"center",marginTop:22,fontSize:11,color:"#374151",lineHeight:1.8 },
  // Camera modal
  cameraModal:{ position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200 },
  cameraBox:  { background:"#0f1118",border:"1px solid #1e2030",borderRadius:14,width:"min(94vw,440px)",overflow:"hidden" },
  camHeader:  { display:"flex",alignItems:"center",justifyContent:"space-between",padding:"13px 16px",borderBottom:"1px solid #1e2030" },
  camClose:   { background:"none",border:"none",color:"#6b7280",fontSize:18,cursor:"pointer" },
  video:      { width:"100%",display:"block",background:"#000" },
  captureBtn: { flex:1,padding:12,background:"#4f6ef7",border:"none",borderRadius:8,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"'DM Mono',monospace" },
  uploadBtn:  { padding:12,background:"#1a1d2e",border:"1px solid #2a2d45",borderRadius:8,color:"#9ca3af",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"'DM Mono',monospace" },
  scanningMsg:{ padding:12,textAlign:"center",fontSize:12,color:"#a5b4fc",letterSpacing:1 },
};

const GCSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}
body{background:#08090d;}
::-webkit-scrollbar{width:4px;}::-webkit-scrollbar-track{background:#0b0d14;}::-webkit-scrollbar-thumb{background:#2a2d45;border-radius:2px;}
.fi{animation:fi .25s ease;}
@keyframes fi{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:translateY(0);}}
.sc{animation:sc .3s ease;}
@keyframes sc{from{opacity:0;transform:translateX(-8px);}to{opacity:1;transform:translateX(0);}}
.pdot{width:9px;height:9px;border-radius:50%;background:#ff2d2d;display:inline-block;
  animation:pd 1.6s ease-in-out infinite;}
@keyframes pd{0%,100%{opacity:.5;transform:scale(.9);box-shadow:0 0 0 0 rgba(255,45,45,.4);}
  50%{opacity:1;transform:scale(1.1);box-shadow:0 0 0 6px rgba(255,45,45,0);}}
.cb:hover,.sb:hover{filter:brightness(1.15);}
.pb:not(:disabled):hover{filter:brightness(1.1);transform:translateY(-1px);}
.lbtn:hover{border-color:#4f6ef7 !important;color:#a5b4fc !important;}
`;
