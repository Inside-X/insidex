import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import app from './src/app.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));

app.listen(PORT, () => {
  console.log(`InsideX server listening on http://localhost:${PORT}`);
});