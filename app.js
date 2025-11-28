/* ================
   CONFIG — edit only these if needed
   ================ */

/*
Provided by you:
- WhatsApp Business number: +917907555924 (we use without '+')
- Google Sheet CSV link: (public)
- Drive image IDs: comma-separated in the sheet image_id column

No other config required.
*/

const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vT9RM9PuEfM9qPbZXALjzYFdGEoBiltayHlPSQlY9yEurdsRIQK1fgTfE-Wofkd821fdqADQ6O08Z4x/pub?gid=0&single=true&output=csv";
const WHATSAPP_NUMBER = "917907555924"; // no '+' sign

/* ================
   End config
   ================ */

const DRIVE_IMAGE_URL = (fileId) => `https://drive.google.com/uc?export=view&id=${fileId}`;

const $ = (sel) => document.querySelector(sel);
const $all = (sel) => Array.from(document.querySelectorAll(sel));

const productsGrid = $("#productsGrid");
const loadingEl = $("#loading");
const categoryFilter = $("#categoryFilter");
const sizeFilter = $("#sizeFilter");
const cartCountEl = $("#cartCount");

let PRODUCTS = [];
let CART = loadCart();
let CURRENT_MODAL_PRODUCT = null;

setupUI();
fetchProducts();

/* --------- UI setup --------- */
function setupUI(){
  $("#viewCartBtn").addEventListener("click", openCart);
  $("#closeCart").addEventListener("click", closeCart);
  $("#continueShopping").addEventListener("click", closeCart);
  $("#checkoutBtn").addEventListener("click", openCheckout);
  $("#closeCheckout").addEventListener("click", closeCheckout);
  $("#backToCart").addEventListener("click", () => { closeCheckout(); openCart(); });

  $("#closeProduct")?.addEventListener("click", () => $("#productModal").classList.add("hidden"));

  categoryFilter.addEventListener("change", renderProducts);
  sizeFilter.addEventListener("change", renderProducts);

  document.addEventListener("click", (e) => {
    if (e.target.matches(".add-to-cart")) {
      const pid = e.target.dataset.pid;
      addToCart(pid);
    } else if (e.target.matches(".view-product")) {
      const pid = e.target.dataset.pid;
      openProductModal(pid);
    }
  });

  $("#cartItems")?.addEventListener("click", (e) => {
    if(!e.target) return;
    if(e.target.matches(".qty-minus") || e.target.matches(".qty-plus") || e.target.matches(".remove-item")){
      const pid = e.target.closest("[data-pid]").dataset.pid;
      if(e.target.matches(".qty-minus")) changeQty(pid, -1);
      if(e.target.matches(".qty-plus")) changeQty(pid, +1);
      if(e.target.matches(".remove-item")) removeFromCart(pid);
      renderCart();
    }
  });

  $("#checkoutForm")?.addEventListener("submit", (ev) => {
    ev.preventDefault();
    handleCheckout(new FormData(ev.target));
  });

  $("#addFromModal")?.addEventListener("click", ()=>{
    if(!CURRENT_MODAL_PRODUCT) return;
    addToCart(CURRENT_MODAL_PRODUCT.id);
    showToast("Added to cart");
  });

  updateCartCount();
}

/* --------- Fetch & parse --------- */
async function fetchProducts(){
  try {
    loadingEl.style.display = "block";
    const res = await fetch(SHEET_CSV_URL);
    if(!res.ok) throw new Error("Failed to fetch sheet: " + res.status);
    const csvText = await res.text();
    const raw = parseCSV(csvText); // array of objects with original headers
    PRODUCTS = raw.map(normalizeProduct);
    populateFilters();
    renderProducts();
  } catch(err){
    console.error(err);
    loadingEl.textContent = "Error loading products. Check your SHEET_CSV_URL and that the sheet is published to web.";
  } finally {
    loadingEl.style.display = "none";
  }
}

/* Simple CSV parser that supports quoted fields */
function parseCSV(csv){
  const lines = csv.split(/\r?\n/).filter(l=>l.trim()!=="");
  if(lines.length===0) return [];
  const headers = parseCSVLine(lines[0]).map(h => h.trim());
  const rows = [];
  for(let i=1;i<lines.length;i++){
    const vals = parseCSVLine(lines[i]);
    // handle line shorter than headers
    const obj = {};
    for(let j=0;j<headers.length;j++){
      obj[headers[j]] = vals[j] !== undefined ? vals[j] : "";
    }
    // skip empty (all blank)
    if(Object.values(obj).every(v => (v === "" || v === null))) continue;
    rows.push(obj);
  }
  return rows;
}
function parseCSVLine(line){
  const out=[]; let cur="", inQuotes=false;
  for(let i=0;i<line.length;i++){
    const ch = line[i];
    if(ch === '"' ){
      if(inQuotes && line[i+1]==='"'){ cur += '"'; i++; } else { inQuotes = !inQuotes; }
    } else if(ch === ',' && !inQuotes){
      out.push(cur); cur="";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/* Normalize product rows (case-insensitive header access) */
function normalizeProduct(row){
  // helper to get by header name ignoring case
  const get = (name) => {
    const k = Object.keys(row).find(h => h.toLowerCase() === name.toLowerCase());
    return k ? row[k].trim() : "";
  };

  const rawImageIds = get("image_id") || get("imageid") || get("image");
  // allow comma-separated drive ids and trim them
  const imageIds = rawImageIds.split(",").map(s=>s.trim()).filter(Boolean);

  return {
    id: get("id") || Math.random().toString(36).slice(2,9),
    name: get("name") || get("title") || "",
    price: parseFloat((get("price") || get("amount") || "0").replace(/[^0-9.\-]/g,"")) || 0,
    size: ( (get("size") || get("sizes") || "").split(",").map(s=>s.trim()).filter(Boolean) ),
    image_ids: imageIds, // array of drive file ids
    category: get("category") || "Uncategorized",
    description: get("description") || get("desc") || ""
  };
}

/* --------- Rendering products --------- */
function populateFilters(){
  const cats = [...new Set(PRODUCTS.map(p => p.category || "Uncategorized"))].sort();
  categoryFilter.innerHTML = `<option value="all">All categories</option>` + cats.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  const sizes = new Set();
  PRODUCTS.forEach(p => (p.size||[]).forEach(s => sizes.add(s)));
  sizeFilter.innerHTML = `<option value="all">All sizes</option>` + [...sizes].sort().map(s=>`<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");
}

function renderProducts(){
  const cat = categoryFilter.value;
  const size = sizeFilter.value;
  const filtered = PRODUCTS.filter(p => {
    if(cat !== "all" && p.category !== cat) return false;
    if(size !== "all" && (!p.size || !p.size.includes(size))) return false;
    return true;
  });
  if(filtered.length === 0) {
    productsGrid.innerHTML = `<div style="padding:20px">No products found.</div>`;
    return;
  }
  productsGrid.innerHTML = filtered.map(p => productCardHTML(p)).join("");
}

function productCardHTML(p){
  const imgId = (p.image_ids && p.image_ids.length) ? p.image_ids[0] : "";
  const imgUrl = imgId ? DRIVE_IMAGE_URL(imgId) : '';
  const sizes = (p.size || []).join(", ");
  return `
    <div class="card">
      <div style="cursor:pointer" class="view-product" data-pid="${escapeHtml(p.id)}">
        ${imgUrl ? `<img alt="${escapeHtml(p.name)}" loading="lazy" src="${imgUrl}" />` : ''}
      </div>
      <h3>${escapeHtml(p.name)}</h3>
      <p>${escapeHtml(p.description || '')}</p>
      <div class="meta">
        <div>₹${(p.price || 0).toFixed(2)}</div>
        <div><small>${escapeHtml(p.category || '')}</small></div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">
        <div style="font-size:.9rem;color:#666">${escapeHtml(sizes)}</div>
        <div style="display:flex;gap:8px">
          <button class="button add add-to-cart" data-pid="${escapeHtml(p.id)}">Add</button>
          <button class="button" data-pid="${escapeHtml(p.id)}" onclick="openProductModal('${escapeHtml(p.id)}')">View</button>
        </div>
      </div>
    </div>
  `;
}

/* --------- Product modal (gallery + details) --------- */
window.openProductModal = function(pid){
  openProductModal(pid);
};
function openProductModal(pid){
  const p = PRODUCTS.find(x => x.id === pid);
  if(!p) return;
  CURRENT_MODAL_PRODUCT = p;
  $("#productName").textContent = p.name;
  $("#productCategory").textContent = p.category;
  $("#productDesc").textContent = p.description || "";
  $("#productPrice").textContent = (p.price || 0).toFixed(2);
  $("#productSizes").textContent = (p.size||[]).join(" • ");

  const gallery = $("#productGallery");
  gallery.innerHTML = "";

  if((p.image_ids||[]).length === 0){
    gallery.innerHTML = `<div style="padding:20px;background:#fafafa;border-radius:8px">No image</div>`;
  } else {
    const main = document.createElement("img");
    main.className = "gallery-main";
    main.alt = p.name;
    main.src = DRIVE_IMAGE_URL(p.image_ids[0]);
    gallery.appendChild(main);

    if(p.image_ids.length > 1){
      const thumbs = document.createElement("div");
      thumbs.className = "gallery-thumbs";
      p.image_ids.forEach((id, idx) => {
        const t = document.createElement("img");
        t.className = "thumb " + (idx===0 ? "active" : "");
        t.src = DRIVE_IMAGE_URL(id);
        t.addEventListener("click", () => {
          main.src = DRIVE_IMAGE_URL(id);
          thumbs.querySelectorAll(".thumb").forEach(el => el.classList.remove("active"));
          t.classList.add("active");
        });
        thumbs.appendChild(t);
      });
      gallery.appendChild(thumbs);
    }
  }

  $("#productModal").classList.remove("hidden");
}

/* --------- Cart operations --------- */
function loadCart(){
  try { return JSON.parse(localStorage.getItem("store_cart")||"[]"); } catch(e){ return []; }
}
function saveCart(){ localStorage.setItem("store_cart", JSON.stringify(CART)); updateCartCount(); }
function updateCartCount(){ const count = CART.reduce((s,i)=>s+i.qty,0); cartCountEl.textContent = count; }
function addToCart(pid){
  const prod = PRODUCTS.find(p=>p.id==pid);
  if(!prod) return showToast("Product not found");
  const item = CART.find(i=>i.id===pid);
  if(item) item.qty++;
  else CART.push({ id: pid, name: prod.name, price: prod.price, image_id: (prod.image_ids && prod.image_ids[0]) || "", qty: 1 });
  saveCart();
  showToast("Added to cart");
}
function changeQty(pid, delta){
  const item = CART.find(i=>i.id===pid);
  if(!item) return;
  item.qty += delta;
  if(item.qty <= 0) CART = CART.filter(i=>i.id!==pid);
  saveCart();
}
function removeFromCart(pid){ CART = CART.filter(i=>i.id!==pid); saveCart(); }
function clearCart(){ CART = []; saveCart(); }
function cartTotal(){ return CART.reduce((s,i)=> s + (i.price * i.qty), 0); }

/* --------- Cart UI --------- */
function openCart(){ renderCart(); $("#cartModal").classList.remove("hidden"); }
function closeCart(){ $("#cartModal").classList.add("hidden"); }
function renderCart(){
  const wrap = $("#cartItems");
  if(!wrap) return;
  if(CART.length===0){ wrap.innerHTML = "<div>Your cart is empty.</div>"; $("#cartTotal").textContent = "0.00"; return; }
  wrap.innerHTML = CART.map(item => `
    <div class="cart-item" data-pid="${escapeHtml(item.id)}">
      <img src="${item.image_id ? DRIVE_IMAGE_URL(item.image_id) : ''}" alt="${escapeHtml(item.name)}"/>
      <div style="flex:1">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <strong>${escapeHtml(item.name)}</strong>
          <div>₹${(item.price||0).toFixed(2)}</div>
        </div>
        <div style="margin-top:6px;display:flex;gap:8px;align-items:center">
          <button class="button qty-minus">-</button>
          <div>${item.qty}</div>
          <button class="button qty-plus">+</button>
          <button class="button remove-item" style="margin-left:12px">Remove</button>
        </div>
      </div>
    </div>
  `).join("");
  $("#cartTotal").textContent = cartTotal().toFixed(2);
}

/* --------- Checkout (WhatsApp) --------- */
function openCheckout(){ if(CART.length === 0) return showToast("Cart is empty"); closeCart(); $("#checkoutModal").classList.remove("hidden"); }
function closeCheckout(){ $("#checkoutModal").classList.add("hidden"); }

function handleCheckout(formData){
  const name = formData.get("name");
  const phone = formData.get("phone");
  const address = formData.get("address");
  const notes = formData.get("notes") || "";

  const itemsText = CART.map(i => `${i.name} x${i.qty} — ₹${(i.price*i.qty).toFixed(2)}`).join("\n");
  const total = cartTotal().toFixed(2);
  const message = `New order from website\n\nCustomer: ${name}\nPhone: ${phone}\nAddress: ${address}\n\nItems:\n${itemsText}\n\nTotal: ₹${total}\n\nNotes: ${notes}`;

  // open WhatsApp using wa.me
  const wa = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
  window.open(wa, "_blank");

  clearCart();
  closeCheckout();
  showToast("Order opened in WhatsApp. Please send it to complete the purchase.");
}

/* --------- Utilities --------- */
function escapeHtml(s){ if(!s && s!==0) return ""; return String(s).replace(/[&<>"']/g, (m)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }
function showToast(msg){
  const el = document.createElement("div");
  el.textContent = msg;
  el.style.position = "fixed";
  el.style.left = "50%";
  el.style.transform = "translateX(-50%)";
  el.style.bottom = "24px";
  el.style.padding = "8px 12px";
  el.style.background = "#111";
  el.style.color = "#fff";
  el.style.borderRadius = "8px";
  el.style.zIndex = 9999;
  document.body.appendChild(el);
  setTimeout(()=> el.style.opacity = 0, 2500);
  setTimeout(()=> el.remove(), 3200);
}
