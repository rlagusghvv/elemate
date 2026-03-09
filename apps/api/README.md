# EleMate API

## Run

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e .
uvicorn app.main:app --reload --port 8000
```

## Env

- `DATABASE_URL` (optional): default `sqlite:///./data/elemate.db`
