from __future__ import annotations

import hashlib
from datetime import UTC, datetime
from pathlib import Path

from playwright.sync_api import Browser, BrowserContext, Page, Playwright, sync_playwright

from ..settings import ARTIFACTS_DIR, PUBLIC_ARTIFACT_PREFIX


class BrowserAutomation:
    def __init__(
        self,
        *,
        task_id: str,
        channel: str | None,
        executable_path: str | None,
        headless: bool,
    ) -> None:
        self.task_id = task_id
        self.channel = channel
        self.executable_path = executable_path
        self.headless = headless
        self._playwright: Playwright | None = None
        self._browser: Browser | None = None
        self._context: BrowserContext | None = None
        self._page: Page | None = None

    def close(self) -> None:
        if self._page is not None:
            self._page.close()
            self._page = None
        if self._context is not None:
            self._context.close()
            self._context = None
        if self._browser is not None:
            self._browser.close()
            self._browser = None
        if self._playwright is not None:
            self._playwright.stop()
            self._playwright = None

    def goto(self, url: str) -> dict:
        page = self._ensure_page()
        page.goto(url, wait_until="load", timeout=30_000)
        return self.snapshot(label="browser-goto")

    def click(self, selector: str) -> dict:
        page = self._ensure_page()
        page.locator(selector).first.click(timeout=10_000)
        return self.snapshot(label="browser-click")

    def type(self, selector: str, text: str) -> dict:
        page = self._ensure_page()
        page.locator(selector).first.fill(text, timeout=10_000)
        return self.snapshot(label="browser-type")

    def press(self, key: str) -> dict:
        page = self._ensure_page()
        page.keyboard.press(key)
        return self.snapshot(label="browser-keypress")

    def scroll(self, delta_x: int, delta_y: int) -> dict:
        page = self._ensure_page()
        page.mouse.wheel(delta_x, delta_y)
        return self.snapshot(label="browser-scroll")

    def extract(self, selector: str) -> dict:
        page = self._ensure_page()
        locator = page.locator(selector).first
        return {
            "selector": selector,
            "text": locator.inner_text(timeout=10_000),
            "html": locator.evaluate("node => node.outerHTML"),
        }

    def snapshot(self, *, label: str = "browser-snapshot") -> dict:
        page = self._ensure_page()
        descriptor = self._write_screenshot(page, label)
        return {
            "url": page.url,
            "title": page.title(),
            "text_excerpt": page.evaluate(
                """
                () => {
                  const text = document.body ? document.body.innerText : "";
                  return text.slice(0, 2500);
                }
                """
            ),
            "interactive_elements": page.evaluate(
                """
                () => {
                  const escapeValue = (value) => String(value).replaceAll('"', '\\"');
                  const selectorFor = (el) => {
                    if (el.id) return `#${CSS.escape(el.id)}`;
                    const name = el.getAttribute('name');
                    if (name) return `${el.tagName.toLowerCase()}[name="${escapeValue(name)}"]`;
                    const aria = el.getAttribute('aria-label');
                    if (aria) return `${el.tagName.toLowerCase()}[aria-label="${escapeValue(aria)}"]`;
                    const placeholder = el.getAttribute('placeholder');
                    if (placeholder) return `${el.tagName.toLowerCase()}[placeholder="${escapeValue(placeholder)}"]`;
                    const text = (el.innerText || el.textContent || '').trim().replaceAll('\\n', ' ');
                    if (text) return `text=${text.slice(0, 80)}`;
                    return el.tagName.toLowerCase();
                  };
                  return Array.from(document.querySelectorAll('a,button,input,textarea,select,[role="button"]'))
                    .slice(0, 40)
                    .map((el) => ({
                      tag: el.tagName.toLowerCase(),
                      text: (el.innerText || el.textContent || '').trim().replaceAll('\\n', ' ').slice(0, 120),
                      selector: selectorFor(el),
                      type: el.getAttribute('type'),
                    }));
                }
                """
            ),
            "screenshot": descriptor,
        }

    def _ensure_page(self) -> Page:
        if self._page is not None:
            return self._page

        self._playwright = sync_playwright().start()
        launch_options = {
            "headless": self.headless,
            "args": ["--no-sandbox"],
        }
        if self.executable_path:
            launch_options["executable_path"] = self.executable_path
        elif self.channel:
            launch_options["channel"] = self.channel

        self._browser = self._playwright.chromium.launch(**launch_options)
        self._context = self._browser.new_context(viewport={"width": 1440, "height": 900})
        self._page = self._context.new_page()
        return self._page

    def _write_screenshot(self, page: Page, label: str) -> dict[str, str | int]:
        directory = ARTIFACTS_DIR / self.task_id
        directory.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now(UTC).strftime("%Y%m%d%H%M%S%f")
        file_path = directory / f"{label}-{timestamp}.png"
        page.screenshot(path=str(file_path), full_page=True)
        raw = file_path.read_bytes()
        sha256 = hashlib.sha256(raw).hexdigest()
        return {
            "public_path": f"{PUBLIC_ARTIFACT_PREFIX}/{self.task_id}/{file_path.name}",
            "sha256": sha256,
            "size": file_path.stat().st_size,
        }
