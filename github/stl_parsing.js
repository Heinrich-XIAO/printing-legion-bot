import { fileURLToPath } from "url";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import occtimportjs from "occt-import-js";

let occtPromise;

function getOCCT() {
  if (!occtPromise) {
    occtPromise = occtimportjs();
  }

  return occtPromise;
}

async function getSTLFiles(repoUrl) {
  const url = new URL(repoUrl);

  const [owner, repo] = url.pathname
    .replace(/^\/|\/$/g, "")
    .split("/");

  const repoInfo = await fetch(
    `https://api.github.com/repos/${owner}/${repo}`
  ).then(r => r.json());

  const branch = repoInfo.default_branch;

  const tree = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`
  ).then(r => r.json());

  if (!tree.tree) {
    throw new Error(JSON.stringify(tree));
  }

  return tree.tree
    .filter(file =>
      file.type === "blob" &&
      ["stl", "step"].some(ext => file.path.toLowerCase().endsWith(`.${ext}`))
    );
}

async function parseSTLDimensions(buffer) {
  const loader = new STLLoader();
  // console.log(buffer)
  const geometry = loader.parse(buffer);
  geometry.computeBoundingBox();
  const boundingBox = geometry.boundingBox;
  const dimensions = {
    width: boundingBox.max.x - boundingBox.min.x,
    height: boundingBox.max.y - boundingBox.min.y,
    depth: boundingBox.max.z - boundingBox.min.z
  };
  return dimensions;
}

async function parseRepoInfo(repoUrl) {
  const url = new URL(repoUrl);
  const [owner, repo] = url.pathname
    .replace(/^\/|\/$/g, "")
    .split("/");

  const repoInfo = await fetch(
    `https://api.github.com/repos/${owner}/${repo}`
  ).then(r => r.json());

  const branch = repoInfo.default_branch;

  return { owner, repo, branch };
}

export async function get3DFileDimentions(repoUrl) {
  const stlFiles = await getSTLFiles(repoUrl);
  const { owner, repo, branch } = await parseRepoInfo(repoUrl);
  return await Promise.all(
    stlFiles.map(async (file) => {
      const fileUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${file.path}`;
      const bufferFetch = await fetch(fileUrl);
      const buffer = await bufferFetch.arrayBuffer();
      // console.log(buffer)
      if (file.path.toLowerCase().endsWith(".stl")) {
        const dimensions = await parseSTLDimensions(buffer);
        return {
          path: file.path,
          dimensions
        };
      }
      if (file.path.toLowerCase().endsWith(".step")) {
        const occt = await getOCCT();
        const fileBuffer = new Uint8Array(buffer);

        // console.log(buffer.constructor.name);
        // console.log(buffer instanceof Buffer);
        // console.log(buffer instanceof Uint8Array);
        // console.log(buffer instanceof ArrayBuffer);
        // console.log({
        //   bytes: fileBuffer.byteLength,
        //   first: new TextDecoder().decode(fileBuffer.slice(0, 80)),
        //   last: new TextDecoder().decode(fileBuffer.slice(-80)),
        // });


        const result = occt.ReadStepFile(fileBuffer, {
          linearUnit: "millimeter",
          linearDeflectionType: "bounding_box_ratio",
          linearDeflection: 0.01,
          angularDeflection: 0.5,
        });
        // const result = occt.ReadStepFile(fileBuffer, null);

        if (!result.success) {
          throw new Error(`Failed to parse STEP file: ${file.path}`);
        }

        let minX = Infinity;
        let minY = Infinity;
        let minZ = Infinity;

        let maxX = -Infinity;
        let maxY = -Infinity;
        let maxZ = -Infinity;

        for (const mesh of result.meshes) {
          const positions = mesh.attributes.position.array;

          // positions is [x, y, z, x, y, z, ...]
          for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i];
            const y = positions[i + 1];
            const z = positions[i + 2];

            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            minZ = Math.min(minZ, z);

            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
            maxZ = Math.max(maxZ, z);
          }
        }

        if (!Number.isFinite(minX)) {
          throw new Error(`STEP file contains no geometry: ${file.path}`);
        }

        return {
          file_name: file.path,
          dimensions: {
            w: maxX - minX,
            h: maxY - minY,
            d: maxZ - minZ,
          },
        };

      }
    }));
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const repoUrl = process.argv[2];
  const dimensions = await get3DFileDimentions(repoUrl);
  console.log(dimensions)
}