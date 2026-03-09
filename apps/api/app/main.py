from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .database import Base, engine
from .routes.agents import router as agents_router
from .routes.browser_tools import router as browser_router
from .routes.chat import router as chat_router
from .routes.meta import router as meta_router
from .routes.onboarding import router as onboarding_router
from .routes.operator import router as operator_router
from .routes.portal import router as portal_router
from .routes.tasks import router as task_router
from .routes.tailscale import router as tailscale_router
from .routes.workspaces import router as workspaces_router
from .settings import ARTIFACTS_DIR

app = FastAPI(
    title="EleMate API",
    version="0.1.0",
    description="EleMate 개인 장비형 에이전트 API",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


app.mount("/artifacts", StaticFiles(directory=ARTIFACTS_DIR), name="artifacts")
app.include_router(agents_router)
app.include_router(browser_router)
app.include_router(chat_router)
app.include_router(meta_router)
app.include_router(onboarding_router)
app.include_router(operator_router)
app.include_router(portal_router)
app.include_router(task_router)
app.include_router(tailscale_router)
app.include_router(workspaces_router)
