// ===== favorites.js — renderiza e gerencia os favoritos =====
const API = 'https://pokeapi.co/api/v2';
const FAV_KEY = 'pkm:favs';

const favList = document.getElementById('favList');
const favClearBtn = document.getElementById('favClear');

// cache simples igual ao app.js (memória + localStorage)
const memCache = new Map();
const getCacheKey = (k) => `pkm:${k}`;
function getCache(k){
  if (memCache.has(k)) return memCache.get(k);
  const raw = localStorage.getItem(getCacheKey(k));
  if (!raw) return null;
  try { const data = JSON.parse(raw); memCache.set(k, data); return data; } catch { return null; }
}
function setCache(k, v){
  memCache.set(k, v);
  try { localStorage.setItem(getCacheKey(k), JSON.stringify(v)); } catch {}
}

// Favoritos (mesmo formato do app.js)
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

// Util
const pad = (n) => String(n).padStart(3, '0');
const typeClass = (t) => `t-${t}`;

// Busca detalhe (com cache)
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

// Render
async function renderFavorites(){
  const ids = [...favs];
  favList.innerHTML = '';

  if (ids.length === 0){
    favList.innerHTML = `<p class="fav-empty">Você ainda não favoritou nenhum Pokémon.</p>`;
    return;
  }

  // busca todos os detalhes dos favoritos
  const details = await Promise.all(ids.map(id => getPokemonDetail(id)));
  details.sort((a,b) => a.id - b.id);

  for (const p of details){
    const article = document.createElement('article');
    article.className = 'fav-card';
    article.innerHTML = `
      <!-- coração para desfavoritar -->
      <button class="p_fav ${isFav(p.id) ? 'is-fav' : ''}"
              data-id="${p.id}"
              aria-label="${isFav(p.id) ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}"
              aria-pressed="${isFav(p.id)}"
              title="${isFav(p.id) ? 'Remover dos favoritos' : 'Favoritar'}">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 6 4 4 6.5 4c1.74 0 3.41.99 4.22 2.44C11.37 4.99 13.04 4 14.78 4 17.3 4 19.3 6 19.3 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
        </svg>
      </button>

      <div class="fav-info">
        <div class="fav-id">#${pad(p.id)}</div>
        <h3 class="fav-name">${p.name}</h3>
        <div class="fav-types">
          ${p.types.map(t => `<span class="p_type ${typeClass(t)}">${t}</span>`).join('')}
        </div>
      </div>

      <div class="fav-media">
        <img src="${p.img}" alt="${p.name}">
      </div>

      <button class="fav-remove" data-id="${p.id}" title="Remover">
        <!-- ícone de lixeira simples -->
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path fill="currentColor" d="M6 7h12v2H6V7zm2 3h8l-1 10H9L8 10zm3-7h2l1 2h4v2H6V8h4l1-2z"/>
        </svg>
      </button>
    `;
    favList.appendChild(article);
  }
}

// Delegação de eventos (coração e remover)
favList.addEventListener('click', (e) => {
  const favBtn = e.target.closest('.p_fav');
  if (favBtn){
    const id = Number(favBtn.dataset.id);
    toggleFav(id);
    // se desfavoritou, remove da lista imediatamente
    if (!isFav(id)){
      favBtn.closest('.fav-card')?.remove();
      if (favs.size === 0) renderFavorites();
      return;
    }
    const active = favBtn.classList.toggle('is-fav');
    favBtn.setAttribute('aria-pressed', String(active));
    favBtn.setAttribute('aria-label', active ? 'Remover dos favoritos' : 'Adicionar aos favoritos');
    return;
  }

  const delBtn = e.target.closest('.fav-remove');
  if (delBtn){
    const id = Number(delBtn.dataset.id);
    if (isNaN(id)) return;
    // remove dos favoritos e do DOM
    favs.delete(id);
    saveFavs(favs);
    delBtn.closest('.fav-card')?.remove();
    if (favs.size === 0) renderFavorites();
  }
});

// Limpar todos
favClearBtn.addEventListener('click', () => {
  if (!confirm('Remover todos os favoritos?')) return;
  favs = new Set();
  saveFavs(favs);
  renderFavorites();
});

// Start
renderFavorites();
