import React, { useEffect, useMemo, useState, useContext, createContext } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Link, useNavigate, useParams } from "react-router-dom";

/* ================= Theme & Global ================= */
const THEME = { BG: "#EAE2D6", ACCENT: "#A65B2F", HERO_HEIGHT: 440 };

const GlobalStyle = () => (
  <style>{`
    * { box-sizing: border-box; }
    body { margin: 0; background: ${THEME.BG}; font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; }
    a.nav { text-decoration: none; }
    a.nav:hover { text-decoration: underline; }
  `}</style>
);

/* ================= Config ================= */
export const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE) ||
  (typeof process !== "undefined" && process.env?.VITE_API_BASE) ||
  "http://localhost:8080";

/* ================= Helpers ================= */
function getImageSrc(p) {
  const raw = p?.imageUrl || p?.image || p?.img || "";
  return raw
    ? `${API_BASE}/media/proxy?url=${encodeURIComponent(raw)}`
    : "https://via.placeholder.com/800x480?text=YanCarpet";
}

/* ================= Unified API ================= */
/**
 * 统一调用后端 API
 * @param {string} path - 以 / 开头的路径，如 /favorites
 * @param {object}  opts
 * @param {string}  opts.method - GET/POST/PUT/DELETE
 * @param {object}  opts.body   - 将被 JSON.stringify
 * @param {boolean} opts.auth   - 需要携带 Bearer token
 */
export async function api(path, { method = "GET", body, auth = false } = {}) {
  const headers = { "Content-Type": "application/json" };
  const token = localStorage.getItem("yan_token");

  if (auth) {
    if (!token) throw new Error("Not signed in (missing JWT). Please sign in first.");
    headers["Authorization"] = `Bearer ${token}`;
  }

  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const text = await res.text();
      message = text || message;
    } catch (_) {}
    throw new Error(`HTTP ${res.status}: ${message}`);
  }

  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json() : res.text();
}

// 便捷方法（可选）
api.get = (path, opts = {}) => api(path, { ...opts, method: "GET" });
api.post = (path, body, opts = {}) => api(path, { ...opts, method: "POST", body });
api.put = (path, body, opts = {}) => api(path, { ...opts, method: "PUT", body });
api.del = (path, opts = {}) => api(path, { ...opts, method: "DELETE" });

function useDebounced(value, delay = 300) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), delay); return () => clearTimeout(t); }, [value, delay]);
  return v;
}

/* ================= Toast ================= */
const ToastCtx = createContext(null);
function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const add = (msg) => {
    const id = Math.random().toString(36).slice(2);
    setItems((prev) => [...prev, { id, msg }]);
    setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== id)), 2000);
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

/* ================= Favorites ================= */
const FavoritesContext = createContext(null);

export function FavoritesProvider({ children }) {
  const [list, setList] = useState([]); // [{ sku, createdAtTs }, ...]
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const token = typeof window !== "undefined" ? localStorage.getItem("yan_token") : null;

  useEffect(() => {
    if (!token) { setList([]); return; }
    refresh().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function refresh() {
    try {
      setLoading(true);
      setError("");
      const data = await api("/favorites", { auth: true });
      setList(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message || String(e));
      if (/HTTP 401/.test(String(e))) setList([]);
      console.warn("[favorites] refresh failed:", e);
    } finally {
      setLoading(false);
    }
  }

  function has(sku) {
    return list.some((f) => f.sku === sku);
  }

  async function add(sku) {
    const token = localStorage.getItem("yan_token");
    if (!token) throw new Error("Please sign in to favorite items.");
    await api.post(`/favorites/${encodeURIComponent(sku)}`, null, { auth: true });
    setList((prev) => (has(sku) ? prev : [{ sku, createdAtTs: Date.now() }, ...prev]));
    return true;
  }

  async function remove(sku) {
    const token = localStorage.getItem("yan_token");
    if (!token) throw new Error("Please sign in to unfavorite items.");
    await api.del(`/favorites/${encodeURIComponent(sku)}`, { auth: true });
    setList((prev) => prev.filter((x) => x.sku !== sku));
    return false;
  }

  async function toggle(sku) {
    const token = localStorage.getItem("yan_token");
    if (!token) throw new Error("Please sign in to favorite items.");
    // 如果后端有 /toggle 返回 boolean，就用它；没有就手动切换：
    try {
      const now = await api.post(`/favorites/${encodeURIComponent(sku)}/toggle`, null, { auth: true });
      if (now === true) {
        setList((prev) => (has(sku) ? prev : [{ sku, createdAtTs: Date.now() }, ...prev]));
        return true;
      } else if (now === false) {
        setList((prev) => prev.filter((x) => x.sku !== sku));
        return false;
      }
      // 回退：手动切换
      if (has(sku)) return remove(sku);
      return add(sku);
    } catch {
      if (has(sku)) return remove(sku);
      return add(sku);
    }
  }

  const value = useMemo(
    () => ({ list, loading, error, refresh, has, add, remove, toggle }),
    [list, loading, error]
  );

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFav() {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error("useFav must be used within <FavoritesProvider>");
  return ctx;
}

/* ================= Cart (local) ================= */
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
        imageUrl: p.imageUrl,
        roomType: p.roomType,
        keywords: p.keywords
      }];
    });
    toast?.add("Added to cart");
  };

  const updateQty = (sku, qty) => {
    qty = Math.max(1, Number(qty) || 1);
    setItems(prev => prev.map(it => it.sku === sku ? { ...it, quantity: qty } : it));
  };

  const inc = (sku) => setItems(prev => prev.map(it => it.sku === sku ? { ...it, quantity: (it.quantity || 0) + 1 } : it));
  const dec = (sku) => setItems(prev => prev.map(it => it.sku === sku ? { ...it, quantity: Math.max(1, (it.quantity || 0) - 1) } : it));
  const remove = (sku) => setItems(prev => prev.filter(i => i.sku !== sku));
  const clear = () => setItems([]);
  const total = items.reduce((s, i) => s + (Number(i.price) || 0) * (i.quantity || 0), 0);
  const count = items.reduce((s, i) => s + (i.quantity || 0), 0);

  return <CartCtx.Provider value={{ items, add, updateQty, inc, dec, remove, clear, total, count }}>{children}</CartCtx.Provider>;
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
          method: "POST",
          body: {
            email, userName: name, password,
            shippingAddress: {}, billingAddress: {},
            defaultPaymentMethod: { type: "CARD", maskedDetail: "VISA **** 0000" }
          }
        });
      }
      const r = await api("/auth/login", { method: "POST", body: { email, password } });
      onAuthed(r.token, email);
      onClose();
    } catch (e) { setErr(e.message); } finally { setLoading(false); }
  };

  if (!open) return null;
  return (
    <div style={S.modalBackdrop}>
      <div style={S.modalCard}>
        <h3 style={S.h3}>{mode === "login" ? "Sign in" : "Create account"}</h3>
        {mode === "register" && <input style={S.input} placeholder="Name" value={name} onChange={e => setName(e.target.value)} />}
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

/* ================= Product Card & Heart ================= */
// 有鉴权与切换逻辑的小心心（未登录给个提示）
function Heart({ sku }) {
  const { has, toggle } = useFav();
  const active = has(sku);

  async function onClick() {
    try {
      const token = localStorage.getItem("yan_token");
      if (!token) {
        alert("Please sign in (top-right) to use Favorites.");
        return;
      }
      await toggle(sku);
    } catch (e) {
      console.warn(e);
      alert(e.message || "Favorite failed.");
    }
  }

  return (
    <button
      onClick={onClick}
      title={active ? "Unfavorite" : "Favorite"}
      style={{
        position: "absolute",
        top: 10,
        right: 10,
        width: 36,
        height: 36,
        borderRadius: 999,
        border: "1px solid #eee",
        background: "white",
        display: "grid",
        placeItems: "center",
        boxShadow: "0 6px 16px rgba(0,0,0,.12)",
        cursor: "pointer",
      }}
    >
      <span style={{ fontSize: 18, color: active ? "#0ea5e9" : "#cbd5e1" }}>♥</span>
    </button>
  );
}

function ProductCard({ p }) {
  const nav = useNavigate();
  const { add } = useCart();
  const goDetail = () => nav(`/item/${encodeURIComponent(p.sku)}`);

  // 展示 roomType（替换原 color/material/keywords）
  const roomLabel = Array.isArray(p.roomType) ? p.roomType.join(" · ") : (p.roomType || "-");

  return (
    <div style={{ ...S.card, position:"relative" }}>
      <div style={S.thumb} onClick={goDetail}>
        <img
          src={getImageSrc(p)}
          alt={p.name || ""}
          style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 12 }}
          onError={(e) => { e.currentTarget.src = "https://via.placeholder.com/400x240?text=YanCarpet"; }}
        />
      </div>

      {/* 右上角收藏 */}
      <Heart sku={p.sku} />

      <div style={{ padding: 12 }}>
        <div style={S.title}>{p.name}</div>
        <div style={S.muted}>{roomLabel}</div>
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

/* ================= Recommendations ================= */
function normalizeList(v) { if (!v) return []; return Array.isArray(v) ? v : [String(v)]; }
function scoreForSeeds(item, seeds) {
  const kws = new Set(normalizeList(item.keywords).map(x => String(x).toLowerCase()));
  const rooms = new Set(normalizeList(item.roomType).map(x => String(x).toLowerCase()));
  let score = 0;
  for (const s of seeds.keywords) if (kws.has(s)) score += 2;
  for (const s of seeds.rooms) if (rooms.has(s)) score += 1;
  return score;
}
function Recommendations({ seeds, excludeSkus = [], limit = 8, title = "You may also like" }) {
  const [list, setList] = useState([]);
  useEffect(() => {
    let alive = true;
    (async () => {
      const data = await api("/items");
      const arr = Array.isArray(data) ? data
        : Array.isArray(data?.items) ? data.items
        : Array.isArray(data?.content) ? data.content : [];
      if (!alive) return;
      const ex = new Set(excludeSkus);
      const ranked = arr
        .filter(it => it?.sku && !ex.has(it.sku))
        .map(it => ({ it, score: scoreForSeeds(it, seeds) }))
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(x => x.it);
      setList(ranked);
    })().catch(() => {});
    return () => { alive = false; };
  }, [JSON.stringify(seeds), JSON.stringify(excludeSkus), limit]);

  if (list.length === 0) return null;
  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ ...S.h3, marginBottom: 8 }}>{title}</div>
      <div
        style={{
          ...S.grid,
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 360px))",
          justifyContent: "center"
        }}
      >
        {list.map(p => <ProductCard key={p.sku} p={p} />)}
      </div>
    </div>
  );
}

/* ================= Pages ================= */
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
      <div style={{ position: "relative", height: THEME.HERO_HEIGHT, background: "#F6EFE9", borderRadius: 12, display: "grid", placeItems: "center", border: "1px solid #e5e7eb" }}>
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
        const data = await api(`/items`);
        if (!keep) return;
        const arr = Array.isArray(data) ? data
          : Array.isArray(data?.items) ? data.items
          : Array.isArray(data?.content) ? data.content : [];
        const withImg = arr.filter(x => x?.imageUrl).slice(0, 6);
        setSlides(withImg);
      } catch (e) { if (keep) setErr(e.message || String(e)); }
    })();
    return () => { keep = false; };
  }, []);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, alignItems: "start", padding: "16px 0" }}>
      <div><Carousel slides={slides} /></div>
      <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:12, padding:16, minHeight: THEME.HERO_HEIGHT }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: "#A65B2F", marginBottom: 8 }}>ABOUT US</h2>
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

function ProductsPage() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const debQ = useDebounced(q, 300);
  const [open, setOpen] = useState(false);

  // 新增：过滤与排序状态
  const [filters, setFilters] = useState({ color: "", material: "", room: "", priceMin: 0, priceMax: 999999 });
  const [draft, setDraft] = useState({ color: "", material: "", room: "", priceMin: 0, priceMax: 999999 });
  const [sortBy, setSortBy] = useState("none"); // none | priceAsc | priceDesc

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
          : Array.isArray(data?.content) ? data.content : [];
        setList(arr);
      } catch (e) { if (keep) setError(e.message || String(e)); }
      finally { if (keep) setLoading(false); }
    })();
    return () => { keep = false; };
  }, [debQ]);

  // 计算价格区间（min/max）
  const priceStats = useMemo(() => {
    const prices = list.map(x => Number(x.unitPrice ?? x.price ?? 0)).filter(n => !Number.isNaN(n));
    const min = prices.length ? Math.min(...prices) : 0;
    const max = prices.length ? Math.max(...prices) : 0;
    return { min, max };
  }, [list]);

  // 初始化价格滑块范围
  useEffect(() => {
    if (priceStats.max >= priceStats.min) {
      setFilters(f => ({ ...f, priceMin: priceStats.min, priceMax: priceStats.max }));
      setDraft(d => ({ ...d, priceMin: priceStats.min, priceMax: priceStats.max }));
    }
  }, [priceStats.min, priceStats.max]);

  const optionSets = useMemo(() => {
    const colors = new Set(), materials = new Set(), rooms = new Set();
    for (const it of list) {
      if (it?.color) String(it.color).split(/[,/]/).map(s => s.trim()).forEach(v => v && colors.add(v));
      if (it?.material) String(it.material).split(/[,/]/).map(s => s.trim()).forEach(v => v && materials.add(v));
      const rt = Array.isArray(it?.roomType) ? it.roomType : (it?.roomType ? [it.roomType] : []);
      rt.forEach(v => v && rooms.add(v));
    }
    return { colors: [...colors].sort(), materials: [...materials].sort(), rooms: [...rooms].sort() };
  }, [list]);

  // 先过滤再排序
  const filteredSorted = useMemo(() => {
    let arr = list.filter(it => {
      const okColor = !filters.color || String(it.color || "").toLowerCase().includes(filters.color.toLowerCase());
      const okMat = !filters.material || String(it.material || "").toLowerCase().includes(filters.material.toLowerCase());
      const rt = Array.isArray(it.roomType) ? it.roomType.join(",") : (it.roomType || "");
      const okRoom = !filters.room || rt.toLowerCase().includes(filters.room.toLowerCase());
      const price = Number(it.unitPrice ?? it.price ?? 0);
      const okPrice = price >= filters.priceMin && price <= filters.priceMax;
      return okColor && okMat && okRoom && okPrice;
    });

    if (sortBy === "priceAsc") arr = arr.slice().sort((a,b)=> (Number(a.unitPrice ?? a.price ?? 0) - Number(b.unitPrice ?? b.price ?? 0)));
    if (sortBy === "priceDesc") arr = arr.slice().sort((a,b)=> (Number(b.unitPrice ?? b.price ?? 0) - Number(a.unitPrice ?? a.price ?? 0)));
    return arr;
  }, [list, filters, sortBy]);

  // 双滑块防交叉
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

  return (
    <div style={S.page}>
      <div style={{ ...S.hero, display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
        <input style={{ ...S.input, maxWidth: 480 }} placeholder="Search: wool carpet / tiles / rug / sku" value={q} onChange={e => setQ(e.target.value)} />

        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          {/* Sort by price */}
          <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{ ...S.input, padding:"8px 10px", width: 180 }}>
            <option value="none">Sort: Default</option>
            <option value="priceAsc">Price ↑</option>
            <option value="priceDesc">Price ↓</option>
          </select>

          <button style={S.ghostBtn} onClick={() => { setDraft(filters); setOpen(true); }}>Filters ▾</button>
        </div>
      </div>
      {error && <div style={S.error}>{error}</div>}
      {loading && <div>Loading...</div>}

      {(filters.color || filters.material || filters.room ||
        filters.priceMin !== priceStats.min || filters.priceMax !== priceStats.max) && (
        <div style={{ margin: "6px 0 10px", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {filters.color && <Chip onClear={() => setFilters(p => ({ ...p, color: "" }))}>Color: {filters.color}</Chip>}
          {filters.material && <Chip onClear={() => setFilters(p => ({ ...p, material: "" }))}>Material: {filters.material}</Chip>}
          {filters.room && <Chip onClear={() => setFilters(p => ({ ...p, room: "" }))}>Room: {filters.room}</Chip>}
          {(filters.priceMin !== priceStats.min || filters.priceMax !== priceStats.max) && (
            <Chip onClear={() => setFilters(p => ({ ...p, priceMin: priceStats.min, priceMax: priceStats.max }))}>
              Price: ${filters.priceMin} - ${filters.priceMax}
            </Chip>
          )}
          <button
            style={S.linkBtn}
            onClick={() => {
              setFilters({ color: "", material: "", room: "", priceMin: priceStats.min, priceMax: priceStats.max });
            }}
          >Clear all</button>
        </div>
      )}

      <div style={S.grid}>{filteredSorted.map(p => <ProductCard key={p.sku} p={p} />)}</div>
      {!loading && filteredSorted.length === 0 && <div style={{ marginTop: 16 }}>No results.</div>}

      {open && (
        <div style={S.panelMask} onClick={() => setOpen(false)}>
          <div style={S.panel} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontWeight: 800, fontSize: 18 }}>Filters</div>
              <button style={S.linkBtn} onClick={() => setOpen(false)}>Close ✕</button>
            </div>

            <div style={{ marginTop: 8 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Color</div>
              <select style={{ ...S.input, padding: "8px 10px" }} value={draft.color} onChange={e => setDraft(d => ({ ...d, color: e.target.value }))}>
                <option value="">All</option>
                {optionSets.colors.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Material</div>
              <select style={{ ...S.input, padding: "8px 10px" }} value={draft.material} onChange={e => setDraft(d => ({ ...d, material: e.target.value }))}>
                <option value="">All</option>
                {optionSets.materials.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Room type</div>
              <select style={{ ...S.input, padding: "8px 10px" }} value={draft.room} onChange={e => setDraft(d => ({ ...d, room: e.target.value }))}>
                <option value="">All</option>
                {optionSets.rooms.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>

            {/* 价格范围：双滑块 + 数值输入 */}
            <div style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Price range (${priceStats.min} - ${priceStats.max})</div>

              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <input
                    type="range"
                    min={priceStats.min} max={priceStats.max}
                    value={Math.min(draft.priceMin, draft.priceMax)}
                    onChange={e => {
                      const v = clamp(Number(e.target.value), priceStats.min, draft.priceMax);
                      setDraft(d => ({ ...d, priceMin: v }));
                    }}
                    style={{ flex: 1 }}
                  />
                  <input
                    type="range"
                    min={priceStats.min} max={priceStats.max}
                    value={Math.max(draft.priceMin, draft.priceMax)}
                    onChange={e => {
                      const v = clamp(Number(e.target.value), draft.priceMin, priceStats.max);
                      setDraft(d => ({ ...d, priceMax: v }));
                    }}
                    style={{ flex: 1 }}
                  />
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    style={{ ...S.input, width: 120 }}
                    type="number"
                    value={draft.priceMin}
                    onChange={e => {
                      const v = clamp(Number(e.target.value), priceStats.min, draft.priceMax);
                      setDraft(d => ({ ...d, priceMin: v }));
                    }}
                  />
                  <span>to</span>
                  <input
                    style={{ ...S.input, width: 120 }}
                    type="number"
                    value={draft.priceMax}
                    onChange={e => {
                      const v = clamp(Number(e.target.value), draft.priceMin, priceStats.max);
                      setDraft(d => ({ ...d, priceMax: v }));
                    }}
                  />
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button style={S.ghostBtn} onClick={() => setDraft({ color: "", material: "", room: "", priceMin: priceStats.min, priceMax: priceStats.max })}>Clear</button>
              <button style={S.primaryBtn} onClick={() => { setFilters(draft); setOpen(false); }}>Apply</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Chip({ children, onClear }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px", border: "1px solid #e5e7eb", borderRadius: 999, background: "#fff" }}>
      <span>{children}</span>
      <button onClick={onClear} style={{ border: "none", background: "none", cursor: "pointer" }}>✕</button>
    </div>
  );
}

// 安全的推荐渲染
const SafeRecommendations = (props) =>
  (typeof Recommendations !== "undefined" ? <Recommendations {...props} /> : null);

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
      } catch (e) { if (keep) setError(e.message || String(e)); } finally { if (keep) setLoading(false); }
    })();
    return () => { keep = false; };
  }, [sku]);

  if (loading) return <div style={S.page}>Loading...</div>;
  if (error) return <div style={S.page}><div style={S.error}>{error}</div></div>;
  if (!p) return <div style={S.page}>Not found.</div>;

  const seeds = {
    keywords: normalizeList(p.keywords).map(x => String(x).toLowerCase()),
    rooms: normalizeList(p.roomType).map(x => String(x).toLowerCase())
  };

  const roomLabel = Array.isArray(p.roomType) ? p.roomType.join(", ") : (p.roomType || "-");

  return (
    <div style={S.page}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        {/* 左：大图 + 收藏按钮 */}
        <div style={{ position: "relative" }}>
          <img
            src={getImageSrc(p)}
            alt={p.name}
            style={{ width: "100%", borderRadius: 16 }}
            onError={(e) => { e.currentTarget.src = "https://via.placeholder.com/800x480?text=YanCarpet"; }}
          />
          <Heart sku={p.sku} />
        </div>

        {/* 右：详情 */}
        <div>
          <div style={S.h2}>{p.name}</div>
          <div style={{ margin: "8px 0" }}>{p.description}</div>
          <div style={S.muted}>Room: {roomLabel}</div>
          <div style={{ marginTop: 8 }}>Sizes: {(p.sizeOptions || []).join(", ")}</div>
          <div style={{ marginTop: 12, fontSize: 18, fontWeight: 700 }}>
            ${Number(p.unitPrice ?? p.price ?? 0).toFixed(2)} <span style={S.muted}>/ {p.unit || "usd/sqm"}</span>
          </div>
          <div style={{ display:"flex", gap:8, marginTop:12 }}>
            <button style={S.primaryBtn} onClick={()=>add(p,1)}>Add to cart</button>
            <button style={S.ghostBtn} onClick={()=>setShowDelivery(true)}>Delivery details</button>
          </div>
        </div>
      </div>

      {/* Delivery 抽屉 */}
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
              <p>We ship worldwide. Packaging is reinforced. Tracking will be provided after dispatch.</p>
              <p>For bespoke sizes/colors, contact sales for production lead time.</p>
            </div>
          </div>
        </div>
      )}

      <SafeRecommendations
        seeds={seeds}
        excludeSkus={[p.sku]}
        title="You may also like"
      />
    </div>
  );
}

function CartPage() {
  const { items, remove, clear, total, inc, dec, updateQty } = useCart();
  const nav = useNavigate();

  const seeds = useMemo(() => {
    const rooms = new Set();
    const kw = new Set();
    for (const it of items) {
      normalizeList(it.roomType).forEach(r => rooms.add(String(r).toLowerCase()));
      normalizeList(it.keywords).forEach(k => kw.add(String(k).toLowerCase()));
    }
    return { rooms: [...rooms], keywords: [...kw] };
  }, [items]);

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
            <thead>
              <tr><th style={{textAlign:"left"}}>Item</th><th>Qty</th><th>Price</th><th></th></tr>
            </thead>
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
                  <td style={{ textAlign: "center" }}>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <button style={S.ghostBtn} onClick={(e)=>{e.stopPropagation(); dec(it.sku);}}>-</button>
                      <input
                        value={it.quantity}
                        onClick={(e)=>e.stopPropagation()}
                        onChange={(e)=>updateQty(it.sku, e.target.value)}
                        onBlur={(e)=>updateQty(it.sku, e.target.value)}
                        style={{ width: 56, textAlign: "center", ...S.input, padding: 6 }}
                      />
                      <button style={S.ghostBtn} onClick={(e)=>{e.stopPropagation(); inc(it.sku);}}>+</button>
                    </div>
                  </td>
                  <td style={{ textAlign: "right" }}>${(Number(it.price) * (it.quantity || 0)).toFixed(2)}</td>
                  <td style={{ textAlign: "right" }}><button style={S.linkBtn} onClick={() => remove(it.sku)}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
            <div>Total: <b>${total.toFixed(2)}</b></div>
          </div>

          <Recommendations
            seeds={seeds}
            excludeSkus={items.map(i => i.sku)}
            title="Recommended for your cart"
          />
        </>
      )}
    </div>
  );
}

function CheckoutPage() {
  const { items, total } = useCart();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const nav = useNavigate();

  const createOrder = async () => {
    try {
      setLoading(true); setErr("");
      const email = localStorage.getItem("yan_email");
      if (!email) throw new Error("Please sign in first (top-right).");
      const order = await api("/orders", { method: "POST", body: { customerEmail: email, items }, auth: true });
      nav(`/payment/${order.orderId}`);
    } catch (e) { setErr(e.message); } finally { setLoading(false); }
  };

  return (
    <div style={S.page}>
      <div style={S.h2}>Checkout</div>
      <div>Signed in as: <b>{localStorage.getItem("yan_email") || "(not signed)"}</b></div>
      <div>Items: <b>{items.length}</b> · Total: <b>${total.toFixed(2)}</b></div>
      {err && <div style={S.error}>{err}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button style={S.primaryBtn} disabled={loading || items.length === 0} onClick={createOrder}>
          {loading ? "Processing..." : "Pay with Card"}
        </button>
        <button style={S.ghostBtn} onClick={() => nav("/cart")}>Back to cart</button>
      </div>
    </div>
  );
}

function PaymentPage() {
  const { orderId } = useParams();
  const { clear } = useCart();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const nav = useNavigate();
  const toast = useToast();

  const [cardNumber, setCardNumber] = useState("");
  const [cvv, setCvv] = useState("");
  const [expiration, setExpiration] = useState("");

  const [cardErr, setCardErr] = useState("");
  const [cvvErr, setCvvErr] = useState("");
  const [expErr, setExpErr] = useState("");

  const validateCard = () => {
    let valid = true;
    setCardErr(""); setCvvErr(""); setExpErr("");

    // Card number: must be digits only, length 13-19
    if (!cardNumber) {
      setCardErr("Card number is required");
      valid = false;
    } else if (!/^\d+$/.test(cardNumber)) {
      setCardErr("Card number must contain digits only");
      valid = false;
    } else if (cardNumber.length < 13 || cardNumber.length > 19) {
      setCardErr("Card number must be 13-19 digits");
      valid = false;
    }

    // CVV: must be digits only, length 3-4
    if (!cvv) {
      setCvvErr("CVV is required");
      valid = false;
    } else if (!/^\d+$/.test(cvv)) {
      setCvvErr("CVV must contain digits only");
      valid = false;
    } else if (cvv.length < 3 || cvv.length > 4) {
      setCvvErr("CVV must be 3-4 digits");
      valid = false;
    }

    // Expiration: must be digits only, format MM/YY (5 chars with slash) or MMYY (4 digits)
    if (!expiration) {
      setExpErr("Expiration date is required");
      valid = false;
    } else {
      const cleaned = expiration.replace(/\D/g, "");
      if (cleaned.length !== 4) {
        setExpErr("Expiration must be 4 digits (MMYY)");
        valid = false;
      } else if (!/^\d+$/.test(cleaned)) {
        setExpErr("Expiration must contain digits only");
        valid = false;
      }
    }

    return valid;
  };

  const submitPayment = async () => {
    if (!validateCard()) {
      toast.add("Please fix validation errors");
      return;
    }

    try {
      setLoading(true); setErr("");

      // Get order to get total amount
      const order = await api(`/orders/${encodeURIComponent(orderId)}`, { auth: true });

      await api("/payments/submit", {
        method: "POST",
        auth: true,
        body: {
          orderId,
          paymentMethod: "CARD",
          amount: Number(order.totalAmount || 0)
        }
      });

      clear();
      nav(`/success/${orderId}`);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={S.page}>
      <div style={S.h2}>Payment</div>
      <div style={{ marginBottom: 12 }}>Order ID: <b>{orderId}</b></div>

      <div style={{ maxWidth: 480, background: "#fff", border: `1px solid ${S._border}`, borderRadius: 12, padding: 16 }}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>Card Number</label>
          <input
            style={{ ...S.input, borderColor: cardErr ? "#dc2626" : "#ddd" }}
            placeholder="1234567890123456"
            value={cardNumber}
            onChange={e => setCardNumber(e.target.value)}
            maxLength={19}
          />
          {cardErr && <div style={{ color: "#dc2626", fontSize: 14, marginTop: 4 }}>{cardErr}</div>}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div>
            <label style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>CVV</label>
            <input
              style={{ ...S.input, borderColor: cvvErr ? "#dc2626" : "#ddd" }}
              placeholder="123"
              value={cvv}
              onChange={e => setCvv(e.target.value)}
              maxLength={4}
            />
            {cvvErr && <div style={{ color: "#dc2626", fontSize: 14, marginTop: 4 }}>{cvvErr}</div>}
          </div>

          <div>
            <label style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>Expiration (MM/YY)</label>
            <input
              style={{ ...S.input, borderColor: expErr ? "#dc2626" : "#ddd" }}
              placeholder="12/25"
              value={expiration}
              onChange={e => {
                let val = e.target.value.replace(/\D/g, "");
                if (val.length >= 2) val = val.slice(0, 2) + "/" + val.slice(2, 4);
                setExpiration(val);
              }}
              maxLength={5}
            />
            {expErr && <div style={{ color: "#dc2626", fontSize: 14, marginTop: 4 }}>{expErr}</div>}
          </div>
        </div>

        {err && <div style={S.error}>{err}</div>}

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button
            style={S.primaryBtn}
            disabled={loading}
            onClick={submitPayment}
          >
            {loading ? "Processing..." : "Submit Payment"}
          </button>
          <button style={S.ghostBtn} onClick={() => nav("/checkout")}>Cancel</button>
        </div>
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
        const data = await api(`/orders/${encodeURIComponent(orderId)}`, { auth: true });
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

/* ================= Pay Success Page ================= */
function PaySuccessPage() {
  const { orderId } = useParams();
  const nav = useNavigate();

  return (
    <div style={S.page}>
      <div style={{ fontSize: 24, fontWeight: 900, color: "#0a7f2e" }}>
        Payment successful 🎉
      </div>
      <div style={{ marginTop: 8 }}>
        Your order has been placed and paid. Order ID: <b>{orderId}</b>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button style={S.primaryBtn} onClick={() => nav("/products")}>
          Continue shopping
        </button>
      </div>
    </div>
  );
}

/* ================= Header / Shell ================= */
function HeaderBar() {
  const nav = useNavigate();
  const cart = useCart();
  const [authOpen, setAuthOpen] = useState(false);
  const [mode, setMode] = useState("login");
  const email = localStorage.getItem("yan_email");
  const [menuOpen, setMenuOpen] = useState(false);

  const onAuthed = (token, em) => {
    localStorage.setItem("yan_token", token);
    localStorage.setItem("yan_email", em);
  };

  return (
    <>
      <header style={S.header}>
        {/* 左上角汉堡 */}
        <button
          aria-label="menu"
          onClick={() => setMenuOpen(true)}
          style={{ ...S.ghostBtn, padding: "8px 12px" }}
          title="Menu"
        >
          ☰
        </button>

        <Link to="/" style={S.brand}>YanCarpet</Link>

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
              <button style={S.ghostBtn} onClick={() => { setMode("login"); setAuthOpen(true); }}>Sign in</button>
              <button style={S.primaryBtn} onClick={() => { setMode("register"); setAuthOpen(true); }}>Register</button>
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

      {/* 侧边抽屉 */}
      {menuOpen && (
        <div style={S.panelMask} onClick={() => setMenuOpen(false)}>
          <div style={S.panel} onClick={e => e.stopPropagation()}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ fontWeight:800, fontSize:18 }}>Menu</div>
              <button style={S.linkBtn} onClick={() => setMenuOpen(false)}>Close ✕</button>
            </div>

            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              <button style={S.ghostBtn} onClick={() => { setMenuOpen(false); window.location.href = "/orders"; }}>
                Order history
              </button>
              <button style={S.ghostBtn} onClick={() => { setMenuOpen(false); window.location.href = "/favorites"; }}>
                Favorites
              </button>
              {email && (
                <button style={S.ghostBtn} onClick={() => { setMenuOpen(false); window.location.href = "/account"; }}>
                  My Account
                </button>
              )}
              {!email && (
                <>
                  <button style={S.ghostBtn} onClick={() => { setMode("login"); setAuthOpen(true); }}>Sign in</button>
                  <button style={S.ghostBtn} onClick={() => { setMode("register"); setAuthOpen(true); }}>Register</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} mode={mode} onAuthed={onAuthed} />
    </>
  );
}

function FavoritesPage() {
  const { list } = useFav();
  const skus = (list || []).map(x => x.sku);
  const [items, setItems] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let keep = true;
    (async () => {
      try {
        setLoading(true); setErr("");
        const rows = [];
        for (const sku of skus) {
          try { rows.push(await api(`/items/${encodeURIComponent(sku)}`)); } catch {}
        }
        if (!keep) return;
        setItems(rows);
      } catch (e) { if (keep) setErr(e.message); } finally { if (keep) setLoading(false); }
    })();
    return () => { keep = false; };
    // 用 join 让依赖可比对
  }, [skus.join(",")]);

  return (
    <div style={S.page}>
      <div style={S.h2}>Favorites</div>
      {err && <div style={S.error}>{err}</div>}
      {loading && <div>Loading...</div>}
      {!loading && items.length === 0 && <div>No favorites yet.</div>}
      <div
        style={{
          ...S.grid,
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 360px))",
          justifyContent: "center"
        }}
      >
        {items.map(p => <ProductCard key={p.sku} p={p} />)}
      </div>
    </div>
  );
}

/* ================= Reusable Form Components ================= */
function AddressForm({ initialAddress = {}, onSubmit, onCancel, loading = false }) {
  const [form, setForm] = useState({
    line1: initialAddress.line1 || "",
    line2: initialAddress.line2 || "",
    city: initialAddress.city || "",
    stateOrProvince: initialAddress.stateOrProvince || "",
    postalCode: initialAddress.postalCode || "",
    country: initialAddress.country || ""
  });

  const handleSubmit = () => onSubmit(form);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <input style={S.input} placeholder="Address Line 1" value={form.line1} onChange={e => setForm({...form, line1: e.target.value})} />
      <input style={S.input} placeholder="Address Line 2 (optional)" value={form.line2} onChange={e => setForm({...form, line2: e.target.value})} />
      <input style={S.input} placeholder="City" value={form.city} onChange={e => setForm({...form, city: e.target.value})} />
      <input style={S.input} placeholder="State/Province" value={form.stateOrProvince} onChange={e => setForm({...form, stateOrProvince: e.target.value})} />
      <input style={S.input} placeholder="Postal Code" value={form.postalCode} onChange={e => setForm({...form, postalCode: e.target.value})} />
      <input style={S.input} placeholder="Country" value={form.country} onChange={e => setForm({...form, country: e.target.value})} />

      <div style={{ display: "flex", gap: 8 }}>
        <button style={S.primaryBtn} onClick={handleSubmit} disabled={loading}>
          {loading ? "Saving..." : "Save"}
        </button>
        <button style={S.ghostBtn} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function PaymentMethodForm({ initialPayment = {}, onSubmit, onCancel, loading = false }) {
  const [form, setForm] = useState({
    type: initialPayment.type || "CARD",
    maskedDetail: initialPayment.maskedDetail || ""
  });

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <select style={S.input} value={form.type} onChange={e => setForm({...form, type: e.target.value})}>
        <option value="CARD">Credit/Debit Card</option>
        <option value="WECHAT_QR">WeChat Pay</option>
        <option value="ALIPAY_QR">Alipay</option>
      </select>

      <input style={S.input} placeholder="Masked Detail (e.g., VISA **** 1234)" value={form.maskedDetail} onChange={e => setForm({...form, maskedDetail: e.target.value})} />

      <div style={{ display: "flex", gap: 8 }}>
        <button style={S.primaryBtn} onClick={() => onSubmit(form)} disabled={loading}>
          {loading ? "Saving..." : "Save"}
        </button>
        <button style={S.ghostBtn} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function OrdersPage() {
  const [list, setList] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [editingOrderId, setEditingOrderId] = useState(null);
  const [updateLoading, setUpdateLoading] = useState(false);
  const [updateErr, setUpdateErr] = useState("");
  const toast = useContext(ToastCtx);

  const loadOrders = async () => {
    try {
      setLoading(true); setErr("");
      const page = await api(`/orders/history?page=0&size=10`, { auth: true });
      const rows =
        Array.isArray(page) ? page :
        Array.isArray(page?.content) ? page.content :
        Array.isArray(page?.items) ? page.items :
        [];
      setList(rows);
    } catch (e) { setErr(e.message); } finally { setLoading(false); }
  };

  useEffect(() => {
    let keep = true;
    loadOrders().catch(() => {});
    return () => { keep = false; };
  }, []);

  const handleUpdateAddress = async (orderId, addressData) => {
    try {
      setUpdateLoading(true); setUpdateErr("");
      await api.put(`/orders/${orderId}/shipping-address`, addressData, { auth: true });
      toast.add("Shipping address updated successfully!");
      setEditingOrderId(null);
      await loadOrders();
    } catch (e) {
      setUpdateErr(e.message);
    } finally {
      setUpdateLoading(false);
    }
  };

  const handleCancelOrder = (orderId) => {
    // Remove the order from the list
    setList(prevList => prevList.filter(o => o.orderId !== orderId));
    // Show toast notification
    toast.add("Order is canceled");
  };

  const editingOrder = list.find(o => o.orderId === editingOrderId);

  return (
    <div style={S.page}>
      <div style={S.h2}>Order history</div>
      {err && <div style={S.error}>{err}</div>}
      {loading && <div>Loading...</div>}
      {!loading && list.length === 0 && <div>No orders yet.</div>}
      <div style={{ display: "grid", gap: 12 }}>
        {list.map(o => (
          <div key={o.orderId} style={{ background:"#fff", border:`1px solid ${S._border}`, borderRadius:12, padding:12 }}>
            <div style={{ fontWeight:800 }}>Order {o.orderId}</div>
            <div style={S.muted}>
              Status: {o.status} · Total: ${Number(o.totalAmount||0).toFixed(2)} · {o.createdAt ? new Date(o.createdAt).toLocaleString() : ""}
            </div>
            {o.shippingAddress && (
              <div style={{ marginTop: 8, fontSize: 14, color: "#666" }}>
                <div><b>Shipping Address:</b></div>
                <div>{o.shippingAddress.line1}{o.shippingAddress.line2 ? ", " + o.shippingAddress.line2 : ""}</div>
                <div>{o.shippingAddress.city}, {o.shippingAddress.stateOrProvince} {o.shippingAddress.postalCode}</div>
                <div>{o.shippingAddress.country}</div>
              </div>
            )}
            <div style={{ marginTop: 8 }}>
              {(o.items||[]).map((it, idx) => (
                <div key={idx} style={{ padding:"4px 0", borderBottom:"1px dashed #eee" }}>
                  {it.name || it.sku} × {it.quantity} — ${Number(it.price||0).toFixed(2)}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              {(o.status === "RESERVED" || o.status === "PAID") && (
                <button
                  style={S.ghostBtn}
                  onClick={() => setEditingOrderId(o.orderId)}
                >
                  Edit Shipping Address
                </button>
              )}
              <button
                style={S.ghostBtn}
                onClick={() => handleCancelOrder(o.orderId)}
              >
                Cancel Order
              </button>
            </div>
          </div>
        ))}
      </div>

      {editingOrderId && (
        <div style={S.modalBackdrop} onClick={() => setEditingOrderId(null)}>
          <div style={S.modalCard} onClick={e => e.stopPropagation()}>
            <div style={S.h3}>Update Shipping Address</div>
            <div style={{ marginBottom: 12, color: "#666" }}>Order: {editingOrderId}</div>
            {updateErr && <div style={S.error}>{updateErr}</div>}
            <AddressForm
              initialAddress={editingOrder?.shippingAddress || {}}
              onSubmit={(data) => handleUpdateAddress(editingOrderId, data)}
              onCancel={() => setEditingOrderId(null)}
              loading={updateLoading}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/* ================= My Account Page ================= */
function AccountPage() {
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editMode, setEditMode] = useState(null); // "shipping" | "billing" | "payment"
  const [updateLoading, setUpdateLoading] = useState(false);
  const [updateErr, setUpdateErr] = useState("");
  const toast = useContext(ToastCtx);

  const loadAccount = async () => {
    try {
      setLoading(true); setError("");
      const data = await api.get("/account/me", { auth: true });
      setAccount(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAccount().catch(() => {});
  }, []);

  const handleUpdateAccount = async (updates) => {
    try {
      setUpdateLoading(true); setUpdateErr("");
      await api.put("/account/me", updates, { auth: true });
      toast.add("Account updated successfully!");
      setEditMode(null);
      await loadAccount();
    } catch (e) {
      setUpdateErr(e.message);
    } finally {
      setUpdateLoading(false);
    }
  };

  if (loading) return <div style={S.page}>Loading...</div>;
  if (error) return <div style={S.page}><div style={S.error}>{error}</div></div>;
  if (!account) return <div style={S.page}>Account not found.</div>;

  return (
    <div style={S.page}>
      <div style={S.h2}>My Account</div>

      {/* User Info */}
      <div style={{ background: "#fff", border: `1px solid ${S._border}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={S.h3}>Account Information</div>
        <div style={{ marginTop: 8 }}>
          <div><b>Email:</b> {account.email}</div>
          <div><b>Name:</b> {account.userName || "Not set"}</div>
        </div>
      </div>

      {/* Shipping Address */}
      <div style={{ background: "#fff", border: `1px solid ${S._border}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={S.h3}>Shipping Address</div>
          {editMode !== "shipping" && (
            <button style={S.linkBtn} onClick={() => setEditMode("shipping")}>Edit</button>
          )}
        </div>
        {editMode === "shipping" ? (
          <div style={{ marginTop: 12 }}>
            {updateErr && <div style={S.error}>{updateErr}</div>}
            <AddressForm
              initialAddress={account.shippingAddress || {}}
              onSubmit={(data) => handleUpdateAccount({ shippingAddress: data })}
              onCancel={() => setEditMode(null)}
              loading={updateLoading}
            />
          </div>
        ) : (
          <div style={{ marginTop: 8, color: "#666" }}>
            {account.shippingAddress ? (
              <>
                <div>{account.shippingAddress.line1}{account.shippingAddress.line2 ? ", " + account.shippingAddress.line2 : ""}</div>
                <div>{account.shippingAddress.city}, {account.shippingAddress.stateOrProvince} {account.shippingAddress.postalCode}</div>
                <div>{account.shippingAddress.country}</div>
              </>
            ) : (
              <div style={{ fontStyle: "italic" }}>No shipping address set</div>
            )}
          </div>
        )}
      </div>

      {/* Billing Address */}
      <div style={{ background: "#fff", border: `1px solid ${S._border}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={S.h3}>Billing Address</div>
          {editMode !== "billing" && (
            <button style={S.linkBtn} onClick={() => setEditMode("billing")}>Edit</button>
          )}
        </div>
        {editMode === "billing" ? (
          <div style={{ marginTop: 12 }}>
            {updateErr && <div style={S.error}>{updateErr}</div>}
            <AddressForm
              initialAddress={account.billingAddress || {}}
              onSubmit={(data) => handleUpdateAccount({ billingAddress: data })}
              onCancel={() => setEditMode(null)}
              loading={updateLoading}
            />
          </div>
        ) : (
          <div style={{ marginTop: 8, color: "#666" }}>
            {account.billingAddress ? (
              <>
                <div>{account.billingAddress.line1}{account.billingAddress.line2 ? ", " + account.billingAddress.line2 : ""}</div>
                <div>{account.billingAddress.city}, {account.billingAddress.stateOrProvince} {account.billingAddress.postalCode}</div>
                <div>{account.billingAddress.country}</div>
              </>
            ) : (
              <div style={{ fontStyle: "italic" }}>No billing address set</div>
            )}
          </div>
        )}
      </div>

      {/* Payment Method */}
      <div style={{ background: "#fff", border: `1px solid ${S._border}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={S.h3}>Payment Method</div>
          {editMode !== "payment" && (
            <button style={S.linkBtn} onClick={() => setEditMode("payment")}>Edit</button>
          )}
        </div>
        {editMode === "payment" ? (
          <div style={{ marginTop: 12 }}>
            {updateErr && <div style={S.error}>{updateErr}</div>}
            <PaymentMethodForm
              initialPayment={account.defaultPaymentMethod || {}}
              onSubmit={(data) => handleUpdateAccount({ defaultPaymentMethod: data })}
              onCancel={() => setEditMode(null)}
              loading={updateLoading}
            />
          </div>
        ) : (
          <div style={{ marginTop: 8, color: "#666" }}>
            {account.defaultPaymentMethod ? (
              <>
                <div><b>Type:</b> {account.defaultPaymentMethod.type}</div>
                <div><b>Details:</b> {account.defaultPaymentMethod.maskedDetail}</div>
              </>
            ) : (
              <div style={{ fontStyle: "italic" }}>No payment method set</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ================= Shell / Routes ================= */
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
          <Route path="/payment/:orderId" element={<PaymentPage />} />
          <Route path="/orders/:orderId" element={<OrderDetailPage />} />
          <Route path="/success/:orderId" element={<PaySuccessPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/favorites" element={<FavoritesPage />} />
          <Route path="/account" element={<AccountPage />} />
        </Routes>
      </main>
      <footer style={S.footer}>© {new Date().getFullYear()} YanCarpet</footer>
    </>
  );
}

/* ================= Static Pages ================= */
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
        We meet designers’, buyers’, and end-users’ requirements on design, quality, durability and price.
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
  navLink: { color:"#111" },
  page: { maxWidth: 1200, margin: "0 auto", padding: "16px" },
  hero: { padding: "12px 16px", background: "#f6efe9", borderRadius: 12, marginBottom: 12 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20, justifyItems: "center" },
  card: { background: "white", border: "1px solid #e0d7cb", borderRadius: 12, overflow: "hidden", width: "100%" },
  thumb: { width: "100%", height: 180, background: "#f8fafc", cursor: "pointer" },
  title: { fontWeight: 700, fontSize: 16 },
  price: { marginTop: 6, fontWeight: 700 },
  input: { padding: "10px 12px", border: "1px solid #ddd", borderRadius: 10, width: "100%" },
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
        <FavoritesProvider>
          <CartProvider>
            <Shell />
          </CartProvider>
        </FavoritesProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

const container = document.getElementById("root");
createRoot(container).render(<App />);
