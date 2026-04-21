/* ============================================================
   Gillett's Sunday Sauce — app.js
   ============================================================ */

// ── Storage helpers ──────────────────────────────────────────
const STORAGE_KEY = 'dinnerPlanner_recipes';

function loadRecipes() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}
function saveRecipes(recipes) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(recipes));
}

// ── State ────────────────────────────────────────────────────
let recipes  = [];
let editingId = null;

// ── View routing ─────────────────────────────────────────────
const views = {
  home:    document.getElementById('view-home'),
  list:    document.getElementById('view-list'),
  detail:  document.getElementById('view-detail'),
  editor:  document.getElementById('view-editor'),
  planner: document.getElementById('view-planner'),
  grocery: document.getElementById('view-grocery'),
};

const navBtns = {
  home:    document.getElementById('nav-home'),
  recipes: document.getElementById('nav-recipes'),
  planner: document.getElementById('nav-planner'),
  grocery: document.getElementById('nav-grocery'),
};

function showView(name) {
  Object.values(views).forEach(v => v && v.classList.remove('active'));
  if (views[name]) views[name].classList.add('active');

  Object.values(navBtns).forEach(b => b && b.classList.remove('active'));
  if      (name === 'home')                              navBtns.home.classList.add('active');
  else if (name === 'list' || name === 'detail' || name === 'editor') navBtns.recipes.classList.add('active');
  else if (name === 'planner')                           navBtns.planner.classList.add('active');
  else if (name === 'grocery')                           navBtns.grocery.classList.add('active');

  // Sync bottom nav
  document.querySelectorAll('.bottom-nav-btn[data-view]').forEach(b => {
    b.classList.toggle('active', b.dataset.view === name ||
      (b.dataset.view === 'list' && (name === 'detail' || name === 'editor')));
  });
}

// ── Nav click handlers ───────────────────────────────────────
navBtns.home.addEventListener('click', () => { renderHome(); showView('home'); });
document.getElementById('nav-home-logo').addEventListener('click', () => { renderHome(); showView('home'); });
navBtns.recipes.addEventListener('click', () => { renderRecipeList(); showView('list'); });
navBtns.planner.addEventListener('click', () => { renderPlanner(); showView('planner'); });
navBtns.grocery.addEventListener('click', () => { renderGrocery(); showView('grocery'); });

document.getElementById('nav-import').addEventListener('click', importRecipes);
document.getElementById('nav-upload')?.addEventListener('click', () => {
  document.getElementById('file-recipes')?.click();
});

document.getElementById('file-recipes')?.addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const incoming = JSON.parse(text);
    if (!Array.isArray(incoming)) throw new Error('Uploaded JSON must be an array of recipes.');
    const added = mergeIncoming(incoming);
    alert(added > 0 ? `✓ Uploaded ${added} recipe${added !== 1 ? 's' : ''}!` : 'No new recipes added.');
  } catch (err) {
    alert('Upload failed: ' + (err?.message || String(err)));
  } finally { e.target.value = ''; }
});

async function importRecipes() {
  try {
    const res = await fetch('data/sample-recipes.json');
    if (!res.ok) throw new Error('Could not load recipe file.');
    const added = mergeIncoming(await res.json());
    if (added > 0) alert(`✓ Imported ${added} recipe${added !== 1 ? 's' : ''}!`);
    else alert('All recipes already loaded — nothing new to import.');
  } catch (err) {
    alert('Import failed. Make sure the app is served via Live Server, not opened as a file://');
  }
}

function mergeIncoming(incoming) {
  if (!Array.isArray(incoming)) return 0;
  const existingIds = new Set(recipes.map(r => r.id));
  const newRecipes  = incoming.filter(r => !existingIds.has(r.id));
  if (newRecipes.length === 0) return 0;
  recipes = [...recipes, ...newRecipes];
  saveRecipes(recipes);
  renderHome();
  renderRecipeList();
  return newRecipes.length;
}

// ══════════════════════════════════════════════════════════════
//  RECIPE CARD BUILDER
// ══════════════════════════════════════════════════════════════
function getRecipeTags(recipe) {
  const tags = [];
  const timeStr = (recipe.time || '').toLowerCase();
  const instr   = (recipe.instructions || []).join(' ').toLowerCase();

  if (/\d[\-–]\d\s*hr/i.test(recipe.time || '') || timeStr.includes('hr')) {
    tags.push({ label: 'slow cook', type: 'neutral' });
  } else if (timeStr) {
    const mins = parseInt(timeStr);
    if (!isNaN(mins) && mins <= 25) tags.push({ label: 'quick', type: 'green' });
    else if (recipe.time)           tags.push({ label: recipe.time, type: 'neutral' });
  }

  if      (instr.includes('grill'))    tags.push({ label: 'grill', type: 'green' });
  else if (instr.includes('air fry'))  tags.push({ label: 'air fryer', type: 'green' });

  return tags.slice(0, 2);
}

function buildRecipeCard(recipe) {
  const tags     = getRecipeTags(recipe);
  const tagsHtml = tags.map(t => `<span class="tag tag-${t.type}">${escHtml(t.label)}</span>`).join('');
  const card = document.createElement('div');
  card.className  = 'recipe-card';
  card.dataset.cat = recipe.category || 'Other';
  card.innerHTML = `
    <div class="recipe-card-img">${recipe.emoji || '🍽'}</div>
    <div class="recipe-card-body">
      <div class="recipe-card-name">${escHtml(recipe.name)}</div>
      <div class="recipe-card-meta">${recipe.time ? escHtml(recipe.time) + ' · ' : ''}Serves ${recipe.servings}</div>
      ${tagsHtml ? `<div class="recipe-card-tags">${tagsHtml}</div>` : ''}
      <div class="recipe-card-actions">
        <button class="card-btn card-btn-view" onclick="openDetail('${escAttr(recipe.id)}')">View</button>
        <button class="card-btn card-btn-edit" onclick="openEditor('${escAttr(recipe.id)}')">Edit</button>
        <button class="card-btn card-btn-del"  onclick="deleteRecipe('${escAttr(recipe.id)}')">✕</button>
      </div>
    </div>`;
  return card;
}

// ══════════════════════════════════════════════════════════════
//  HOME VIEW
// ══════════════════════════════════════════════════════════════
function renderHome() {
  const dateEl = document.getElementById('hero-date');
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric'
    });
  }

  renderMiniPlanner();

  const grid = document.getElementById('home-recipe-grid');
  if (!grid) return;
  grid.innerHTML = '';

  if (recipes.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <p>No recipes yet — import the sample collection to get started.</p>
        <button class="btn-primary" onclick="importRecipes()">Import Recipes</button>
      </div>`;
    return;
  }

  recipes.forEach(r => grid.appendChild(buildRecipeCard(r)));
}

function renderMiniPlanner() {
  const el = document.getElementById('mini-planner');
  if (!el) return;
  el.innerHTML = DAYS.map(({ key, label }) => {
    const recipe = plan[key] ? recipes.find(r => r.id === plan[key]) : null;
    return `
      <div class="mini-plan-row">
        <span class="mini-day">${label.slice(0, 3).toUpperCase()}</span>
        ${recipe
          ? `<span class="mini-meal">${escHtml(recipe.name)}</span>
             <span class="mini-tag">${escHtml(recipe.category || '')}</span>`
          : `<span class="mini-empty">— pick a recipe</span>`
        }
      </div>`;
  }).join('');
}

// Hero CTAs
document.getElementById('btn-plan-week').addEventListener('click', () => {
  renderPlanner(); showView('planner');
});
document.getElementById('btn-browse-recipes').addEventListener('click', () => {
  renderRecipeList(); showView('list');
});
document.getElementById('btn-see-all').addEventListener('click', () => {
  renderRecipeList(); showView('list');
});

// ══════════════════════════════════════════════════════════════
//  SPIN THE WHEEL
// ══════════════════════════════════════════════════════════════
function spinRecipe() {
  if (recipes.length === 0) {
    alert('No recipes yet — import some first!');
    return;
  }

  const pick     = recipes[Math.floor(Math.random() * recipes.length)];
  const shakeBtns = ['btn-spin', 'bottom-spin'].map(id => document.getElementById(id)).filter(Boolean);

  shakeBtns.forEach(btn => { btn.disabled = true; btn.classList.add('shaking'); });

  setTimeout(() => {
    shakeBtns.forEach(btn => { btn.disabled = false; btn.classList.remove('shaking'); });
    document.getElementById('spin-emoji').textContent = pick.emoji || '🍽';
    document.getElementById('spin-name').textContent  = pick.name;
    document.getElementById('spin-meta').textContent  =
      [pick.time, pick.category, `Serves ${pick.servings}`].filter(Boolean).join(' · ');
    document.getElementById('spin-view-btn').onclick  = () => { closeSpin(); openDetail(pick.id); };
    document.getElementById('spin-again-btn').onclick = spinRecipe;
    document.getElementById('spin-modal').style.display = 'flex';
  }, 1400);
}

function closeSpin() {
  document.getElementById('spin-modal').style.display = 'none';
}

document.getElementById('btn-spin').addEventListener('click', spinRecipe);
document.getElementById('spin-close-btn').addEventListener('click', closeSpin);
document.getElementById('spin-modal').addEventListener('click', e => {
  if (e.target.id === 'spin-modal') closeSpin();
});

// ══════════════════════════════════════════════════════════════
//  RECIPE LIST VIEW
// ══════════════════════════════════════════════════════════════
const recipeGrid = document.getElementById('recipe-grid');

function renderRecipeList() {
  if (recipes.length === 0) {
    recipeGrid.innerHTML = `
      <div class="empty-state">
        <p>No recipes yet — add your first one or import the sample library!</p>
        <button class="btn-primary" onclick="openNewRecipe()">+ Add Recipe</button>
      </div>`;
    return;
  }

  recipeGrid.innerHTML = '';

  const CAT_ORDER = ['Chicken', 'Seafood', 'Steak', 'Ground Meat', 'Salads', 'Crock Pot', 'Other'];
  const grouped   = {};
  recipes.forEach(r => {
    const cat = r.category || 'Other';
    (grouped[cat] = grouped[cat] || []).push(r);
  });

  const cats = [
    ...CAT_ORDER.filter(c => grouped[c]),
    ...Object.keys(grouped).filter(c => !CAT_ORDER.includes(c)),
  ];

  cats.forEach(cat => {
    const header = document.createElement('div');
    header.className  = 'recipe-category-header';
    header.textContent = cat;
    recipeGrid.appendChild(header);
    grouped[cat].forEach(r => recipeGrid.appendChild(buildRecipeCard(r)));
  });
}

document.getElementById('btn-new-recipe').addEventListener('click', openNewRecipe);

// ══════════════════════════════════════════════════════════════
//  RECIPE DETAIL VIEW
// ══════════════════════════════════════════════════════════════
function openDetail(id) {
  const recipe = recipes.find(r => r.id === id);
  if (!recipe) return;

  document.getElementById('detail-name').textContent     = recipe.name;
  document.getElementById('detail-servings').textContent = `Serves ${recipe.servings}`;

  const ul = document.getElementById('detail-ingredients');
  ul.innerHTML = recipe.ingredients.map(ing => {
    const amt = [ing.amount, ing.unit].filter(Boolean).join(' ');
    return `<li><span class="amount">${escHtml(amt)}</span><span>${escHtml(ing.item)}</span></li>`;
  }).join('');

  const ol = document.getElementById('detail-instructions');
  ol.innerHTML = recipe.instructions.map(step =>
    `<li><span>${escHtml(step)}</span></li>`
  ).join('');

  document.getElementById('btn-edit-recipe').onclick   = () => openEditor(id);
  document.getElementById('btn-delete-recipe').onclick = () => {
    deleteRecipe(id);
    renderRecipeList();
    showView('list');
  };

  showView('detail');
}

document.getElementById('btn-back-from-detail').addEventListener('click', () => {
  renderRecipeList();
  showView('list');
});

// ══════════════════════════════════════════════════════════════
//  RECIPE EDITOR VIEW
// ══════════════════════════════════════════════════════════════
const ingredientRowsEl  = document.getElementById('ingredient-rows');
const instructionRowsEl = document.getElementById('instruction-rows');

function openNewRecipe() {
  editingId = null;
  document.getElementById('editor-title').textContent = 'New Recipe';
  document.getElementById('editor-name').value        = '';
  document.getElementById('editor-servings').value    = 4;
  ingredientRowsEl.innerHTML  = '';
  instructionRowsEl.innerHTML = '';
  addIngredientRow();
  addIngredientRow();
  addIngredientRow();
  addInstructionRow();
  addInstructionRow();
  showView('editor');
}

function openEditor(id) {
  const recipe = recipes.find(r => r.id === id);
  if (!recipe) return;
  editingId = id;
  document.getElementById('editor-title').textContent = 'Edit Recipe';
  document.getElementById('editor-name').value        = recipe.name;
  document.getElementById('editor-servings').value    = recipe.servings;
  ingredientRowsEl.innerHTML  = '';
  instructionRowsEl.innerHTML = '';
  recipe.ingredients.forEach(ing  => addIngredientRow(ing));
  recipe.instructions.forEach(step => addInstructionRow(step));
  showView('editor');
}

document.getElementById('btn-back-from-editor').addEventListener('click', () => { renderRecipeList(); showView('list'); });
document.getElementById('btn-cancel-editor').addEventListener('click',    () => { renderRecipeList(); showView('list'); });

function addIngredientRow(ing = {}) {
  const row = document.createElement('div');
  row.className = 'ingredient-row';
  row.innerHTML = `
    <input type="text" placeholder="Qty"  value="${escAttr(ing.amount || '')}" class="ing-amount">
    <input type="text" placeholder="Unit" value="${escAttr(ing.unit   || '')}" class="ing-unit">
    <input type="text" placeholder="Ingredient" value="${escAttr(ing.item || '')}" class="ing-item">
    <button class="btn-icon" title="Remove" onclick="this.closest('.ingredient-row').remove()">✕</button>`;
  ingredientRowsEl.appendChild(row);
}
document.getElementById('btn-add-ingredient').addEventListener('click', () => addIngredientRow());

function addInstructionRow(text = '') {
  const row = document.createElement('div');
  row.className = 'instruction-row';
  row.innerHTML = `
    <textarea placeholder="Describe this step…" class="inst-text">${escHtml(text)}</textarea>
    <button class="btn-icon" title="Remove" onclick="this.closest('.instruction-row').remove()">✕</button>`;
  instructionRowsEl.appendChild(row);
}
document.getElementById('btn-add-instruction').addEventListener('click', () => addInstructionRow());

document.getElementById('btn-save-recipe').addEventListener('click', saveRecipe);

function saveRecipe() {
  const name     = document.getElementById('editor-name').value.trim();
  const servings = parseInt(document.getElementById('editor-servings').value) || 4;

  if (!name) { alert('Please enter a recipe name.'); document.getElementById('editor-name').focus(); return; }

  const ingredients = [...ingredientRowsEl.querySelectorAll('.ingredient-row')]
    .map(row => ({
      amount: row.querySelector('.ing-amount').value.trim(),
      unit:   row.querySelector('.ing-unit').value.trim(),
      item:   row.querySelector('.ing-item').value.trim(),
    })).filter(ing => ing.item);

  const instructions = [...instructionRowsEl.querySelectorAll('.inst-text')]
    .map(ta => ta.value.trim()).filter(Boolean);

  if (ingredients.length === 0)  { alert('Please add at least one ingredient.'); return; }
  if (instructions.length === 0) { alert('Please add at least one instruction step.'); return; }

  if (editingId) {
    const idx = recipes.findIndex(r => r.id === editingId);
    recipes[idx] = { id: editingId, name, servings, ingredients, instructions };
  } else {
    recipes.push({ id: crypto.randomUUID(), name, servings, ingredients, instructions });
  }

  saveRecipes(recipes);
  renderHome();
  renderRecipeList();
  showView('list');
}

function deleteRecipe(id) {
  if (!confirm('Delete this recipe?')) return;
  recipes = recipes.filter(r => r.id !== id);
  saveRecipes(recipes);
  renderHome();
  renderRecipeList();
}

// ══════════════════════════════════════════════════════════════
//  WEEKLY PLANNER
// ══════════════════════════════════════════════════════════════
const PLANNER_KEY = 'dinnerPlanner_weeklyPlan';

const DAYS = [
  { key: 'monday',    label: 'Monday' },
  { key: 'tuesday',   label: 'Tuesday' },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday',  label: 'Thursday' },
  { key: 'friday',    label: 'Friday' },
  { key: 'saturday',  label: 'Saturday' },
  { key: 'sunday',    label: 'Sunday' },
];

let plan = {};

function loadPlan() {
  try { return JSON.parse(localStorage.getItem(PLANNER_KEY)) || {}; }
  catch { return {}; }
}
function savePlan() {
  localStorage.setItem(PLANNER_KEY, JSON.stringify(plan));
}

function renderPlanner() {
  const grid = document.getElementById('planner-grid');
  grid.innerHTML = '';

  DAYS.forEach(({ key, label }) => {
    const recipe = plan[key] ? recipes.find(r => r.id === plan[key]) : null;

    const PLANNER_CAT_ORDER = ['Chicken', 'Seafood', 'Steak', 'Ground Meat', 'Salads', 'Crock Pot', 'Other'];
    const grouped = {};
    recipes.forEach(r => {
      const cat = r.category || 'Other';
      (grouped[cat] = grouped[cat] || []).push(r);
    });
    const options = [
      ...PLANNER_CAT_ORDER.filter(c => grouped[c]),
      ...Object.keys(grouped).filter(c => !PLANNER_CAT_ORDER.includes(c)),
    ].map(cat => `
      <optgroup label="${escAttr(cat)}">
        ${grouped[cat].map(r =>
          `<option value="${escAttr(r.id)}"${r.id === plan[key] ? ' selected' : ''}>${escHtml(r.name)}</option>`
        ).join('')}
      </optgroup>`
    ).join('');

    const card = document.createElement('div');
    card.className = 'day-card';
    card.innerHTML = `
      <div class="day-header">
        <span class="day-name">${label}</span>
        ${recipe ? `<button class="btn-icon" title="Clear" onclick="clearDay('${key}')">✕</button>` : ''}
      </div>
      <div class="day-recipe-display">
        ${recipe
          ? `<button class="day-recipe-link" onclick="openDetail('${escAttr(recipe.id)}')">
               <span class="day-emoji">${recipe.emoji || '🍽'}</span>
               <span class="day-recipe-name">${escHtml(recipe.name)}</span>
             </button>`
          : `<span class="day-empty-text">No meal planned</span>`
        }
      </div>
      <select class="recipe-picker" onchange="assignRecipe('${key}', this.value)">
        <option value="">— pick a recipe —</option>
        ${options}
      </select>`;
    grid.appendChild(card);
  });
}

function assignRecipe(day, recipeId) {
  if (recipeId) plan[day] = recipeId;
  else delete plan[day];
  savePlan();
  renderPlanner();
  renderMiniPlanner();
}

function clearDay(day) {
  delete plan[day];
  savePlan();
  renderPlanner();
  renderMiniPlanner();
}

document.getElementById('btn-clear-plan').addEventListener('click', () => {
  if (Object.keys(plan).length === 0) return;
  if (!confirm('Clear all meals for the week?')) return;
  plan = {};
  savePlan();
  renderPlanner();
  renderMiniPlanner();
});

// ══════════════════════════════════════════════════════════════
//  GROCERY LIST
// ══════════════════════════════════════════════════════════════
const GROCERY_CHECKS_KEY = 'dinnerPlanner_groceryChecks';
let groceryChecks = new Set();

function loadChecks() {
  try { return new Set(JSON.parse(localStorage.getItem(GROCERY_CHECKS_KEY)) || []); }
  catch { return new Set(); }
}
function saveChecks() {
  localStorage.setItem(GROCERY_CHECKS_KEY, JSON.stringify([...groceryChecks]));
}

const CAT_ORDER = [
  '🥩 Meat & Seafood', '🥦 Produce', '🧀 Dairy & Eggs',
  '🥫 Canned & Jarred', '🌾 Grains & Bread', '🫙 Oils & Spices', '🛒 Other',
];

const CATEGORY_RULES = [
  { cat: '🥩 Meat & Seafood', keywords: ['chicken', 'turkey', 'beef', 'steak', 'ground', 'shrimp', 'salmon', 'sausage', 'pork', 'flank', 'skirt', 'sirloin', 'ribeye'] },
  { cat: '🥦 Produce',        keywords: ['tomato', 'lettuce', 'spinach', 'kale', 'arugula', 'cucumber', 'avocado', 'onion', 'garlic', 'lemon', 'lime', 'pepper', 'zucchini', 'broccoli', 'mango', 'strawberr', 'celery', 'carrot', 'mushroom', 'squash', 'sweet potato', 'jalapeño', 'jalapeno', 'cilantro', 'parsley', 'basil', 'mint', 'chive', 'rosemary', 'thyme', 'ginger', 'corn', 'edamame', 'cabbage', 'pine nut', 'walnut', 'pecan', 'candied'] },
  { cat: '🧀 Dairy & Eggs',   keywords: ['cheese', 'feta', 'mozzarella', 'parmesan', 'cheddar', 'cream cheese', 'heavy cream', 'butter', 'sour cream', 'yogurt', 'cottage', 'ricotta', 'egg'] },
  { cat: '🥫 Canned & Jarred', keywords: ['broth', 'beans', 'olives', 'chipotle', 'adobo', 'buffalo', 'crushed tomato', 'diced tomato', 'green chile', 'tortellini', 'oyster sauce', 'soy sauce'] },
  { cat: '🌾 Grains & Bread',  keywords: ['rice', 'quinoa', 'pasta', 'pita', 'tortilla', 'bread', 'noodle', 'crouton', 'rotini', 'penne'] },
  { cat: '🫙 Oils & Spices', keywords: ['oil', 'vinegar', 'honey', 'sriracha', 'worcestershire', 'dijon', 'mayo', 'ketchup', 'mustard', 'ranch', 'caesar', 'hot sauce', 'salsa', 'tzatziki', 'hummus', 'balsamic', 'cornstarch', 'mirin', 'seasoning', 'oregano', 'cumin', 'paprika', 'chili powder', 'salt', 'pepper', 'garlic powder', 'onion powder', 'italian', 'red pepper flake', 'everything bagel', 'sugar', 'anchovy', 'cotija', 'sesame', 'pita chip', 'tortilla strip'] },
];

function categorize(itemName) {
  const lower = itemName.toLowerCase();
  // Powders, dried spices, and seasoning blends always go to Oils & Spices
  // before Produce keywords (garlic, onion, pepper) can claim them
  const spiceTerms = ['powder', 'dried', 'flakes', 'seasoning', 'paste'];
  if (spiceTerms.some(t => lower.includes(t))) return '🫙 Oils & Spices';
  // Standalone salt & pepper references
  if (/\bsalt\b/.test(lower) || /\bpepper\b/.test(lower)) return '🫙 Oils & Spices';
  for (const { cat, keywords } of CATEGORY_RULES) {
    if (keywords.some(kw => lower.includes(kw))) return cat;
  }
  return '🛒 Other';
}

function combineAmounts(entries) {
  const byUnit = {};
  entries.forEach(({ amount, unit }) => {
    const u = (unit || '').trim();
    const n = parseFloat(amount);
    if (!isNaN(n)) byUnit[u] = (byUnit[u] || 0) + n;
  });
  return Object.entries(byUnit).map(([unit, total]) => {
    const n = Math.round(total * 100) / 100;
    return [n, unit].filter(v => v !== '' && v !== 0).join('\u202f');
  }).join(' + ');
}

function buildGroceryItems() {
  const plannedRecipes = DAYS
    .map(({ key }) => plan[key])
    .filter(Boolean)
    .map(id => recipes.find(r => r.id === id))
    .filter(Boolean);

  if (plannedRecipes.length === 0) return null;

  const merged = {};
  plannedRecipes.forEach(recipe => {
    recipe.ingredients.forEach(ing => {
      const key = ing.item.trim().toLowerCase();
      if (!merged[key]) merged[key] = { item: ing.item.trim(), entries: [], recipeNames: new Set() };
      merged[key].entries.push({ amount: ing.amount, unit: ing.unit });
      merged[key].recipeNames.add(recipe.name);
    });
  });

  const categorized = {};
  Object.values(merged).forEach(ing => {
    const cat = categorize(ing.item);
    (categorized[cat] = categorized[cat] || []).push(ing);
  });

  return categorized;
}

function renderGrocery() {
  const el = document.getElementById('grocery-content');
  const categorized = buildGroceryItems();

  if (!categorized) {
    el.innerHTML = `
      <div class="empty-state">
        <p>No meals planned — add some recipes to your weekly plan first.</p>
        <button class="btn-primary" onclick="document.getElementById('nav-planner').click()">Go to Weekly Plan</button>
      </div>`;
    return;
  }

  el.innerHTML = '';

  CAT_ORDER.forEach(cat => {
    const items = categorized[cat];
    if (!items || items.length === 0) return;

    const section = document.createElement('div');
    section.className = 'grocery-category';

    const listEl = document.createElement('ul');
    listEl.className = 'grocery-list';

    items.forEach(ing => {
      const checkKey = ing.item.toLowerCase();
      const isChecked = groceryChecks.has(checkKey);
      const amounts   = combineAmounts(ing.entries);
      const recipeList = [...ing.recipeNames].join(' & ');

      const li = document.createElement('li');
      li.className  = 'grocery-item' + (isChecked ? ' checked' : '');
      li.dataset.key = checkKey;
      li.innerHTML  = `
        <span class="grocery-check-box"></span>
        <span class="grocery-amount">${escHtml(amounts)}</span>
        <span class="grocery-name">${escHtml(ing.item)} <span class="grocery-recipe-names">(${escHtml(recipeList)})</span></span>`;
      listEl.appendChild(li);
    });

    section.innerHTML = `<h3 class="grocery-cat-header">${cat}</h3>`;
    section.appendChild(listEl);
    el.appendChild(section);
  });
}

document.getElementById('grocery-content').addEventListener('click', e => {
  const li = e.target.closest('.grocery-item');
  if (!li) return;
  const key = li.dataset.key;
  if (groceryChecks.has(key)) groceryChecks.delete(key);
  else groceryChecks.add(key);
  saveChecks();
  li.classList.toggle('checked');
});

document.getElementById('btn-clear-checks').addEventListener('click', () => {
  if (groceryChecks.size === 0) return;
  groceryChecks = new Set();
  saveChecks();
  renderGrocery();
});

// ══════════════════════════════════════════════════════════════
//  BOTTOM NAV
// ══════════════════════════════════════════════════════════════
document.querySelectorAll('.bottom-nav-btn[data-view]').forEach(btn => {
  btn.addEventListener('click', () => {
    const view = btn.dataset.view;
    if      (view === 'home')    { renderHome();       showView('home'); }
    else if (view === 'planner') { renderPlanner();    showView('planner'); }
    else if (view === 'list')    { renderRecipeList(); showView('list'); }
    else if (view === 'grocery') { renderGrocery();    showView('grocery'); }
  });
});
document.getElementById('bottom-spin')?.addEventListener('click', spinRecipe);

// ══════════════════════════════════════════════════════════════
//  UTILS
// ══════════════════════════════════════════════════════════════
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escAttr(str) { return String(str).replace(/"/g, '&quot;'); }

// ══════════════════════════════════════════════════════════════
//  BOOT
// ══════════════════════════════════════════════════════════════
async function boot() {
  recipes       = loadRecipes();
  plan          = loadPlan();
  groceryChecks = loadChecks();

  if (recipes.length === 0) {
    try {
      const res  = await fetch('data/sample-recipes.json');
      const seed = await res.json();
      recipes = seed;
      saveRecipes(recipes);
    } catch { /* no server — user can import manually */ }
  }

  renderHome();
  showView('home');
}

boot();
