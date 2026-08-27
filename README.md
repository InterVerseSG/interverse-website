# InterVerseSG Web Preview

Browser-based preview of the InterVerseSG San Germán campus digital twin.

## What it does

- Loads the verified campus POI GeoJSON from `InterVerseSG/interverse-ai`.
- Displays NAV destinations on an accessible Leaflet map.
- Sends natural-language commands to the deployed InterVerse API.
- Sends the resulting structured command to InterVerse Builder.
- Highlights the validated `NAV_*` destination on the map.

Example:

`Llévame a la Escuela Graduada` → Gemini → Builder → `NAV_EscuelaGraduada`

## Deploy on Render

This repository contains `render.yaml` and requires no build step.

1. In Render choose **New → Blueprint**.
2. Connect `InterVerseSG/interverse-website`.
3. Keep branch `main`.
4. Render detects `render.yaml` and creates the static site `interverse-website`.
5. Open the public URL and test the default command.

No API keys are stored in this repository. Gemini is called only by the already-deployed `interverse-api` backend.

## Data policy

The map shows only coordinates that are present in the project's verified GeoJSON. The browser preview is for digital-twin visualization and navigation testing, not engineering or surveying.
