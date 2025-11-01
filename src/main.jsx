import React, { useEffect, useMemo, useState, useContext, createContext, useRef } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Link, useNavigate, useParams, useLocation } from "react-router-dom";

// === Global theme (put near the top) ===
const THEME = { BG: "#EAE2D6", ACCENT: "#A65B2F", HERO_HEIGHT: 440 };


// 全局样式：底色 & nav hover 下划线
const GlobalStyle = () => (
  <style>{`
    body { background: ${THEME.BG}; }
    a.nav { text-decoration: none; }
    a.nav:hover { text-decoration: underline; }
  `}</style>
);

/* ================= Config ================= */
const API_BASE = (window.__API_BASE__ ?? "http://localhost:8080").replace(/\/$/, "");

/* ================= Helpers ================= */
// 统一把商品图片转成代理地址
function getImageSrc(p) {
  const raw = p?.imageUrl || p?.image || p?.img || "";
  return raw
    ? `${API_BASE}/media/proxy?url=${encodeURIComponent(raw)}`
    : "https://via.placeholder.com/800x480?text=YanCarpet";
}

async function api(path, { method = "GET", body, auth = false } = {}) {
  const headers = { "Content-Type": "application/json" };
  const token = localStorage.getItem("yan_token");
  if (auth && token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`HTTP ${res.status}: ${txt}`);
  }
  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json() : res.text();
}

function useDebounced(value, delay = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

/* ================= Toast ================= */
const ToastCtx = createContext(null);
function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const add = (msg) => {
    const id = Math.random().toString(36).slice(2);
    setItems((prev) => [...prev, { id, msg }]);
    setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== id)), 2200);
  };
  return (
    <ToastCtx.Provider value={{ add }}>
      {children}
      <div style={{ position: "fixed", right: 16, bottom: 16, display: "grid", gap: 8, zIndex: 9999 }}>
        {items.map((t) => (
          <div key={t.id} style={{ background: "#111", color: "#fff", padding: "10px 12px", borderRadius: 10, boxShadow: "0 6px 24px rgba(0,0,0,.2)" }}>
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
function useToast() { return useContext(ToastCtx); }

/* ================= Cart ================= */
const CartCtx = createContext(null);
function CartProvider({ children }) {
  const [items, setItems] = useState(() => {
    try { return JSON.parse(localStorage.getItem("yan_cart") || "[]"); } catch { return []; }
  });
  const toast = useToast();
  useEffect(() => { localStorage.setItem("yan_cart", JSON.stringify(items)); }, [items]);

  const add = (p, qty = 1) => {
    setItems(prev => {
      const i = prev.findIndex(it => it.sku === p.sku);
      if (i >= 0) {
        const copy = [...prev]; copy[i] = { ...copy[i], quantity: (copy[i].quantity || 0) + qty };
        return copy;
      }
      return [...prev, {
        sku: p.sku,
        name: p.name,
        price: Number(p.unitPrice ?? p.price ?? 0),
        quantity: qty,
        imageUrl: p.imageUrl
      }];
    });
    toast?.add("Added to cart");
  };
  const remove = (sku) => setItems(prev => prev.filter(i => i.sku !== sku));
  const clear = () => setItems([]);
  const total = items.reduce((s, i) => s + (Number(i.price) || 0) * (i.quantity || 0), 0);
  const count = items.reduce((s, i) => s + (i.quantity || 0), 0);
  return <CartCtx.Provider value={{ items, add, remove, clear, total, count }}>{children}</CartCtx.Provider>;
}
function useCart() { return useContext(CartCtx); }

/* ================= Auth Modal ================= */
function AuthModal({ open, onClose, mode = "login", onAuthed }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    try {
      setLoading(true); setErr("");
      if (mode === "register") {
        await api("/account/create", {
          method: "POST", body: {
            email, userName: name, password,
            shippingAddress: {}, billingAddress: {},
            defaultPaymentMethod: { type: "CARD", maskedDetail: "VISA **** 0000" }
          }
        });
      }
      const r = await api("/auth/login", { method: "POST", body: { email, password } });
      onAuthed(r.token, email);
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally { setLoading(false); }
  };

  if (!open) return null;
  return (
    <div style={S.modalBackdrop}>
      <div style={S.modalCard}>
        <h3 style={S.h3}>{mode === "login" ? "Sign in" : "Create account"}</h3>
        {mode === "register" && (
          <input style={S.input} placeholder="Name" value={name} onChange={e => setName(e.target.value)} />
        )}
        <input style={S.input} placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
        <input style={S.input} placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} />
        {err && <div style={S.error}>{err}</div>}
        <button disabled={loading} style={S.primaryBtn} onClick={submit}>
          {loading ? "Loading..." : (mode === "login" ? "Sign in" : "Create")}
        </button>
        <button style={S.ghostBtn} onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

/* ================= Cards ================= */
function ProductCard({ p }) {
  const nav = useNavigate();
  const { add } = useCart();

  const goDetail = () => nav(`/item/${encodeURIComponent(p.sku)}`);

  return (
    <div style={S.card}>
      <div style={S.thumb} onClick={goDetail}>
        <img
          src={getImageSrc(p)}
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

/* ================= Pages ================= */
// 首页轮播
function Carousel({ slides = [], interval = 3500 }) {
  const [i, setI] = useState(0);
  const nav = useNavigate();
  const len = Array.isArray(slides) ? slides.length : 0;

  useEffect(() => {
    if (len <= 1) return;
    const t = setInterval(() => setI(v => (v + 1) % len), interval);
    return () => clearInterval(t);
  }, [len, interval]);

  if (len === 0) {
    return (
      <div style={{
        position: "relative", height: THEME.HERO_HEIGHT,
        background: "#F6EFE9", borderRadius: 12,
        display: "grid", placeItems: "center", border: "1px solid #e5e7eb"
      }}>
        <div style={{ color: "#64748b" }}>No products yet.</div>
      </div>
    );
  }

  const cur = slides[Math.min(i, len - 1)] || slides[0];

  return (
    <div style={{ position: "relative", height: THEME.HERO_HEIGHT, borderRadius: 12, overflow: "hidden", background: "#fff" }}>
      <img
        src={getImageSrc({ imageUrl: cur.imageUrl })}
        alt={cur.name || ""}
        style={{ width: "100%", height: "100%", objectFit: "cover", cursor: "pointer" }}
        onClick={() => cur?.sku && nav(`/item/${encodeURIComponent(cur.sku)}`)}
        onError={(e) => { e.currentTarget.src = "https://via.placeholder.com/800x220?text=YanCarpet"; }}
      />
      {len > 1 && (
        <>
          <button onClick={(e) => { e.stopPropagation(); setI(v => (v - 1 + len) % len); }}
            style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", ...S.ghostBtn }}>‹</button>
          <button onClick={(e) => { e.stopPropagation(); setI(v => (v + 1) % len); }}
            style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", ...S.ghostBtn }}>›</button>
        </>
      )}
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
        // 若 /items/search?q= 更合适，可改成那条
        const data = await api(`/items`);
        if (!keep) return;
        const arr = Array.isArray(data) ? data
          : Array.isArray(data?.items) ? data.items
          : Array.isArray(data?.content) ? data.content
          : [];
        const withImg = arr.filter(x => x?.imageUrl).slice(0, 6);
        setSlides(withImg);
      } catch (e) {
        if (keep) setErr(e.message || String(e));
      }
    })();
    return () => { keep = false; };
  }, []);

  // 左右分栏：左轮播（已缩小），右 About Us
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 24,
      alignItems: "start",
      padding: "16px 0"
    }}>
      <div>
        <Carousel slides={slides} />
      </div>

      <div style={{
      background:"#fff", 
      border:"1px solid #e5e7eb", 
      borderRadius:12, 
      padding:16, 
      minHeight: THEME.HERO_HEIGHT, 
      overflow: "visible"           
    }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: "#A65B2F", marginBottom: 8 }}>
          ABOUT US
        </h2>
        {err && <div style={{ color: "crimson", marginBottom: 8 }}>Failed to load products: {err}</div>}
        <p style={{ color: "#374151", lineHeight: 1.6 }}>
          Jiangsu Shengyan Carpet Co., Ltd. located in 336 Yanling Road, Jiangyin, Jiangsu Province, China.
          We entered the carpet industry in 1995 and over the past 20 years have cooperated with more than ten thousand organizations.
        </p>
        <p style={{ color: "#374151", lineHeight: 1.6 }}>
          Our vision is concern your concerns. During these 20 years, we never stopped learning and innovating.
          We believe the only thing that never changes is change itself. By constant innovation we catch up with global development.
        </p>
        <p style={{ color: "#374151", lineHeight: 1.6 }}>
          Our factory is located in Liyang. Our products include Axminster carpet, Wilton carpet, exhibition carpet,
          carpet tiles, tufted carpet and PVC. Materials cover wool, PP, nylon, sisal, acrylic, polyester, and corn fiber —
          meeting designers’, buyers’, and end-users’ requirements for design, quality, durability and price.
        </p>
      </div>
    </div>
  );
}

// Products（带抽屉筛选）
function ProductsPage() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [q, setQ] = useState("");
  const debQ = useDebounced(q, 300);

  const [open, setOpen] = useState(false);
  const [filters, setFilters] = useState({ color: "", material: "", room: "" });
  const [draft, setDraft] = useState({ color: "", material: "", room: "" });

  useEffect(() => {
    let keep = true;
    (async () => {
      try {
        setLoading(true); setError("");
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

  const optionSets = useMemo(() => {
    const colors = new Set();
    const materials = new Set();
    const rooms = new Set();
    for (const it of list) {
      if (it?.color) String(it.color).split(/[,/]/).map(s => s.trim()).forEach(v => v && colors.add(v));
      if (it?.material) String(it.material).split(/[,/]/).map(s => s.trim()).forEach(v => v && materials.add(v));
      const rt = Array.isArray(it?.roomType) ? it.roomType : (it?.roomType ? [it.roomType] : []);
      rt.forEach(v => v && rooms.add(v));
    }
    return {
      colors: Array.from(colors).sort(),
      materials: Array.from(materials).sort(),
      rooms: Array.from(rooms).sort(),
    };
  }, [list]);

  const filtered = useMemo(() => {
    return list.filter(it => {
      const okColor = !filters.color || String(it.color || "").toLowerCase().includes(filters.color.toLowerCase());
      const okMat = !filters.material || String(it.material || "").toLowerCase().includes(filters.material.toLowerCase());
      const rt = Array.isArray(it.roomType) ? it.roomType.join(",") : (it.roomType || "");
      const okRoom = !filters.room || rt.toLowerCase().includes(filters.room.toLowerCase());
      return okColor && okMat && okRoom;
    });
  }, [list, filters]);

  const openDrawer = () => { setDraft(filters); setOpen(true); };
  const applyDraft = () => { setFilters(draft); setOpen(false); };
  const clearDraft = () => { setDraft({ color: "", material: "", room: "" }); };

  return (
    <div style={S.page}>
      <div style={{ ...S.hero, display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
        <input
          style={{ ...S.input, maxWidth: 480 }}
          placeholder="Search: wool carpet / tiles / rug / sku"
          value={q}
          onChange={e => setQ(e.target.value)}
        />
        <button style={S.ghostBtn} onClick={openDrawer}>Filters ▾</button>
      </div>

      {error && <div style={S.error}>{error}</div>}
      {loading && <div>Loading...</div>}

      {(filters.color || filters.material || filters.room) && (
        <div style={{ margin: "6px 0 10px", display: "flex", gap: 8, flexWrap: "wrap" }}>
          {filters.color && <Chip onClear={() => setFilters(p => ({ ...p, color: "" }))}>Color: {filters.color}</Chip>}
          {filters.material && <Chip onClear={() => setFilters(p => ({ ...p, material: "" }))}>Material: {filters.material}</Chip>}
          {filters.room && <Chip onClear={() => setFilters(p => ({ ...p, room: "" }))}>Room: {filters.room}</Chip>}
          <button style={S.linkBtn} onClick={() => setFilters({ color: "", material: "", room: "" })}>Clear all</button>
        </div>
      )}

      <div style={S.grid}>
        {filtered.map(p => <ProductCard key={p.sku} p={p} />)}
      </div>
      {!loading && filtered.length === 0 && <div style={{ marginTop: 16 }}>No results.</div>}

      {open && (
        <div style={S.panelMask} onClick={() => setOpen(false)}>
          <div style={S.panel} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontWeight: 800, fontSize: 18 }}>Filters</div>
              <button style={S.linkBtn} onClick={() => setOpen(false)}>Close ✕</button>
            </div>

            <div style={{ marginTop: 8 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Color</div>
              <select
                style={{ ...S.input, padding: "8px 10px" }}
                value={draft.color}
                onChange={e => setDraft(d => ({ ...d, color: e.target.value }))}
              >
                <option value="">All</option>
                {optionSets.colors.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Material</div>
              <select
                style={{ ...S.input, padding: "8px 10px" }}
                value={draft.material}
                onChange={e => setDraft(d => ({ ...d, material: e.target.value }))}
              >
                <option value="">All</option>
                {optionSets.materials.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Room type</div>
              <select
                style={{ ...S.input, padding: "8px 10px" }}
                value={draft.room}
                onChange={e => setDraft(d => ({ ...d, room: e.target.value }))}
              >
                <option value="">All</option>
                {optionSets.rooms.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button style={S.ghostBtn} onClick={clearDraft}>Clear</button>
              <button style={S.primaryBtn} onClick={applyDraft}>Apply</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Chip({ children, onClear }) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "6px 10px", border: "1px solid #e5e7eb", borderRadius: 999, background: "#fff"
    }}>
      <span>{children}</span>
      <button onClick={onClear} style={{ border: "none", background: "none", cursor: "pointer" }}>✕</button>
    </div>
  );
}

function DetailPage() {
  const { sku } = useParams();
  const [p, setP] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showDelivery, setShowDelivery] = useState(false);  
  const { add } = useCart();

  useEffect(() => {
    let keep = true;
    (async () => {
      try {
        setLoading(true); setError("");
        const data = await api(`/items/${encodeURIComponent(sku)}`);
        if (!keep) return; setP(data);
      } catch (e) { if (keep) setError(e.message); } finally { if (keep) setLoading(false); }
    })();
    return () => { keep = false; };
  }, [sku]);

  if (loading) return <div style={S.page}>Loading...</div>;
  if (error) return <div style={S.page}><div style={S.error}>{error}</div></div>;
  if (!p) return <div style={S.page}>Not found.</div>;

  return (
    <div style={S.page}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        <img
          src={getImageSrc(p)}
          alt={p.name}
          style={{ width: "100%", borderRadius: 16 }}
        />
        <div>
          <div style={S.h2}>{p.name}</div>
          <div style={{ margin: "8px 0" }}>{p.description}</div>
          <div style={S.muted}>Material: {p.material} · Color: {p.color}</div>
          <div style={{ marginTop: 8 }}>Room: {(Array.isArray(p.roomType) ? p.roomType.join(", ") : p.roomType) || "-"}</div>
          <div style={{ marginTop: 8 }}>Sizes: {(p.sizeOptions || []).join(", ")}</div>
          <div style={{ marginTop: 12, fontSize: 18, fontWeight: 700 }}>
            ${Number(p.unitPrice ?? p.price ?? 0).toFixed(2)} <span style={S.muted}>/ {p.unit || "usd/sqm"}</span>
          </div>
          <div style={{ display:"flex", gap:8, marginTop:12 }}>
            <button style={S.primaryBtn} onClick={()=>add(p,1)}>Add to cart</button>
            <button style={S.ghostBtn} onClick={()=>setShowDelivery(true)}>Delivery details</button> {}
          </div>
        </div>
      </div>
      {showDelivery && (
        <div style={S.panelMask} onClick={()=>setShowDelivery(false)}>
          <div style={S.panel} onClick={e=>e.stopPropagation()}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ fontWeight:800, fontSize:18 }}>Delivery details</div>
              <button style={S.linkBtn} onClick={()=>setShowDelivery(false)}>Close ✕</button>
            </div>

            <div style={{ marginTop:12, color:"#374151", lineHeight:1.7 }}>
              <p><b>Shipping policy</b></p>
              <p>Sea shipping ≈ <b>15 business days</b>; Custom ≈ <b>30 business days</b>.</p>
              <p>We ship worldwide. Packaging is reinforced to protect pile and edges. Tracking will be provided after dispatch.</p>
              <p>For bespoke sizes/colors, please contact our sales for production lead time and bulk shipping options.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CartPage() {
  const { items, remove, clear, total } = useCart();
  const nav = useNavigate();
  return (
    <div style={S.page}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={S.h2}>Cart</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={S.ghostBtn} onClick={clear}>Clear</button>
          <button style={S.primaryBtn} onClick={() => nav("/checkout")}>Checkout</button>
        </div>
      </div>

      {items.length === 0 ? (
        <div>Cart is empty. <button style={S.linkBtn} onClick={() => nav("/")}>Go shop →</button></div>
      ) : (
        <>
          <table style={S.table}>
            <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th></th></tr></thead>
            <tbody>
              {items.map(it => (
                <tr key={it.sku}>
                  <td
                    style={{ padding: 12, display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
                    onClick={() => nav(`/item/${encodeURIComponent(it.sku)}`)}
                  >
                    <img src={getImageSrc({ imageUrl: it.imageUrl })} alt=""
                      style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, border: `1px solid ${S._border}` }} />
                    <div style={{ fontWeight: 700, textDecoration: "underline" }}>{it.name}</div>
                  </td>
                  <td>{it.quantity}</td>
                  <td>${(Number(it.price) * (it.quantity || 0)).toFixed(2)}</td>
                  <td><button style={S.linkBtn} onClick={() => remove(it.sku)}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
            <div>Total: <b>${total.toFixed(2)}</b></div>
          </div>
        </>
      )}
    </div>
  );
}

function CheckoutPage() {
  const { items, total, clear } = useCart();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const nav = useNavigate();

  const placeOrder = async () => {
    try {
      setLoading(true); setErr("");
      const email = localStorage.getItem("yan_email");
      if (!email) throw new Error("Please sign in first (top-right).");
      const order = await api("/orders", { method: "POST", body: { customerEmail: email, items }, auth: true });
      await api("/payments/submit", {
        method: "POST",
        auth: true,
        body: { orderId: order.orderId, paymentMethod: "CARD", amount: Number(total.toFixed(2)) }
      });
      clear();
      alert("Order placed & paid successfully! OrderId: " + order.orderId);
      nav(`/orders/${order.orderId}`);
    } catch (e) { setErr(e.message); } finally { setLoading(false); }
  };

  return (
    <div style={S.page}>
      <div style={S.h2}>Checkout</div>
      <div>Signed in as: <b>{localStorage.getItem("yan_email") || "(not signed)"}</b></div>
      <div>Items: <b>{items.length}</b> · Total: <b>${total.toFixed(2)}</b></div>
      {err && <div style={S.error}>{err}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button style={S.primaryBtn} disabled={loading || items.length === 0} onClick={placeOrder}>
          {loading ? "Processing..." : "Pay with Card"}
        </button>
        <button style={S.ghostBtn} onClick={() => nav("/cart")}>Back to cart</button>
      </div>
    </div>
  );
}

function OrderDetailPage() {
  const { orderId } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let keep = true;
    (async () => {
      try {
        setLoading(true); setError("");
        const data = await api(`/orders/${encodeURIComponent(orderId)}`);
        if (!keep) return; setOrder(data);
      } catch (e) { if (keep) setError(e.message); } finally { if (keep) setLoading(false); }
    })();
    return () => { keep = false; };
  }, [orderId]);

  if (loading) return <div style={S.page}>Loading...</div>;
  if (error) return <div style={S.page}><div style={S.error}>{error}</div></div>;
  if (!order) return <div style={S.page}>Not found.</div>;

  return (
    <div style={S.page}>
      <div style={S.h2}>Order {order.orderId}</div>
      <div>Status: <b>{order.status}</b></div>
      <div>Customer: {order.customerEmail}</div>
      <div style={{ marginTop: 12 }}>
        {(order.items || []).map(it => (
          <div key={it.sku} style={{ padding: "8px 0", borderBottom: "1px solid #eee" }}>
            {it.name} × {it.quantity} — ${Number(it.price || 0).toFixed(2)}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12 }}>Total: <b>${Number(order.totalAmount || 0).toFixed(2)}</b></div>
    </div>
  );
}

/* ================= Shell / Header ================= */
function HeaderBar() {
  const nav = useNavigate();
  const cart = useCart();
  const [authOpen, setAuthOpen] = useState(false);
  const [mode, setMode] = useState("login");
  const email = localStorage.getItem("yan_email");

  const onAuthed = (token, em) => {
    localStorage.setItem("yan_token", token);
    localStorage.setItem("yan_email", em);
  };

  const location = useLocation();

  return (
    <>
      <header style={S.header}>
        <Link to="/" style={S.brand}>
          YanCarpet
        </Link>
        <nav style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <Link to="/" className="nav" style={S.navLink}>Home</Link>
          <Link to="/products" className="nav" style={S.navLink}>Products</Link>
          <Link to="/about" className="nav" style={S.navLink}>About us</Link>
          <Link to="/contact" className="nav" style={S.navLink}>Contact us</Link>
        </nav>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ color: "#A65B2F", fontWeight: 800 }}>Everything Ships FREE</div>

          {!email ? (
            <>
              <button
                style={S.ghostBtn}
                onClick={() => { setMode("login"); setAuthOpen(true); }}
              >Sign in</button>
              <button
                style={S.primaryBtn}
                onClick={() => { setMode("register"); setAuthOpen(true); }}
              >Register</button>
            </>
          ) : (
            <>
              <span style={S.muted}>Hi, {email}</span>
              <button
                style={S.ghostBtn}
                onClick={() => { localStorage.removeItem("yan_token"); localStorage.removeItem("yan_email"); location.reload(); }}
              >Sign out</button>
            </>
          )}

          <button
            onClick={() => nav("/cart")}
            style={{ ...S.primaryBtn, display: "inline-flex", alignItems: "center", gap: 8 }}
            title="Cart"
          >
            <span>Cart</span>
            <span style={{
              minWidth: 22, height: 22, borderRadius: 999, background: "white",
              color: "#A65B2F", display: "grid", placeItems: "center",
              fontWeight: 800, padding: "0 6px"
            }}>
              {cart.count}
            </span>
          </button>
        </div>
      </header>

      {/* Auth Modal 对所有路由有效 */}
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} mode={mode} onAuthed={onAuthed} />
    </>
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("[UI ErrorBoundary]", error, info); }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: "monospace" }}>
          <h3>UI crashed</h3>
          <pre style={{ whiteSpace: "pre-wrap" }}>{String(this.state.error?.message || this.state.error)}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

function AboutPage() {
  return (
    <div style={S.page}>
      <div style={S.h2}>About Us</div>
      <p style={{ color: "#374151", lineHeight: 1.6 }}>
        Jiangsu Shengyan Carpet Co., Ltd. located in 336 Yanling Road, Jiangyin, Jiangsu province, China.
        We entering carpet industry in 1995, over 20 years, we have cooperated over ten thousands organizations.
      </p>
      <p style={{ color: "#374151", lineHeight: 1.6 }}>
        Our vision is concern your concerns. During these 20 years, we never stopped learning and innovating.
        We think the only thing that never changes is changing. Only by innovation that we can catch up with the global development.
      </p>
      <p style={{ color: "#374151", lineHeight: 1.6 }}>
        Our factory located in Liyang, our products include Axminster carpet, Wilton carpet, exhibition carpet,
        carpet tiles, tufted carpet and PVC. Our materials cover wool, PP, nylon, sisal, acrylic, polyester, and corn fiber.
        We have been able to meet designers’, buyers’, and end-users’ requirements in terms of design, quality, durability, quantity, and price.
      </p>
    </div>
  );
}

function ContactPage() {
  return (
    <div style={S.page}>
      <div style={S.h2}>Contact Us</div>
      <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.8 }}>
{`Jiangsu Shengyan Carpet Co.,Ltd.
Ins: lisasycarpet
FB: lisasycarpet@outlook.com
Web: http://www.yancarpet.com
Tel: +86 15961661413 / +86 18651010003
Whatsapp / Wechat: +86 15961661413 / +86 18651010003
Email: cindywang@yancarpet.com / sales1@yancarpet.com
Address: No336, Yanling Road, Jiangyin City, Jiangsu Province, China.`}
      </div>
    </div>
  );
}

function Shell() {
  return (
    <>
      <HeaderBar />
      <main style={{ padding: "24px 16px", maxWidth: 1200, margin: "0 auto" }}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/item/:sku" element={<DetailPage />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/orders/:orderId" element={<OrderDetailPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/contact" element={<ContactPage />} />
        </Routes>
      </main>
      <footer style={S.footer}>
        © {new Date().getFullYear()} YanCarpet
      </footer>
    </>
  );
}

/* ================= Styles ================= */
const S = {
  _border: "#e5e7eb",
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "12px 16px", borderBottom: "1px solid #eee", position: "sticky", top: 0,
    background: "white", zIndex: 10
  },
  brand: {
    fontWeight: 900, fontSize: 22, textDecoration: "none", color: "black",
    fontFamily: "'Georgia', 'Times New Roman', serif", letterSpacing: ".5px"
  },
  navLink: {
    color:"#111"
  },
  page: { maxWidth: 1200, margin: "0 auto", padding: "16px" },
  hero: { padding: "12px 16px", background: "#f6efe9", borderRadius: 12, marginBottom: 12 },
  toolbar: { display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 8, marginBottom: 12 },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: 20,
    justifyItems: "center"
  },
  card: { background: "white", border: "1px solid #e0d7cb", borderRadius: 12, overflow: "hidden", width: "100%" },
  thumb: { width: "100%", height: 180, background: "#f8fafc", cursor: "pointer" },
  title: { fontWeight: 700, fontSize: 16 },
  price: { marginTop: 6, fontWeight: 700 },
  input: {
    padding: "10px 12px",
    border: "1px solid #ddd",
    borderRadius: 10,
    width: "100%",
    boxSizing: "border-box"
  },
  primaryBtn: { padding: "10px 14px", borderRadius: 10, background: "black", color: "white", border: "none", cursor: "pointer" },
  ghostBtn: { padding: "10px 14px", borderRadius: 10, background: "white", color: "#111", border: "1px solid #ddd", cursor: "pointer" },
  linkBtn: { padding: 0, border: "none", background: "none", color: "#2563eb", cursor: "pointer" },
  h2: { fontSize: 22, fontWeight: 800, marginBottom: 8 },
  h3: { fontSize: 18, fontWeight: 800, marginBottom: 8 },
  muted: { color: "#64748b" },
  error: { color: "#dc2626", background: "#fee2e2", padding: "8px 10px", borderRadius: 8, marginTop: 8 },
  footer: { padding: "16px", textAlign: "center", color: "#64748b", borderTop: "1px solid #eee", marginTop: 24 },
  modalBackdrop: { position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "grid", placeItems: "center", zIndex: 50 },
  modalCard: { background: "white", width: "100%", maxWidth: 420, padding: 16, borderRadius: 16, boxShadow: "0 10px 30px rgba(0,0,0,.15)" },
  table: { width: "100%", borderCollapse: "collapse" },
  panelMask: { position: "fixed", inset: 0, background: "rgba(0,0,0,.25)", display: "flex", justifyContent: "flex-end", zIndex: 50 },
  panel: { width: 360, height: "100%", background: "#fff", padding: 16, boxShadow: "-12px 0 30px rgba(0,0,0,.15)", overflowY: "auto" }
};

/* ================= Mount ================= */
function App() {
  return (
    <BrowserRouter>
      <GlobalStyle />   
      <ToastProvider>
        <CartProvider>
          <ErrorBoundary>
            <Shell />
          </ErrorBoundary>
        </CartProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}


const container = document.getElementById("root");
createRoot(container).render(<App />);
