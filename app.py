"""Hugging Face Space entrypoint.

Re-exports the FastAPI app (which has Gradio mounted at ``/``) from
``frontend.main`` so HF Spaces can launch it directly.
"""

# Importing ``spaces`` (and any ZeroGPU-decorated function) must happen before
# the heavy ML stack so the ZeroGPU runtime can detect the GPU entrypoint at
# startup. The package only exists on HF infra, so guard it for local dev.
try:
    import spaces  # type: ignore

    @spaces.GPU
    def _zerogpu_warmup() -> str:
        """Placeholder GPU entrypoint so ZeroGPU detects a GPU function.

        Replace with real model inference once the instruct model is wired in.
        """
        return "ok"

except ImportError:  # local dev without the `spaces` package
    _zerogpu_warmup = None  # type: ignore

from frontend.main import app

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=7860)

