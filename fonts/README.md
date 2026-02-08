DejaVu Sans font placeholder

This folder should contain the DejaVuSans.ttf file used by the PDF exporter in `script.js`.

Current state:
- `DejaVuSans.ttf` is a placeholder (empty file). Replace it with the real DejaVu Sans TTF to enable proper Cyrillic rendering in generated PDFs.

Where to get the font:
- Official DejaVu fonts: https://dejavu-fonts.github.io/
- Example CDN/package sources (verify license before use):
  - https://github.com/dejavu-fonts/dejavu-fonts

How to install:
1. Download `DejaVuSans.ttf` and place it into the `fonts/` folder (project root).
2. Reload the web page and generate PDF — console should log `Loaded font from /fonts/DejaVuSans.ttf` and use DejaVu for PDF.

If you prefer, I can embed the base64 font into a small JS file (`fonts/dejavu-base64.js`) instead of adding a binary TTF — tell me to proceed if you want that.