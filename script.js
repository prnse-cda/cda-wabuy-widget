// script.js
// Config
const CSV_URL = typeof CSV_PUB_URL !== 'undefined' ? CSV_PUB_URL :
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vT9RM9PuEfM9qPbZXALjzYFdGEoBiltayHlPSQlY9yEurdsRIQK1fgTfE-Wofkd821fdqADQ6O08Z4x/pub?gid=0&single=true&output=csv";
const WA_NUMBER = "917907555924"; // used in wa.me (no plus)

// CSV parsing (simple)
function csvToArray(str, delimiter = ',') {
  // handle quoted commas
  const rows = [];
  const lines = str.split('\n').filter(l => l.trim() !== '');
  const headers = lines[0].split(delimiter).map(h => h.trim());
  for (let i = 1; i < lines.length; i++) {
    const row = [];
    let cur = '', inQuotes = false;
    for (let ch of lines[i]) {
      if (ch === '"' ) { inQuotes = !inQuotes; continue; }
      if (ch === delimiter && !inQuotes) { row.push(cur); cur = ''; continue; }
      cur += ch;
    }
    row.push(cur);
    const obj = {};
    headers.forEach((h, idx) => obj[h.trim().toLowerCase()] = (row[idx] || "").trim());
    rows.push(obj);
  }
  return rows;
}

// load CSV
function loadProducts() {
  return fetch(CSV_URL)
    .then(r => {
      if (!r.ok) throw new Error("Could not fetch CSV. Check publish-to-web settings.");
      return r.text();
    })
    .then(text => csvToArray(text))
    .catch(err => { console.error(err); return []; });
}

// helpers
function toDirectDrive(url){
  // Accept drive sharing or already direct link. If 'drive.google.com/file/d/ID' converts.
  try {
    if(!url) return '';
    url = url.trim();
    if(url.includes('drive.google.com') && url.includes('/file/d/')) {
      const id = url.match(/\/file\/d\/([^\/]+)/);
      if(id && id[1]) return `https://drive.google.com/uc?export=view&id=${id[1]}`;
    }
    return url;
  } catch(e){ return url; }
}

function makeProductCard(p){
  const div = document.createElement('div');
  div.className = 'product-card';
  const img = document.createElement('img');
  const firstImg = (p.images || '').split(',').map(s=>s.trim()).filter(Boolean)[0] || '';
  img.src = toDirectDrive(firstImg) || 'placeholder.jpg';
  img.alt = p.name || p.code;
  div.appendChild(img);
  const h3 = document.createElement('h3');
  h3.textContent = `${p.name || ''}`;
  div.appendChild(h3);
  const code = document.createElement('div'); code.className='meta'; code.textContent = `Code: ${p.code || ''}`;
  div.appendChild(code);
  const price = document.createElement('div'); price.className='price'; price.textContent = p.price ? `₹${p.price}` : '—';
  div.appendChild(price);
  const a = document.createElement('a'); a.className='btn-buy';
  // link to product detail page (Option A)
  a.href = `product.html?code=${encodeURIComponent(p.code)}`;
  a.textContent = 'View / Buy';
  div.appendChild(a);
  return div;
}

// build products grid on products.html or featured on index
function buildProductsGrid(products, containerId, limit=0) {
  const container = document.getElementById(containerId);
  if(!container) return;
  container.innerHTML = '';
  const list = limit>0 ? products.slice(0,limit) : products;
  list.forEach(p => container.appendChild(makeProductCard(p)));
}

// product detail builder
function buildProductDetail(product){
  const target = document.getElementById('productDetail');
  if(!target) return;
  target.innerHTML = ''; // clear
  if(!product){ target.innerHTML = '<p>Product not found.</p>'; return; }

  // left: gallery
  const gallery = document.createElement('div'); gallery.className='gallery';
  const mainImg = document.createElement('img'); mainImg.className='main-img';
  const images = (product.images || '').split(',').map(s=>s.trim()).filter(Boolean).map(toDirectDrive);
  mainImg.src = images[0] || '';
  gallery.appendChild(mainImg);
  const thumbs = document.createElement('div'); thumbs.className='thumbs';
  images.forEach((u, i) => {
    const t = document.createElement('img'); t.src = u; if(i===0) t.classList.add('active');
    t.addEventListener('click', ()=>{document.querySelectorAll('.thumbs img').forEach(x=>x.classList.remove('active')); t.classList.add('active'); mainImg.src = u;});
    thumbs.appendChild(t);
  });
  gallery.appendChild(thumbs);

  // right: detail card
  const detail = document.createElement('div'); detail.className='detail-card';
  const title = document.createElement('h1'); title.textContent = product.name || product.code;
  detail.appendChild(title);
  const meta = document.createElement('div'); meta.className='meta'; meta.textContent = `Code: ${product.code || ''}`;
  detail.appendChild(meta);
  const price = document.createElement('div'); price.className='price'; price.textContent = product.price ? `₹${product.price}` : '—';
  detail.appendChild(price);
  const stock = document.createElement('div'); stock.className='meta';
  const st = (product.stock || '').toLowerCase();
  if(st.includes('out')) stock.innerHTML = `<span class="stock out">Out of stock</span>`;
  else if(st.includes('low')) stock.innerHTML = `<span class="stock low">Low stock</span>`;
  else stock.innerHTML = `<span class="stock in">In stock</span>`;
  detail.appendChild(stock);

  // sizes
  const label = document.createElement('label'); label.textContent = 'Size';
  const select = document.createElement('select'); select.className='select';
  (product.size || '').split(',').map(s=>s.trim()).filter(Boolean).forEach(sz => {
    const o = document.createElement('option'); o.value = sz; o.textContent = sz; select.appendChild(o);
  });
  detail.appendChild(label); detail.appendChild(select);

  // qty
  const qlabel = document.createElement('label'); qlabel.textContent = 'Quantity';
  const qty = document.createElement('input'); qty.type='number'; qty.min=1; qty.value=1; qty.style.marginTop='8px';
  detail.appendChild(qlabel); detail.appendChild(qty);

  // notes
  const nlabel = document.createElement('label'); nlabel.textContent = 'Notes (optional)';
  const notes = document.createElement('input'); notes.type='text'; notes.placeholder='eg. gift wrap';
  detail.appendChild(nlabel); detail.appendChild(notes);

  // actions
  const actions = document.createElement('div'); actions.className='buy-actions';
  const waBtn = document.createElement('button'); waBtn.className='btn-buy'; waBtn.textContent='Buy on WhatsApp';
  waBtn.addEventListener('click', ()=>{
    const selectedSize = select.value || '';
    const q = qty.value || '1';
    let msg = `Hello Cathy%27s Dreamy Attire,%0A%0AI would like to order:%0A%0A`;
    msg += `Product: ${encodeURIComponent(product.name || product.code)}%0A`;
    msg += `Product Code: ${encodeURIComponent(product.code)}%0A`;
    msg += `Size: ${encodeURIComponent(selectedSize)}%0A`;
    msg += `Quantity: ${encodeURIComponent(q)}%0A`;
    if(product.price) msg += `Price: ${encodeURIComponent('₹'+product.price)}%0A`;
    if(notes.value) msg += `Notes: ${encodeURIComponent(notes.value)}%0A`;
    if(images[0]) msg += `%0AImage: ${encodeURIComponent(images[0])}%0A`;
    msg += `%0AThank you!`;
    const url = `https://wa.me/${WA_NUMBER}?text=${msg}`;
    window.open(url, '_blank');
  });
  actions.appendChild(waBtn);

  detail.appendChild(actions);
  detail.appendChild(document.createElement('div')).className='small-note';

  // append to page in grid layout
  const container = document.createElement('div'); container.style.display='grid'; container.style.gridTemplateColumns='1fr 360px'; container.style.gap='20px';
  container.appendChild(gallery); container.appendChild(detail);

  target.appendChild(container);
}

// page-specific initialization
(function init(){
  // detect which page we are on
  const path = location.pathname.split('/').pop();
  const page = path || 'index.html';

  loadProducts().then(products => {
    // normalize keys for easy access
    products = products.map(r => ({
      code: (r.code||r['product code']||'').trim(),
      name: (r.name||'').trim(),
      price: (r.price||'').trim(),
      size: (r.size||r.sizes||'').trim(),
      images: (r.images||r.imageurls||'').trim(),
      category: (r.category||'').trim().toUpperCase(),
      stock: (r.stock||'').trim()
    })).filter(p => p.code);

    // index: featured (first 6)
    if(document.getElementById('featuredGrid')) buildProductsGrid(products,'featuredGrid',6);

    // products page
    if(document.getElementById('productGrid')){
      buildProductsGrid(products,'productGrid');
      // filters
      const cat = document.getElementById('filterCategory');
      const search = document.getElementById('searchBox');
      cat.addEventListener('change', ()=> {
        const f = cat.value;
        const filtered = f==='ALL' ? products : products.filter(x=>x.category===f);
        buildProductsGrid(filtered,'productGrid');
      });
      search.addEventListener('input', ()=> {
        const q = search.value.trim().toLowerCase();
        const filtered = products.filter(x => x.name.toLowerCase().includes(q) || x.code.toLowerCase().includes(q));
        buildProductsGrid(filtered,'productGrid');
      });

      // if hash present, auto-filter to category
      if(location.hash){
        const h = location.hash.replace('#','');
        document.getElementById('filterCategory').value = h.toUpperCase();
        const filtered = products.filter(x=>x.category===h.toUpperCase());
        buildProductsGrid(filtered,'productGrid');
      }
    }

    // product page
    if(document.getElementById('productDetail')){
      const params = new URLSearchParams(location.search);
      const code = params.get('code') || params.get('id') || '';
      const p = products.find(x=>x.code === code);
      buildProductDetail(p);
    }
  });
})();
