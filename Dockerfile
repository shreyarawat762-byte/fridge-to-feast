# ---- Stage 1: build the React frontend ----
FROM node:20-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# ---- Stage 2: Python backend serving the built frontend ----
FROM python:3.12-slim
WORKDIR /app

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./
# Place the built React app where main.py expects static files
COPY --from=frontend-build /app/frontend/dist ./static

# Render (and most free hosts) assign the port dynamically via $PORT.
# Falls back to 8000 for local `docker run`.
ENV PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
