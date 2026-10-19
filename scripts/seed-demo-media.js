// ============================================================================
// scripts/seed-demo-media.js — Attach a demo image to the first post
// ----------------------------------------------------------------------------
// Usage: node scripts/seed-demo-media.js
// Useful for visually testing the media pipeline in the browser.
// ============================================================================

const sharp = require('sharp');

const db = require('../src/database/db');
const { storeBuffer } = require('../src/media/storage');
const mediaModel = require('../src/models/media.model');

async function run() {
  const post = db.prepare('SELECT id, user_id FROM posts LIMIT 1').get();

  if (!post) {
    console.log('No posts found. Create a post first, then re-run this script.');
    process.exit(0);
  }

  console.log(`Attaching demo image to post id=${post.id} (owner=${post.user_id})...`);

  const buffer = await sharp({
    create: {
      width: 400,
      height: 300,
      channels: 3,
      background: { r: 100, g: 150, b: 200 },
    },
  })
    .webp()
    .toBuffer();

  const stored = await storeBuffer(buffer, 'webp');

  const media = mediaModel.create({
    userId: post.user_id,
    postId: post.id,
    kind: 'post_image',
    originalName: 'demo.webp',
    mimeType: 'image/webp',
    sizeBytes: buffer.length,
    width: 400,
    height: 300,
    storagePath: stored.relativePath,
    sha256: stored.sha256,
  });

  console.log(`✅ Created demo media id=${media.id}`);
  console.log(`   URL: /api/media/${media.id}`);
  console.log(`   Path: ${stored.relativePath}`);
  console.log('');
  console.log('Reload the browser to see the image attached to the post.');
}

run().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});