"""Gradio entry that serves the built Three.js Rubik's Cube app.

The Vite-built bundle in ``frontend/dist/`` is mounted as a FastAPI
``StaticFiles`` route, then embedded into the Gradio UI via an iframe.
"""

from __future__ import annotations

from pathlib import Path

import gradio as gr
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

FRONTEND_DIR = Path(__file__).resolve().parent
DIST_DIR = FRONTEND_DIR / "dist"

app = FastAPI()

if DIST_DIR.is_dir():
    app.mount("/cube", StaticFiles(directory=str(DIST_DIR), html=True), name="cube")
    IFRAME_HTML = (
        '<iframe src="/cube/index.html" '
        'style="width:100%;height:88vh;border:0;border-radius:8px;background:#999" '
        'allow="fullscreen"></iframe>'
    )
else:
    IFRAME_HTML = (
        '<div style="padding:24px;font-family:monospace;background:#fee;border:1px solid #c66;'
        'border-radius:6px">Frontend bundle not found at <code>frontend/dist/</code>. '
        'Run <code>npm install &amp;&amp; npm run build</code> in <code>frontend/</code>.</div>'
    )

with gr.Blocks(title="Rubik's Cube Instructor", fill_height=True) as demo:
    gr.Markdown("# Rubik's Cube Instructor")
    gr.HTML(IFRAME_HTML)

app = gr.mount_gradio_app(app, demo, path="/")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=7860)