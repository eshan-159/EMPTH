const fs = require('fs');

const indexHtml = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>Empth OS</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <div id="root" class="root">
      <div id="bar-mode" class="bar">
        <input id="query" class="query" type="text" placeholder="Ask Empth…" autofocus />
        <button id="mic" class="mic" title="Enter Voice Mode">Mic</button>
      </div>

      <div id="voice-mode" class="voice-mode" style="display: none;">
        <button id="close-voice" class="close-voice" title="Exit Voice Mode">✕</button>
        <div class="sphere-container">
          <div id="sphere" class="sphere"></div>
        </div>
      </div>

      <div id="status" class="status"></div>
      <div id="result" class="result"></div>
    </div>

    <script src="renderer.js"></script>
  </body>
</html>`;

fs.writeFileSync('frontend/renderer/index.html', indexHtml);
