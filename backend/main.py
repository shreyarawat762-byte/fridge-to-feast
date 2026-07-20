import os
import json
from typing import List, Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from groq import Groq

app = FastAPI(title="Fridge to Feast API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

client = Groq(api_key=os.environ.get("GROQ_API_KEY"))


class RecipeRequest(BaseModel):
    ingredients: List[str]
    cuisine: Optional[str] = None
    diet: Optional[str] = None
    max_time: Optional[str] = None
    meal_type: Optional[str] = None


def build_prompt(req: RecipeRequest) -> str:
    ingredients_str = ", ".join(req.ingredients) if req.ingredients else "whatever is commonly on hand"

    constraints = []
    if req.meal_type:
        constraints.append(f"Meal type: {req.meal_type}.")
    if req.cuisine:
        constraints.append(f"Cuisine style: {req.cuisine}.")
    if req.diet:
        constraints.append(f"Dietary restriction: {req.diet}.")
    if req.max_time:
        constraints.append(f"Total time should be under: {req.max_time}.")
    constraints_str = " ".join(constraints) if constraints else "No additional constraints."

    return f"""You are a professional home-cooking assistant for the app "Fridge to Feast".

The user has these ingredients available: {ingredients_str}.
{constraints_str}

Generate 3 to 5 recipe suggestions, ranked by how well they use the listed ingredients
(prioritize recipes that use the MOST of the listed ingredients and require the FEWEST extra items).

Format your entire response in Markdown using exactly this structure, repeated for each recipe:

## <Recipe Title>
**Time:** <prep + cook time>
**Uses:** <comma-separated ingredients from the user's list this recipe uses>
**Needs:** <comma-separated additional ingredients required, or "Nothing else!" if none>

<1-2 sentence appetizing description>

**Steps:**
1. ...
2. ...
3. ...

---

Do not include any text before the first "## " heading or after the final recipe.
"""


@app.post("/api/recipes")
async def get_recipes(req: RecipeRequest):
    prompt = build_prompt(req)

    def event_stream():
        stream = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            stream=True,
        )
        for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                yield f"data: {json.dumps({'text': delta})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.get("/api/health")
async def health():
    return {"status": "ok"}


static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.isdir(static_dir):
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
