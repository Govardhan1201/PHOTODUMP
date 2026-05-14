const fs = require('fs');
const https = require('https');
const path = require('path');

const modelsDir = path.join(__dirname, 'apps/web/public/models');
if (!fs.existsSync(modelsDir)) {
  fs.mkdirSync(modelsDir, { recursive: true });
}

// 1. face-api.js weights for Detection + Landmarks
const faceApiBaseUrl = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/';
const faceApiFiles = [
  'ssd_mobilenetv1_model-weights_manifest.json',
  'ssd_mobilenetv1_model-shard1',
  'ssd_mobilenetv1_model-shard2',
  'face_landmark_68_model-weights_manifest.json',
  'face_landmark_68_model-shard1'
];

// 2. ArcFace ONNX models for 512-dim embedding extraction
// Using reliable Hugging Face Hub links
const onnxModels = [
  {
    name: 'arcface_mobilenet.onnx',
    url: 'https://huggingface.co/takuoko/arcface-onnx/resolve/main/arcface_mobilenet.onnx' // ~25MB
  },
  {
    name: 'arcface_r50.onnx',
    url: 'https://huggingface.co/takuoko/arcface-onnx/resolve/main/arcface_r50.onnx' // ~166MB
  }
];

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to download ${url}: ${res.statusCode}`));
      }
      const fileStream = fs.createWriteStream(dest);
      res.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close();
        console.log('Downloaded', path.basename(dest));
        resolve();
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

async function downloadAll() {
  console.log('Starting model downloads...');
  
  for (const file of faceApiFiles) {
    const dest = path.join(modelsDir, file);
    try {
      await downloadFile(faceApiBaseUrl + file, dest);
    } catch (e) {
      console.error(e.message);
    }
  }

  for (const model of onnxModels) {
    const dest = path.join(modelsDir, model.name);
    try {
      // For large models, check if they exist to skip re-download
      if (!fs.existsSync(dest) || fs.statSync(dest).size < 1000) {
        console.log(`Downloading ${model.name}... this may take a moment.`);
        await downloadFile(model.url, dest);
      } else {
        console.log(`Skipped ${model.name} (already exists)`);
      }
    } catch (e) {
      console.error(e.message);
    }
  }
  
  console.log('All models ready!');
}

downloadAll();
