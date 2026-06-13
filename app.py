"""Hugging Face Space entrypoint.

Re-exports the FastAPI app (which has Gradio mounted at ``/``) from
``frontend.main`` so HF Spaces can launch it directly. The ZeroGPU entrypoint
(``@spaces.GPU``) is defined and wired into the Gradio app in ``frontend.main``.
"""

from frontend.main import app

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=7860)


