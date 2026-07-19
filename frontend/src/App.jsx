import { useState, useRef } from 'react'

const CUISINES = ['Any', 'Italian', 'Indian', 'Mexican', 'Chinese', 'Mediterranean', 'American']
const DIETS = ['None', 'Vegetarian', 'Vegan', 'Gluten-free', 'Dairy-free']
const TIMES = ['Any', 'Under 20 min', 'Under 40 min']

function parseRecipes(rawText) {
  // Split streamed markdown into recipe blocks on "## " headings
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

export default function App() {
  const [ingredients, setIngredients] = useState([])
  const [inputValue, setInputValue] = useState('')
  const [cuisine, setCuisine] = useState('Any')
  const [diet, setDiet] = useState('None')
  const [maxTime, setMaxTime] = useState('Any')
  const [rawText, setRawText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const abortRef = useRef(null)

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

  const removeIngredient = (item) => {
    setIngredients(ingredients.filter(i => i !== item))
  }

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

  return (
    <div className="page">
      <header className="masthead">
        <div className="masthead-tape" />
        <h1>FRIDGE&nbsp;TO&nbsp;FEAST</h1>
        <p className="tagline">Ring up what you've got. Walk out with dinner.</p>
      </header>

      <section className="ticket">
        <div className="ticket-label">ITEM ENTRY</div>

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

        <button
          className="ring-up"
          onClick={findRecipes}
          disabled={!ingredients.length || loading}
        >
          {loading ? 'Cooking up ideas…' : 'Find Recipes'}
        </button>

        {error && <p className="error">{error}</p>}
      </section>

      {(recipes.length > 0 || loading) && (
        <section className="results">
          {recipes.map((r) => (
            <article className="recipe-card" key={r.id}>
              <div className="stamp">CHEF-APPROVED</div>
              <h2>{r.title}</h2>
              {r.time && <p className="meta">⏱ {r.time}</p>}
              {r.uses && <p className="meta"><strong>Uses:</strong> {r.uses}</p>}
              {r.needs && <p className="meta"><strong>Needs:</strong> {r.needs}</p>}
              {r.description && <p className="desc">{r.description}</p>}
              {r.steps.length > 0 && (
                <ol className="steps">
                  {r.steps.map((s, i) => <li key={i}>{s}</li>)}
                </ol>
              )}
            </article>
          ))}
          {loading && recipes.length === 0 && (
            <div className="recipe-card skeleton">Printing your recipes…</div>
          )}
        </section>
      )}

      <footer className="foot">Built with Claude · Fridge to Feast</footer>
    </div>
  )
}
