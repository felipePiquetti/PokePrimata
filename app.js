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

// ===== Renderização =====
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

// ===== Fonte de dados de acordo com o filtro =====
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

// ===== Listeners =====
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
});

// ===== Start =====
(async function init(){
  await loadTypes();
  await fetchPage();
})();
