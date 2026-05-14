const fs = require('fs');
const path = require('path');

try {
  // Resolve the main file of the package, then navigate to the dist folder
  // This avoids the "exports" restriction on package.json in modern Node.js
  const mainFile = require.resolve('onnxruntime-web');
  const wasmDir = path.join(path.dirname(mainFile), '..', 'dist');
  const destDir = path.join(__dirname, 'public', 'onnx');

  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  if (fs.existsSync(wasmDir)) {
    const files = fs.readdirSync(wasmDir).filter(f => f.endsWith('.wasm'));
    for (const file of files) {
      fs.copyFileSync(path.join(wasmDir, file), path.join(destDir, file));
      console.log(`Copied ${file} to public/onnx/`);
    }
  } else {
    console.error(`WASM directory not found at: ${wasmDir}`);
  }
} catch (e) {
  console.error('Failed to locate onnxruntime-web. Is it installed?', e.message);
}
