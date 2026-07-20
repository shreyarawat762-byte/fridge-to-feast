import { useState, useEffect, useRef } from 'react'

const CUISINES = ['Any', 'Italian', 'Indian', 'Mexican', 'Chinese', 'Mediterranean', 'American']
const DIETS = ['None', 'Vegetarian', 'Vegan', 'Gluten-free', 'Dairy-free']
const TIMES = ['Any', 'Under 20 min', 'Under 40 min']
const MEAL_TYPES = ['Any', 'Breakfast', 'Lunch', 'Dinner', 'Snack']

const FOODISH_URL = 'https://foodish-api.com/api/'

function parseRecipes(rawText) {
  const blocks = rawText.split(/\n(?=## )/).filter(b => b.trim().startsWith('##'))
  return blocks.map((block, i) => {
    const titleMatch = block.match(/^## (.+)/)
    const timeMatch = block.match(/\*\*Time:\*\* (.+)/)
    const usesMatch = block.match(/\*\*Uses:\*\* (.+)/)
    const needsMatch = block.match(/\*\*Needs:\*\* (.+)/)
    const stepsMatch = block.match(/\*\*Steps:\*\*([\s\S]*?)(?:\n---|$)/)
    const descMatch = block.match(/\*\*Needs:\*\* .+\n\n([\s\S]*?)\n\n\*\*Steps/)

    const steps = stepsMatch
      ? stepsMatch[1].trim().split(/\n/).map(s => s.replace(/^\d+\.\s*/, '').trim()).filter(Boolean)
      : []

    return {
      id: i,
      title: titleMatch ? titleMatch[1].trim() : 'Recipe',
      time: timeMatch ? timeMatch[1].trim() : '',
      uses: usesMatch ? usesMatch[1].trim() : '',
      needs: needsMatch ? needsMatch[1].trim() : '',
      description: descMatch ? descMatch[1].trim() : '',
      steps,
    }
  })
}

function loadFavorites() {
  try {
    return JSON.parse(localStorage.getItem('ftf_favorites') || '[]')
  } catch {
    return []
  }
}

function RecipeImage({ seed }) {
  const [src, setSrc] = useState(null)
  const [errored, setErrored] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(FOODISH_URL)
      .then(r => r.json())
      .then(data => { if (!cancelled) setSrc(data.image) })
      .catch(() => { if (!cancelled) setErrored(true) })
    return () => { cancelled = true }
  }, [seed])

  const finalSrc = errored ? `https://picsum.photos/seed/food${seed}/400/300` : src

  if (!finalSrc) return <div className="card-image skeleton-image" />
  return (
    <img
      className="card-image"
      src={finalSrc}
      alt=""
      loading="lazy"
      onError={() => setErrored(true)}
    />
  )
}

function RecipeCard({ recipe, isFavorite, onToggleFavorite }) {
  const [open, setOpen] = useState(false)

  return (
    <article className="recipe-card">
      <div className="card-image-wrap">
        <button
          className={`fav-btn ${isFavorite ? 'is-fav' : ''}`}
          onClick={() => onToggleFavorite(recipe)}
          aria-label="Save to favorites"
        >
          {isFavorite ? '♥' : '♡'}
        </button>
        {recipe.time && <span className="time-badge">⏱ {recipe.time}</span>}
      </div>
      <div className="card-body">
        <h3>{recipe.title}</h3>
        {recipe.description && <p className="desc">{recipe.description}</p>}
        <div className="tag-row">
          {recipe.uses && <span className="tag tag-have">Uses: {recipe.uses}</span>}
          {recipe.needs && <span className="tag tag-need">Needs: {recipe.needs}</span>}
        </div>
        {recipe.steps.length > 0 && (
          <>
            <button className="steps-toggle" onClick={() => setOpen(!open)}>
              {open ? 'Hide steps ▲' : 'View steps ▼'}
            </button>
            {open && (
              <ol className="steps">
                {recipe.steps.map((s, i) => <li key={i}>{s}</li>)}
              </ol>
            )}
          </>
        )}
      </div>
    </article>
  )
}

export default function App() {
  const [name, setName] = useState(() => localStorage.getItem('ftf_name') || '')
  const [nameInput, setNameInput] = useState('')
  const [view, setView] = useState('cook')

  const [ingredients, setIngredients] = useState([])
  const [inputValue, setInputValue] = useState('')
  const [mealType, setMealType] = useState('Any')
  const [cuisine, setCuisine] = useState('Any')
  const [diet, setDiet] = useState('None')
  const [maxTime, setMaxTime] = useState('Any')
  const [rawText, setRawText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [favorites, setFavorites] = useState(loadFavorites)
  const abortRef = useRef(null)

  const saveName = () => {
    const val = nameInput.trim()
    if (!val) return
    localStorage.setItem('ftf_name', val)
    setName(val)
  }

  const toggleFavorite = (recipe) => {
    const key = recipe.title
    const exists = favorites.some(f => f.title === key)
    const next = exists ? favorites.filter(f => f.title !== key) : [...favorites, recipe]
    setFavorites(next)
    localStorage.setItem('ftf_favorites', JSON.stringify(next))
  }

  const addIngredient = () => {
    const val = inputValue.trim().replace(/,$/, '')
    if (val && !ingredients.includes(val)) {
      setIngredients([...ingredients, val])
    }
    setInputValue('')
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addIngredient()
    } else if (e.key === 'Backspace' && !inputValue && ingredients.length) {
      setIngredients(ingredients.slice(0, -1))
    }
  }

  const removeIngredient = (item) => setIngredients(ingredients.filter(i => i !== item))

  const findRecipes = async () => {
    if (!ingredients.length) return
    setLoading(true)
    setError(null)
    setRawText('')

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch('/api/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ingredients,
          cuisine: cuisine === 'Any' ? null : cuisine,
          diet: diet === 'None' ? null : diet,
          max_time: maxTime === 'Any' ? null : maxTime,
          meal_type: mealType === 'Any' ? null : mealType,
        }),
        signal: controller.signal,
      })

      if (!res.ok || !res.body) throw new Error('Request failed')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n\n')
        buffer = lines.pop()

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const payload = line.slice(6)
          if (payload === '[DONE]') continue
          try {
            const { text } = JSON.parse(payload)
            accumulated += text
            setRawText(accumulated)
          } catch { /* ignore partial parse */ }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') setError('Something went wrong. Try again.')
    } finally {
      setLoading(false)
    }
  }

  const recipes = parseRecipes(rawText)
  const favTitles = new Set(favorites.map(f => f.title))

  if (!name) {
    return (
      <div className="gate">
        <div className="gate-card">
          <div className="gate-emoji">🍳</div>
          <h1>Fridge to Feast</h1>
          <p>Tell us your name so we can save your favorite recipes.</p>
          <input
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveName()}
            placeholder="Your name"
            autoFocus
          />
          <button onClick={saveName} disabled={!nameInput.trim()}>Let's cook →</button>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">🍳 Fridge to Feast</div>
        <nav className="tabs">
          <button className={view === 'cook' ? 'active' : ''} onClick={() => setView('cook')}>Find Recipes</button>
          <button className={view === 'favorites' ? 'active' : ''} onClick={() => setView('favorites')}>
            My Favorites {favorites.length > 0 && <span className="badge">{favorites.length}</span>}
          </button>
        </nav>
        <div className="greeting">Hi, {name} 👋</div>
      </header>

      {view === 'cook' && (
        <>
          <section className="hero">
            <h1>What's in your fridge today?</h1>
            <p>Add your ingredients and we'll whip up ideas in seconds.</p>
          </section>

          <section className="panel">
            <div className="chip-input">
              {ingredients.map((item) => (
                <span className="chip" key={item}>
                  {item}
                  <button aria-label={`Remove ${item}`} onClick={() => removeIngredient(item)}>×</button>
                </span>
              ))}
              <input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={addIngredient}
                placeholder={ingredients.length ? 'Add another…' : 'e.g. eggs, spinach, rice'}
                aria-label="Add an ingredient"
              />
            </div>

            <div className="meal-tabs">
              {MEAL_TYPES.map(m => (
                <button
                  key={m}
                  className={mealType === m ? 'meal-pill active' : 'meal-pill'}
                  onClick={() => setMealType(m)}
                >
                  {m}
                </button>
              ))}
            </div>

            <div className="filters">
              <label>
                <span>Cuisine</span>
                <select value={cuisine} onChange={(e) => setCuisine(e.target.value)}>
                  {CUISINES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label>
                <span>Diet</span>
                <select value={diet} onChange={(e) => setDiet(e.target.value)}>
                  {DIETS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </label>
              <label>
                <span>Time</span>
                <select value={maxTime} onChange={(e) => setMaxTime(e.target.value)}>
                  {TIMES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
            </div>

            <button className="cta" onClick={findRecipes} disabled={!ingredients.length || loading}>
              {loading ? 'Cooking up ideas…' : 'Find Recipes'}
            </button>

            {error && <p className="error">{error}</p>}
          </section>

          {(recipes.length > 0 || loading) && (
            <section className="results">
              {recipes.map((r) => (
                <RecipeCard
                  key={r.id}
                  recipe={r}
                  isFavorite={favTitles.has(r.title)}
                  onToggleFavorite={toggleFavorite}
                />
              ))}
              {loading && recipes.length === 0 && (
                <div className="recipe-card skeleton-card">Printing your recipes…</div>
              )}
            </section>
          )}
        </>
      )}

      {view === 'favorites' && (
        <section className="results favorites-view">
          {favorites.length === 0 ? (
            <div className="empty-state">
              <p>No favorites yet — tap the heart on any recipe to save it here.</p>
            </div>
          ) : (
            favorites.map((r) => (
              <RecipeCard
                key={r.title}
                recipe={r}
                isFavorite={true}
                onToggleFavorite={toggleFavorite}
              />
            ))
          )}
        </section>
      )}

      <footer className="foot">Made by Shreya</footer>
    </div>
  )
}
