/* =====================
   CONFIG — use your links
   ===================== */
const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vT9RM9PuEfM9qPbZXALjzYFdGEoBiltayHlPSQlY9yEurdsRIQK1fgTfE-Wofkd821fdqADQ6O08Z4x/pub?gid=0&single=true&output=csv";
const WHATSAPP_NUMBER = "917907555924"; // no plus sign
/* ===================== */

const DRIVE_IMAGE_URL = (fileId) => `https://drive.google.com/uc?export=view&id=${fileId}`;

const $ = (s) => document.querySelector(s);
const $all = (s) => Array.from(document.querySelectorAll(s));

const productsGrid = $("#productsGrid");
const loadingEl = $("#loading");
const categoryFilter = $("#categoryFilter");
const searchInput = $("#searchInput");
const cartCountEl = $("#cartCount");

let PRODUCTS = [];
let CART = loadCart();
let CURRENT = null; // product shown in modal

/* UI wiring */
document.addEventListener("DOMContentLoaded", () => {
  setupUI();
  fetchProducts();
});

function setupUI(){
  $("#viewCartBtn")?.addEventListener("click", openCart);
  $("#closeCart")?.addEventListener("click", closeCart);
  $("#continueShopping")?.addEventListener("click", closeCart);
  $("#checkoutBtn")?.addEventListener("click", openCheckout);
  $("#closeCheckout")?.addEventListener("click", closeCheckout);
  $("#backToCart")?.addEventListener("click", () => { closeCheckout(); openCart(); });

  $("#closeProduct")?.addEventListener("click", () => $("#productModal").classList.add("hidden"));
  $("#modalAdd")?.addEventListener("click", onModalAdd);
  $("#modalBuy")?.addEventListener("click", onModalBuy);

  categoryFilter?.addEventListener("change", renderProducts);
  searchInput?.addEventListener("input", debounce(renderProducts, 240));

  $("#cartItems")?.addEventListener("click", (e) => {
    if(e.target.matches(".qty-minus") || e.target.matches(".qty-plus") || e.target.matches(".remove-item")){
      const pid = e.target.closest("[data-pid]")?.dataset?.pid;
      const psize = e.target.closest("[data-pid]")?.dataset?.size || undefined;
      if(!pid) return;
      if(e.target.matches(".qty-minus")) changeQty(pid, -1, psize);
      if(e.target.matches(".qty-plus")) changeQty(pid, +1, psize);
      if(e.target.matches(".remove-item")) removeCartItem(pid, psize);
      renderCart();
    }
  });

  // size change in cart
  document.addEventListener("change", (e) => {
    if(e.target.matches(".cart-size")){
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

/* Fetch & parse CSV */
async function fetchProducts(){
  try {
    loadingEl.style.display = "block";
    const res = await fetch(SHEET_CSV_URL);
    if(!res.ok) throw new Error("Sheet fetch error " + res.status);
    const csv = await res.text();
    const rows = parseCSV(csv);
    PRODUCTS = rows.map(normalizeProduct);
    populateFilters();
    renderProducts();
  } catch(err){
    console.error(err);
    loadingEl.textContent = "Failed to load products. Check your sheet URL & publish settings.";
  } finally {
    loadingEl.style.display = "none";
  }
}

/* CSV parsing (handles quoted commas) */
function parseCSV(text){
  const lines = text.split(/\r?\n/).filter(Boolean);
  if(lines.length === 0) return [];
  const headers = parseLine(lines[0]);
  const out = [];
  for(let i=1;i<lines.length;i++){
    const vals = parseLine(lines[i]);
    const obj = {};
    for(let j=0;j<headers.length;j++){
      obj[headers[j].trim()] = (vals[j] !== undefined) ? vals[j].trim() : "";
    }
    // skip empty rows
    if(Object.values(obj).every(v => v === "")) continue;
    out.push(obj);
  }
  return out;
}
function parseLine(line){
  const res = [];
  let cur = "", inQ=false;
  for(let i=0;i<line.length;i++){
    const ch = line[i];
    if(ch === '"'){
      if(inQ && line[i+1] === '"'){ cur += '"'; i++; } else { inQ = !inQ; }
    } else if(ch === ',' && !inQ){
      res.push(cur); cur = "";
    } else {
      cur += ch;
    }
  }
  res.push(cur);
  return res;
}

/* Normalize product - case-insensitive headers supported */
function normalizeProduct(row){
  const g = (key) => {
    const found = Object.keys(row).find(h => h.toLowerCase() === key.toLowerCase());
    return found ? row[found] : "";
  };

  const rawImages = g("image_id") || g("imageid") || g("image") || "";
  const image_ids = rawImages.split(",").map(x => x.trim()).filter(Boolean);
  const sizeList = (g("size") || g("sizes") || "").split(",").map(s => s.trim()).filter(Boolean);

  const id = g("id") || Math.random().toString(36).slice(2,9);
  const name = g("name") || g("title") || "";
  const price = parseFloat((g("price")||"0").replace(/[^0-9.\-]/g,"")) || 0;
  const category = g("category") || "Uncategorized";
  const description = g("description") || g("desc") || "";

  return { id, name, price, category, description, image_ids, size: sizeList };
}

/* Filters and rendering */
function populateFilters(){
  const cats = [...new Set(PRODUCTS.map(p => p.category || "Uncategorized"))].sort();
  categoryFilter.innerHTML = `<option value="all">All categories</option>` + cats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
}
function renderProducts(){
  const cat = categoryFilter.value;
  const q = (searchInput.value || "").trim().toLowerCase();
  const filtered = PRODUCTS.filter(p => {
    if(cat !== "all" && p.category !== cat) return false;
    if(q){
      const hay = (p.name + " " + (p.description||"") + " " + p.category).toLowerCase();
      if(!hay.includes(q)) return false;
    }
    return true;
  });

  if(filtered.length === 0){
    productsGrid.innerHTML = `<div class="loading">No products found.</div>`;
    return;
  }

  productsGrid.innerHTML = filtered.map(p => productCard(p)).join("");
}

/* Product card HTML */
function productCard(p){
  const img = (p.image_ids && p.image_ids.length) ? DRIVE_IMAGE_URL(p.image_ids[0]) : "";
  const sizes = (p.size||[]).join(" • ");
  return `
    <article class="card" data-id="${escapeHtml(p.id)}">
      <div class="card-media" data-pid="${escapeHtml(p.id)}">
        ${img ? `<img loading="lazy" src="${img}" alt="${escapeHtml(p.name)}"/>` : `<div style="height:200px;background:#f6f7fb;border-radius:8px"></div>`}
      </div>
      <div>
        <h3>${escapeHtml(p.name)}</h3>
        <p>${escapeHtml(p.description || "")}</p>
        <div class="meta">
          <div class="price-small">₹${p.price.toFixed(2)}</div>
          <div class="muted">${escapeHtml(p.category)}</div>
        </div>
        <div class="actions">
          <div class="muted small">${escapeHtml(sizes)}</div>
          <div style="display:flex;gap:8px;align-items:center">
            <button class="btn" data-action="view" data-pid="${escapeHtml(p.id)}">View</button>
            <button class="btn" data-action="add" data-pid="${escapeHtml(p.id)}">Add</button>
          </div>
        </div>
      </div>
    </article>
  `;
}

/* Event delegation for card buttons */
document.addEventListener("click", (e) => {
  const view = e.target.closest("[data-action='view']");
  const add = e.target.closest("[data-action='add']");
  if(view){
    const pid = view.dataset.pid;
    openProduct(pid);
  } else if(add){
    const pid = add.dataset.pid;
    // if product has sizes, open modal so user can choose; otherwise add default
    const prod = PRODUCTS.find(x => x.id === pid);
    if(prod?.size?.length){
      openProduct(pid);
    } else {
      addToCartWithSize(pid, "");
      showToast("Added to cart");
    }
  }
});

/* Product modal actions */
function openProduct(pid){
  const p = PRODUCTS.find(x => x.id === pid);
  if(!p) return;
  CURRENT = p;
  $("#modalName").textContent = p.name;
  $("#modalCategory").textContent = p.category;
  $("#modalDesc").textContent = p.description || "";
  $("#modalPrice").textContent = (p.price||0).toFixed(2);

  // images
  const main = $("#modalMainImage");
  const thumbs = $("#modalThumbs");
  thumbs.innerHTML = "";
  if(p.image_ids && p.image_ids.length){
    main.src = DRIVE_IMAGE_URL(p.image_ids[0]);
    p.image_ids.forEach((id, idx) => {
      const img = document.createElement("img");
      img.src = DRIVE_IMAGE_URL(id);
      img.alt = p.name;
      img.className = idx===0 ? "active" : "";
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

  $("#productModal").classList.remove("hidden");
  $("#productModal").setAttribute("aria-hidden", "false");
}

/* Modal add/buy */
function onModalAdd(){
  if(!CURRENT) return;
  const size = $("#modalSizeSelect") ? $("#modalSizeSelect").value : "";
  addToCartWithSize(CURRENT.id, size);
  showToast("Added to cart");
  $("#productModal").classList.add("hidden");
}
function onModalBuy(){
  if(!CURRENT) return;
  const size = $("#modalSizeSelect") ? $("#modalSizeSelect").value : "";
  addToCartWithSize(CURRENT.id, size);
  openCart();
  setTimeout(() => openCheckout(), 200);
  $("#productModal").classList.add("hidden");
}

/* CART: stored as array of items with id, size, qty, price, name, image_id */
function loadCart(){ try { return JSON.parse(localStorage.getItem("store_cart") || "[]"); } catch(e) { return []; } }
function saveCart(){ localStorage.setItem("store_cart", JSON.stringify(CART)); updateCartCount(); }
function updateCartCount(){ cartCountEl.textContent = CART.reduce((s,i)=>s+i.qty, 0); }

/* Add item (group by id+size) */
function addToCartWithSize(pid, size){
  const prod = PRODUCTS.find(p => p.id === pid);
  if(!prod) return;
  // find existing item same pid & size
  const item = CART.find(i => i.id === pid && (i.size||"") === (size||""));
  if(item){
    item.qty += 1;
  } else {
    CART.push({
      id: pid,
      name: prod.name,
      price: prod.price,
      image_id: (prod.image_ids && prod.image_ids[0]) || "",
      qty: 1,
      size: size || ""
    });
  }
  saveCart();
}

/* change qty by pid+size (if multiple items share pid with different sizes, change the first matching) */
function changeQty(pid, delta, optSize){
  // find item whose id matches and optional size matches
  const idx = CART.findIndex(i => i.id === pid && (optSize === undefined || i.size === optSize));
  if(idx === -1) return;
  CART[idx].qty += delta;
  if(CART[idx].qty <= 0) CART.splice(idx, 1);
  saveCart();
}

/* remove specific item (by pid+size) */
function removeCartItem(pid, size){
  CART = CART.filter(i => !(i.id === pid && (size === undefined || i.size === size)));
  saveCart();
}

/* update cart item size (moves item to same pid+newsize if exists merge) */
function updateCartItemSize(pid, newSize){
  // find item (first match)
  const item = CART.find(i => i.id === pid);
  if(!item) return;
  // if already same size, nothing
  if(item.size === newSize) return;
  // check if another item for same pid+newSize exists
  const other = CART.find(i => i.id === pid && i.size === newSize);
  if(other){
    other.qty += item.qty;
    // remove old
    CART = CART.filter(i => i !== item);
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
      <div class="cart-item" data-pid="${escapeHtml(item.id)}" data-size="${escapeHtml(item.size||"")}">
        <img src="${item.image_id ? DRIVE_IMAGE_URL(item.image_id) : ''}" alt="${escapeHtml(item.name)}" />
        <div style="flex:1">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <strong>${escapeHtml(item.name)}</strong>
            <div>₹${(item.price||0).toFixed(2)}</div>
          </div>
          <div style="margin-top:8px;display:flex;gap:10px;flex-wrap:wrap;align-items:center">
            <label style="font-size:0.9rem">Size:
              <select class="cart-size" data-pid="${escapeHtml(item.id)}">
                ${sizes.map(s => `<option value="${escapeHtml(s)}" ${item.size===s ? "selected" : ""}>${escapeHtml(s)}</option>`).join("")}
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
  $("#cartCount").textContent = CART.reduce((s,i)=>s+i.qty, 0);
}

/* helper - sizes for a product */
function getProductSizes(pid){
  const p = PRODUCTS.find(x => x.id === pid);
  return p?.size || [];
}

/* totals */
function cartTotal(){ return CART.reduce((s,i)=> s + i.price * i.qty, 0); }

/* Cart modal open/close */
function openCart(){
  renderCart();
  $("#cartModal").classList.remove("hidden");
}
function closeCart(){ $("#cartModal").classList.add("hidden"); }

/* Checkout */
function openCheckout(){
  if(CART.length === 0){ showToast("Cart is empty"); return; }
  $("#checkoutModal").classList.remove("hidden");
}
function closeCheckout(){ $("#checkoutModal").classList.add("hidden"); }

function handleCheckout(formData){
  const name = formData.get("name");
  const phone = formData.get("phone");
  const address = formData.get("address");
  const notes = formData.get("notes") || "";

  const itemsText = CART.map(i => `${i.name} (${i.size || "No size"}) x${i.qty} — ₹${(i.price * i.qty).toFixed(2)}`).join("\n");
  const total = cartTotal().toFixed(2);
  const message = `New order from website\n\nCustomer: ${name}\nPhone: ${phone}\nAddress: ${address}\n\nItems:\n${itemsText}\n\nTotal: ₹${total}\n\nNotes: ${notes}`;

  const waUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
  window.open(waUrl, "_blank");

  // clear cart after opening WA
  CART = [];
  saveCart();
  closeCheckout();
  closeCart();
  showToast("Order opened in WhatsApp. Please send to complete the purchase.");
}

/* Utilities */
function escapeHtml(s){ if(s === null || s === undefined) return ""; return String(s).replace(/[&<>"']/g, (m)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }
function showToast(msg){
  const el = document.createElement("div");
  el.textContent = msg;
  el.style.position = "fixed";
  el.style.left = "50%";
  el.style.transform = "translateX(-50%)";
  el.style.bottom = "24px";
  el.style.padding = "10px 14px";
  el.style.background = "#111";
  el.style.color = "#fff";
  el.style.borderRadius = "8px";
  el.style.zIndex = 9999;
  document.body.appendChild(el);
  setTimeout(()=> el.style.opacity = 0, 2500);
  setTimeout(()=> el.remove(), 3200);
}
function debounce(fn, ms = 150){ let t; return (...a) => { clearTimeout(t); t = setTimeout(()=>fn(...a), ms); }; }
