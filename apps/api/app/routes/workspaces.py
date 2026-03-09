from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException, Query, status

from ..execution import get_runtime_status
from ..schemas import WorkspaceBrowseOut, WorkspaceEntryOut

router = APIRouter(prefix="/workspaces", tags=["workspaces"])

PROJECT_MARKERS = (
    ".git",
    "package.json",
    "pyproject.toml",
    "requirements.txt",
    "Cargo.toml",
    "go.mod",
    "README.md",
)


@router.get("/browse", response_model=WorkspaceBrowseOut)
def browse_workspaces(path: str | None = Query(default=None)) -> WorkspaceBrowseOut:
    roots = _allowed_roots()
    current = _resolve_path(path, roots)
    entries: list[WorkspaceEntryOut] = []

    try:
        children = sorted(current.iterdir(), key=lambda item: (not item.is_dir(), item.name.lower()))
    except OSError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    for child in children:
        if child.name.startswith(".") and child.name not in {".git"}:
            continue
        if not child.is_dir():
            continue
        entries.append(
            WorkspaceEntryOut(
                name=child.name,
                path=str(child.resolve()),
                is_dir=True,
                is_project=_looks_like_project(child),
            )
        )

    parent_path = None
    for root in roots:
        if current == root:
            break
    else:
        parent_path = str(current.parent)

    return WorkspaceBrowseOut(
        current_path=str(current),
        parent_path=parent_path,
        roots=[str(root) for root in roots],
        entries=entries[:120],
    )


def _allowed_roots() -> list[Path]:
    runtime = get_runtime_status()
    candidates = [Path.home().resolve(), Path(runtime.workspace_root).resolve()]
    roots: list[Path] = []
    for candidate in candidates:
        if candidate.exists() and candidate not in roots:
            roots.append(candidate)
    return roots or [Path.home().resolve()]


def _resolve_path(path: str | None, roots: list[Path]) -> Path:
    if path:
        candidate = Path(path).expanduser().resolve()
    else:
        candidate = roots[0]

    for root in roots:
        if candidate == root or root in candidate.parents:
            if not candidate.exists():
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace path does not exist")
            if not candidate.is_dir():
                raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Workspace path must be a directory")
            return candidate

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Workspace browsing is limited to the configured local roots.",
    )


def _looks_like_project(path: Path) -> bool:
    return any((path / marker).exists() for marker in PROJECT_MARKERS)
