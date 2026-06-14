"""Gradio entry that serves the built Three.js Rubik's Cube app inline.

The Vite-built bundle in ``frontend/dist/`` is mounted as a FastAPI
``StaticFiles`` route. Its hashed CSS/JS asset URLs (and the fullscreen
CSS that hides all Gradio chrome) are injected into the Gradio page
``<head>`` by an on-load ``js`` callback, and a single
``<div id="app">`` mount point is rendered inline through ``gr.HTML``.

Two-way bridge:
  * Python -> JS: a hidden ``gr.Textbox`` whose ``.change`` event runs
    JavaScript that calls ``window.rubikInstructor.applyMoves(...)``.
  * JS -> Python: ``window.rubikInstructor.getState()`` is polled from
    a button's ``js`` argument; the JSON state is then handed to a
    Python callback for inspection / decision making.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import gradio as gr
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

# ZeroGPU detects GPU usage by scanning the Gradio app for functions decorated
# with ``@spaces.GPU``. The package only exists on HF infra, so guard the import
# for local dev. Replace ``_zerogpu_warmup`` with real model inference later.
try:
    import spaces  # type: ignore

    @spaces.GPU
    def _zerogpu_warmup() -> str:
        return "ok"

except ImportError:  # local dev without the `spaces` package
    spaces = None  # type: ignore
    _zerogpu_warmup = None  # type: ignore

FRONTEND_DIR = Path(__file__).resolve().parent
DIST_DIR = FRONTEND_DIR / "dist"
ASSETS_PREFIX = "/cube-assets"



def _read_built_assets() -> tuple[str, str] | None:
    """Parse ``dist/index.html`` for the hashed CSS and JS filenames."""
    index = DIST_DIR / "index.html"
    if not index.is_file():
        return None
    html = index.read_text(encoding="utf-8")
    js_match = re.search(r'src="([^"]+\.js)"', html)
    css_match = re.search(r'href="([^"]+\.css)"', html)
    if not js_match or not css_match:
        return None
    # Vite emits absolute paths because base="/cube-assets/"; strip duplicate prefix.
    return css_match.group(1), js_match.group(1)


app = FastAPI()
_assets = _read_built_assets()

if _assets is not None:
    app.mount(ASSETS_PREFIX, StaticFiles(directory=str(DIST_DIR)), name="cube_assets")
    css_url, js_url = _assets
    MOUNT_HTML = '<div id="app"></div>'
    BUILD_OK = True
else:
    css_url = js_url = ""
    MOUNT_HTML = (
        '<div style="padding:24px;font-family:monospace;background:#fee;border:1px solid #c66;'
        'border-radius:6px">Frontend bundle not found at <code>frontend/dist/</code>. '
        "Run <code>npm install &amp;&amp; npm run build</code> in <code>frontend/</code>.</div>"
    )
    BUILD_OK = False


# CSS that strips all Gradio chrome so the Three.js canvas is the entire visible
# application. The mount div is pinned to the full viewport; Gradio's container
# padding, footer, and block gaps are removed.
FULLSCREEN_CSS = """
footer { display: none !important; }
html, body {
    margin: 0 !important;
    padding: 0 !important;
    height: 100% !important;
    max-height: 100% !important;
    overflow: hidden !important;
}
/* On HF Spaces the app is embedded in an auto-resizing iframe: the parent sets
   the iframe height from the content's scrollHeight. Any in-flow element sized
   in vh/% feeds an infinite "stretch downward" loop. Taking the whole Gradio
   shell OUT of flow (position:fixed) collapses body scrollHeight to ~0, so the
   resizer has nothing to grow. inset:0 then fills the iframe exactly. */
gradio-app {
    display: block !important;
    height: 100% !important;
    max-height: 100% !important;
    overflow: hidden !important;
}
.gradio-container {
    position: fixed !important;
    inset: 0 !important;
    width: 100vw !important;
    height: 100vh !important;
    max-width: 100% !important;
    max-height: 100vh !important;
    min-height: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: hidden !important;
    background: #0a0e1a !important;
    color: #e6edf6 !important;
}
.gradio-container > .main,
.gradio-container .wrap,
.gradio-container .contain {
    height: 100% !important;
    max-height: 100% !important;
    min-height: 0 !important;
    padding: 0 !important;
    gap: 0 !important;
    overflow: hidden !important;
}
#app {
    position: fixed !important;
    inset: 0 !important;
    width: 100vw !important;
    height: 100vh !important;
    overflow: hidden !important;
}
"""


# JS that injects the Vite-built CSS link and ES module script into the page
# <head> on app load. Runs once (idempotent).
LOAD_BUNDLE_JS = (
    "() => {"
    "  if (window.__rubikBundleLoaded) return;"
    "  window.__rubikBundleLoaded = true;"
    f'  const link = document.createElement("link");'
    f'  link.rel = "stylesheet";'
    f'  link.href = "{css_url}";'
    "  document.head.appendChild(link);"
    f'  const s = document.createElement("script");'
    f'  s.type = "module";'
    f'  s.src = "{js_url}";'
    "  document.head.appendChild(s);"
    # Append the fullscreen overrides LAST so they win the cascade against the
    # bundle's own ``#app`` rule (equal specificity -> later wins).
    f'  const style = document.createElement("style");'
    f"  style.textContent = {json.dumps(FULLSCREEN_CSS)};"
    "  document.head.appendChild(style);"
    # Belt-and-suspenders against the HF Spaces iframe auto-resizer: hard-clamp
    # the document to the visible viewport so reported scrollHeight can never
    # exceed innerHeight, which is what drives the runaway vertical stretch.
    "  const pin = () => {"
    "    const h = window.innerHeight;"
    "    for (const el of [document.documentElement, document.body]) {"
    "      el.style.height = h + 'px';"
    "      el.style.maxHeight = h + 'px';"
    "      el.style.overflow = 'hidden';"
    "    }"
    "  };"
    "  pin();"
    "  window.addEventListener('resize', pin);"
    "}"
)


# --- Python <-> JS bridge ---------------------------------------------------

# Python pushes a string of moves into ``moves_in`` (programmatically or via
# the demo textbox). The change event fires this JS, which forwards to the
# in-page cube API. Returning the same string keeps the textbox in sync.
PUSH_MOVES_JS = """
(moves) => {
  if (!moves) return moves;
  const api = window.rubikInstructor;
  if (!api) { console.warn('rubikInstructor not ready'); return moves; }
  api.applyMoves(moves);
  return moves;
}
""".strip()

# JS reads the current cube state and returns it (as a JSON string) so a
# Python callback can receive it via a hidden textbox.
READ_STATE_JS = """
() => {
  const api = window.rubikInstructor;
  if (!api) return JSON.stringify({ error: 'not_ready' });
  return JSON.stringify({ state: api.getState(), solved: api.isSolved(), busy: api.isBusy() });
}
""".strip()


def _format_state(payload: str) -> str:
    """Pretty-print the JSON returned by READ_STATE_JS."""
    import json

    if not payload:
        return ""
    try:
        data = json.loads(payload)
    except json.JSONDecodeError:
        return payload
    return json.dumps(data, indent=2)


with gr.Blocks(
    title="Rubik's Cube Instructor",
) as demo:
    # The Three.js app owns the full viewport; no visible Gradio chrome.
    gr.HTML(MOUNT_HTML)

    # Register the ZeroGPU entrypoint with the Gradio app so HF detects a
    # @spaces.GPU function at startup (hidden; replace with real inference).
    if _zerogpu_warmup is not None:
        _gpu_trigger = gr.Button(visible=False)
        _gpu_out = gr.Textbox(visible=False)
        _gpu_trigger.click(_zerogpu_warmup, inputs=None, outputs=_gpu_out)

    if BUILD_OK:
        # Hidden Python <-> JS bridge. No visible controls: these components are
        # internal plumbing for future ZeroGPU-backed inference. Python can push
        # moves into the cube and read its state back via hidden callbacks.
        moves_in = gr.Textbox(visible=False)
        state_raw = gr.Textbox(visible=False)
        state_out = gr.Textbox(visible=False)

        moves_in.change(None, inputs=moves_in, outputs=None, js=PUSH_MOVES_JS)
        state_raw.change(_format_state, inputs=state_raw, outputs=state_out)

        # Inject the Vite bundle into the page on load.
        demo.load(None, inputs=None, outputs=None, js=LOAD_BUNDLE_JS)

# ssr_mode=False prevents gradio from starting a second (Node SSR) server on the
# same port. On HF Spaces the FastAPI app is already served on 7860, so the SSR
# server would collide ("address already in use").
app = gr.mount_gradio_app(app, demo, path="/", ssr_mode=False)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=7860)