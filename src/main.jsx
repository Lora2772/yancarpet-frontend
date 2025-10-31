import React, { useEffect, useMemo, useState, useContext, createContext } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Link, NavLink, useNavigate, useParams } from "react-router-dom";

/* ================= Config ================= */
const API_BASE = (window.__API_BASE__ ?? "http://localhost:8080").replace(/\/$/, "");

/* ================= Helpers ================= */
function getImageSrc(p) {
  const raw = p?.imageUrl || p?.image || p?.img || "";
  return raw ? `${API_BASE}/media/proxy?url=${encodeURIComponent(raw)}` : "https://via.placeholder.com/1200x600?text=YanCarpet";
}
async function api(path, { method = "GET", body, auth = false } = {}) {
  const headers = { "Content-Type": "application/json" };
  const token = localStorage.getItem("yan_token");
  if (auth && token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${txt}`);
  }
  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json() : res.text();
}
function useDebounced(value, delay = 300) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), delay); return () => clearTimeout(t); }, [value, delay]);
  return v;
}

/* ================= Theme ================= */
const THEME = {
  brandFont: "'Playfair Display', serif", // 艺术字体
  bodyFont:
    "'Inter', system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, 'Microsoft YaHei', sans-serif",
  primary: "#c2410c",      // deep orange
  primaryDark: "#9a3412",
  soft: "#fff7ed",         // orange-50
  soft2: "#f8fafc",        // gray-50
  border: "#e5e7eb",
  text: "#111827",
  muted: "#64748b",
  shadow: "0 10px 30px rgba(0,0,0,.12)",
};

/* ================= Toast ================= */
const ToastCtx = createContext(null);
function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = (msg) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2200);
  };
  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div style={{ position: "fixed", right: 16, bottom: 16, display: "grid", gap: 8, zIndex: 60 }}>
        {toasts.map((t) => (
          <div key={t.id} style={{
            background: "white", border: `1px solid ${THEME.border}`, borderRadius: 12,
            boxShadow: THEME.shadow, padding: "10px 12px", minWidth: 220
          }}>
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
function useToast(){ return useContext(ToastCtx); }

/* ================= Cart ================= */
const CartCtx = createContext(null);
function CartProvider({ children }) {
  const [items, setItems] = useState(() => {
    try { return JSON.parse(localStorage.getItem("yan_cart") || "[]"); } catch { return []; }
  });
  useEffect(() => { localStorage.setItem("yan_cart", JSON.stringify(items)); }, [items]);

  const add = (p, qty=1) => {
    setItems(prev => {
      const i = prev.findIndex(it => it.sku === p.sku);
      const price = Number(p.unitPrice ?? p.price ?? 0);
      if (i >= 0) { const copy=[...prev]; copy[i] = { ...copy[i], quantity: (copy[i].quantity||0)+qty }; return copy; }
      return [...prev, { sku: p.sku, name: p.name, price, quantity: qty, imageUrl: p.imageUrl }];
    });
  };
  const remove = (sku) => setItems(prev => prev.filter(i => i.sku !== sku));
  const clear = () => setItems([]);
  const setQty = (sku, qty) => setItems(prev => prev.map(i => i.sku===sku ? { ...i, quantity: Math.max(1, qty) } : i));
  const inc = (sku) => setItems(prev => prev.map(i => i.sku===sku ? { ...i, quantity: (i.quantity||1)+1 } : i));
  const dec = (sku) => setItems(prev => prev.map(i => i.sku===sku ? { ...i, quantity: Math.max(1,(i.quantity||1)-1) } : i));
  const total = items.reduce((s,i)=> s + (Number(i.price)||0)*(i.quantity||0), 0);
  return <CartCtx.Provider value={{ items, add, remove, clear, setQty, inc, dec, total }}>{children}</CartCtx.Provider>;
}
function useCart(){ return useContext(CartCtx); }

/* ================= Favorites ================= */
const FavCtx = createContext(null);
function FavProvider({ children }) {
  const [favs, setFavs] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem("yan_favs") || "[]")); } catch { return new Set(); }
  });
  useEffect(() => { localStorage.setItem("yan_favs", JSON.stringify([...favs])); }, [favs]);
  const toggle = (sku) => setFavs(prev => { const nx=new Set(prev); nx.has(sku)?nx.delete(sku):nx.add(sku); return nx; });
  const has = (sku) => favs.has(sku);
  return <FavCtx.Provider value={{ favs, toggle, has }}>{children}</FavCtx.Provider>;
}
function useFav(){ return useContext(FavCtx); }
function Heart({ active, onClick }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      title={active ? "Unfavorite" : "Favorite"}
      style={{
        position: "absolute", top: 10, right: 10, width: 36, height: 36, borderRadius: 999,
        border: `1px solid ${THEME.border}`, background: "white", display: "grid", placeItems: "center",
        boxShadow: THEME.shadow, cursor: "pointer"
      }}>
      <span style={{ fontSize: 18, color: active ? THEME.primary : "#cbd5e1" }}>♥</span>
    </button>
  );
}

/* ================= Styles ================= */
const S = {
  header: {
    display:"flex", justifyContent:"space-between", alignItems:"center",
    padding:"12px 18px", borderBottom:`1px solid ${THEME.border}`, position:"sticky", top:0,
    background:"white", zIndex:10
  },
  leftBrand: { display:"flex", alignItems:"baseline", gap:10 },
  brand: { fontFamily: THEME.brandFont, fontWeight:800, fontSize:22, letterSpacing:".2px", color:THEME.text, textDecoration:"none" },
  tagline: { color:THEME.muted, fontSize:13 },
  tabs: { display:"flex", gap:14, alignItems:"center" },

  page: { maxWidth:1200, margin:"0 auto", padding:"18px", fontFamily: THEME.bodyFont, color:THEME.text },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: 20,
    justifyItems: "center"
  },
  card: { background:"white", border:`1px solid ${THEME.border}`, borderRadius:16, overflow:"hidden", boxShadow:THEME.shadow },
  thumb: { width:"100%", height:220, background:THEME.soft2, position:"relative", cursor:"pointer" },
  title: { fontWeight:700, fontSize:16 },
  muted: { color: THEME.muted },
  price: { marginTop:6, fontWeight:800, color: THEME.primary },

  input: { padding:"10px 12px", border:`1px solid ${THEME.border}`, borderRadius:12, width:"100%", boxSizing:"border-box", outline:"none" },
  primaryBtn: { padding:"10px 14px", borderRadius:12, background:THEME.primary, color:"white", border:"none", cursor:"pointer", fontWeight:600 },
  ghostBtn: { padding:"10px 14px", borderRadius:12, background:"white", color:THEME.text, border:`1px solid ${THEME.border}`, cursor:"pointer", fontWeight:600 },
  linkBtn: { padding:0, border:"none", background:"none", color:"#2563eb", cursor:"pointer" },

  hero: { background: THEME.soft, border:`1px solid ${THEME.border}`, borderRadius:16, boxShadow:THEME.shadow, overflow:"hidden" },

  panelMask: { position:"fixed", inset:0, background:"rgba(0,0,0,.25)", display:"flex", justifyContent:"flex-end", zIndex:50 },
  panel: { width:360, height:"100%", background:"#fff", padding:16, boxShadow:"-12px 0 30px rgba(0,0,0,.15)", overflowY:"auto" },

  cartTopBar: { display:"flex", justifyContent:"flex-end", gap:10, marginBottom:12 }
};

/* =========== Nav tabs with fancy font & hover underline =========== */
function TabLink({ to, children }) {
  const base = ({ isActive }) => ({
    fontFamily: THEME.brandFont,
    textDecoration: "none",
    padding:"8px 12px",
    borderRadius:12,
    border:`1px solid ${isActive ? THEME.primaryDark : THEME.border}`,
    background: isActive ? THEME.primary : "transparent",
    color: isActive ? "white" : THEME.text,
    position:"relative"
  });
  const [hover, setHover] = useState(false);
  return (
    <NavLink to={to} style={base}
      onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)}>
      <span style={{ borderBottom: hover ? "2px solid currentColor" : "2px solid transparent" }}>{children}</span>
    </NavLink>
  );
}

/* ================= Header ================= */
function Header() {
  const { items } = useCart();
  const nav = useNavigate();
  const count = items.reduce((s,i)=>s+(i.quantity||0),0);

  return (
    <header style={S.header}>
      {/* 左侧品牌 + 标语 */}
      <div style={S.leftBrand}>
        <Link to="/" style={S.brand}>YanCarpet</Link>
        <span style={S.tagline}>High quality is all in the details</span>
      </div>

      {/* 中间 Tabs（不含 Cart） */}
      <nav style={S.tabs}>
        <TabLink to="/">Home</TabLink>
        <TabLink to="/products">Products</TabLink>
        <TabLink to="/about">About us</TabLink>
        <TabLink to="/contact">Contact us</TabLink>
      </nav>

      {/* 右侧“Everything Ships FREE” + Cart 按钮（全局固定） */}
      <div style={{ display:"flex", alignItems:"center", gap:12 }}>
        <div style={{ color: THEME.primary, fontWeight: 800 }}>Everything Ships FREE</div>
        <button
          onClick={()=>nav("/cart")}
          style={{ ...S.primaryBtn, display:"inline-flex", alignItems:"center", gap:8 }}
          title="Cart"
        >
          <span>Cart</span>
          <span style={{
            minWidth:22, height:22, borderRadius:999, background:"white",
            color:THEME.primary, display:"grid", placeItems:"center", fontWeight:800, padding:"0 6px"
          }}>{count}</span>
        </button>
      </div>
    </header>
  );
}


/* ================= Home (carousel) ================= */
function Carousel({ slides = [], interval = 3500 }) {
  const [i, setI] = useState(0);
  const len = Array.isArray(slides) ? slides.length : 0;
  const nav = useNavigate();

  useEffect(() => {
    if (len <= 1) return;
    const t = setInterval(() => setI((v) => (v + 1) % len), interval);
    return () => clearInterval(t);
  }, [len, interval]);

  // 没数据：安全占位，不崩
  if (len === 0) {
    return (
      <div style={{ position: "relative", height: 420, background: THEME.soft,
        display: "grid", placeItems: "center", borderRadius: 16, border: `1px solid ${THEME.border}` }}>
        <div style={S.muted}>No products yet.</div>
      </div>
    );
  }

  const cur = slides[Math.min(i, len - 1)] || slides[0];

  return (
    <div style={{ position: "relative", height: 420, background: THEME.soft, borderRadius: 16, overflow: "hidden" }}>
      <img
        src={getImageSrc({ imageUrl: cur.imageUrl })}
        alt={cur.name || ""}
        style={{ width: "100%", height: "100%", objectFit: "cover", cursor: "pointer" }}
        onClick={() => cur?.sku && nav(`/item/${encodeURIComponent(cur.sku)}`)}
        onError={(e) => { e.currentTarget.src = "https://via.placeholder.com/1200x420?text=YanCarpet"; }}
      />
      <button
        onClick={(e)=>{e.stopPropagation(); setI((v)=> (v - 1 + len) % len);}}
        style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", ...S.ghostBtn }}>‹</button>
      <button
        onClick={(e)=>{e.stopPropagation(); setI((v)=> (v + 1) % len);}}
        style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", ...S.ghostBtn }}>›</button>

      <div style={{
        position:"absolute", left:0, right:0, bottom:0, padding:"10px 14px",
        background:"linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,.55) 80%)",
        color:"white", display:"flex", justifyContent:"space-between", alignItems:"end"
      }}>
        <div style={{ fontWeight:800 }}>{cur.name || ""}</div>
        <div style={{ fontWeight:800 }}>
          ${Number(cur?.unitPrice ?? 0).toFixed(2)}{" "}
          <span style={{ opacity:.8, fontWeight:500 }}>/ {cur?.unit || "usd/sqm"}</span>
        </div>
      </div>
    </div>
  );
}

function HomePage() {
  const [slides, setSlides] = useState([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    let keep = true;
    (async () => {
      try {
        setErr("");
        // 若你的后端不支持 q 为空，可以换成 /items 或 /items/featured
        const data = await api(`/items/search?q=`);
        if (!keep) return;
        // 兼容多种返回形态
        const arr =
          Array.isArray(data) ? data :
          Array.isArray(data?.items) ? data.items :
          Array.isArray(data?.content) ? data.content : [];
        // 过滤掉没有图片的，最多 6 张
        const withImg = arr.filter(x => x?.imageUrl).slice(0, 6);
        setSlides(withImg);
      } catch (e) {
        if (keep) setErr(e.message || String(e));
      }
    })();
    return () => { keep = false; };
  }, []);

  return (
    <div style={S.page}>
      {err && <div style={{ color:"crimson", marginBottom:8 }}>Failed to load products: {err}</div>}
      <div style={S.hero}>
        <Carousel slides={slides}/>
      </div>
    </div>
  );
}


/* ================= Products (catalog) ================= */
// ================= ProductCard（用于 Products/Home 网格） =================
function ProductCard({ p }) {
  const nav = useNavigate();
  const { add } = useCart();

  const goDetail = () => nav(`/item/${encodeURIComponent(p.sku)}`);

  return (
    <div style={S.card}>
      <div style={S.thumb} onClick={goDetail}>
        <img
          src={getImageSrc(p)}  // 走你的 /media/proxy
          alt={p.name || ""}
          style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 12 }}
          onError={(e) => { e.currentTarget.src = "https://via.placeholder.com/400x240?text=YanCarpet"; }}
        />
      </div>
      <div style={{ padding: 12 }}>
        <div style={S.title}>{p.name}</div>
        <div style={S.muted}>{[p.material, p.color].filter(Boolean).join(" · ")}</div>
        <div style={S.price}>
          ${Number(p.unitPrice ?? p.price ?? 0).toFixed(2)}{" "}
          <span style={S.muted}>/ {p.unit || "usd/sqm"}</span>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button style={S.ghostBtn} onClick={goDetail}>Details</button>
          <button style={S.primaryBtn} onClick={() => add(p, 1)}>Add to cart</button>
        </div>
      </div>
    </div>
  );
}

// ================= Catalog (带抽屉) =================
// ================= ProductsPage（带抽屉筛选，防崩版） =================
function ProductsPage(){
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // 顶部搜索
  const [q, setQ] = useState("");
  const debQ = useDebounced(q, 300);

  // 抽屉
  const [open, setOpen] = useState(false);

  // 当前已应用的筛选
  const [filters, setFilters] = useState({ color: "", material: "", room: "" });
  // 抽屉里的草稿
  const [draft, setDraft] = useState({ color: "", material: "", room: "" });

  useEffect(() => {
    let keep = true;
    (async () => {
      try {
        setLoading(true); setError("");
        // 你的后端若 /items 返回全部，也可以改成 /items
        const path = debQ ? `/items/search?q=${encodeURIComponent(debQ)}` : "/items";
        const data = await api(path);
        if (!keep) return;
        const arr = Array.isArray(data) ? data
          : Array.isArray(data?.items) ? data.items
          : Array.isArray(data?.content) ? data.content
          : [];
        setList(arr);
      } catch (e) {
        if (keep) setError(e.message || String(e));
      } finally {
        if (keep) setLoading(false);
      }
    })();
    return () => { keep = false; };
  }, [debQ]);

  // 从列表聚合出可选项
  const optionSets = useMemo(() => {
    const colors = new Set();
    const materials = new Set();
    const rooms = new Set();
    for (const it of list) {
      if (it?.color) String(it.color).split(/[,/]/).map(s=>s.trim()).forEach(v => v && colors.add(v));
      if (it?.material) String(it.material).split(/[,/]/).map(s=>s.trim()).forEach(v => v && materials.add(v));
      const rt = Array.isArray(it?.roomType) ? it.roomType : (it?.roomType ? [it.roomType] : []);
      rt.forEach(v => v && rooms.add(v));
    }
    return {
      colors: Array.from(colors).sort(),
      materials: Array.from(materials).sort(),
      rooms: Array.from(rooms).sort(),
    };
  }, [list]);

  // 应用筛选后的列表
  const filtered = useMemo(() => {
    return list.filter(it => {
      const okColor = !filters.color || String(it.color||"").toLowerCase().includes(filters.color.toLowerCase());
      const okMat   = !filters.material || String(it.material||"").toLowerCase().includes(filters.material.toLowerCase());
      const rt = Array.isArray(it.roomType) ? it.roomType.join(",") : (it.roomType||"");
      const okRoom  = !filters.room || rt.toLowerCase().includes(filters.room.toLowerCase());
      return okColor && okMat && okRoom;
    });
  }, [list, filters]);

  const openDrawer = () => { setDraft(filters); setOpen(true); };
  const applyDraft = () => { setFilters(draft); setOpen(false); };
  const clearDraft = () => { setDraft({ color:"", material:"", room:"" }); };

  return (
    <div style={S.page}>
      {/* 顶部工具条 */}
      <div style={{...S.hero, display:"flex", gap:12, alignItems:"center", justifyContent:"space-between"}}>
        <input
          style={{...S.input, maxWidth:480}}
          placeholder="Search: wool carpet / tiles / rug / sku"
          value={q}
          onChange={e=>setQ(e.target.value)}
        />
        <button style={S.ghostBtn} onClick={openDrawer}>Filters ▾</button>
      </div>

      {error && <div style={S.error}>{error}</div>}
      {loading && <div>Loading...</div>}

      {/* 当前筛选标签 */}
      {(filters.color || filters.material || filters.room) && (
        <div style={{margin:"6px 0 10px", display:"flex", gap:8, flexWrap:"wrap"}}>
          {filters.color && <Chip onClear={()=>setFilters(p=>({ ...p, color:"" }))}>Color: {filters.color}</Chip>}
          {filters.material && <Chip onClear={()=>setFilters(p=>({ ...p, material:"" }))}>Material: {filters.material}</Chip>}
          {filters.room && <Chip onClear={()=>setFilters(p=>({ ...p, room:"" }))}>Room: {filters.room}</Chip>}
          <button style={S.linkBtn} onClick={()=>setFilters({ color:"", material:"", room:"" })}>Clear all</button>
        </div>
      )}

      {/* 商品网格 */}
      <div style={S.grid}>
        {filtered.map(p => <ProductCard key={p.sku} p={p} />)}
      </div>
      {!loading && filtered.length===0 && <div style={{marginTop:16}}>No results.</div>}

      {/* 右侧抽屉 */}
      {open && (
        <div style={S.panelMask} onClick={()=>setOpen(false)}>
          <div style={S.panel} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8}}>
              <div style={{fontWeight:800, fontSize:18}}>Filters</div>
              <button style={S.linkBtn} onClick={()=>setOpen(false)}>Close ✕</button>
            </div>

            <div style={{marginTop:8}}>
              <div style={{fontWeight:700, marginBottom:6}}>Color</div>
              <select
                style={{...S.input, padding:"8px 10px"}}
                value={draft.color}
                onChange={e=>setDraft(d=>({ ...d, color: e.target.value }))}
              >
                <option value="">All</option>
                {optionSets.colors.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div style={{marginTop:12}}>
              <div style={{fontWeight:700, marginBottom:6}}>Material</div>
              <select
                style={{...S.input, padding:"8px 10px"}}
                value={draft.material}
                onChange={e=>setDraft(d=>({ ...d, material: e.target.value }))}
              >
                <option value="">All</option>
                {optionSets.materials.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            <div style={{marginTop:12}}>
              <div style={{fontWeight:700, marginBottom:6}}>Room type</div>
              <select
                style={{...S.input, padding:"8px 10px"}}
                value={draft.room}
                onChange={e=>setDraft(d=>({ ...d, room: e.target.value }))}
              >
                <option value="">All</option>
                {optionSets.rooms.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>

            <div style={{display:"flex", gap:8, marginTop:16}}>
              <button style={S.ghostBtn} onClick={clearDraft}>Clear</button>
              <button style={S.primaryBtn} onClick={applyDraft}>Apply</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 小标签组件（可清除）
function Chip({ children, onClear }) {
  return (
    <div style={{
      display:"inline-flex", alignItems:"center", gap:6,
      padding:"6px 10px", border:"1px solid #e5e7eb", borderRadius:999, background:"#fff"
    }}>
      <span>{children}</span>
      <button onClick={onClear} style={{ border:"none", background:"none", cursor:"pointer" }}>✕</button>
    </div>
  );
}


/* ================= Drawer & Delivery ================= */
function Drawer({ open, onClose, title, children }){
  if (!open) return null;
  return (
    <div style={S.panelMask} onClick={onClose}>
      <div style={S.panel} onClick={(e)=>e.stopPropagation()}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
          <div style={{ ...S.title, fontSize:18 }}>{title}</div>
          <button style={S.ghostBtn} onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
function DeliveryPanel(){
  return (
    <div>
      <div style={{ ...S.muted, marginBottom:10 }}>
        <span style={{ background:"#dcfce7", color:"#166534", padding:"3px 8px", borderRadius:8, border:"1px solid #bbf7d0", fontWeight:700, marginRight:8 }}>FREE Fast Delivery</span>
        Get it by <b>Tue, Nov 4</b>
      </div>
      <div style={{ borderTop:`1px solid ${THEME.border}`, paddingTop:12 }}>
        <div style={{ fontWeight:800, fontSize:18, marginBottom:8 }}>Available Delivery Method(s)</div>
        <div style={{ marginBottom:8 }}>
          Ground Delivery<br/><span style={S.muted}>Get it by Tue, Nov 4</span>
        </div>
        <div style={{ marginBottom:8 }}>
          Expedited Delivery<br/><span style={S.muted}>Get it by Tue, Nov 4</span>
        </div>
        <div style={{ marginBottom:8 }}>
          Express Delivery<br/><span style={S.muted}>Get it by Mon, Nov 3</span>
        </div>
        <div style={{ marginTop:8, ...S.muted }}>Delivery dates and pricing will be confirmed at Checkout.</div>
      </div>
      <div style={{ marginTop:14 }}>
        <div style={{ fontWeight:800, fontSize:18, marginBottom:6 }}>Shipping Policy</div>
        <div style={S.muted}>
          <b>Sea shipping ≈ 15 business days · Custom ≈ 30 business days</b>
        </div>
      </div>
    </div>
  );
}

function DetailPage(){
  const { sku } = useParams();
  const [p, setP] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { add } = useCart();
  const { push } = useToast();
  const { has, toggle } = useFav();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let keep=true;
    (async()=>{
      try{ setLoading(true); setError("");
        const data = await api(`/items/${encodeURIComponent(sku)}`);
        if(!keep) return; setP(data);
      }catch(e){ if(keep) setError(e.message); } finally{ if(keep) setLoading(false); }
    })();
    return () => { keep=false; };
  }, [sku]);

  if (loading) return <div style={S.page}>Loading...</div>;
  if (error) return <div style={S.page}><div style={{ color:"crimson" }}>{error}</div></div>;
  if (!p) return <div style={S.page}>Not found.</div>;

  return (
    <div style={S.page}>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:24 }}>
        <div style={{ position:"relative" }}>
          <img src={getImageSrc(p)} alt={p.name} style={{ width:"100%", borderRadius:16 }}/>
          <Heart active={has(p.sku)} onClick={()=>toggle(p.sku)} />
        </div>

        <div>
          <div style={{ fontFamily: THEME.brandFont, fontSize:26, fontWeight:800, marginBottom:10 }}>{p.name}</div>
          <div style={{ margin:"8px 0" }}>{p.description}</div>
          <div style={S.muted}>Material: {p.material} · Color: {p.color}</div>
          <div style={{ marginTop:8 }}>Room: {(Array.isArray(p.roomType)? p.roomType.join(", ") : p.roomType)||"-"}</div>
          <div style={{ marginTop:8 }}>Sizes: {(p.sizeOptions||[]).join(", ")}</div>
          <div style={{ marginTop:12, fontSize:18, fontWeight:800, color:THEME.primary }}>
            ${Number(p.unitPrice||0).toFixed(2)} <span style={S.muted}>/ {p.unit||"usd/sqm"}</span>
          </div>

          <div style={{ display:"flex", gap:10, marginTop:12 }}>
            <button style={S.primaryBtn} onClick={()=>{ add(p,1); push("Added to cart"); }}>Add to cart</button>
            <button style={S.ghostBtn} onClick={()=>setOpen(true)}>Delivery Details ▸</button>
          </div>

          <div style={{ marginTop:16, padding:12, background:THEME.soft, borderRadius:12, border:`1px solid ${THEME.border}` }}>
            <b>Customize your carpet</b>: contact sales for bespoke sizes/colors.
          </div>
        </div>
      </div>

      <Drawer open={open} onClose={()=>setOpen(false)} title="Delivery Details">
        <DeliveryPanel/>
      </Drawer>
    </div>
  );
}

/* ================= Cart / Checkout ================= */
function CartPage(){
  const { items, remove, clear, total, inc, dec, setQty } = useCart();
  const nav = useNavigate();

  return (
    <div style={S.page}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
        <div style={{ fontFamily: THEME.brandFont, fontSize:24, fontWeight:800 }}>Cart</div>
        <div style={S.cartTopBar}>
          <button style={S.ghostBtn} onClick={clear}>Clear</button>
          <button style={S.primaryBtn} onClick={()=>nav("/checkout")}>Checkout</button>
        </div>
      </div>

      {items.length===0 ? (
        <div>Cart is empty. <button style={S.linkBtn} onClick={()=>nav("/products")}>Go shop →</button></div>
      ) : (
        <>
          <table style={{ width:"100%", borderCollapse:"collapse", border:`1px solid ${THEME.border}`, borderRadius:16, overflow:"hidden", boxShadow:THEME.shadow }}>
            <thead style={{ background: THEME.soft }}>
              <tr>
                <th style={{ textAlign:"left", padding:12 }}>Item</th>
                <th style={{ textAlign:"right", padding:12 }}>Unit</th>
                <th style={{ textAlign:"center", padding:12 }}>Qty</th>
                <th style={{ textAlign:"right", padding:12 }}>Subtotal</th>
                <th style={{ width:80 }}></th>
              </tr>
            </thead>
            <tbody>
              {items.map(it=>{
                const unit = Number(it.price||0), sub = unit*(it.quantity||0);
                return (
                  <tr key={it.sku} style={{ borderTop:`1px solid ${THEME.border}` }}>
                    <td style={{ padding:12, display:"flex", alignItems:"center", gap:10, cursor:"pointer" }}
                        onClick={()=>nav(`/item/${encodeURIComponent(it.sku)}`)}>
                      <img src={getImageSrc({imageUrl: it.imageUrl})} alt=""
                          style={{ width:64, height:64, objectFit:"cover", borderRadius:8, border:`1px solid ${THEME.border}` }}/>
                      <div style={{ fontWeight:700, textDecoration:"underline" }}>{it.name}</div>
                    </td>
                    <td style={{ padding:12, textAlign:"right" }}>${unit.toFixed(2)}</td>
                    <td style={{ padding:12, textAlign:"center" }}>
                      <div style={{ display:"inline-flex", alignItems:"center", gap:8 }}>
                        <button style={S.ghostBtn} onClick={()=>dec(it.sku)}>-</button>
                        <input value={it.quantity} onChange={(e)=>setQty(it.sku, Number(e.target.value)||1)} style={{ width:56, textAlign:"center", ...S.input }}/>
                        <button style={S.ghostBtn} onClick={()=>inc(it.sku)}>+</button>
                      </div>
                    </td>
                    <td style={{ padding:12, textAlign:"right" }}><b>${sub.toFixed(2)}</b></td>
                    <td style={{ padding:12, textAlign:"center" }}><button style={S.linkBtn} onClick={()=>remove(it.sku)}>Remove</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:14 }}>
            <div style={{ padding:"6px 12px", borderRadius:999, background:THEME.soft, border:`1px solid ${THEME.border}` }}>
              Total <b style={{ marginLeft:8, color:THEME.primary }}>${total.toFixed(2)}</b>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function CheckoutPage(){
  const { items, total, clear } = useCart();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const nav = useNavigate();

  const placeOrder = async () => {
    try {
      setLoading(true); setErr("");
      const email = localStorage.getItem("yan_email");
      if (!email) throw new Error("Please sign in first (top-right).");
      const order = await api("/orders", { method:"POST", body: { customerEmail: email, items }, auth: true });
      await api("/payments/submit", { method:"POST", auth:true, body: { orderId: order.orderId, paymentMethod:"CARD", amount: Number(total.toFixed(2)) }});
      clear();
      alert("Order placed & paid successfully! OrderId: " + order.orderId);
      nav(`/orders/${order.orderId}`);
    } catch(e){ setErr(e.message); } finally { setLoading(false); }
  };

  return (
    <div style={S.page}>
      <div style={{ fontFamily: THEME.brandFont, fontSize:24, fontWeight:800, marginBottom:10 }}>Checkout</div>
      <div style={{ background:"white", border:`1px solid ${THEME.border}`, borderRadius:16, padding:18, boxShadow:THEME.shadow }}>
        <div>Signed in as: <b>{localStorage.getItem("yan_email") || "(not signed)"}</b></div>
        <div>Items: <b>{items.length}</b> · Total: <b style={{ color:THEME.primary }}>${total.toFixed(2)}</b></div>
        {err && <div style={{ color:"crimson", marginTop:8 }}>{err}</div>}
        <div style={{ display:"flex", gap:10, marginTop:14 }}>
          <button style={S.primaryBtn} disabled={loading||items.length===0} onClick={placeOrder}>
            {loading?"Processing...":"Pay with Card"}
          </button>
          <button style={S.ghostBtn} onClick={()=>nav("/cart")}>Back to cart</button>
        </div>
      </div>
    </div>
  );
}

/* ================= Static Pages ================= */
function AboutPage(){
  return (
    <div style={S.page}>
      <div style={{ fontFamily: THEME.brandFont, fontSize:24, fontWeight:800, marginBottom:10 }}>About us</div>
      <div style={{ background:"white", border:`1px solid ${THEME.border}`, borderRadius:16, padding:18, boxShadow:THEME.shadow, lineHeight:1.7 }}>
        <p><b>Jiangsu Shengyan Carpet Co., Ltd.</b> located in 336 Yanling Road, Jiangyin, Jiangsu Province, China. We entered the carpet industry in 1995. Over more than twenty years, we have cooperated with tens of thousands of organizations.</p>
        <p>Our vision is <b>concern your concerns</b>. During these 20 years, we have never stopped learning and innovating. We believe the only thing that never changes is changing. Only through innovation can we keep up with global development.</p>
        <p>Our factory is located in Liyang. Our products include Axminster carpet, Wilton carpet, exhibition carpet, carpet tiles, tufted carpet and PVC carpet. Materials cover wool, PP, nylon, sisal, acrylic, polyester, and corn fiber. We are able to meet designers’, buyers’, and end-users’ requirements in design, quality, durability, quantity, and price.</p>
        <p>You are more than welcome to visit our factory and production line. Based on our twenty years of experience and professional carpet knowledge, we can supply carpets exactly per customer specification, or provide suitable designs as needed.</p>
      </div>
    </div>
  );
}

function ContactPage(){
  return (
    <div style={S.page}>
      <div style={{ fontFamily: THEME.brandFont, fontSize:24, fontWeight:800, marginBottom:10 }}>Contact us</div>
      <div style={{ background:"white", border:`1px solid ${THEME.border}`, borderRadius:16, padding:18, boxShadow:THEME.shadow, lineHeight:1.9 }}>
        <p><b>Jiangsu Shengyan Carpet Co.,Ltd.</b></p>
        <p>Ins : <b>lisasycarpet</b></p>
        <p>FB : <b>lisasycarpet@outlook.com</b></p>
        <p>Web : <a href="http://www.yancarpet.com" target="_blank" rel="noreferrer">http://www.yancarpet.com</a></p>
        <p>Tel : <b>+86 15961661413</b> / <b>+86 18651010003</b></p>
        <p>Whatsapp / Wechat : <b>+86 15961661413</b> / <b>+86 18651010003</b></p>
        <p>Email : <b>cindywang@yancarpet.com</b> / <b>sales1@yancarpet.com</b></p>
        <p>Address: <b>No.336, Yanling Road, Jiangyin City, Jiangsu Province, China</b></p>
      </div>
    </div>
  );
}

/* ================= Shell ================= */
function Shell(){
  return (
    <div>
      <Header/>
      <main style={{ padding:"24px 16px", maxWidth:1200, margin:"0 auto" }}>
        <Routes>
          <Route path="/" element={<HomePage/>} />
          <Route path="/products" element={<ProductsPage/>} />  {/* ← 这里 */}
          <Route path="/item/:sku" element={<DetailPage/>} />
          <Route path="/cart" element={<CartPage/>} />
          <Route path="/checkout" element={<CheckoutPage/>} />
          <Route path="/about" element={<AboutPage/>} />
          <Route path="/contact" element={<ContactPage/>} />
        </Routes>

      </main>
      <footer style={{ padding:18, textAlign:"center", color:THEME.muted, borderTop:`1px solid ${THEME.border}` }}>
        © {new Date().getFullYear()} YanCarpet · Everything ships FREE
      </footer>
    </div>
  );
}

/* ================= Mount ================= */
function App(){
  return (
    <BrowserRouter>
      <ToastProvider>
        <FavProvider>
          <CartProvider>
            <Shell/>
          </CartProvider>
        </FavProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

const container = document.getElementById("root");
createRoot(container).render(<App/>);
