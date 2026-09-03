# AXIS TELOS Configurator Spec Work

Static Three.js prototype for the TELOS container configurator.

## Required local assets

Place these files at the repository root:

- `telos.glb`
- `telos-logo.svg`

The current prototype expects those exact filenames.

## Run locally

From the repository root:

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`.

## GitHub Pages

A GitHub Actions Pages workflow is included at `.github/workflows/pages.yml`.

After the two required assets have been pushed, open the repository's **Settings → Pages** and select **GitHub Actions** as the source if GitHub asks you to choose a deployment source.

The app uses the exported GLB's absolute animation timestamps so furniture, cage, wall panels and floor components stay on the same authored Blender timeline. Collapsed corrugations and crossmembers are hidden in Three.js until their Y scale grows beyond the collapsed threshold. Imported materials are forced to `THREE.FrontSide` for backface culling.
