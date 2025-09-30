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

    function mod(n, m){ return ((n % m) + m) % m; }
    function relative(i) {
      let d = i - index;
      if (d > len/2) d -= len;
      if (d < -len/2) d += len;
      return d;
    }
    function applyTransforms() {
      cards.forEach((card, i) => {
        const d = relative(i);
        const isCenter = d === 0;
        const x = d * 260 + dragDX;
        const scale = 1 - Math.min(Math.abs(d) * 0.12, 0.30);
        const opacity = 1 - Math.min(Math.abs(d) * 0.25, 0.50);
        const z = 100 - Math.abs(d);

        card.style.transform = `translate(-50%, -50%) translateX(${x}px) scale(${scale})`;
        card.style.opacity = opacity;
        card.style.zIndex = z;
        card.classList.toggle("is-center", isCenter);
        // sem blur por enquanto
        card.style.filter = "none";
      });
    }
    function go(dir){ index = mod(index + dir, len); applyTransforms(); }
    function goTo(i){ index = mod(i, len); applyTransforms(); }

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
  })();
}
