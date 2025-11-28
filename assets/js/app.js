// app.js - main site script
// Uses PapaParse (not required) — but we'll use a simple CSV fetch + parse for robustness.
// Config (shared across pages)
const CSV_URL = (typeof CSV_PUB_URL !== 'undefined') ? CSV_PUB_URL :
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vT9RM9PuEfM9qPbZXALjzYFdGEoBiltayHlPSQlY9yEurdsRIQK1fgTfE-Wofkd821fdqADQ6O08Z4x/pub?gid=0&single=true&output=csv";
const WA_NUMBER = (typeof WA_NUMBER !== 'undefined') ? WA_NUMBER : "917907555924";

// Simple CSV fetch+parse (handles quoted commas)
async function fetchProducts() {
  try {
    const res = await fetch(CSV_URL);
    if (!res.ok) throw new Error('Could not fetch CSV. Check publish-to-web settings.');
    const text = await res.text();
    return csvToObjects(text);
  } catch (e) {
    console.error(e);
    return [];
  }
}

function csvToObjects(csvText) {
  const lines = csvText.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length < 1) return [];
  const headers = splitCSVLine(lines[0]).map(h => h.trim().toLowerCase());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i]);
    const obj = {};
    headers.forEach((h, idx) => obj[h] = (cols[idx] || '').trim());
    rows.push(obj);
  }
  // normalize fields
  return rows.map(r => ({
    code: (r.code || r['product code'] || '').trim(),
    name: (r.name || r.title || '').trim(),
    price: (r.price || '').trim(),
    size: (r.size || r.sizes || '').trim(),
    images: (r.images || r.imageurls || '').trim(),
    category: ((r.category || '').trim()).toUpperCase(),
    stock: (r.stock || '').trim(),
    description: (r.description || '').trim()
  })).filter(p => p.code);
}

// CSV splitting (handles quotes)
function splitCSVLine(line) {
  const res = [];
  let cur = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' ) { inQuotes = !inQuotes; continue; }
    if (ch === ',' && !inQuotes) { res.push(cur); cur = ''; continue; }
    cur += ch;
  }
  res.push(cur);
  return res;
}

// Convert Google Drive File ID or various URLs to direct view URL
function toDriveUrl(token) {
  if (!token) return '';
  token = token.trim();
  // if token looks like a Drive share link with /file/d/ID
  const m = token.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m && m[1]) return `https://drive.google.com/uc?export=view&id=${m[1]}`;
  // if already a UC export link or http(s) image, return as is
  if (token.startsWith('https://drive.google.com/uc?export=view&id=')) return token;
  if (token.startsWith('http://') || token.startsWith('https://')) return token;
  // otherwise assume token is a direct file id
  if (/^[a-zA-Z0-9_-]{10,}$/.test(token)) return `https://drive.google.com/uc?export=view&id=${token}`;
  return token;
}

// Build product card (used on collections page)
function createProductCard(product) {
  const card = document.createElement('div');
  card.className = 'product-card';

  const firstImgToken = (product.images || '').split(',').map(s=>s.trim()).filter(Boolean)[0] || '';
  const imgSrc = toDriveUrl(firstImgToken) || 'https://via.placeholder.com/600x400?text=No+Image';
  const img = document.createElement('img'); img.src = imgSrc; img.alt = product.name || product.code;
  card.appendChild(img);

  const title = document.createElement('h3'); title.textContent = product.name || product.code; card.appendChild(title);

  const meta = document.createElement('div'); meta.className = 'product-meta';
  const code = document.createElement('div'); code.className='code'; code.textContent = `Code: ${product.code}`; meta.appendChild(code);
  const price = document.createElement('div'); price.className='price'; price.textContent = product.price ? `₹${product.price}` : '—'; meta.appendChild(price);
  card.appendChild(meta);

  // size + qty row
  const controls = document.createElement('div'); controls.className = 'controls-row';
  const sizeSelect = document.createElement('select');
  const sizes = (product.size || '').split(',').map(s=>s.trim()).filter(Boolean);
  if (sizes.length === 0) {
    const opt = document.createElement('option'); opt.textContent = '—'; sizeSelect.appendChild(opt);
  } else {
    sizes.forEach(s => { const o = document.createElement('option'); o.value = s; o.textContent = s; sizeSelect.appendChild(o); });
  }
  controls.appendChild(sizeSelect);

  const qty = document.createElement('input'); qty.type='number'; qty.min=1; qty.value=1; qty.style.width='80px';
  controls.appendChild(qty);
  card.appendChild(controls);

  // buy button
  const buyRow = document.createElement('div'); buyRow.className='buy-row';
  const buyBtn = document.createElement('button'); buyBtn.className='btn-buy'; buyBtn.textContent='Buy on WhatsApp';
  buyBtn.addEventListener('click', () => {
    const selSize = sizeSelect.value || '';
    const q = qty.value || '1';
    let msg = `Hello Cathy%27s Dreamy Attire,%0A%0AI would like to order:%0A%0A`;
    msg += `Product: ${encodeURIComponent(product.name || product.code)}%0A`;
    msg += `Product Code: ${encodeURIComponent(product.code)}%0A`;
    msg += `Size: ${encodeURIComponent(selSize)}%0A`;
    msg += `Quantity: ${encodeURIComponent(q)}%0A`;
    if (product.price) msg += `Price: ${encodeURIComponent('₹'+product.price)}%0A`;
    // include first image link for reference
    const firstImg = (product.images || '').split(',').map(s=>toDriveUrl(s.trim())).filter(Boolean)[0];
    if (firstImg) msg += `%0AImage: ${encodeURIComponent(firstImg)}%0A`;
    msg += `%0AThank you!`;
    const url = `https://wa.me/${WA_NUMBER}?text=${msg}`;
    window.open(url, '_blank');
  });
  buyRow.appendChild(buyBtn);
  card.appendChild(buyRow);

  return card;
}

// Build grids for collections page
async function renderCollections() {
  const products = await fetchProducts();
  // split into categories
  const trending = products.filter(p => (p.category||'').toUpperCase().includes('CO') || (p.category||'').toUpperCase().includes('CO-ORD') || (p.category||'').toUpperCase().includes('COORD'));
  const ethnic = products.filter(p => (p.category||'').toUpperCase().includes('ETHNIC') || (p.category||'').toUpperCase().includes('KURTI') || (p.category||'').toUpperCase().includes('SAREE') || (p.category||'').toUpperCase().includes('LEHENGA'));

  const trendingGrid = document.getElementById('trendingGrid');
  const ethnicGrid = document.getElementById('ethnicGrid');
  if (trendingGrid) {
    trendingGrid.innerHTML = '';
    trending.forEach(p => trendingGrid.appendChild(createProductCard(p)));
    if (trending.length === 0) trendingGrid.innerHTML = '<p class="muted">No trending co-ords found.</p>';
  }
  if (ethnicGrid) {
    ethnicGrid.innerHTML = '';
    ethnic.forEach(p => ethnicGrid.appendChild(createProductCard(p)));
    if (ethnic.length === 0) ethnicGrid.innerHTML = '<p class="muted">No ethnic products found.</p>';
  }
}

// product detail page builder
async function renderProductDetail() {
  const params = new URLSearchParams(location.search);
  const code = (params.get('code') || '').trim();
  const container = document.getElementById('productDetailContainer');
  if (!container) return;
  const products = await fetchProducts();
  const product = products.find(p => p.code === code);
  if (!product) {
    container.innerHTML = `<p>Product not found for code: ${code}</p>`;
    return;
  }

  // build detail layout
  const left = document.createElement('div'); left.className = 'gallery';
  const mainImg = document.createElement('img'); mainImg.className='main-img';
  const imageTokens = (product.images || '').split(',').map(s=>s.trim()).filter(Boolean);
  const imageUrls = imageTokens.map(toDriveUrl);
  mainImg.src = imageUrls[0] || 'https://via.placeholder.com/800x600?text=No+Image';
  left.appendChild(mainImg);
  const thumbs = document.createElement('div'); thumbs.className='thumbs';
  imageUrls.forEach((u,i) => {
    const t = document.createElement('img'); t.src = u;
    if (i===0) t.classList.add('active');
    t.addEventListener('click', () => {
      document.querySelectorAll('.thumbs img').forEach(x=>x.classList.remove('active'));
      t.classList.add('active'); mainImg.src = u;
    });
    thumbs.appendChild(t);
  });
  left.appendChild(thumbs);

  // right
  const right = document.createElement('div'); right.className='detail-card';
  const h = document.createElement('h1'); h.textContent = product.name || product.code; right.appendChild(h);
  const meta = document.createElement('div'); meta.className='meta'; meta.textContent = `Code: ${product.code}`; right.appendChild(meta);
  const price = document.createElement('div'); price.className='price'; price.textContent = product.price ? `₹${product.price}` : '—'; right.appendChild(price);
  const stock = document.createElement('div'); stock.className='meta'; stock.innerHTML = (product.stock||'').toLowerCase().includes('out') ? '<span class="stock out">Out of stock</span>' : '<span class="stock in">In stock</span>'; right.appendChild(stock);

  const sizeLabel = document.createElement('label'); sizeLabel.textContent = 'Size'; right.appendChild(sizeLabel);
  const sizeSel = document.createElement('select'); sizeSel.className='select';
  (product.size || '').split(',').map(s=>s.trim()).filter(Boolean).forEach(sz => { const o=document.createElement('option'); o.value=sz; o.textContent=sz; sizeSel.appendChild(o); });
  right.appendChild(sizeSel);

  const qtyLabel = document.createElement('label'); qtyLabel.textContent = 'Quantity'; right.appendChild(qtyLabel);
  const qtyInp = document.createElement('input'); qtyInp.type='number'; qtyInp.value=1; qtyInp.min=1; right.appendChild(qtyInp);

  const notesLabel = document.createElement('label'); notesLabel.textContent = 'Notes (optional)'; right.appendChild(notesLabel);
  const notesInp = document.createElement('input'); notesInp.type='text'; notesInp.placeholder='eg. gift wrap'; right.appendChild(notesInp);

  const buy = document.createElement('button'); buy.className='btn-buy'; buy.textContent='Buy on WhatsApp';
  buy.addEventListener('click', ()=> {
    const s = sizeSel.value || '';
    const q = qtyInp.value || '1';
    let msg = `Hello Cathy%27s Dreamy Attire,%0A%0AI would like to order:%0A%0A`;
    msg += `Product: ${encodeURIComponent(product.name || product.code)}%0A`;
    msg += `Product Code: ${encodeURIComponent(product.code)}%0A`;
    msg += `Size: ${encodeURIComponent(s)}%0A`;
    msg += `Quantity: ${encodeURIComponent(q)}%0A`;
    if (product.price) msg += `Price: ${encodeURIComponent('₹'+product.price)}%0A`;
    if (notesInp.value) msg += `Notes: ${encodeURIComponent(notesInp.value)}%0A`;
    if (imageUrls[0]) msg += `%0AImage: ${encodeURIComponent(imageUrls[0])}%0A`;
    msg += `%0AThank you!`;
    window.open(`https://wa.me/${WA_NUMBER}?text=${msg}`, '_blank');
  });
  right.appendChild(buy);

  const layout = document.createElement('div'); layout.className='product-detail';
  layout.appendChild(left); layout.appendChild(right);
  container.innerHTML=''; container.appendChild(layout);
}

// page boot
(function boot() {
  const path = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  // render collections page content
  if (document.getElementById('trendingGrid') || document.getElementById('ethnicGrid')) {
    renderCollections();
  }
  // index: optionally show some featured (first 6)
  if (document.getElementById('featuredGrid')) {
    fetchProducts().then(products => {
      const featured = products.slice(0,6);
      const grid = document.getElementById('featuredGrid');
      if (grid) { grid.innerHTML = ''; featured.forEach(p => grid.appendChild(createProductCard(p))); }
    });
  }
  // product detail
  if (document.getElementById('productDetailContainer')) {
    renderProductDetail();
  }
})();
