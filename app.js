/* =====================
   CONFIG (do not edit unless needed)
   ===================== */
const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vT9RM9PuEfM9qPbZXALjzYFdGEoBiltayHlPSQlY9yEurdsRIQK1fgTfE-Wofkd821fdqADQ6O08Z4x/pub?gid=0&single=true&output=csv";
const WHATSAPP_NUMBER = "917907555924"; // no +
/* ===================== */

const DRIVE_IMAGE_URL = (id) => `https://drive.google.com/uc?export=view&id=${id}`;

const $ = sel => document.querySelector(sel);
const $all = sel => Array.from(document.querySelectorAll(sel));

const productsGrid = $("#productsGrid");
const loadingEl = $("#loading");
const categoryFilter = $("#categoryFilter");
const searchInput = $("#searchInput");
const cartCountEl = $("#cartCount");

let PRODUCTS = [];
let CART = loadCart();
let CURRENT_PRODUCT = null;

/* ---- startup ---- */
document.addEventListener("DOMContentLoaded", () => {
  wireUI();
  loadProducts();
});

/* ---- UI wiring ---- */
function wireUI(){
  $("#viewCartBtn")?.addEventListener("click", openCart);
  $("#closeCart")?.addEventListener("click", closeCart);
  $("#continueShopping")?.addEventListener("click", closeCart);
  $("#checkoutBtn")?.addEventListener("click", openCheckout);
  $("#closeCheckout")?.addEventListener("click", closeCheckout);
  $("#backToCart")?.addEventListener("click", () => { closeCheckout(); openCart(); });

  $("#closeProduct")?.addEventListener("click", () => { hideModal("#productModal"); });
  $("#modalAdd")?.addEventListener("click", modalAddToCart);
  $("#modalBuy")?.addEventListener("click", modalBuyNow);

  categoryFilter?.addEventListener("change", renderProducts);
  searchInput?.addEventListener("input", debounce(renderProducts, 220));

  document.addEventListener("click", (e) => {
    if(e.target.closest("[data-p-action='view']")) {
      const pid = e.target.closest("[data-p-action='view']").dataset.pid;
      openProduct(pid);
    } else if(e.target.closest("[data-p-action='add']")) {
      const pid = e.target.closest("[data-p-action='add']").dataset.pid;
      const prod = PRODUCTS.find(p => p.id === pid);
      if(prod && prod.size && prod.size.length) openProduct(pid);
      else { addToCartWithSize(pid, ""); showToast("Added to cart"); }
    } else if(e.target.matches(".qty-minus") || e.target.matches(".qty-plus") || e.target.matches(".remove-item")) {
      const itemEl = e.target.closest("[data-cart-id]");
      if(!itemEl) return;
      const pid = itemEl.dataset.cartId;
      const psize = itemEl.dataset.cartSize || "";
      if(e.target.matches(".qty-minus")) changeQty(pid, -1, psize);
      if(e.target.matches(".qty-plus")) changeQty(pid, +1, psize);
      if(e.target.matches(".remove-item")) removeCartItem(pid, psize);
      renderCart();
    }
  });

  document.addEventListener("change", (e) => {
    if(e.target.matches(".cart-size")) {
      const pid = e.target.dataset.pid;
      const size = e.target.value;
      updateCartItemSize(pid, size);
      renderCart();
    }
  });

  $("#checkoutForm")?.addEventListener("submit", (ev) => {
    ev.preventDefault();
    handleCheckout(new FormData(ev.target));
  });

  updateCartCount();
}

/* ---- products loading ---- */
async function loadProducts(){
  try {
    loadingEl.style.display = "block";
    const res = await fetch(SHEET_CSV_URL);
    if(!res.ok) throw new Error("Sheet fetch failed: " + res.status);
    const text = await res.text();
    const rows = parseCSV(text);
    PRODUCTS = rows.map(normalizeRow);
    populateCategories();
    renderProducts();
  } catch(err) {
    console.error(err);
    loadingEl.textContent = "Unable to load products. Check sheet URL and published-to-web setting.";
  } finally {
    loadingEl.style.display = "none";
  }
}

/* ---- CSV parser (simple, robust) ---- */
function parseCSV(csv) {
  const lines = csv.split(/\r?\n/).filter(l => l.trim() !== "");
  if(lines.length === 0) return [];
  const headers = splitCsvLine(lines[0]).map(h => h.trim());
  const out = [];
  for(let i=1;i<lines.length;i++){
    const vals = splitCsvLine(lines[i]);
    const obj = {};
    for(let j=0;j<headers.length;j++){
      obj[headers[j]] = vals[j] !== undefined ? vals[j].trim() : "";
    }
    // skip blank row
    if(Object.values(obj).every(v => v === "")) continue;
    out.push(obj);
  }
  return out;
}
function splitCsvLine(line){
  const out = []; let cur = "", inQuotes = false;
  for(let i=0;i<line.length;i++){
    const ch = line[i];
    if(ch === '"') {
      if(inQuotes && line[i+1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if(ch === ',' && !inQuotes) {
      out.push(cur); cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/* ---- normalize row to product object ---- */
function normalizeRow(row) {
  const find = (k) => {
    const key = Object.keys(row).find(h => h.toLowerCase() === k.toLowerCase());
    return key ? row[key] : "";
  };
  const rawImgs = find("image_id") || find("image") || "";
  const image_ids = rawImgs.split(",").map(s => s.trim()).filter(Boolean);
  const sizeList = (find("size") || find("sizes") || "").split(",").map(s => s.trim()).filter(Boolean);
  const id = find("id") || Math.random().toString(36).slice(2,9);
  const name = find("name") || find("title") || "";
  const price = parseFloat((find("price") || "0").replace(/[^0-9.\-]/g, "")) || 0;
  const category = find("category") || "Uncategorized";
  const description = find("description") || find("desc") || "";
  return { id, name, price, category, description, image_ids, size: sizeList };
}

/* ---- render / filters ---- */
function populateCategories(){
  const cats = [...new Set(PRODUCTS.map(p => p.category || "Uncategorized"))].sort();
  if(!categoryFilter) return;
  categoryFilter.innerHTML = `<option value="all">All categories</option>` + cats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
}
function renderProducts(){
  if(!productsGrid) return;
  const cat = categoryFilter ? categoryFilter.value : "all";
  const q = searchInput ? (searchInput.value || "").trim().toLowerCase() : "";
  const filtered = PRODUCTS.filter(p => {
    if(cat !== "all" && p.category !== cat) return false;
    if(q){
      const hay = (p.name + " " + p.description + " " + p.category).toLowerCase();
      if(!hay.includes(q)) return false;
    }
    return true;
  });

  if(filtered.length === 0){
    productsGrid.innerHTML = `<div class="loading">No products found.</div>`;
    return;
  }

  productsGrid.innerHTML = filtered.map(p => productCardHTML(p)).join("");
}

/* product card */
function productCardHTML(p){
  const img = p.image_ids && p.image_ids.length ? DRIVE_IMAGE_URL(p.image_ids[0]) : "";
  const sizes = (p.size || []).join(" • ");
  return `
    <article class="card" data-id="${escapeHtml(p.id)}">
      <div class="card-media">
        ${img ? `<img loading="lazy" src="${img}" alt="${escapeHtml(p.name)}">` : `<div style="height:200px;background:#f6f7fb;border-radius:8px"></div>`}
      </div>
      <div>
        <h3>${escapeHtml(p.name)}</h3>
        <p>${escapeHtml(p.description || "")}</p>
        <div class="meta">
          <div class="muted">₹${(p.price||0).toFixed(2)}</div>
          <div class="muted">${escapeHtml(p.category)}</div>
        </div>
        <div class="actions">
          <div class="muted small">${escapeHtml(sizes)}</div>
          <div style="display:flex;gap:8px">
            <button data-p-action="view" data-pid="${escapeHtml(p.id)}" class="btn">View</button>
            <button data-p-action="add" data-pid="${escapeHtml(p.id)}" class="btn">Add</button>
          </div>
        </div>
      </div>
    </article>
  `;
}

/* ---- product modal ---- */
function openProduct(pid){
  const p = PRODUCTS.find(x => x.id === pid);
  if(!p) return;
  CURRENT_PRODUCT = p;
  $("#modalName").textContent = p.name;
  $("#modalCategory").textContent = p.category;
  $("#modalDesc").textContent = p.description || "";
  $("#modalPrice").textContent = (p.price || 0).toFixed(2);

  // images
  const main = $("#modalMainImage");
  const thumbs = $("#modalThumbs");
  if(!main || !thumbs) return;
  thumbs.innerHTML = "";
  if(p.image_ids && p.image_ids.length){
    main.src = DRIVE_IMAGE_URL(p.image_ids[0]);
    p.image_ids.forEach((id, idx) => {
      const img = document.createElement("img");
      img.src = DRIVE_IMAGE_URL(id);
      img.alt = p.name;
      if(idx === 0) img.classList.add("active");
      img.addEventListener("click", () => {
        main.src = DRIVE_IMAGE_URL(id);
        $all("#modalThumbs img").forEach(im => im.classList.remove("active"));
        img.classList.add("active");
      });
      thumbs.appendChild(img);
    });
  } else {
    main.src = "";
    main.alt = "No image";
  }

  // sizes
  const sizeWrap = $("#modalSizeWrap");
  const sizeSelect = $("#modalSizeSelect");
  if(p.size && p.size.length){
    sizeWrap.style.display = "block";
    sizeSelect.innerHTML = p.size.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");
  } else {
    sizeWrap.style.display = "none";
    sizeSelect.innerHTML = "";
  }

  showModal("#productModal");
}

/* modal add/buy handlers */
function modalAddToCart(){
  if(!CURRENT_PRODUCT) return;
  const size = $("#modalSizeSelect") ? $("#modalSizeSelect").value : "";
  addToCartWithSize(CURRENT_PRODUCT.id, size);
  showToast("Added to cart");
  hideModal("#productModal");
}
function modalBuyNow(){
  if(!CURRENT_PRODUCT) return;
  const size = $("#modalSizeSelect") ? $("#modalSizeSelect").value : "";
  addToCartWithSize(CURRENT_PRODUCT.id, size);
  showModal("#cartModal");
  setTimeout(() => showModal("#checkoutModal"), 250);
  hideModal("#productModal");
}

/* ---- cart operations ---- */
function loadCart(){ try { return JSON.parse(localStorage.getItem("store_cart") || "[]"); } catch(e){ return []; } }
function saveCart(){ localStorage.setItem("store_cart", JSON.stringify(CART)); updateCartCount(); }
function updateCartCount(){ if(cartCountEl) cartCountEl.textContent = CART.reduce((s,i)=>s+i.qty, 0); }

function addToCartWithSize(pid, size){
  const prod = PRODUCTS.find(p => p.id === pid);
  if(!prod) return;
  // try to find exact match id+size
  const item = CART.find(i => i.id === pid && (i.size || "") === (size || ""));
  if(item) item.qty += 1;
  else CART.push({ id: pid, name: prod.name, price: prod.price, image_id: (prod.image_ids[0]||""), qty: 1, size: size || "" });
  saveCart();
}

function changeQty(pid, delta, size){
  const idx = CART.findIndex(i => i.id === pid && (i.size || "") === (size || ""));
  if(idx === -1) return;
  CART[idx].qty += delta;
  if(CART[idx].qty <= 0) CART.splice(idx, 1);
  saveCart();
}
function removeCartItem(pid, size){
  CART = CART.filter(i => !(i.id === pid && (i.size || "") === (size || "")));
  saveCart();
}
function updateCartItemSize(pid, newSize){
  // find first matching item
  const idx = CART.findIndex(i => i.id === pid);
  if(idx === -1) return;
  const item = CART[idx];
  if(item.size === newSize) return;
  // if another exists with same pid+newSize merge
  const otherIdx = CART.findIndex(i => i.id === pid && i.size === newSize);
  if(otherIdx !== -1){
    CART[otherIdx].qty += item.qty;
    CART.splice(idx,1);
  } else {
    item.size = newSize;
  }
  saveCart();
}

/* render cart */
function renderCart(){
  const wrap = $("#cartItems");
  if(!wrap) return;
  if(CART.length === 0){
    wrap.innerHTML = `<div class="loading">Your cart is empty</div>`;
    $("#cartTotal").textContent = "0.00";
    return;
  }
  wrap.innerHTML = CART.map(item => {
    const sizes = getProductSizes(item.id);
    return `
      <div class="cart-item" data-cart-id="${escapeHtml(item.id)}" data-cart-size="${escapeHtml(item.size||"")}">
        <img src="${item.image_id ? DRIVE_IMAGE_URL(item.image_id) : ''}" alt="${escapeHtml(item.name)}"/>
        <div style="flex:1">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <strong>${escapeHtml(item.name)}</strong>
            <div>₹${(item.price||0).toFixed(2)}</div>
          </div>
          <div style="margin-top:8px;display:flex;gap:10px;flex-wrap:wrap;align-items:center">
            <label>Size:
              <select class="cart-size" data-pid="${escapeHtml(item.id)}">
                ${sizes.map(s => `<option value="${escapeHtml(s)}" ${item.size===s ? "selected":""}>${escapeHtml(s)}</option>`).join("")}
              </select>
            </label>
            <div style="display:flex;align-items:center;gap:8px">
              <button class="btn qty-minus">-</button>
              <div>${item.qty}</div>
              <button class="btn qty-plus">+</button>
              <button class="btn remove-item" style="margin-left:12px">Remove</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join("");
  $("#cartTotal").textContent = cartTotal().toFixed(2);
  updateCartCount();
}

function getProductSizes(pid){
  const p = PRODUCTS.find(x => x.id === pid);
  return p?.size || [];
}
function cartTotal(){ return CART.reduce((s,i)=> s + (i.price * i.qty), 0); }

/* ---- checkout ---- */
function openCheckout(){ if(CART.length === 0) return showToast("Cart is empty"); showModal("#checkoutModal"); }
function handleCheckout(formData){
  const name = formData.get("name");
  const phone = formData.get("phone");
  const address = formData.get("address");
  const notes = formData.get("notes") || "";

  const itemsText = CART.map(i => `${i.name} (${i.size || "No size"}) x${i.qty} — ₹${(i.price * i.qty).toFixed(2)}`).join("\n");
  const total = cartTotal().toFixed(2);
  const message = `New order from website\n\nCustomer: ${name}\nPhone: ${phone}\nAddress: ${address}\n\nItems:\n${itemsText}\n\nTotal: ₹${total}\n\nNotes: ${notes}`;

  const wa = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
  window.open(wa, "_blank");

  CART = [];
  saveCart();
  hideModal("#checkoutModal");
  hideModal("#cartModal");
  showToast("Opened WhatsApp with order. Please send to complete.");
}

/* ---- helpers: show/hide modal ---- */
function showModal(sel){
  const el = $(sel);
  if(!el) return;
  el.classList.remove("hidden");
  el.setAttribute("aria-hidden", "false");
}
function hideModal(sel){
  const el = $(sel);
  if(!el) return;
  el.classList.add("hidden");
  el.setAttribute("aria-hidden", "true");
}

/* ---- utilities ---- */
function escapeHtml(s){ if(s === null || s === undefined) return ""; return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function showToast(msg){
  const el = document.createElement("div");
  el.textContent = msg;
  el.style.position = "fixed";
  el.style.left = "50%";
  el.style.transform = "translateX(-50%)";
  el.style.bottom = "22px";
  el.style.padding = "10px 14px";
  el.style.background = "#111";
  el.style.color = "#fff";
  el.style.borderRadius = "8px";
  el.style.zIndex = 9999;
  document.body.appendChild(el);
  setTimeout(()=> el.style.opacity = 0, 2500);
  setTimeout(()=> el.remove(), 3200);
}
function debounce(fn, ms = 150){ let t; return (...a)=>{ clearTimeout(t); t = setTimeout(()=>fn(...a), ms); }; }
