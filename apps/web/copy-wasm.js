const fs = require('fs');
const path = require('path');

const wasmDir = path.join(__dirname, 'node_modules', 'onnxruntime-web', 'dist');
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
  console.log('onnxruntime-web/dist not found. Please run npm install first.');
}
