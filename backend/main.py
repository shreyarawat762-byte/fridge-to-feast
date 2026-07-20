import os
import json
from typing import List, Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import anthropic

app = FastAPI(title="Fridge to Feast API")

# Allow the frontend to call the API during local dev.
# In production the frontend is served by this same app, so CORS is a no-op there.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))


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
        with client.messages.stream(
            model="claude-sonnet-4-6",
            max_tokens=2000,
            messages=[{"role": "user", "content": prompt}],
        ) as stream:
            for text in stream.text_stream:
                # Server-Sent Events format
                yield f"data: {json.dumps({'text': text})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.get("/api/health")
async def health():
    return {"status": "ok"}


# Serve the built React app (created by `npm run build` -> frontend/dist)
# The Docker image copies that build output to /app/static
static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.isdir(static_dir):
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
