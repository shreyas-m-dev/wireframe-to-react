'use strict';

/**
 * Upload intake and source-image storage.
 *
 * Multer keeps the upload in memory (bounded by maxUploadBytes, one file).
 * The file type is decided by its magic bytes, never by the client's filename
 * or Content-Type. Accepted images are written under
 * DATA_DIR/uploads/<ownerId>/<jobId>.<ext> with owner-only permissions; the
 * path is server-generated, so no client input reaches the filesystem path.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { HttpError } = require('./http/errors');

const SIGNATURES = [
  { mime: 'image/png', ext: '.png', test: (b) => b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/jpeg', ext: '.jpg', test: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/webp', ext: '.webp', test: (b) => b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' },
  { mime: 'image/bmp', ext: '.bmp', test: (b) => b.length >= 2 && b[0] === 0x42 && b[1] === 0x4d },
];

function sniffImage(buffer) {
  return SIGNATURES.find((signature) => signature.test(buffer)) || null;
}

function uploadMiddleware(maxBytes) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: 1, fields: 5, fieldSize: 4096, parts: 8 },
  }).single('wireframe');
}

/** Validates an in-memory upload; returns { buffer, mime, ext, filename, sha256 }. */
function inspectUpload(file) {
  if (!file || !file.buffer?.length) throw new HttpError(400, 'file_required', "Attach a wireframe image in the 'wireframe' field.");
  const kind = sniffImage(file.buffer);
  if (!kind) throw new HttpError(415, 'unsupported_media_type', 'Unsupported file. Upload a PNG, JPEG, WebP or BMP image.');
  const base = path.basename(String(file.originalname || 'wireframe')).replace(/[^\w.\- ]+/g, '_').slice(0, 200) || 'wireframe';
  return { buffer: file.buffer, mime: kind.mime, ext: kind.ext, filename: base, sha256: crypto.createHash('sha256').update(file.buffer).digest('hex') };
}

function createBlobStore(dataDir) {
  const root = path.join(dataDir, 'uploads');
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const resolveInside = (target) => {
    const resolved = path.resolve(target);
    if (!resolved.startsWith(path.resolve(root) + path.sep)) throw new Error('blob path escapes the upload root');
    return resolved;
  };
  return {
    root,
    write(ownerId, jobId, ext, buffer) {
      const directory = path.join(root, ownerId.replace(/[^a-f0-9-]/gi, ''));
      fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
      const target = resolveInside(path.join(directory, `${jobId.replace(/[^a-f0-9-]/gi, '')}${ext}`));
      fs.writeFileSync(target, buffer, { mode: 0o600 });
      return target;
    },
    copy(sourcePath, ownerId, jobId) {
      const source = resolveInside(sourcePath);
      return this.write(ownerId, jobId, path.extname(source), fs.readFileSync(source));
    },
    read(blobPath) {
      return fs.readFileSync(resolveInside(blobPath));
    },
    exists(blobPath) {
      try { return fs.statSync(resolveInside(blobPath)).isFile(); } catch { return false; }
    },
    remove(blobPath) {
      if (!blobPath) return;
      try { fs.rmSync(resolveInside(blobPath), { force: true }); } catch { /* already gone or outside root: nothing to remove */ }
    },
  };
}

module.exports = { sniffImage, uploadMiddleware, inspectUpload, createBlobStore };
