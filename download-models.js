const fs = require('fs');
const https = require('https');
const path = require('path');

const modelsDir = path.join(__dirname, 'apps/web/public/models');
if (!fs.existsSync(modelsDir)) {
  fs.mkdirSync(modelsDir, { recursive: true });
}

// Switching to the official original weights for guaranteed compatibility
const baseUrl = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/';
const files = [
  'ssd_mobilenetv1_model-weights_manifest.json',
  'ssd_mobilenetv1_model-shard1',
  'ssd_mobilenetv1_model-shard2',
  'face_landmark_68_model-weights_manifest.json',
  'face_landmark_68_model-shard1',
  'face_recognition_model-weights_manifest.json',
  'face_recognition_model-shard1',
  'face_recognition_model-shard2'
];

files.forEach(file => {
  const dest = path.join(modelsDir, file);
  https.get(baseUrl + file, (res) => {
    if (res.statusCode !== 200) {
      console.error(`Failed to download ${file}: ${res.statusCode}`);
      return;
    }
    const fileStream = fs.createWriteStream(dest);
    res.pipe(fileStream);
    fileStream.on('finish', () => {
      fileStream.close();
      console.log('Downloaded', file);
    });
  }).on('error', (err) => {
    console.error(`Error downloading ${file}:`, err.message);
  });
});
