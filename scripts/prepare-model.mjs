// Optimize a downloaded model for the app and list its parts.
//
//   npm run prepare-model -- models-src/trumpet.glb trumpet
//
// Writes public/models/<model>.glb (meshopt-compressed, which three.js decodes without extra
// files) and prints every node/mesh so keys can be mapped in <model>.parts.json.
// Nodes are kept separate on purpose: valves and key cups must stay individual parts.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, quantize, meshopt } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';

const [src, model] = process.argv.slice(2);
if (!src || !model) {
  console.error('Usage: npm run prepare-model -- <input.glb|.gltf> <model id, e.g. trumpet>');
  process.exit(1);
}

await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
    'draco3d.encoder': await draco3d.createEncoderModule(),
    'meshopt.encoder': MeshoptEncoder,
    'meshopt.decoder': MeshoptDecoder,
  });

const doc = await io.read(src);
// Remove Draco so meshopt can take over.
doc.getRoot().listExtensionsUsed()
  .filter((e) => e.extensionName === 'KHR_draco_mesh_compression')
  .forEach((e) => e.dispose());

await doc.transform(dedup(), prune(), weld(), quantize(), meshopt({ encoder: MeshoptEncoder }));
const out = `public/models/${model}.glb`;
await io.write(out, doc);

console.log(`Wrote ${out}\n\nNodes (use these names in public/models/${model}.parts.json):`);
for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh();
  if (!mesh && !node.listChildren().length) continue;
  const tris = mesh?.listPrimitives().reduce((n, p) => n + (p.getIndices()?.getCount() ?? 0) / 3, 0);
  console.log(`  ${node.getName() || '(unnamed)'}${mesh ? `  [mesh, ${tris} tris]` : ''}`);
}
