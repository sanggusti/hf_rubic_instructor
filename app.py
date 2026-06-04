"""Hugging Face Space entrypoint.

Re-exports the FastAPI app (which has Gradio mounted at ``/``) from
``frontend.main`` so HF Spaces can launch it directly.
"""

from frontend.main import app

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=7860)
