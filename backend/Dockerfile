# Etap budowania zależności
FROM python:3.14-slim AS builder

WORKDIR /app

# Aktualizacja pip i instalacja pdm
RUN pip install --upgrade pip pdm

# Kopiowanie plików konfiguracyjnych PDM
COPY pyproject.toml uv.lock ./

# Instalacja tylko produkcyjnych zależności
RUN pdm install --prod

# Etap finalny
FROM python:3.14-slim

WORKDIR /app

# Skopiowanie zależności z buildera
COPY --from=builder /root/.local /root/.local
ENV PATH=/root/.local/bin:$PATH

# Skopiowanie reszty aplikacji
COPY . .

# Port aplikacji
EXPOSE 5000

# Uruchomienie aplikacj
CMD ["python", "app.py"]