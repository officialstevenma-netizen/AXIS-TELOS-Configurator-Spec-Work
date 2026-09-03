import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

const viewport = document.getElementById("viewport");
const status = document.getElementById("status");
const specLength = document.getElementById("spec-length");
const buttons = [...document.querySelectorAll(".size-button")];

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe5e5e0);

const camera = new THREE.PerspectiveCamera(34, 1, 0.05, 100);
camera.position.set(7.5, -8.5, 5.5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
viewport.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 3.5;
controls.maxDistance = 18;

scene.add(new THREE.HemisphereLight(0xffffff, 0x77776f, 2.2));
const sun = new THREE.DirectionalLight(0xffffff, 3.0);
sun.position.set(6, -5, 9);
sun.castShadow = false;
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 40),
  new THREE.MeshStandardMaterial({ color: 0xd8d8d3, roughness: 0.95, side: THREE.FrontSide })
);
ground.rotation.x = -Math.PI / 2;
ground.position.z = -0.012;
scene.add(ground);

const STATES = {
  small:  { time: 3.333333283662797, length: 2.4 },
  medium: { time: 199.99999701976782, length: 4.2 },
  large:  { time: 399.99999403953564, length: 6.0 }
};

let model = null;
let mixer = null;
let actions = [];
let revealMeshes = [];
let currentTime = STATES.small.time;
let targetTime = STATES.small.time;

const SOURCE_PREFIX = "SOURCE_";
const THIN_NAME_HINTS = [
  "carpet", "rug", "curtain", "blind", "shade", "leaf", "leaves", "paper"
];

function materialList(object) {
  if (!object.material) return [];
  return Array.isArray(object.material) ? object.material : [object.material];
}

function isRepeatedPart(object) {
  return object.name.startsWith("Wall_Left_") ||
    object.name.startsWith("Wall_Right_") ||
    object.name.startsWith("Crossmember_");
}

function isThinMesh(object) {
  const names = `${object.name} ${materialList(object).map(m => m?.name || "").join(" ")}`.toLowerCase();
  return THIN_NAME_HINTS.some(hint => names.includes(hint));
}

function trackTargetName(trackName) {
  return trackName.replace(/\.(position|quaternion|scale|morphTargetInfluences)(\[\d+\])?$/, "");
}

function buildAnimationIndex(gltf) {
  const animatedNodes = new Set();
  const scaleControllers = new Set();

  for (const clip of gltf.animations) {
    for (const track of clip.tracks) {
      const target = trackTargetName(track.name);
      if (!target || target === track.name) continue;
      animatedNodes.add(target);
      if (/\.scale(\[\d+\])?$/.test(track.name)) scaleControllers.add(target);
    }
  }

  return { animatedNodes, scaleControllers };
}

function nearlyZeroScale(object) {
  return Math.max(Math.abs(object.scale.x), Math.abs(object.scale.y), Math.abs(object.scale.z)) < 0.01;
}

/*
  Blender can export descendants of an Empty that is keyed to exactly zero scale
  with zero local scale and a huge inverse parent offset. The controller's own
  animation is valid, but the child rest transforms are no longer useful.

  In this asset the affected furniture was authored with common origins, so the
  mesh geometry already contains the component offsets. Restoring descendants to
  unit scale and clearing only obviously corrupted large local offsets recreates
  the intended assembly while leaving the Empty's 0 to 1 animation untouched.
*/
function repairZeroScaleControllerHierarchies(gltf) {
  const { animatedNodes, scaleControllers } = buildAnimationIndex(gltf);
  const repaired = [];

  for (const controllerName of scaleControllers) {
    const controller = model.getObjectByName(controllerName);
    if (!controller || controller.children.length === 0) continue;
    if (!nearlyZeroScale(controller)) continue;

    controller.traverse(child => {
      if (child === controller) return;
      if (animatedNodes.has(child.name)) return;
      if (!nearlyZeroScale(child)) return;

      const before = {
        position: child.position.toArray(),
        scale: child.scale.toArray()
      };

      child.scale.set(1, 1, 1);

      /* Broken parent inverse offsets in this GLB are 4 m, 16/32 m or 64 m. */
      if (child.position.length() > 2.0) {
        child.position.set(0, 0, 0);
      }

      child.updateMatrix();
      child.updateMatrixWorld(true);

      repaired.push({
        controller: controllerName,
        child: child.name,
        before,
        after: {
          position: child.position.toArray(),
          scale: child.scale.toArray()
        }
      });
    });
  }

  console.info("TELOS repaired zero scale hierarchies", repaired);
}

function textureSourceIndex(json, textureIndex) {
  const textureDef = json.textures?.[textureIndex];
  if (!textureDef) return undefined;
  if (textureDef.source !== undefined) return textureDef.source;

  const extensions = textureDef.extensions || {};
  return extensions.KHR_texture_basisu?.source ??
    extensions.EXT_texture_webp?.source ??
    extensions.EXT_texture_avif?.source;
}

function textureImageName(parser, textureIndex) {
  if (textureIndex === undefined) return "";
  const sourceIndex = textureSourceIndex(parser.json, textureIndex);
  const imageDef = sourceIndex !== undefined ? parser.json.images?.[sourceIndex] : null;
  return String(imageDef?.name || imageDef?.uri || "").toLowerCase();
}

function looksNormal(name) {
  return /(^|[_ .-])(normal|norm|nor|bump)([_ .-]|$)/i.test(name);
}

function looksColour(name) {
  return /(albedo|base.?color|base.?colour|diffuse|color|colour)/i.test(name);
}

async function getTexture(parser, index, colorSpace) {
  if (index === undefined) return null;
  const texture = await parser.getDependency("texture", index);
  if (!texture) return null;
  texture.colorSpace = colorSpace;
  texture.flipY = false;
  texture.needsUpdate = true;
  return texture;
}

/*
  Restore texture slots from the actual glTF material definitions instead of
  guessing from whatever Three.js material state happened to arrive. If an
  optimisation pass ever swapped an obvious normal and albedo source, repair
  that pair by inspecting the image names in the GLB JSON.
*/
async function restoreCanonicalMaterialTextures(gltf) {
  const parser = gltf.parser;
  const jobs = [];
  const diagnostics = [];
  const seen = new Set();

  model.traverse(object => {
    if (!object.isMesh) return;

    for (const material of materialList(object)) {
      if (!material || seen.has(material)) continue;
      seen.add(material);

      jobs.push((async () => {
        const association = parser.associations?.get(material);
        const materialIndex = association?.materials;
        const materialDef = materialIndex !== undefined ? parser.json.materials?.[materialIndex] : null;
        if (!materialDef) return;

        const pbr = materialDef.pbrMetallicRoughness || {};
        let baseIndex = pbr.baseColorTexture?.index;
        let normalIndex = materialDef.normalTexture?.index;

        const baseName = textureImageName(parser, baseIndex);
        const normalName = textureImageName(parser, normalIndex);

        if (baseIndex !== undefined && normalIndex !== undefined && looksNormal(baseName) && looksColour(normalName)) {
          [baseIndex, normalIndex] = [normalIndex, baseIndex];
        }

        const [baseMap, normalMap, metalRoughMap, aoMap, emissiveMap] = await Promise.all([
          getTexture(parser, baseIndex, THREE.SRGBColorSpace),
          getTexture(parser, normalIndex, THREE.NoColorSpace),
          getTexture(parser, pbr.metallicRoughnessTexture?.index, THREE.NoColorSpace),
          getTexture(parser, materialDef.occlusionTexture?.index, THREE.NoColorSpace),
          getTexture(parser, materialDef.emissiveTexture?.index, THREE.SRGBColorSpace)
        ]);

        if (baseIndex !== undefined) material.map = baseMap;
        if (normalIndex !== undefined) material.normalMap = normalMap;
        if (pbr.metallicRoughnessTexture?.index !== undefined) {
          material.metalnessMap = metalRoughMap;
          material.roughnessMap = metalRoughMap;
        }
        if (materialDef.occlusionTexture?.index !== undefined) material.aoMap = aoMap;
        if (materialDef.emissiveTexture?.index !== undefined) material.emissiveMap = emissiveMap;

        material.needsUpdate = true;

        diagnostics.push({
          material: material.name,
          materialIndex,
          baseImage: textureImageName(parser, baseIndex),
          normalImage: textureImageName(parser, normalIndex),
          metalRoughImage: textureImageName(parser, pbr.metallicRoughnessTexture?.index)
        });
      })());
    }
  });

  await Promise.all(jobs);
  console.info("TELOS canonical material textures", diagnostics);
}

function prepareModel(root) {
  revealMeshes = [];
  const hiddenSources = [];

  root.traverse(object => {
    if (object.name.startsWith(SOURCE_PREFIX)) {
      object.visible = false;
      hiddenSources.push(object.name);
      return;
    }

    object.visible = true;
    if (!object.isMesh) return;

    const thin = isThinMesh(object);
    for (const material of materialList(object)) {
      if (!material) continue;
      material.side = thin ? THREE.DoubleSide : THREE.FrontSide;
      material.needsUpdate = true;
    }

    if (isRepeatedPart(object)) revealMeshes.push(object);
  });

  console.info("TELOS hidden source meshes", hiddenSources);
}

function updateRevealVisibility() {
  for (const object of revealMeshes) {
    object.visible = object.scale.y > 0.015;
  }
}

function seekAbsoluteTime(time) {
  if (!mixer) return;

  for (const { clip, action } of actions) {
    action.time = THREE.MathUtils.clamp(time, 0, clip.duration);
  }

  mixer.update(0);
  updateRevealVisibility();
}

function fitCamera(root) {
  const bounds = new THREE.Box3().setFromObject(root);
  const centre = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const longest = Math.max(size.x, size.y, size.z);

  controls.target.copy(centre);
  camera.position.set(
    centre.x + longest * 1.05,
    centre.y - longest * 1.30,
    centre.z + longest * 0.75
  );
  camera.near = Math.max(longest / 1000, 0.01);
  camera.far = longest * 20;
  camera.updateProjectionMatrix();
}

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

const MODEL_URL = `./telos.glb?model-rev=20260903-hierarchy-texture-repair`;

loader.load(
  MODEL_URL,
  async gltf => {
    model = gltf.scene;
    scene.add(model);

    /* Repair exporter damage before animation playback. */
    repairZeroScaleControllerHierarchies(gltf);

    /* Rebind PBR texture slots from the GLB's canonical material definitions. */
    await restoreCanonicalMaterialTextures(gltf);

    prepareModel(model);

    mixer = new THREE.AnimationMixer(model);
    actions = gltf.animations.map(clip => {
      const action = mixer.clipAction(clip);
      action.play();
      action.paused = true;
      action.enabled = true;
      action.clampWhenFinished = true;
      action.setEffectiveWeight(1);
      return { clip, action };
    });

    seekAbsoluteTime(STATES.small.time);
    fitCamera(model);

    console.info("TELOS GLB loaded", {
      url: MODEL_URL,
      scene: gltf.scene?.name,
      scenes: gltf.scenes.map(s => s.name),
      animations: gltf.animations.map(a => a.name),
      resolvedStates: STATES
    });

    status.textContent = `${actions.length} animation clips loaded`;
    setTimeout(() => { status.hidden = true; }, 1200);
  },
  progress => {
    if (!progress.total) return;
    const percent = Math.round((progress.loaded / progress.total) * 100);
    status.textContent = `Loading model ${percent}%`;
  },
  error => {
    console.error("TELOS GLB load failed", error);
    const message = error?.message || String(error);
    status.hidden = false;
    status.textContent = `GLB error: ${message}`;
  }
);

buttons.forEach(button => {
  button.addEventListener("click", () => {
    const state = STATES[button.dataset.size];
    if (!state) return;

    targetTime = state.time;
    specLength.textContent = `${state.length.toFixed(1)} m`;
    buttons.forEach(item => item.classList.toggle("active", item === button));
  });
});

function resize() {
  const width = Math.max(1, viewport.clientWidth);
  const height = Math.max(1, viewport.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

window.addEventListener("resize", resize);
resize();

let previousTime = performance.now();
function render(now) {
  requestAnimationFrame(render);

  const dt = Math.min((now - previousTime) / 1000, 0.05);
  previousTime = now;

  const difference = targetTime - currentTime;
  if (Math.abs(difference) > 0.0001) {
    const alpha = 1 - Math.exp(-4.2 * dt);
    currentTime += difference * alpha;

    if (Math.abs(targetTime - currentTime) < 0.01) currentTime = targetTime;
    seekAbsoluteTime(currentTime);
  }

  controls.update();
  renderer.render(scene, camera);
}

requestAnimationFrame(render);
