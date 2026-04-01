FROM python:3.14-slim AS builder

WORKDIR /app

RUN pip install --upgrade pip pdm

COPY pyproject.toml uv.lock ./

RUN pdm install --prod

FROM python:3.14-slim

WORKDIR /app

COPY --from=builder /root/.local /root/.local
ENV PATH=/root/.local/bin:$PATH

COPY . .

EXPOSE 5000

CMD ["python", "app.py"]