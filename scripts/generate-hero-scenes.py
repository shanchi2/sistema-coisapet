#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Gera as 3 fotos realistas da cena do hero (site-novo/) via Gemini
Nano Banana Pro. Script proprio (nao o logo/generate.py da skill design,
que forca fundo branco/estilo vetor de logo - nao serve pra cena de
ambiente fotorrealista).

Uso: GEMINI_API_KEY=xxx python generate-hero-scenes.py
"""
import os
import sys
from pathlib import Path

try:
    from google import genai
    from google.genai import types
except ImportError:
    print("Instale antes: pip install google-genai")
    sys.exit(1)

API_KEY = os.environ.get("GEMINI_API_KEY")
if not API_KEY:
    print("Erro: defina GEMINI_API_KEY")
    sys.exit(1)

client = genai.Client(api_key=API_KEY)
MODEL = "gemini-2.5-flash-image"

OUT_DIR = Path(__file__).parent.parent / "site-novo" / "assets" / "hero"
OUT_DIR.mkdir(parents=True, exist_ok=True)

COMMON_STYLE = (
    "Professional editorial pet-product photography, shot on a full-frame camera "
    "with an 85mm lens, shallow depth of field, soft warm golden-hour side lighting. "
    "Color palette: deep warm brown background (#3D1F0D), copper/amber wood tones "
    "(#C4956A), cream-colored substrate and laminated wood accents (#F5ECD7). "
    "Photorealistic, highly detailed, no text, no logos, no watermarks, no people, "
    "no hands. Landscape orientation, cinematic composition."
)

SCENES = [
    {
        "file": "scene-1-wide.jpg",
        "prompt": (
            "A beautifully arranged glass hamster terrarium photographed from a "
            "slight outside angle, sitting on a wooden shelf. Inside: pale sandy "
            "substrate, a small natural wood house with visible laser-cut grooves, "
            "a dried branch with small dried leaves. Warm side light hits the glass, "
            "soft bokeh in the dark brown background. Large empty negative space on "
            "the left third of the frame for text overlay. " + COMMON_STYLE
        ),
    },
    {
        "file": "scene-2-mid.jpg",
        "prompt": (
            "Camera pushed physically closer, now just inside the same terrarium's "
            "glass wall looking across the habitat: blurred pale substrate in the "
            "extreme foreground (out of focus), in sharp focus at the center a "
            "handcrafted wooden hamster exercise wheel with a copper-toned metal rim, "
            "softly blurred glass and warm dark background behind it. " + COMMON_STYLE
        ),
    },
    {
        "file": "scene-3-close.jpg",
        "prompt": (
            "Extreme close-up, almost abstract framing, of a handcrafted laminated "
            "wood hamster house: cream-colored laser-cut wood panels with a visible "
            "circular entrance hole, warm raking light grazing across the wood grain "
            "and cut edges, shallow focus with soft warm bokeh. Cozy, intimate "
            "atmosphere. " + COMMON_STYLE
        ),
    },
]

for scene in SCENES:
    out_path = OUT_DIR / scene["file"]
    print(f"Gerando {scene['file']}...")
    try:
        response = client.models.generate_content(
            model=MODEL,
            contents=scene["prompt"],
            config=types.GenerateContentConfig(
                response_modalities=["IMAGE", "TEXT"],
                image_config=types.ImageConfig(aspect_ratio="16:9"),
            ),
        )
        image_data = None
        for part in response.candidates[0].content.parts:
            if getattr(part, "inline_data", None) and part.inline_data.mime_type.startswith("image/"):
                image_data = part.inline_data.data
                break
        if not image_data:
            print(f"  ERRO: nenhuma imagem retornada pra {scene['file']}")
            continue
        with open(out_path, "wb") as f:
            f.write(image_data)
        print(f"  OK: salvo em {out_path} ({len(image_data)} bytes)")
    except Exception as e:
        print(f"  ERRO gerando {scene['file']}: {e}")

print("\nConcluido.")
