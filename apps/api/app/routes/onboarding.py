from __future__ import annotations

from fastapi import APIRouter

from ..schemas import OnboardingStatusOut, OnboardingUpdate
from ..services.onboarding import get_onboarding_status, update_onboarding_status

router = APIRouter(prefix="/onboarding", tags=["onboarding"])


@router.get("/status", response_model=OnboardingStatusOut)
def read_onboarding_status() -> OnboardingStatusOut:
    return get_onboarding_status()


@router.post("/status", response_model=OnboardingStatusOut)
def write_onboarding_status(payload: OnboardingUpdate) -> OnboardingStatusOut:
    return update_onboarding_status(payload)
