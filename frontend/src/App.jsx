import { useState, useEffect, useRef, useCallback } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "";

// ─── Palette ───────────────────────────────────────────────────────────────
// Single blue palette: navy text, slate grays, white backgrounds, blue accents
const P = {
  navy:     "#0f2040",
  blue:     "#1d4ed8",
  blueL:    "#3b6ef8",
  blueBg:   "#eff4ff",
  blueBd:   "#c7d7fd",
  slate:    "#475569",
  slateL:   "#94a3b8",
  slateXL:  "#cbd5e1",
  bg:       "#f8fafc",
  white:    "#ffffff",
  border:   "#e2e8f0",
  red:      "#dc2626",
  redBg:    "#fef2f2",
  redBd:    "#fecaca",
  amber:    "#d97706",
  amberBg:  "#fffbeb",
  amberBd:  "#fde68a",
  green:    "#16a34a",
  greenBg:  "#f0fdf4",
  greenBd:  "#bbf7d0",
};

// ─── Data ──────────────────────────────────────────────────────────────────
const SITUATIONS = [
  { id:"traffic_stop",  icon:"🚗", label:"Traffic Stop",    desc:"Pulled over by police" },
  { id:"arrest",        icon:"🚨", label:"Arrest",          desc:"Being placed under arrest" },
  { id:"search",        icon:"🔍", label:"Search",          desc:"Officer wants to search property" },
  { id:"immigration",   icon:"🛂", label:"Immigration",     desc:"Immigration enforcement encounter" },
  { id:"interrogation", icon:"💬", label:"Interrogation",   desc:"Police questioning or interview" },
];
const STATES = ["NY","CA","TX","FL","Federal"];

const URGENCY = {
  red:    { bg:P.redBg,   border:P.redBd,   text:P.red,   label:"Act Now",   icon:"🔴" },
  yellow: { bg:P.amberBg, border:P.amberBd, text:P.amber, label:"Caution",   icon:"🟡" },
  green:  { bg:P.greenBg, border:P.greenBd, text:P.green, label:"You're OK", icon:"🟢" },
};

const DOC_LABELS = {
  judicial_warrant:"Judicial Warrant", administrative_warrant:"Admin Warrant",
  summons:"Summons", traffic_ticket:"Traffic Ticket",
  notice:"Notice", id_document:"ID / License", other:"Document",
};

const LAWYERS_DB = {
  traffic_stop: {
    NY: [
      { name:"David Ziff", firm:"Ziff Law Group", specialty:"Traffic & DWI Defense", years:18, rating:4.9, reviews:312, email:"dziff@zifflawgroup.com", phone:"(212) 555-0192", location:"Manhattan, NY", badge:"Super Lawyers 2024", free_consult:true },
      { name:"Scott Bonanno", firm:"Bonanno Law", specialty:"Traffic Violations & License Suspension", years:14, rating:4.8, reviews:228, email:"scott@bonannolawny.com", phone:"(718) 555-0147", location:"Brooklyn, NY", badge:"10+ Years NYC Traffic Defense", free_consult:true },
      { name:"Michael Villanueva", firm:"Villanueva & Associates", specialty:"Traffic Tickets & Points Reduction", years:9, rating:4.7, reviews:189, email:"mv@villalawny.com", phone:"(646) 555-0183", location:"Queens, NY", badge:"Former Traffic Court Prosecutor", free_consult:false },
    ],
    CA: [
      { name:"Paul Burglin", firm:"Burglin Law Offices", specialty:"DUI & Traffic Defense", years:24, rating:4.9, reviews:445, email:"pb@burglinlaw.com", phone:"(415) 555-0134", location:"San Francisco, CA", badge:"AV Preeminent Rated", free_consult:true },
      { name:"Lawrence Taylor", firm:"Taylor & Taylor", specialty:"DUI Defense & Traffic Law", years:31, rating:4.8, reviews:601, email:"lt@taylorduilaw.com", phone:"(310) 555-0167", location:"Los Angeles, CA", badge:"Founding Member CA DUI Lawyers Assoc", free_consult:true },
      { name:"Erin Gerstenzang", firm:"Gerstenzang Law", specialty:"Traffic Violations & License Issues", years:12, rating:4.7, reviews:203, email:"eg@gerstenzanglaw.com", phone:"(650) 555-0121", location:"Palo Alto, CA", badge:"Rising Star 2023", free_consult:false },
    ],
    TX: [
      { name:"Mark Thiessen", firm:"Thiessen Law Firm", specialty:"Traffic & DWI Defense", years:20, rating:4.9, reviews:387, email:"mt@thiessenlawfirm.com", phone:"(713) 555-0155", location:"Houston, TX", badge:"Board Certified Criminal Law", free_consult:true },
      { name:"Tyler Flood", firm:"Tyler Flood & Associates", specialty:"DWI & Traffic Defense", years:16, rating:4.8, reviews:294, email:"tf@tylerflood.com", phone:"(713) 555-0178", location:"Houston, TX", badge:"Former DWI Prosecutor", free_consult:true },
      { name:"Jed Silverman", firm:"Silverman Law Office", specialty:"Traffic Tickets & License Defense", years:11, rating:4.7, reviews:167, email:"js@silvermanlawoffice.com", phone:"(214) 555-0139", location:"Dallas, TX", badge:"Texas Criminal Defense Lawyers Assoc", free_consult:false },
    ],
    FL: [
      { name:"Kevin J. Kulik", firm:"Kevin J. Kulik P.A.", specialty:"Traffic & Criminal Defense", years:22, rating:4.9, reviews:356, email:"kk@kevinkulik.com", phone:"(954) 555-0144", location:"Fort Lauderdale, FL", badge:"AV Rated Martindale-Hubbell", free_consult:true },
      { name:"Joni Jacobs", firm:"Jacobs Law Group", specialty:"Traffic Violations & DUI", years:15, rating:4.8, reviews:211, email:"jj@jacobslawfl.com", phone:"(305) 555-0162", location:"Miami, FL", badge:"Florida Bar Traffic Law Committee", free_consult:true },
      { name:"Adam Rossen", firm:"Rossen Law Firm", specialty:"DUI & Traffic Defense", years:13, rating:4.7, reviews:198, email:"ar@rossenlawfirm.com", phone:"(954) 555-0118", location:"Boca Raton, FL", badge:"Super Lawyers Rising Star", free_consult:false },
    ],
  },
  arrest: {
    NY: [
      { name:"Benjamin Brafman", firm:"Brafman & Associates", specialty:"Criminal Defense", years:40, rating:5.0, reviews:892, email:"bb@braflaw.com", phone:"(212) 555-0101", location:"Manhattan, NY", badge:"Top 100 Trial Lawyers", free_consult:false },
      { name:"Gerald Lefcourt", firm:"Lefcourt Criminal Defense", specialty:"Federal & State Criminal Defense", years:35, rating:4.9, reviews:634, email:"gl@lefcourtlaw.com", phone:"(212) 555-0188", location:"Manhattan, NY", badge:"NACDL Past President", free_consult:false },
      { name:"Dawn Florio", firm:"Florio Law Offices", specialty:"Criminal Defense & Civil Rights", years:20, rating:4.8, reviews:312, email:"df@floriolaw.com", phone:"(212) 555-0177", location:"New York, NY", badge:"Former Prosecutor", free_consult:true },
    ],
    CA: [
      { name:"Mark Geragos", firm:"Geragos & Geragos", specialty:"High-Profile Criminal Defense", years:32, rating:4.9, reviews:756, email:"mg@geragos.com", phone:"(213) 555-0145", location:"Los Angeles, CA", badge:"Named Top 10 Criminal Lawyers", free_consult:false },
      { name:"Harland Braun", firm:"Braun & Braun", specialty:"Criminal Defense", years:38, rating:4.8, reviews:512, email:"hb@braunlaw.com", phone:"(213) 555-0133", location:"Los Angeles, CA", badge:"Fellow American College of Trial Lawyers", free_consult:false },
      { name:"Alex Coolman", firm:"Coolman Defense", specialty:"Criminal Defense & Civil Rights", years:14, rating:4.7, reviews:203, email:"ac@coolmandefense.com", phone:"(415) 555-0156", location:"San Francisco, CA", badge:"ACLU Cooperating Attorney", free_consult:true },
    ],
    TX: [
      { name:"Dick DeGuerin", firm:"DeGuerin & Dickson", specialty:"Criminal Defense", years:45, rating:5.0, reviews:934, email:"dd@deguerin.com", phone:"(713) 555-0102", location:"Houston, TX", badge:"Texas Criminal Defense Hall of Fame", free_consult:false },
      { name:"Chip Lewis", firm:"Lewis & Dickson", specialty:"Criminal Defense", years:28, rating:4.9, reviews:445, email:"cl@lewisdefense.com", phone:"(713) 555-0191", location:"Houston, TX", badge:"Board Certified Criminal Law", free_consult:false },
      { name:"Mick Mickelsen", firm:"Broden & Mickelsen", specialty:"Federal Criminal Defense", years:22, rating:4.8, reviews:334, email:"mm@brodenmickelsen.com", phone:"(214) 555-0167", location:"Dallas, TX", badge:"Former Federal Prosecutor", free_consult:true },
    ],
    FL: [
      { name:"Roy Black", firm:"Black Srebnick", specialty:"Criminal Defense", years:40, rating:5.0, reviews:812, email:"rb@royblack.com", phone:"(305) 555-0103", location:"Miami, FL", badge:"Florida Bar Criminal Law Certification", free_consult:false },
      { name:"David Oscar Markus", firm:"Markus/Moss PLLC", specialty:"Federal Criminal Defense", years:26, rating:4.9, reviews:489, email:"dom@markuslaw.com", phone:"(305) 555-0174", location:"Miami, FL", badge:"Best Lawyers in America", free_consult:false },
      { name:"Jayne Weintraub", firm:"Weintraub & Weintraub", specialty:"Criminal Defense & Civil Rights", years:30, rating:4.8, reviews:367, email:"jw@weintraublaw.com", phone:"(305) 555-0152", location:"Miami, FL", badge:"AV Preeminent Rated", free_consult:true },
    ],
  },
  immigration: {
    NY: [
      { name:"Michael Wildes", firm:"Wildes & Weinberg P.C.", specialty:"Immigration Law", years:30, rating:4.9, reviews:678, email:"mw@wildeslaw.com", phone:"(212) 555-0120", location:"Manhattan, NY", badge:"Former Federal Prosecutor (INS)", free_consult:true },
      { name:"Cyrus Mehta", firm:"Cyrus D. Mehta & Partners", specialty:"Business & Family Immigration", years:28, rating:4.9, reviews:534, email:"cm@cyrusmehta.com", phone:"(212) 555-0138", location:"Manhattan, NY", badge:"AILA NY Chapter Past Chair", free_consult:false },
      { name:"Camille Mackler", firm:"Mackler Immigration Law", specialty:"Deportation Defense & Asylum", years:15, rating:4.8, reviews:289, email:"cm@macklerimmigration.com", phone:"(718) 555-0165", location:"Brooklyn, NY", badge:"NYCLU Immigration Coalition", free_consult:true },
    ],
    CA: [
      { name:"Carl Shusterman", firm:"Law Offices of Carl Shusterman", specialty:"Employment & Family Immigration", years:35, rating:4.9, reviews:823, email:"cs@shusterman.com", phone:"(213) 555-0112", location:"Los Angeles, CA", badge:"Former INS Trial Attorney", free_consult:true },
      { name:"Bryan Johnson", firm:"Johnson Immigration Law", specialty:"Deportation Defense", years:18, rating:4.8, reviews:412, email:"bj@johnsonimmigration.com", phone:"(619) 555-0143", location:"San Diego, CA", badge:"AILA Member", free_consult:true },
      { name:"Annaluisa Padilla", firm:"Law Offices of Annaluisa Padilla", specialty:"Immigration & Civil Rights", years:22, rating:4.8, reviews:356, email:"ap@padillalaw.com", phone:"(213) 555-0159", location:"Los Angeles, CA", badge:"CAILA Board Member", free_consult:false },
    ],
    TX: [
      { name:"Charles Kuck", firm:"Kuck Baxter Immigration", specialty:"Immigration Law", years:26, rating:4.9, reviews:567, email:"ck@immigrationlaw.com", phone:"(713) 555-0127", location:"Houston, TX", badge:"AILA Past National President", free_consult:true },
      { name:"Kathleen Walker", firm:"Walker & Associates", specialty:"Immigration & Nationality Law", years:32, rating:4.8, reviews:489, email:"kw@walkerimmigration.com", phone:"(214) 555-0148", location:"Dallas, TX", badge:"State Bar of TX Immigration Law Chair", free_consult:false },
      { name:"Grisel Ruiz", firm:"Ruiz Immigration Law", specialty:"Deportation Defense & Asylum", years:14, rating:4.7, reviews:234, email:"gr@ruizimmigration.com", phone:"(956) 555-0171", location:"McAllen, TX", badge:"CLINIC Accredited Representative", free_consult:true },
    ],
    FL: [
      { name:"Grisel Alonso", firm:"Alonso Immigration Law", specialty:"Deportation Defense", years:19, rating:4.9, reviews:445, email:"ga@alonsoimmigration.com", phone:"(305) 555-0136", location:"Miami, FL", badge:"Florida Bar Immigration Certification", free_consult:true },
      { name:"Matthew Kolken", firm:"Kolken & Kolken", specialty:"Immigration Litigation", years:21, rating:4.8, reviews:378, email:"mk@kolkenlaw.com", phone:"(954) 555-0153", location:"Fort Lauderdale, FL", badge:"Super Lawyers 2024", free_consult:false },
      { name:"Claudia Cañizares", firm:"NewUs Immigration", specialty:"Family & Asylum Immigration", years:16, rating:4.7, reviews:267, email:"cc@newusimmigration.com", phone:"(305) 555-0169", location:"Miami, FL", badge:"AILA South Florida Chapter", free_consult:true },
    ],
  },
  search: {
    NY: [
      { name:"Ronald Kuby", firm:"Kuby Law Office", specialty:"Civil Rights & Criminal Defense", years:33, rating:4.9, reviews:445, email:"rk@kubylaw.com", phone:"(212) 555-0114", location:"Manhattan, NY", badge:"NYCLU Board Member", free_consult:true },
      { name:"Lamis Deek", firm:"Deek Law", specialty:"Civil Rights & Search/Seizure", years:14, rating:4.8, reviews:234, email:"ld@deeklaw.com", phone:"(718) 555-0182", location:"Brooklyn, NY", badge:"NLG NY Chapter", free_consult:true },
      { name:"Robert Caliendo", firm:"Caliendo Law", specialty:"Criminal Defense & 4th Amendment", years:18, rating:4.7, reviews:189, email:"rc@caliendolaw.com", phone:"(212) 555-0106", location:"New York, NY", badge:"Former Manhattan ADA", free_consult:false },
    ],
    CA: [
      { name:"Michael Rehm", firm:"Rehm Law", specialty:"Civil Rights & Search/Seizure", years:16, rating:4.8, reviews:267, email:"mr@rehmlaw.com", phone:"(415) 555-0123", location:"San Francisco, CA", badge:"ACLU Cooperating Attorney", free_consult:true },
      { name:"Peter Bibring", firm:"ACLU of Southern California", specialty:"Civil Rights & Police Misconduct", years:20, rating:4.9, reviews:389, email:"pb@aclusocal.org", phone:"(213) 555-0141", location:"Los Angeles, CA", badge:"ACLU Staff Attorney", free_consult:true },
      { name:"John Raphling", firm:"Raphling Defense", specialty:"Criminal Defense & Search Law", years:22, rating:4.8, reviews:312, email:"jr@raphlingdefense.com", phone:"(213) 555-0158", location:"Los Angeles, CA", badge:"Former Public Defender", free_consult:false },
    ],
    TX: [
      { name:"Brian Wice", firm:"Wice Law Group", specialty:"Criminal Defense & Civil Rights", years:29, rating:4.9, reviews:412, email:"bw@wicelaw.com", phone:"(713) 555-0116", location:"Houston, TX", badge:"Board Certified Criminal Law", free_consult:false },
      { name:"Toby Shook", firm:"Shook & Associates", specialty:"Criminal Defense & Search/Seizure", years:24, rating:4.8, reviews:334, email:"ts@shooklaw.com", phone:"(214) 555-0137", location:"Dallas, TX", badge:"Former Dallas County Prosecutor", free_consult:true },
      { name:"Stan Schwieger", firm:"Schwieger Defense", specialty:"4th Amendment & Drug Crimes", years:17, rating:4.7, reviews:223, email:"ss@schwiegerlawyer.com", phone:"(512) 555-0164", location:"Austin, TX", badge:"TCDLA Member", free_consult:true },
    ],
    FL: [
      { name:"Daniel Aaronson", firm:"Aaronson Law Group", specialty:"Civil Rights & Search/Seizure", years:27, rating:4.9, reviews:378, email:"da@aaronsonlaw.com", phone:"(954) 555-0129", location:"Fort Lauderdale, FL", badge:"Florida Bar Criminal Law Board Certified", free_consult:false },
      { name:"Jacqueline Goodman", firm:"Goodman Law", specialty:"Criminal Defense & Civil Rights", years:19, rating:4.8, reviews:256, email:"jg@goodmanlawfl.com", phone:"(305) 555-0146", location:"Miami, FL", badge:"NACDL Member", free_consult:true },
      { name:"Brian Tannebaum", firm:"Tannebaum Weiss", specialty:"Criminal Defense", years:23, rating:4.7, reviews:289, email:"bt@tannebaumweiss.com", phone:"(305) 555-0173", location:"Miami, FL", badge:"Florida Bar Past Criminal Law Chair", free_consult:false },
    ],
  },
  interrogation: {
    NY: [
      { name:"Barry Scheck", firm:"Innocence Project / Neufeld Scheck", specialty:"Criminal Defense & False Confessions", years:38, rating:5.0, reviews:723, email:"bs@neufeldschecklaw.com", phone:"(212) 555-0108", location:"Manhattan, NY", badge:"Innocence Project Co-Founder", free_consult:false },
      { name:"Susan Kellman", firm:"Kellman Law", specialty:"Federal Criminal Defense", years:30, rating:4.9, reviews:489, email:"sk@kellmanlaw.com", phone:"(212) 555-0125", location:"Manhattan, NY", badge:"NACDL Board Member", free_consult:false },
      { name:"Jennifer Louis-Jeune", firm:"Louis-Jeune Law", specialty:"Criminal Defense & Civil Rights", years:12, rating:4.8, reviews:212, email:"jlj@louisjeunelaw.com", phone:"(347) 555-0187", location:"Brooklyn, NY", badge:"Public Defender Alumni", free_consult:true },
    ],
    CA: [
      { name:"Shawn Holley", firm:"Kinsella Weitzman", specialty:"Criminal Defense", years:28, rating:4.9, reviews:534, email:"sh@kwikalaw.com", phone:"(310) 555-0119", location:"Los Angeles, CA", badge:"Super Lawyers Top 100", free_consult:false },
      { name:"Noel Stern", firm:"Stern Defense Group", specialty:"Criminal Defense & Interrogation Rights", years:20, rating:4.8, reviews:334, email:"ns@sterndefensegroup.com", phone:"(415) 555-0142", location:"San Francisco, CA", badge:"Former DA Investigator", free_consult:true },
      { name:"James Spertus", firm:"Spertus Landes & Umhofer", specialty:"White Collar & Criminal Defense", years:24, rating:4.8, reviews:378, email:"js@spertuslaw.com", phone:"(310) 555-0166", location:"Los Angeles, CA", badge:"Former Federal Prosecutor", free_consult:false },
    ],
    TX: [
      { name:"Randy Schaffer", firm:"Schaffer, Freeland & Eldredge", specialty:"Criminal Defense", years:36, rating:4.9, reviews:567, email:"rs@schafferlaw.net", phone:"(713) 555-0111", location:"Houston, TX", badge:"Texas Criminal Defense Hall of Fame", free_consult:false },
      { name:"Gary Trichter", firm:"Trichter & Murphy", specialty:"Criminal Defense & DWI", years:31, rating:4.8, reviews:445, email:"gt@trichterandmurphy.com", phone:"(713) 555-0134", location:"Houston, TX", badge:"Board Certified Criminal Law", free_consult:true },
      { name:"Lisa Callaway", firm:"Callaway Criminal Defense", specialty:"Criminal Defense", years:16, rating:4.7, reviews:223, email:"lc@callawaydefense.com", phone:"(512) 555-0157", location:"Austin, TX", badge:"TCDLA Member", free_consult:true },
    ],
    FL: [
      { name:"Bruce Fleisher", firm:"Fleisher Law", specialty:"Criminal Defense", years:33, rating:4.9, reviews:489, email:"bf@fleisherlaw.com", phone:"(305) 555-0122", location:"Miami, FL", badge:"Florida Bar Criminal Certification", free_consult:false },
      { name:"Stacy Scheff", firm:"Scheff Law", specialty:"Criminal Defense & Civil Rights", years:18, rating:4.8, reviews:312, email:"ss@schefflaw.com", phone:"(954) 555-0149", location:"Fort Lauderdale, FL", badge:"NACDL Member", free_consult:true },
      { name:"Hillard Haas", firm:"Haas Law Group", specialty:"Criminal Defense", years:25, rating:4.7, reviews:267, email:"hh@haaslawgroup.com", phone:"(407) 555-0176", location:"Orlando, FL", badge:"Florida Association Criminal Defense Lawyers", free_consult:false },
    ],
  },
};

function getLawyers(situation, state) {
  const byState = LAWYERS_DB[situation] || {};
  return byState[state] || byState["NY"] || [];
}

// ─── API ───────────────────────────────────────────────────────────────────
const post = (url, body) =>
  fetch(`${API_BASE}${url}`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) })
    .then(r => { if(!r.ok) throw new Error(`${r.status}`); return r.json(); });

const apiPrepare         = (situation, state, description) => post("/prepare", { situation, state, description });
const apiAnalyze         = (spoken_text, situation, state, description, conversation_history) =>
  post("/analyze", { spoken_text, situation, state, description, conversation_history });
const apiAnalyzeDocument = (image_base64, media_type, state, situation, description) =>
  post("/analyze-document", { image_base64, media_type, state, situation, description });
const apiAnalyzeVideo    = (video_base64, media_type, state, situation, description) =>
  post("/analyze-video", { video_base64, media_type, state, situation, description });
const apiGenerateReport  = (body) =>
  fetch(`${API_BASE}/generate-report`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) })
    .then(r => { if(!r.ok) throw new Error(`${r.status}`); return r.blob(); });

// ─── Speech hook ───────────────────────────────────────────────────────────
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
    r.onerror  = () => {};
    r.onend    = () => setListening(false);
    ref.current = r;
  }, [onResult]);
  const start = useCallback(() => { ref.current?.start(); setListening(true); }, []);
  const stop  = useCallback(() => { ref.current?.stop();  setListening(false); }, []);
  return { listening, supported, start, stop };
}

// ─── Main App ──────────────────────────────────────────────────────────────
// Screens: s1_situation → s2_state → s3_listening → s4_results
export default function App() {
  const [screen,      setScreen]      = useState("s1_situation");
  const [situation,   setSituation]   = useState(null);
  const [stateCode,   setStateCode]   = useState(null);
  const [description, setDescription] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [transcript,  setTranscript]  = useState([]);
  const [history,     setHistory]     = useState([]);
  const [isThinking,  setIsThinking]  = useState(false);
  const [preparing,   setPreparing]   = useState(false);
  const [error,       setError]       = useState(null);
  const [backendOk,   setBackendOk]   = useState(null);
  const [startTime,   setStartTime]   = useState(null);

  // Image scan
  const [scanResult,  setScanResult]  = useState(null);
  const [scanning,    setScanning]    = useState(false);
  const [docFindings, setDocFindings] = useState([]);

  // Video analysis
  const [videoResult,   setVideoResult]   = useState(null);
  const [videoAnalyzing,setVideoAnalyzing]= useState(false);
  const [videoName,     setVideoName]     = useState("");

  // Report
  const [reportLoading, setReportLoading] = useState(false);
  const [reportReady,   setReportReady]   = useState(false);

  // Lawyers
  const [showLawyers, setShowLawyers] = useState(false);

  // Results tab: "suggestions" | "document" | "video" | "lawyers"
  const [activeTab, setActiveTab] = useState("suggestions");

  const feedEndRef = useRef(null);
  useEffect(() => { feedEndRef.current?.scrollIntoView({ behavior:"smooth" }); }, [suggestions]);
  useEffect(() => {
    fetch(`${API_BASE}/health`).then(r => setBackendOk(r.ok)).catch(() => setBackendOk(false));
  }, []);

  // ── Speech ──────────────────────────────────────────────────────────────
  const handleSpeech = useCallback(async (text) => {
    const ts = new Date().toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});
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
    } catch { setError("Analysis failed — check backend is running."); }
    setIsThinking(false);
  }, [situation, stateCode, description, history, isThinking]);

  const { listening, supported, start: startSpeech, stop: stopSpeech } = useSpeech(handleSpeech);

  // ── Nav ─────────────────────────────────────────────────────────────────
  async function goToState() {
    if (!situation) return;
    setScreen("s2_state");
  }

  async function startSession() {
    if (!stateCode) return;
    setPreparing(true); setError(null);
    try { await apiPrepare(situation, stateCode, description); } catch { /* fallback ok */ }
    setPreparing(false);
    setSuggestions([]); setTranscript([]); setHistory([]);
    setDocFindings([]); setScanResult(null); setVideoResult(null);
    setStartTime(Date.now());
    startSpeech();
    setScreen("s3_listening");
  }

  function stopListening() {
    stopSpeech();
    setScreen("s4_results");
    setActiveTab("suggestions");
  }

  function reset() {
    setSituation(null); setStateCode(null); setDescription("");
    setSuggestions([]); setTranscript([]); setHistory([]);
    setDocFindings([]); setScanResult(null);
    setVideoResult(null); setVideoName("");
    setError(null); setReportReady(false); setShowLawyers(false);
    setScreen("s1_situation");
  }

  // ── Image upload ─────────────────────────────────────────────────────────
  async function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setScanning(true); setError(null);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl    = ev.target.result;
      const base64     = dataUrl.split(",")[1];
      const media_type = file.type || "image/jpeg";
      try {
        const result = await apiAnalyzeDocument(base64, media_type, stateCode, situation, description);
        setScanResult(result);
        setDocFindings(p => [...p, result]);
        setActiveTab("document");
      } catch { setError("Document scan failed — check backend is running."); }
      setScanning(false);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  // ── Video upload ─────────────────────────────────────────────────────────
  async function handleVideoUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setVideoAnalyzing(true); setVideoName(file.name); setError(null);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl    = ev.target.result;
      const base64     = dataUrl.split(",")[1];
      const media_type = file.type || "video/mp4";
      try {
        const result = await apiAnalyzeVideo(base64, media_type, stateCode, situation, description);
        setVideoResult(result);
        setActiveTab("video");
      } catch { setError("Video analysis failed — check backend is running."); }
      setVideoAnalyzing(false);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  // ── Report ───────────────────────────────────────────────────────────────
  async function downloadReport() {
    setReportLoading(true); setError(null);
    try {
      const blob = await apiGenerateReport({
        situation, state: stateCode, description,
        transcript, suggestions,
        doc_findings: docFindings,
        video_findings: videoResult ? [videoResult] : [],
        duration_seconds: startTime ? Math.floor((Date.now()-startTime)/1000) : 0,
      });
      const url  = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = `lawaier-report-${Date.now()}.pdf`;
      link.click(); URL.revokeObjectURL(url);
      setReportReady(true);
    } catch { setError("Report generation failed — check backend is running."); }
    setReportLoading(false);
  }

  // ── Contact lawyer ────────────────────────────────────────────────────────
  function contactLawyer(lawyer) {
    const sit     = situation?.replace(/_/g," ") || "legal";
    const subject = encodeURIComponent(`Legal Assistance — ${sit} in ${stateCode}`);
    const body    = encodeURIComponent(
`Dear ${lawyer.name},

I am seeking legal representation regarding a recent ${sit} encounter in ${stateCode}.

Summary: ${description || "Please see attached incident report."}

I have attached a detailed AI LawAIer incident report which includes the full encounter timeline, rights invoked, AI coaching suggestions provided, and any evidence analyzed.

I would greatly appreciate the opportunity to discuss my case.

Thank you,
[Your Name]
[Your Phone Number]`);
    window.location.href = `mailto:${lawyer.email}?subject=${subject}&body=${body}`;
  }

  const sitInfo = SITUATIONS.find(s => s.id === situation);

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <div style={s.app}>
      <style>{CSS}</style>

      {/* ── HEADER ── */}
      <header style={s.header}>
        <div style={s.headerLeft}>
          <span style={s.headerLogo}>⚖ LawAIer</span>
          {situation && stateCode && screen !== "s1_situation" && screen !== "s2_state" && (
            <span style={s.headerPill}>{sitInfo?.label} · {stateCode}</span>
          )}
        </div>
        <div style={s.headerRight}>
          <span style={{...s.statusDot, background: backendOk===null?P.slateXL : backendOk?P.green:P.red}} />
          <span style={s.statusText}>{backendOk===null?"connecting…":backendOk?"Connected":"Offline"}</span>
        </div>
      </header>

      {/* ── STEP BAR (steps 1-4 only on setup screens) ── */}
      {(screen==="s1_situation"||screen==="s2_state") && (
        <div style={s.stepBar}>
          {["Situation","State","Session","Results"].map((label,i) => {
            const stepNum = i+1;
            const curStep = screen==="s1_situation"?1:2;
            const done    = stepNum < curStep;
            const active  = stepNum === curStep;
            return (
              <div key={label} style={s.stepItem}>
                <div style={{...s.stepCircle,
                  background: done?P.blue:active?P.blue:P.white,
                  border: `2px solid ${done||active?P.blue:P.slateXL}`,
                  color: done||active?P.white:P.slateL}}>
                  {done ? "✓" : stepNum}
                </div>
                <span style={{...s.stepLabel, color:active?P.navy:done?P.blue:P.slateL}}>{label}</span>
                {i < 3 && <div style={{...s.stepLine, background:done?P.blue:P.slateXL}} />}
              </div>
            );
          })}
        </div>
      )}

      <main style={s.main}>

        {/* ══════════════════════════════════════════════════════════════
            SCREEN 1 — SELECT SITUATION
        ══════════════════════════════════════════════════════════════ */}
        {screen==="s1_situation" && (
          <div className="fade">
            <div style={s.pageHeader}>
              <h1 style={s.h1}>What's happening?</h1>
              <p style={s.subtext}>Select the situation you're facing. Your coach will load the relevant laws.</p>
            </div>

            <div style={s.situationGrid}>
              {SITUATIONS.map(sit => (
                <button key={sit.id} className="sitCard" onClick={() => { setSituation(sit.id); goToState(); }}
                  style={{...s.sitCard, ...(situation===sit.id ? s.sitCardActive : {})}}>
                  <span style={s.sitIcon}>{sit.icon}</span>
                  <span style={s.sitLabel}>{sit.label}</span>
                  <span style={s.sitDesc}>{sit.desc}</span>
                  <span style={{...s.sitArrow, opacity: situation===sit.id?1:0}}>→</span>
                </button>
              ))}
            </div>

            <p style={s.legalNote}>⚠ This tool provides general legal information only — not legal advice. Always consult a licensed attorney.</p>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            SCREEN 2 — SELECT STATE
        ══════════════════════════════════════════════════════════════ */}
        {screen==="s2_state" && (
          <div className="fade">
            <button style={s.backBtn} onClick={() => setScreen("s1_situation")}>← Back</button>

            <div style={s.pageHeader}>
              <div style={s.situationBadge}>
                <span>{sitInfo?.icon}</span>
                <span>{sitInfo?.label}</span>
              </div>
              <h1 style={s.h1}>Which state?</h1>
              <p style={s.subtext}>State laws vary significantly. We'll load the right statutes for your location.</p>
            </div>

            <div style={s.stateGrid}>
              {STATES.map(st => (
                <button key={st} className="stateBtn" onClick={() => setStateCode(st)}
                  style={{...s.stateBtn, ...(stateCode===st ? s.stateBtnActive : {})}}>
                  <span style={s.stateName}>{st}</span>
                  <span style={s.stateLabel}>{st==="Federal"?"Federal Law":`${st} State Law`}</span>
                </button>
              ))}
            </div>

            <div style={s.descSection}>
              <label style={s.label}>Briefly describe what's happening <span style={{color:P.slateL}}>(optional)</span></label>
              <textarea style={s.textarea}
                placeholder="e.g. Officer pulled me over on I-95, asking to search my vehicle..."
                value={description} onChange={e => setDescription(e.target.value)} />
            </div>

            {error && <ErrBanner msg={error} />}

            <button style={{...s.primaryBtn, opacity:!stateCode||preparing?0.5:1}}
              disabled={!stateCode||preparing} onClick={startSession} className="primaryBtn">
              {preparing ? "Loading laws…" : "Start Session →"}
            </button>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            SCREEN 3 — LISTENING
        ══════════════════════════════════════════════════════════════ */}
        {screen==="s3_listening" && (
          <div className="fade">
            <div style={s.listenHeader}>
              <div>
                <div style={s.listenTitle}>
                  <span style={s.liveDot} className="pulse" />
                  <span style={{fontSize:15,fontWeight:600,color:P.navy}}>Listening Live</span>
                  {isThinking && <span style={s.thinkingBadge}>analyzing…</span>}
                </div>
                <div style={s.listenSub}>{sitInfo?.label} · {stateCode}</div>
              </div>
              <button style={s.stopBtn} onClick={stopListening}>Stop Session</button>
            </div>

            {error && <ErrBanner msg={error} />}

            <div style={s.feedArea}>
              {suggestions.length === 0 ? (
                <div style={s.emptyFeed}>
                  <div style={{fontSize:36,marginBottom:10}}>👂</div>
                  <div style={{fontSize:14,color:P.slate,marginBottom:4}}>Listening for legally significant moments</div>
                  <div style={{fontSize:12,color:P.slateL}}>Speak clearly near your device's microphone</div>
                </div>
              ) : suggestions.map(sug => <SugCard key={sug.id} s={sug} />)}
              <div ref={feedEndRef} />
            </div>

            {transcript.length > 0 && (
              <div style={s.transcriptBox}>
                <div style={s.transcriptLabel}>Transcript</div>
                {transcript.slice(-4).map((t,i) => (
                  <div key={i} style={s.transcriptLine}>
                    <span style={s.transcriptTime}>{t.ts}</span>
                    <span style={{color:P.slate}}>"{t.text}"</span>
                  </div>
                ))}
              </div>
            )}

            {!supported && (
              <div style={{...s.errBanner, marginTop:12}}>
                Speech recognition requires Chrome or Edge. Use a supported browser for live audio.
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            SCREEN 4 — RESULTS
        ══════════════════════════════════════════════════════════════ */}
        {screen==="s4_results" && (
          <div className="fade">
            {/* Summary bar */}
            <div style={s.summaryBar}>
              <div style={s.summaryLeft}>
                <div style={s.summaryTitle}>Session Complete</div>
                <div style={s.summarySub}>{sitInfo?.label} · {stateCode} · {transcript.length} spoken moments</div>
              </div>
              <button style={s.newSessionBtn} onClick={reset}>New Session</button>
            </div>

            {/* Stat chips */}
            <div style={s.statRow}>
              <StatChip n={suggestions.length}                                 label="Suggestions"  color={P.blue}  />
              <StatChip n={suggestions.filter(s=>s.urgency==="red").length}    label="Critical"     color={P.red}   />
              <StatChip n={suggestions.filter(s=>s.urgency==="yellow").length} label="Caution"      color={P.amber} />
              <StatChip n={docFindings.length}                                  label="Docs Scanned" color={P.green} />
            </div>

            {/* ── Action cards row ── */}
            <div style={s.actionGrid}>

              {/* Upload Image */}
              <label style={s.actionCard} className="actionCard">
                <span style={s.actionIcon}>🖼</span>
                <span style={s.actionTitle}>Scan Document</span>
                <span style={s.actionDesc}>Upload a photo of a ticket, warrant, or notice for AI analysis</span>
                {scanning
                  ? <span style={s.actionLoading}>Scanning…</span>
                  : <span style={s.actionCta}>Upload Image →</span>}
                <input type="file" accept="image/*" style={{display:"none"}} onChange={handleImageUpload} disabled={scanning} />
              </label>

              {/* Upload Video */}
              <label style={s.actionCard} className="actionCard">
                <span style={s.actionIcon}>🎥</span>
                <span style={s.actionTitle}>Analyze Video</span>
                <span style={s.actionDesc}>Upload dashcam or CCTV footage for AI evidence analysis</span>
                {videoAnalyzing
                  ? <span style={s.actionLoading}>Analyzing…</span>
                  : <span style={s.actionCta}>Upload Video →</span>}
                <input type="file" accept="video/*" style={{display:"none"}} onChange={handleVideoUpload} disabled={videoAnalyzing} />
              </label>

              {/* Download PDF */}
              <button style={s.actionCard} className="actionCard" onClick={downloadReport} disabled={reportLoading}>
                <span style={s.actionIcon}>📄</span>
                <span style={s.actionTitle}>Download Report</span>
                <span style={s.actionDesc}>Generate a professional PDF legal report for your attorney</span>
                {reportLoading
                  ? <span style={s.actionLoading}>Generating…</span>
                  : <span style={s.actionCta}>{reportReady?"Download Again →":"Generate PDF →"}</span>}
              </button>

              {/* Find Lawyer */}
              <button style={s.actionCard} className="actionCard"
                onClick={() => { setShowLawyers(p=>!p); setActiveTab("lawyers"); }}>
                <span style={s.actionIcon}>⚖</span>
                <span style={s.actionTitle}>Find a Lawyer</span>
                <span style={s.actionDesc}>Matched {sitInfo?.label} attorneys in {stateCode}</span>
                <span style={s.actionCta}>{showLawyers?"Hide Lawyers":"View Matches →"}</span>
              </button>

            </div>

            {error && <ErrBanner msg={error} />}

            {/* ── Tabs ── */}
            <div style={s.tabBar}>
              {[
                { id:"suggestions", label:`Suggestions (${suggestions.length})` },
                { id:"document",    label:`Documents (${docFindings.length})` },
                { id:"video",       label:"Video Analysis" },
                { id:"lawyers",     label:"Lawyers" },
              ].map(tab => (
                <button key={tab.id} style={{...s.tab, ...(activeTab===tab.id?s.tabActive:{})}}
                  onClick={() => setActiveTab(tab.id)}>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab: Suggestions */}
            {activeTab==="suggestions" && (
              <div>
                {suggestions.length===0
                  ? <div style={s.emptyTab}>No legally significant moments were detected during this session.</div>
                  : suggestions.map(sug => <SugCard key={sug.id} s={sug} showTrigger />)}
              </div>
            )}

            {/* Tab: Documents */}
            {activeTab==="document" && (
              <div>
                {docFindings.length===0 ? (
                  <div style={s.emptyTab}>
                    No documents scanned yet. Use the "Scan Document" button above to upload an image of a ticket, warrant, or notice.
                  </div>
                ) : docFindings.map((d,i) => <DocCard key={i} result={d} />)}
              </div>
            )}

            {/* Tab: Video */}
            {activeTab==="video" && (
              <div>
                {videoAnalyzing && (
                  <div style={s.analyzingBox}>
                    <div style={s.analyzingSpinner} className="spin" />
                    <div>
                      <div style={{fontSize:14,fontWeight:600,color:P.navy,marginBottom:4}}>Analyzing video footage…</div>
                      <div style={{fontSize:12,color:P.slate}}>{videoName}</div>
                      <div style={{fontSize:12,color:P.slateL,marginTop:4}}>AI is reviewing the footage for rights violations and key moments. This may take 20–40 seconds.</div>
                    </div>
                  </div>
                )}
                {!videoResult && !videoAnalyzing && (
                  <div style={s.emptyTab}>
                    <div style={{fontSize:32,marginBottom:12}}>🎥</div>
                    <div style={{fontSize:14,fontWeight:600,color:P.navy,marginBottom:8}}>Upload video footage for AI analysis</div>
                    <div style={{fontSize:13,color:P.slate,marginBottom:16,lineHeight:1.6}}>
                      Supports dashcam recordings, CCTV footage, or any video of the encounter.
                      AI will analyze for rights violations, use of force, procedure compliance, and key timestamps.
                    </div>
                    <label style={s.uploadVideoBtn} className="primaryBtn">
                      Choose Video File
                      <input type="file" accept="video/*" style={{display:"none"}} onChange={handleVideoUpload} />
                    </label>
                  </div>
                )}
                {videoResult && !videoAnalyzing && <VideoCard result={videoResult} filename={videoName} />}
              </div>
            )}

            {/* Tab: Lawyers */}
            {activeTab==="lawyers" && (
              <div>
                <div style={s.lawyerHeader}>
                  <div style={{fontSize:14,fontWeight:600,color:P.navy}}>{sitInfo?.label} Attorneys in {stateCode}</div>
                  <div style={{fontSize:12,color:P.slate,marginTop:3}}>Sorted by rating · Click Contact to send report via email</div>
                </div>
                {getLawyers(situation, stateCode).map((l,i) => (
                  <LawyerCard key={i} lawyer={l} onContact={() => contactLawyer(l)} />
                ))}
                <div style={s.lawyerDisclaim}>
                  Lawyer profiles shown are illustrative examples. Verify credentials independently before engaging counsel.
                </div>
              </div>
            )}

            <div style={s.disclaimer}>
              This tool provides general legal information only — not legal advice. Always consult a licensed attorney for your specific situation.
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function SugCard({ s: sug, showTrigger }) {
  const u = URGENCY[sug.urgency] || URGENCY.green;
  return (
    <div style={{...s2.sugCard, background:u.bg, borderColor:u.border}}>
      <div style={s2.sugTop}>
        <span style={{...s2.sugBadge, background:u.bg, color:u.text, border:`1px solid ${u.border}`}}>
          {u.icon} {u.label}
        </span>
        <span style={s2.sugTime}>{sug.time}</span>
      </div>
      <div style={s2.sugText}>{sug.suggestion}</div>
      <div style={s2.sugLaw}>📖 {sug.law}</div>
      {showTrigger && sug.trigger && (
        <div style={s2.sugTrigger}>Triggered by: "{sug.trigger}"</div>
      )}
    </div>
  );
}

function DocCard({ result }) {
  const u    = URGENCY[result.urgency] || URGENCY.yellow;
  const typ  = DOC_LABELS[result.document_type] || "Document";
  const pa   = result.points_analysis;

  return (
    <div style={{...s2.card, borderColor:u.border}}>
      <div style={s2.cardHeader}>
        <div style={s2.cardTitleRow}>
          <span style={{fontSize:18}}>📄</span>
          <span style={s2.cardTitle}>{typ}</span>
          <span style={{...s2.badge, background:u.bg, color:u.text, border:`1px solid ${u.border}`}}>
            {u.icon} {u.label}
          </span>
          {pa && pa.total_points > 0 && (
            <span style={{...s2.badge, background:P.amberBg, color:P.amber, border:`1px solid ${P.amberBd}`}}>
              {pa.total_points} pts
            </span>
          )}
        </div>
      </div>
      <p style={s2.cardSummary}>{result.summary}</p>

      {result.is_judicial_warrant===false && result.document_type?.includes("warrant") && (
        <div style={s2.warrantAlert}>
          ⚠ This is NOT a judicial warrant — they cannot enter your home without your consent.
        </div>
      )}

      {result.findings?.length > 0 && (
        <div style={s2.section}>
          <div style={s2.sectionLabel}>Findings</div>
          {result.findings.map((f,i) => <div key={i} style={s2.bullet}>• {f}</div>)}
        </div>
      )}

      {result.actions?.length > 0 && (
        <div style={s2.section}>
          <div style={s2.sectionLabel}>What to do</div>
          {result.actions.map((a,i) => <div key={i} style={{...s2.bullet, color:P.blue, fontWeight:500}}>→ {a}</div>)}
        </div>
      )}

      {result.recommended_next_step && (
        <div style={s2.nextStep}>💡 {result.recommended_next_step}</div>
      )}

      {pa && pa.total_points > 0 && (
        <PointsPanel pa={pa} />
      )}
    </div>
  );
}

function PointsPanel({ pa }) {
  const susp = pa.suspension_threshold;
  const pct  = susp ? Math.min(100, Math.round((pa.total_points/susp)*100)) : 0;
  const barC = pct>=100?P.red:pct>=70?P.amber:P.blue;

  return (
    <div style={s2.pointsPanel}>
      <div style={s2.pointsHeader}>🚗 DMV Points — {pa.state_name}</div>

      <div style={s2.pointsStats}>
        <div style={s2.pointsStat}>
          <div style={{...s2.pointsBig, color:pct>=70?P.red:P.amber}}>{pa.total_points}</div>
          <div style={s2.pointsStatLabel}>Total Points</div>
        </div>
        <div style={s2.pointsStat}>
          <div style={s2.pointsBig}>{susp||"—"}</div>
          <div style={s2.pointsStatLabel}>Suspension At</div>
        </div>
        <div style={s2.pointsStat}>
          <div style={{...s2.pointsBig, color:pa.points_to_suspension===0?P.red:P.green}}>
            {pa.points_to_suspension ?? "—"}
          </div>
          <div style={s2.pointsStatLabel}>Points Left</div>
        </div>
      </div>

      {susp && (
        <div style={{marginBottom:12}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
            <span style={{fontSize:11,color:P.slate}}>Progress to suspension</span>
            <span style={{fontSize:11,fontWeight:600,color:barC}}>{pct}%</span>
          </div>
          <div style={{background:P.slateXL,borderRadius:4,height:6,overflow:"hidden"}}>
            <div style={{width:`${pct}%`,height:"100%",background:barC,borderRadius:4,transition:"width .4s"}} />
          </div>
        </div>
      )}

      {pa.worst_consequence && (
        <div style={{...s2.warrantAlert, marginBottom:10}}>{pa.worst_consequence}</div>
      )}

      <div style={{marginBottom:10}}>
        <div style={s2.sectionLabel}>Violation Breakdown</div>
        {pa.breakdown.map((v,i) => (
          <div key={i} style={{...s2.violationRow, background:i%2===0?P.bg:P.white}}>
            <div style={{flex:1}}>
              <div style={{fontSize:12,fontWeight:600,color:P.navy}}>{v.code} — {v.name}</div>
              {v.fine_range && v.fine_range!=="unknown" && (
                <div style={{fontSize:11,color:P.slateL}}>Fine: {v.fine_range}</div>
              )}
              {v.note && <div style={{fontSize:11,color:P.amber}}>ℹ {v.note}</div>}
            </div>
            <div style={{textAlign:"right",flexShrink:0,marginLeft:12}}>
              <div style={{fontSize:20,fontWeight:700,color:v.points>=6?P.red:v.points>=4?P.amber:P.slate}}>
                {v.points}
              </div>
              <div style={{fontSize:10,color:P.slateL}}>pts</div>
            </div>
          </div>
        ))}
        <div style={s2.violationTotal}>
          <span style={{fontWeight:600,color:P.navy}}>Total</span>
          <span style={{fontSize:18,fontWeight:700,color:pct>=70?P.red:P.amber}}>{pa.total_points} pts</span>
        </div>
      </div>

      {pa.contest_recommended && (
        <div style={s2.contestBox}>
          ⚖ <strong>Consider contesting:</strong> {pa.contest_reason}
        </div>
      )}
    </div>
  );
}

function VideoCard({ result, filename }) {
  const u = URGENCY[result.urgency] || URGENCY.yellow;
  return (
    <div style={{...s2.card, borderColor:u.border}}>
      <div style={s2.cardHeader}>
        <div style={s2.cardTitleRow}>
          <span style={{fontSize:18}}>🎥</span>
          <span style={s2.cardTitle}>{result.footage_type || "Video Analysis"}</span>
          <span style={{...s2.badge, background:u.bg, color:u.text, border:`1px solid ${u.border}`}}>
            {u.icon} {u.label}
          </span>
        </div>
        {filename && <div style={{fontSize:11,color:P.slateL,marginTop:4}}>{filename}</div>}
      </div>

      <p style={s2.cardSummary}>{result.summary}</p>

      {result.duration && (
        <div style={{fontSize:12,color:P.slate,marginBottom:12}}>⏱ Duration: {result.duration}</div>
      )}

      {result.timeline?.length > 0 && (
        <div style={s2.section}>
          <div style={s2.sectionLabel}>Timeline of Events</div>
          {result.timeline.map((e,i) => (
            <div key={i} style={s2.timelineRow}>
              <span style={s2.timelineTs}>{e.timestamp}</span>
              <span style={{...s2.timelineDot, background:e.significant?P.amber:P.slateXL}} />
              <span style={{fontSize:12,color:P.slate,flex:1}}>{e.event}</span>
            </div>
          ))}
        </div>
      )}

      {result.violations_detected?.length > 0 && (
        <div style={s2.section}>
          <div style={s2.sectionLabel}>Potential Rights Violations</div>
          {result.violations_detected.map((v,i) => (
            <div key={i} style={{...s2.bullet, color:P.red, fontWeight:500}}>⚠ {v}</div>
          ))}
        </div>
      )}

      {result.officer_conduct && (
        <div style={s2.section}>
          <div style={s2.sectionLabel}>Officer Conduct Assessment</div>
          <p style={{fontSize:12,color:P.slate,margin:0,lineHeight:1.6}}>{result.officer_conduct}</p>
        </div>
      )}

      {result.evidence_strength && (
        <div style={s2.section}>
          <div style={s2.sectionLabel}>Evidence Strength</div>
          <div style={{...s2.badge, display:"inline-flex", background:P.blueBg, color:P.blue, border:`1px solid ${P.blueBd}`}}>
            {result.evidence_strength}
          </div>
        </div>
      )}

      {result.key_observations?.length > 0 && (
        <div style={s2.section}>
          <div style={s2.sectionLabel}>Key Observations</div>
          {result.key_observations.map((o,i) => <div key={i} style={s2.bullet}>• {o}</div>)}
        </div>
      )}

      {result.recommended_actions?.length > 0 && (
        <div style={s2.section}>
          <div style={s2.sectionLabel}>Recommended Actions</div>
          {result.recommended_actions.map((a,i) => (
            <div key={i} style={{...s2.bullet, color:P.blue, fontWeight:500}}>→ {a}</div>
          ))}
        </div>
      )}

      {result.recommended_next_step && (
        <div style={s2.nextStep}>💡 {result.recommended_next_step}</div>
      )}
    </div>
  );
}

function LawyerCard({ lawyer: l, onContact }) {
  return (
    <div style={s2.lawyerCard} className="lawyerCard">
      <div style={s2.lawyerTop}>
        <div style={{flex:1}}>
          <div style={s2.lawyerName}>
            {l.name}
            {l.free_consult && <span style={s2.freeTag}>Free Consult</span>}
          </div>
          <div style={s2.lawyerFirm}>{l.firm}</div>
          <div style={s2.lawyerSpec}>{l.specialty}</div>
        </div>
        <div style={s2.lawyerRating}>
          <div style={s2.ratingNum}>{l.rating}</div>
          <div style={s2.ratingStars}>{"★".repeat(Math.round(l.rating))}{"☆".repeat(5-Math.round(l.rating))}</div>
          <div style={s2.ratingReviews}>{l.reviews} reviews</div>
        </div>
      </div>

      <div style={s2.lawyerMeta}>
        <span>📍 {l.location}</span>
        <span>⚖ {l.years} yrs exp</span>
        <span>📞 {l.phone}</span>
      </div>

      <div style={s2.lawyerBadge}>🏅 {l.badge}</div>

      <button style={s2.contactBtn} onClick={onContact} className="contactBtn">
        ✉ Contact — Send Report via Email
      </button>
      <div style={{fontSize:11,color:P.slateL,textAlign:"center",marginTop:6}}>
        Opens your mail app with a pre-filled draft · Attach the downloaded PDF
      </div>
    </div>
  );
}

function ErrBanner({ msg }) {
  return <div style={s2.errBanner}>⚠ {msg}</div>;
}

function StatChip({ n, label, color }) {
  return (
    <div style={{...s2.statChip, borderColor:color+"33"}}>
      <div style={{fontSize:22,fontWeight:700,color,lineHeight:1}}>{n}</div>
      <div style={{fontSize:10,color:P.slate,marginTop:3,letterSpacing:.3}}>{label}</div>
    </div>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────
const s = {
  app:          { minHeight:"100vh", background:P.bg, color:P.navy, fontFamily:"Inter, system-ui, sans-serif" },
  header:       { background:P.white, borderBottom:`1px solid ${P.border}`, padding:"14px 24px", display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:100 },
  headerLeft:   { display:"flex", alignItems:"center", gap:12 },
  headerLogo:   { fontSize:16, fontWeight:700, color:P.navy, letterSpacing:-.3 },
  headerPill:   { background:P.blueBg, color:P.blue, border:`1px solid ${P.blueBd}`, borderRadius:20, padding:"3px 10px", fontSize:11, fontWeight:500 },
  headerRight:  { display:"flex", alignItems:"center", gap:6 },
  statusDot:    { width:7, height:7, borderRadius:"50%", display:"inline-block" },
  statusText:   { fontSize:11, color:P.slateL },
  stepBar:      { background:P.white, borderBottom:`1px solid ${P.border}`, padding:"16px 24px", display:"flex", alignItems:"center", justifyContent:"center", gap:0 },
  stepItem:     { display:"flex", alignItems:"center", gap:6 },
  stepCircle:   { width:26, height:26, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, flexShrink:0 },
  stepLabel:    { fontSize:11, fontWeight:500, marginRight:6 },
  stepLine:     { width:40, height:2, marginRight:6, flexShrink:0 },
  main:         { maxWidth:640, margin:"0 auto", padding:"28px 20px 60px" },
  pageHeader:   { marginBottom:28 },
  h1:           { fontSize:24, fontWeight:700, color:P.navy, marginBottom:8, letterSpacing:-.4 },
  subtext:      { fontSize:14, color:P.slate, lineHeight:1.6, margin:0 },
  situationBadge: { display:"inline-flex", alignItems:"center", gap:6, background:P.blueBg, border:`1px solid ${P.blueBd}`, borderRadius:20, padding:"4px 12px", fontSize:12, fontWeight:500, color:P.blue, marginBottom:12 },
  situationGrid:{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:24 },
  sitCard:      { background:P.white, border:`1.5px solid ${P.border}`, borderRadius:12, padding:"20px 16px", cursor:"pointer", display:"flex", flexDirection:"column", gap:4, textAlign:"left", transition:"all .15s" },
  sitCardActive:{ borderColor:P.blue, background:P.blueBg },
  sitIcon:      { fontSize:24, marginBottom:4 },
  sitLabel:     { fontSize:14, fontWeight:600, color:P.navy },
  sitDesc:      { fontSize:12, color:P.slateL, lineHeight:1.4 },
  sitArrow:     { fontSize:16, color:P.blue, marginTop:4 },
  stateGrid:    { display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:8, marginBottom:24 },
  stateBtn:     { background:P.white, border:`1.5px solid ${P.border}`, borderRadius:10, padding:"14px 8px", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:3, transition:"all .15s" },
  stateBtnActive:{ borderColor:P.blue, background:P.blueBg },
  stateName:    { fontSize:15, fontWeight:700, color:P.navy },
  stateLabel:   { fontSize:9, color:P.slateL, textAlign:"center" },
  descSection:  { marginBottom:20 },
  label:        { display:"block", fontSize:12, fontWeight:500, color:P.slate, marginBottom:6 },
  textarea:     { width:"100%", background:P.white, border:`1px solid ${P.border}`, borderRadius:8, padding:"10px 12px", color:P.navy, fontSize:13, fontFamily:"Inter, system-ui, sans-serif", resize:"vertical", minHeight:72, outline:"none", boxSizing:"border-box", lineHeight:1.5 },
  primaryBtn:   { width:"100%", padding:"14px", background:P.blue, border:"none", borderRadius:8, color:P.white, fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:"Inter, system-ui, sans-serif", transition:"all .15s" },
  backBtn:      { background:"none", border:"none", color:P.blue, fontSize:13, fontWeight:500, cursor:"pointer", padding:"0 0 16px", display:"block", fontFamily:"Inter, system-ui, sans-serif" },
  listenHeader: { display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:20 },
  listenTitle:  { display:"flex", alignItems:"center", gap:8, marginBottom:4 },
  liveDot:      { width:9, height:9, borderRadius:"50%", background:P.red, display:"inline-block", flexShrink:0 },
  thinkingBadge:{ background:P.blueBg, color:P.blue, border:`1px solid ${P.blueBd}`, borderRadius:10, padding:"2px 8px", fontSize:11 },
  listenSub:    { fontSize:12, color:P.slateL },
  stopBtn:      { background:P.white, border:`1.5px solid ${P.border}`, borderRadius:8, padding:"8px 16px", color:P.slate, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"Inter, system-ui, sans-serif" },
  feedArea:     { minHeight:200, marginBottom:16 },
  emptyFeed:    { textAlign:"center", padding:"48px 0", color:P.slateL },
  transcriptBox:{ background:P.white, border:`1px solid ${P.border}`, borderRadius:8, padding:"12px 14px", marginTop:8 },
  transcriptLabel:{ fontSize:10, fontWeight:600, color:P.slateL, letterSpacing:1, textTransform:"uppercase", marginBottom:8 },
  transcriptLine: { display:"flex", gap:10, fontSize:12, marginBottom:4 },
  transcriptTime: { color:P.slateL, flexShrink:0 },
  summaryBar:   { display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:16 },
  summaryLeft:  {},
  summaryTitle: { fontSize:18, fontWeight:700, color:P.navy },
  summarySub:   { fontSize:12, color:P.slateL, marginTop:4 },
  newSessionBtn:{ background:P.white, border:`1.5px solid ${P.border}`, borderRadius:8, padding:"8px 16px", color:P.slate, fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"Inter, system-ui, sans-serif", flexShrink:0 },
  statRow:      { display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:8, marginBottom:20 },
  actionGrid:   { display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:20 },
  actionCard:   { background:P.white, border:`1.5px solid ${P.border}`, borderRadius:12, padding:"18px 16px", cursor:"pointer", display:"flex", flexDirection:"column", gap:4, textAlign:"left", fontFamily:"Inter, system-ui, sans-serif", transition:"all .15s" },
  actionIcon:   { fontSize:22, marginBottom:2 },
  actionTitle:  { fontSize:13, fontWeight:600, color:P.navy },
  actionDesc:   { fontSize:11, color:P.slateL, lineHeight:1.5, flex:1 },
  actionCta:    { fontSize:12, fontWeight:600, color:P.blue, marginTop:4 },
  actionLoading:{ fontSize:12, color:P.slateL, marginTop:4 },
  tabBar:       { display:"flex", borderBottom:`1px solid ${P.border}`, marginBottom:16, gap:0 },
  tab:          { padding:"10px 14px", border:"none", background:"none", color:P.slateL, fontSize:12, fontWeight:500, cursor:"pointer", borderBottom:"2px solid transparent", fontFamily:"Inter, system-ui, sans-serif", transition:"all .15s" },
  tabActive:    { color:P.blue, borderBottomColor:P.blue },
  emptyTab:     { textAlign:"center", padding:"40px 20px", color:P.slateL, fontSize:13, lineHeight:1.7 },
  lawyerHeader: { marginBottom:16, padding:"12px 0" },
  lawyerDisclaim:{ fontSize:11, color:P.slateL, textAlign:"center", marginTop:12, lineHeight:1.6 },
  analyzingBox: { display:"flex", gap:14, alignItems:"flex-start", background:P.blueBg, border:`1px solid ${P.blueBd}`, borderRadius:10, padding:"16px", marginBottom:16 },
  analyzingSpinner:{ width:22, height:22, border:`3px solid ${P.blueBd}`, borderTopColor:P.blue, borderRadius:"50%", flexShrink:0 },
  uploadVideoBtn:{ display:"inline-block", background:P.blue, color:P.white, border:"none", borderRadius:8, padding:"11px 20px", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"Inter, system-ui, sans-serif" },
  disclaimer:   { textAlign:"center", marginTop:32, fontSize:11, color:P.slateL, lineHeight:1.7 },
  errBanner:    { background:P.amberBg, border:`1px solid ${P.amberBd}`, borderRadius:8, padding:"10px 14px", fontSize:12, color:P.amber, marginBottom:12 },
  legalNote:    { textAlign:"center", fontSize:11, color:P.slateL, lineHeight:1.6, marginTop:8 },
};

const s2 = {
  sugCard:      { background:P.white, border:`1px solid`, borderRadius:10, padding:"14px 16px", marginBottom:10 },
  sugTop:       { display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 },
  sugBadge:     { borderRadius:20, padding:"3px 10px", fontSize:11, fontWeight:600 },
  sugTime:      { fontSize:11, color:P.slateL },
  sugText:      { fontSize:14, fontWeight:500, color:P.navy, lineHeight:1.5, marginBottom:6 },
  sugLaw:       { fontSize:11, color:P.slateL },
  sugTrigger:   { fontSize:11, color:P.slateL, marginTop:4, fontStyle:"italic" },
  card:         { background:P.white, border:`1px solid`, borderRadius:10, padding:"18px 18px", marginBottom:12 },
  cardHeader:   { marginBottom:12 },
  cardTitleRow: { display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" },
  cardTitle:    { fontSize:14, fontWeight:600, color:P.navy },
  badge:        { borderRadius:20, padding:"3px 9px", fontSize:11, fontWeight:500, display:"inline-flex", alignItems:"center", gap:4 },
  cardSummary:  { fontSize:13, color:P.slate, lineHeight:1.6, marginBottom:12, margin:"0 0 12px" },
  warrantAlert: { background:P.redBg, border:`1px solid ${P.redBd}`, borderRadius:6, padding:"8px 12px", fontSize:12, fontWeight:600, color:P.red, marginBottom:10 },
  section:      { marginBottom:12 },
  sectionLabel: { fontSize:10, fontWeight:600, color:P.slateL, letterSpacing:1, textTransform:"uppercase", marginBottom:6 },
  bullet:       { fontSize:12, color:P.slate, marginBottom:4, lineHeight:1.5 },
  nextStep:     { background:P.blueBg, border:`1px solid ${P.blueBd}`, borderRadius:6, padding:"9px 12px", fontSize:12, color:P.blue },
  pointsPanel:  { background:P.bg, border:`1px solid ${P.border}`, borderRadius:8, padding:"14px", marginTop:14 },
  pointsHeader: { fontSize:12, fontWeight:600, color:P.navy, marginBottom:12 },
  pointsStats:  { display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:14 },
  pointsStat:   { textAlign:"center", background:P.white, border:`1px solid ${P.border}`, borderRadius:8, padding:"10px 6px" },
  pointsBig:    { fontSize:26, fontWeight:700, color:P.navy, lineHeight:1 },
  pointsStatLabel:{ fontSize:9, color:P.slateL, marginTop:3 },
  violationRow: { display:"flex", alignItems:"flex-start", justifyContent:"space-between", padding:"8px 8px", borderRadius:4, marginBottom:2 },
  violationTotal:{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 8px", borderTop:`1px solid ${P.border}`, marginTop:4 },
  contestBox:   { background:P.blueBg, border:`1px solid ${P.blueBd}`, borderRadius:6, padding:"10px 12px", fontSize:12, color:P.blue, lineHeight:1.6 },
  timelineRow:  { display:"flex", alignItems:"flex-start", gap:8, marginBottom:8 },
  timelineTs:   { fontSize:11, color:P.slateL, flexShrink:0, width:48 },
  timelineDot:  { width:8, height:8, borderRadius:"50%", flexShrink:0, marginTop:3 },
  statChip:     { background:P.white, border:`1.5px solid`, borderRadius:8, padding:"12px 8px", textAlign:"center" },
  lawyerCard:   { background:P.white, border:`1px solid ${P.border}`, borderRadius:12, padding:"18px 18px", marginBottom:12, transition:"all .15s" },
  lawyerTop:    { display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:10 },
  lawyerName:   { fontSize:14, fontWeight:700, color:P.navy, marginBottom:2, display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" },
  freeTag:      { background:P.greenBg, color:P.green, border:`1px solid ${P.greenBd}`, borderRadius:20, padding:"1px 7px", fontSize:10, fontWeight:500 },
  lawyerFirm:   { fontSize:12, color:P.slateL, marginBottom:2 },
  lawyerSpec:   { fontSize:11, color:P.blue, fontWeight:500 },
  lawyerRating: { textAlign:"center", marginLeft:14, flexShrink:0 },
  ratingNum:    { fontSize:20, fontWeight:700, color:P.amber, lineHeight:1 },
  ratingStars:  { fontSize:11, color:P.amber },
  ratingReviews:{ fontSize:9, color:P.slateL, marginTop:2 },
  lawyerMeta:   { display:"flex", gap:14, fontSize:11, color:P.slateL, marginBottom:10, flexWrap:"wrap" },
  lawyerBadge:  { background:P.bg, border:`1px solid ${P.border}`, borderRadius:6, padding:"5px 10px", fontSize:11, color:P.slate, marginBottom:12, display:"inline-block" },
  contactBtn:   { width:"100%", padding:"11px", background:P.blue, border:"none", borderRadius:8, color:P.white, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"Inter, system-ui, sans-serif" },
  errBanner:    { background:P.amberBg, border:`1px solid ${P.amberBd}`, borderRadius:8, padding:"10px 14px", fontSize:12, color:P.amber, marginBottom:12 },
};

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: ${P.bg}; }
.fade { animation: fadeIn .2s ease; }
@keyframes fadeIn { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:translateY(0); } }
.pulse { animation: pulse 2s ease-in-out infinite; }
@keyframes pulse { 0%,100% { opacity:.6; transform:scale(.9); } 50% { opacity:1; transform:scale(1.1); } }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
.sitCard:hover { border-color:${P.blue} !important; background:${P.blueBg} !important; }
.stateBtn:hover { border-color:${P.blue} !important; }
.actionCard:hover { border-color:${P.blue} !important; box-shadow:0 2px 8px rgba(29,78,216,.08); }
.primaryBtn:hover:not(:disabled) { background:${P.blueL} !important; }
.contactBtn:hover { background:${P.blueL} !important; }
.lawyerCard:hover { box-shadow:0 2px 12px rgba(0,0,0,.06); }
textarea:focus { border-color:${P.blue} !important; box-shadow:0 0 0 3px ${P.blueBg}; }
::-webkit-scrollbar { width:4px; }
::-webkit-scrollbar-track { background:${P.bg}; }
::-webkit-scrollbar-thumb { background:${P.slateXL}; border-radius:2px; }
`;
