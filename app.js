// ===== app.js (com favoritos ❤️ e indicadores do carrossel) =====

// ===== Config =====
const API = 'https://pokeapi.co/api/v2';
const PAGE_SIZE = 24;        // quantidade por página
let currentPage = 1;
let currentType = 'all';
let totalPages = 1;

const grid = document.getElementById('grid');
const pageLabel = document.getElementById('pageLabel');
const prevBtn = document.getElementById('prevPage');
const nextBtn = document.getElementById('nextPage');
const typeSelect = document.getElementById('typeSelect');
const applyFilterBtn = document.getElementById('applyFilter');

// ===== Cache simples (memória + localStorage) =====
const memCache = new Map();
const getCacheKey = (k) => `pkm:${k}`;
function getCache(k){
  if (memCache.has(k)) return memCache.get(k);
  const raw = localStorage.getItem(getCacheKey(k));
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    memCache.set(k, data);
    return data;
  } catch { return null; }
}
function setCache(k, v){
  memCache.set(k, v);
  try { localStorage.setItem(getCacheKey(k), JSON.stringify(v)); } catch {}
}

// ===== Favoritos =====
const FAV_KEY = 'pkm:favs';
function loadFavs(){
  try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY) || '[]')); }
  catch { return new Set(); }
}
function saveFavs(set){ try { localStorage.setItem(FAV_KEY, JSON.stringify([...set])); } catch {} }
let favs = loadFavs();
const isFav = (id) => favs.has(id);
function toggleFav(id){
  if (favs.has(id)) favs.delete(id); else favs.add(id);
  saveFavs(favs);
}

// ===== Util =====
const pad = (n) => String(n).padStart(3, '0');
const artwork = (id) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;

// Mapear tipo -> classe
function typeClass(t){
  return `t-${t}`;
}

// ===== Carrega lista de tipos para o <select> =====
async function loadTypes(){
  try{
    const res = await fetch(`${API}/type`);
    const data = await res.json();
    const order = data.results
      .map(t => t.name)
      .filter(n => !['unknown','shadow'].includes(n))
      .sort();

    for (const name of order){
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name[0].toUpperCase() + name.slice(1);
      typeSelect.appendChild(opt);
    }
  }catch(e){
    console.error('Erro ao carregar tipos', e);
  }
}

// ===== Busca detalhes de 1 Pokémon (com cache) =====
async function getPokemonDetail(nameOrId){
  const key = `pokemon:${nameOrId}`;
  const cached = getCache(key);
  if (cached) return cached;

  const res = await fetch(`${API}/pokemon/${nameOrId}`);
  if (!res.ok) throw new Error('Falha ao buscar Pokémon');
  const data = await res.json();
  const normalized = {
    id: data.id,
    name: data.name,
    types: data.types.map(t => t.type.name),
    img: data.sprites?.other?.['official-artwork']?.front_default || data.sprites?.front_default
  };
  setCache(key, normalized);
  return normalized;
}

// ===== Renderização (grid) =====
function renderCards(list){
  grid.innerHTML = '';
  if (!list || !list.length){
    grid.innerHTML = `<p style="color:#b9c7de;text-align:center;">Nenhum Pokémon encontrado.</p>`;
    return;
  }

  for (const p of list){
    const card = document.createElement('article');
    card.className = 'p_card';
    card.innerHTML = `
      <!-- ❤️ favorito -->
      <button class="p_fav ${isFav(p.id) ? 'is-fav' : ''}"
              data-id="${p.id}"
              aria-label="${isFav(p.id) ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}"
              aria-pressed="${isFav(p.id)}"
              title="${isFav(p.id) ? 'Remover dos favoritos' : 'Favoritar'}">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 6 4 4 6.5 4c1.74 0 3.41.99 4.22 2.44C11.37 4.99 13.04 4 14.78 4 17.3 4 19.3 6 19.3 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
        </svg>
      </button>

      <div class="p_id">#${pad(p.id)}</div>
      <div class="p_imgWrap">
        <img src="${p.img}" alt="${p.name}">
      </div>
      <h3 class="p_name">${p.name[0].toUpperCase() + p.name.slice(1)}</h3>
      <div class="p_types">
        ${p.types.map(t => `<span class="p_type ${typeClass(t)}">${t}</span>`).join('')}
      </div>
    `;
    grid.appendChild(card);
  }
}

function renderPagination(){
  pageLabel.textContent = `${currentPage} de ${totalPages}`;
  prevBtn.disabled = currentPage <= 1;
  nextBtn.disabled = currentPage >= totalPages;
}

// ===== Fonte de dados de acordo com o filtro (grid) =====
let typeListCache = {}; // {type: [names]}

async function fetchPage(){
  // placeholder enquanto carrega
  grid.innerHTML = '<p style="color:#b9c7de;text-align:center;">Carregando...</p>';

  if (currentType === 'all'){
    // pagina pelo endpoint pokemon
    const offset = (currentPage - 1) * PAGE_SIZE;
    const res = await fetch(`${API}/pokemon?limit=${PAGE_SIZE}&offset=${offset}`);
    const data = await res.json();
    totalPages = Math.ceil(data.count / PAGE_SIZE);

    // buscar detalhes em paralelo
    const details = await Promise.all(
      data.results.map(p => getPokemonDetail(p.name))
    );
    renderCards(details);
    renderPagination();
    return;
  }

  // Filtrando por tipo:
  // 1) pega a lista de nomes para o tipo (cacheável)
  let names = typeListCache[currentType];
  if (!names){
    const res = await fetch(`${API}/type/${currentType}`);
    const data = await res.json();
    names = data.pokemon.map(p => p.pokemon.name);
    // remove duplicados e ordena alfabeticamente
    names = [...new Set(names)].sort();
    typeListCache[currentType] = names;
  }

  totalPages = Math.max(1, Math.ceil(names.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;

  const start = (currentPage - 1) * PAGE_SIZE;
  const slice = names.slice(start, start + PAGE_SIZE);

  const details = await Promise.all(slice.map(n => getPokemonDetail(n)));
  // ordena por id crescente para ficar bonitinho
  details.sort((a,b)=> a.id - b.id);

  renderCards(details);
  renderPagination();
}

// ===== Listeners (grid) =====
prevBtn.addEventListener('click', () => {
  if (currentPage > 1){ currentPage--; fetchPage(); }
});
nextBtn.addEventListener('click', () => {
  if (currentPage < totalPages){ currentPage++; fetchPage(); }
});
applyFilterBtn.addEventListener('click', () => {
  currentType = typeSelect.value || 'all';
  currentPage = 1;
  fetchPage();
  // também atualiza o carrossel de destaque baseado no filtro atual
  pcLoadCarousel(currentType);
});

// Toggle de favorito (delegação no grid)
grid.addEventListener('click', (e) => {
  const btn = e.target.closest('.p_fav');
  if (!btn) return;

  const id = Number(btn.dataset.id);
  toggleFav(id);

  const active = btn.classList.toggle('is-fav');
  btn.setAttribute('aria-pressed', String(active));
  btn.setAttribute('aria-label', active ? 'Remover dos favoritos' : 'Adicionar aos favoritos');
  btn.title = active ? 'Remover dos favoritos' : 'Favoritar';
});

// ===== Start (grid) =====
(async function init(){
  await loadTypes();
  await fetchPage();
  // inicia o carrossel (listando aleatórios)
  pcLoadCarousel('all');
})();


// ========================================================================
// ===== Carrossel Pokémon (vanilla) — AGORA BUSCANDO DIRETO DA API =======
// ========================================================================

/**
 * Exponho uma função global pcLoadCarousel(tipo='all') para:
 *  - carregar 5 Pokémon aleatórios (all) OU 5 do tipo escolhido
 *  - reutiliza getPokemonDetail + cache
 *  - integra com os botões, teclado e arraste
 */
function pcLoadCarousel(type = 'all'){
  (async function () {
    const track = document.getElementById("pcTrack");
    if (!track) return;

    // Limpa track enquanto carrega
    track.innerHTML = `
      <li class="pc-card" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:280px;height:120px;display:grid;place-items:center;background:rgba(15,23,42,.85);border:1px solid rgba(255,255,255,.08);border-radius:24px;color:#b9c7de">
        Carregando carrossel...
      </li>`;

    // ----- escolhe 5 nomes pela API -----
    const SIZE = 5;
    let names = [];

    if (type === 'all'){
      // pega 5 aleatórios dentro dos primeiros ~150 (rápido e suficiente)
      const offset = Math.floor(Math.random() * 150);
      const res = await fetch(`${API}/pokemon?limit=${SIZE}&offset=${offset}`);
      const data = await res.json();
      names = data.results.map(p => p.name);
    } else {
      // pega lista do tipo (usa cache do grid se já existir)
      let pool = typeListCache[type];
      if (!pool){
        const res = await fetch(`${API}/type/${type}`);
        const json = await res.json();
        pool = [...new Set(json.pokemon.map(p => p.pokemon.name))];
        typeListCache[type] = pool;
      }
      // escolhe até 5 únicos aleatórios desse tipo
      const tmp = pool.slice();
      while (names.length < Math.min(SIZE, tmp.length)){
        const i = Math.floor(Math.random() * tmp.length);
        names.push(tmp.splice(i,1)[0]);
      }
    }

    // busca detalhes
    const details = await Promise.all(names.map(n => getPokemonDetail(n)));
    details.sort((a,b) => a.id - b.id);

    // ----- render cards -----
    track.innerHTML = '';
    details.forEach(p => {
      const li = document.createElement("li");
      li.className = "pc-card";
      li.setAttribute("role", "group");
      li.setAttribute("aria-label", `#${pad(p.id)} ${p.name}`);

      li.innerHTML = `
        <div class="pc-number">#${pad(p.id)}</div>
        <img src="${p.img}" alt="${p.name}">
        <div class="pc-name">${p.name[0].toUpperCase() + p.name.slice(1)}</div>
        <div class="pc-types">
          ${p.types.map(t => `<span class="pc-pill ${t}">${t}</span>`).join("")}
        </div>
      `;

      li.addEventListener("click", () => {
        const myIndex = Array.from(track.children).indexOf(li);
        if (relative(myIndex) !== 0) goTo(myIndex);
      });

      track.appendChild(li);
    });

    // ----- lógica de navegação/anim -----
    const cards = Array.from(track.children);
    const len = cards.length;
    let index = Math.floor(len/2); // começa no do meio
    let dragDX = 0;

    // Indicadores (dots)
    const dotsWrap = document.getElementById("pcDots");

    function mod(n, m){ return ((n % m) + m) % m; }
    function relative(i) {
      let d = i - index;
      if (d > len/2) d -= len;
      if (d < -len/2) d += len;
      return d;
    }

    function renderDots(){
      if(!dotsWrap) return;
      dotsWrap.innerHTML = "";
      for (let i = 0; i < len; i++){
        const dot = document.createElement("button");
        dot.type = "button";
        dot.className = "pc-dot" + (i === index ? " is-active" : "");
        dot.setAttribute("aria-label", `Ir para card ${i+1}`);
        dot.addEventListener("click", () => goTo(i));
        dotsWrap.appendChild(dot);
      }
    }

    function updateDots(){
      if (!dotsWrap) return;
      [...dotsWrap.children].forEach((el, i) => {
        el.classList.toggle("is-active", i === index);
      });
    }

    renderDots();

    function applyTransforms() {
      const spread = 230;        // espaçamento base
      const edgeFactor = 0.85;   // comprime as pontas (0.8–0.9)

      const maxD = Math.floor(cards.length / 2);

      cards.forEach((card, i) => {
        const d = relative(i);
        const isCenter = d === 0;

        const factor = (Math.abs(d) === maxD) ? edgeFactor : 1;

        const x = d * spread * factor + dragDX;
        const scale = 1 - Math.min(Math.abs(d) * 0.12, 0.30);
        const opacity = 1 - Math.min(Math.abs(d) * 0.25, 0.50);
        const z = 100 - Math.abs(d);

        card.style.transform = `translate(-50%, -50%) translateX(${x}px) scale(${scale})`;
        card.style.opacity = opacity;
        card.style.zIndex = z;
        card.classList.toggle("is-center", isCenter);
        card.style.filter = "none";
      });
    }

    function go(dir){ index = mod(index + dir, len); applyTransforms(); updateDots(); }
    function goTo(i){ index = mod(i, len); applyTransforms(); updateDots(); }

    // Botões
    document.querySelector(".pc-prev")?.addEventListener("click", () => go(-1), { once: true });
    document.querySelector(".pc-next")?.addEventListener("click", () => go(1), { once: true });
    // Reanexa handlers persistentes (como usamos once:true acima para evitar empilhar)
    document.querySelector(".pc-prev")?.addEventListener("click", () => go(-1));
    document.querySelector(".pc-next")?.addEventListener("click", () => go(1));

    // Teclado
    const onKey = (e) => {
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.removeEventListener("keydown", onKey);
    window.addEventListener("keydown", onKey);

    // Arraste (pointer events)
    const viewport = document.querySelector(".pc-viewport");
    let startX = 0, dragging = false;

    const onDown = (clientX) => { dragging = true; startX = clientX; dragDX = 0; };
    const onMove = (clientX) => { if (!dragging) return; dragDX = (clientX - startX) * 0.8; applyTransforms(); };
    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      const threshold = 80;
      if (dragDX > threshold) go(-1);
      else if (dragDX < -threshold) go(1);
      dragDX = 0; applyTransforms();
      updateDots();
    };

    // Remove handlers anteriores (para evitar duplicar ao recarregar)
    viewport.onmousedown = null;
    window.onmousemove = null;
    window.onmouseup = null;
    viewport.ontouchstart = null;
    window.ontouchmove = null;
    window.ontouchend = null;

    // Mouse
    viewport.addEventListener("mousedown", (e) => onDown(e.clientX));
    window.addEventListener("mousemove", (e) => onMove(e.clientX));
    window.addEventListener("mouseup", onUp);

    // Touch
    viewport.addEventListener("touchstart", (e) => onDown(e.touches[0].clientX), {passive:true});
    window.addEventListener("touchmove", (e) => onMove(e.touches[0].clientX), {passive:true});
    window.addEventListener("touchend", onUp);

    // Inicializa posicionamento
    applyTransforms();
    updateDots();
  })();
}
