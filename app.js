import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const viewport = document.getElementById("viewport");
const status = document.getElementById("status");
const specLength = document.getElementById("spec-length");
const sizeButtons = [...document.querySelectorAll(".size-button")];
const floorButtons = [...document.querySelectorAll("[data-floor]")];
const wallButtons = [...document.querySelectorAll("[data-wall]")];

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(34, 1, 0.05, 100);
camera.position.set(7.5, -8.5, 5.5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
viewport.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 3.5;
controls.maxDistance = 18;

/* Soft daylight studio environment for flattering product reflections. */
const pmrem = new THREE.PMREMGenerator(renderer);
const roomEnvironment = new RoomEnvironment();
scene.environment = pmrem.fromScene(roomEnvironment, 0.04).texture;
roomEnvironment.dispose();
pmrem.dispose();

function createSkyTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");

  const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
  sky.addColorStop(0.00, "#aebdd0");
  sky.addColorStop(0.42, "#d8dee2");
  sky.addColorStop(0.68, "#eee9df");
  sky.addColorStop(1.00, "#d7d0c6");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const glow = ctx.createRadialGradient(
    canvas.width * 0.72,
    canvas.height * 0.43,
    0,
    canvas.width * 0.72,
    canvas.height * 0.43,
    canvas.width * 0.28
  );
  glow.addColorStop(0, "rgba(255,246,224,0.34)");
  glow.addColorStop(1, "rgba(255,246,224,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

scene.background = createSkyTexture();

const hemi = new THREE.HemisphereLight(0xf7fbff, 0x777066, 1.6);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff6e8, 2.5);
sun.position.set(6, 9, 4);
sun.castShadow = true;
sun.shadow.mapSize.set(1536, 1536);
sun.shadow.camera.left = -8;
sun.shadow.camera.right = 8;
sun.shadow.camera.top = 8;
sun.shadow.camera.bottom = -8;
sun.shadow.camera.near = 0.1;
sun.shadow.camera.far = 30;
sun.shadow.bias = -0.00015;
sun.shadow.normalBias = 0.025;
scene.add(sun);

/* True shadow catcher: invisible surface, visible contact shadow only. */
const shadowCatcher = new THREE.Mesh(
  new THREE.PlaneGeometry(30, 30),
  new THREE.ShadowMaterial({
    color: 0x000000,
    opacity: 0.18,
    transparent: true,
    depthWrite: false
  })
);
shadowCatcher.rotation.x = -Math.PI / 2;
shadowCatcher.receiveShadow = true;
scene.add(shadowCatcher);

const STATES = {
  small:  { time: 3.333333283662797, length: 2.4 },
  medium: { time: 199.99999701976782, length: 4.2 },
  large:  { time: 399.99999403953564, length: 6.0 }
};

const FLOOR_VARIANTS = {
  "smoked-walnut":    { color: 0x6f4b32, roughness: 0.48 },
  "natural-oak":      { color: 0xb88a5a, roughness: 0.46 },
  "honey-ash":        { color: 0xc99655, roughness: 0.45 },
  "nordic-oak":       { color: 0xd7c09b, roughness: 0.50 },
  "blackened-timber": { color: 0x37322f, roughness: 0.42 }
};

const WALL_VARIANTS = {
  "gallery-white":  { color: 0xf1efe9, roughness: 0.66 },
  "warm-limestone": { color: 0xd6c2a3, roughness: 0.68 },
  "soft-concrete":  { color: 0xb0aea8, roughness: 0.70 },
  "graphite":       { color: 0x5d5c59, roughness: 0.64 },
  "sage-mineral":   { color: 0xa3ac9d, roughness: 0.69 }
};

let selectedFloor = "smoked-walnut";
let selectedWall = "soft-concrete";

let model = null;
let mixer = null;
let actions = [];
let revealMeshes = [];
let floorMaterial = null;
let wallMaterial = null;
let carpetMaterial = null;
let currentTime = STATES.small.time;
let targetTime = STATES.small.time;

const THIN_NAME_HINTS = [
  "carpet",
  "rug",
  "curtain",
  "blind",
  "shade",
  "leaf",
  "leaves",
  "paper"
];

function materialList(object) {
  if (!object.material) return [];
  return Array.isArray(object.material) ? object.material : [object.material];
}

function isThinMesh(object) {
  const text = `${object.name} ${materialList(object).map(m => m?.name || "").join(" ")}`.toLowerCase();
  return THIN_NAME_HINTS.some(hint => text.includes(hint));
}

function isRepeatedPart(object) {
  return object.name.startsWith("Wall_Left_") ||
    object.name.startsWith("Wall_Right_") ||
    object.name.startsWith("Crossmember_");
}

function collectNamedMaterials(root) {
  const map = new Map();

  root.traverse(object => {
    if (!object.isMesh) return;

    for (const material of materialList(object)) {
      if (!material?.name || map.has(material.name)) continue;
      map.set(material.name, material);
    }
  });

  return map;
}

function prepareModel(root) {
  revealMeshes = [];

  root.traverse(object => {
    if (object.name.startsWith("SOURCE_")) {
      object.visible = false;
      object.castShadow = false;
      return;
    }

    if (!object.isMesh) return;

    const thin = isThinMesh(object);
    const mats = materialList(object);

    for (const material of mats) {
      if (!material) continue;
      material.side = thin ? THREE.DoubleSide : THREE.FrontSide;
      material.needsUpdate = true;
    }

    const transparent = mats.some(material =>
      (material?.transparent && material.opacity < 0.55) ||
      (material?.transmission || 0) > 0.1
    );

    object.castShadow = !transparent;
    object.receiveShadow = true;

    if (isRepeatedPart(object)) revealMeshes.push(object);
  });
}

function updateRevealVisibility() {
  for (const object of revealMeshes) {
    const grown = Math.abs(object.scale.y) > 0.02;
    object.visible = grown;
    object.castShadow = grown;
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

function textureSourceIndex(json, textureIndex) {
  const texture = json.textures?.[textureIndex];
  if (!texture) return undefined;
  if (texture.source !== undefined) return texture.source;

  return texture.extensions?.KHR_texture_basisu?.source ??
    texture.extensions?.EXT_texture_webp?.source ??
    texture.extensions?.EXT_texture_avif?.source;
}

function imageNameForTexture(parser, textureIndex) {
  if (textureIndex === undefined) return "";
  const imageIndex = textureSourceIndex(parser.json, textureIndex);
  if (imageIndex === undefined) return "";
  return String(parser.json.images?.[imageIndex]?.name || "").toLowerCase();
}

function findTextureByImageName(parser, matcher) {
  const images = parser.json.images || [];
  const textures = parser.json.textures || [];

  const imageIndex = images.findIndex(image => matcher(String(image.name || "").toLowerCase()));
  if (imageIndex < 0) return undefined;

  return textures.findIndex((texture, textureIndex) => {
    const source = textureSourceIndex(parser.json, textureIndex);
    return source === imageIndex;
  });
}

/* Keep the very narrow couch fix. Everything else stays as GLTFLoader authored it. */
async function repairBrokenBaseColourAssignments(gltf) {
  const parser = gltf.parser;
  const seen = new Set();

  const meshes = [];
  model.traverse(child => { if (child.isMesh) meshes.push(child); });

  for (const object of meshes) {
    for (const material of materialList(object)) {
      if (!material || seen.has(material)) continue;
      seen.add(material);

      const association = parser.associations?.get(material);
      const materialIndex = association?.materials;
      if (materialIndex === undefined) continue;

      const materialDef = parser.json.materials?.[materialIndex];
      const baseTextureIndex = materialDef?.pbrMetallicRoughness?.baseColorTexture?.index;
      if (baseTextureIndex === undefined) continue;

      const baseImageName = imageNameForTexture(parser, baseTextureIndex);
      const obviouslyTechnical = /(normal|roughness|metallic|occlusion|\bao\b|bump)/i.test(baseImageName);
      if (!obviouslyTechnical) continue;

      const materialName = String(material.name || materialDef?.name || "").toLowerCase();
      if (!materialName.includes("fabric 131")) continue;

      const replacementTextureIndex = findTextureByImageName(
        parser,
        name => name.includes("fabric_131") && /(albedo|diffuse|base.?color|base.?colour)/i.test(name)
      );

      if (replacementTextureIndex === undefined || replacementTextureIndex < 0) continue;

      const replacement = await parser.getDependency("texture", replacementTextureIndex);
      if (!replacement) continue;

      replacement.colorSpace = THREE.SRGBColorSpace;
      replacement.flipY = false;
      replacement.needsUpdate = true;
      material.map = replacement;
      material.needsUpdate = true;
    }
  }
}

function applyCarpetGrayscale(material) {
  if (!material || material.userData.telosGrayscaleApplied) return;

  const previous = material.onBeforeCompile;
  material.onBeforeCompile = shader => {
    if (previous) previous(shader);

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `#include <map_fragment>
       float telosCarpetGray = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
       diffuseColor.rgb = vec3(telosCarpetGray);`
    );
  };

  material.customProgramCacheKey = () => "telos-carpet-grayscale-v1";
  material.color.set(0xffffff);
  material.needsUpdate = true;
  material.userData.telosGrayscaleApplied = true;
}

function applyFloorVariant(key) {
  selectedFloor = key;
  const variant = FLOOR_VARIANTS[key];
  if (!variant || !floorMaterial) return;

  /*
    The exported floor shader is ideal for tinting: its base map is the
    grayscale floorboards_displacement texture, with bump_wood_05k as normal
    detail and wood-smooth-10_spec driving surface response. Tinting the
    grayscale base retains the grain while giving us believable colourways.
  */
  floorMaterial.color.setHex(variant.color);
  floorMaterial.metalness = 0.0;
  floorMaterial.roughness = variant.roughness;
  if (floorMaterial.normalScale) floorMaterial.normalScale.set(0.55, 0.55);
  floorMaterial.needsUpdate = true;
}

function applyWallVariant(key) {
  selectedWall = key;
  const variant = WALL_VARIANTS[key];
  if (!variant || !wallMaterial) return;

  wallMaterial.color.setHex(variant.color);
  wallMaterial.metalness = 0.0;
  wallMaterial.roughness = variant.roughness;
  wallMaterial.needsUpdate = true;
}

function updateFinishButtons(buttons, attribute, selected) {
  for (const button of buttons) {
    button.classList.toggle("active", button.dataset[attribute] === selected);
  }
}

function fitCamera(root) {
  const bounds = new THREE.Box3().setFromObject(root);
  const centre = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const longest = Math.max(size.x, size.y, size.z);

  controls.target.copy(centre);
  camera.position.set(
    centre.x + longest * 1.05,
    centre.y + longest * 0.68,
    centre.z + longest * 1.20
  );

  camera.near = Math.max(longest / 1000, 0.01);
  camera.far = longest * 20;
  camera.updateProjectionMatrix();

  shadowCatcher.position.y = bounds.min.y - 0.006;
}

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

const MODEL_URL = `./telos.glb?model-rev=20260903-aesthetics-v1`;

loader.load(
  MODEL_URL,
  async gltf => {
    model = gltf.scene;
    scene.add(model);

    prepareModel(model);
    await repairBrokenBaseColourAssignments(gltf);

    const materials = collectNamedMaterials(model);
    floorMaterial = materials.get("Wood Floor Dark Walnut") || null;
    wallMaterial = materials.get("Concrete wall") || null;
    carpetMaterial = materials.get("Carpet") || null;

    if (carpetMaterial) applyCarpetGrayscale(carpetMaterial);
    applyFloorVariant(selectedFloor);
    applyWallVariant(selectedWall);

    console.info("TELOS material targets", {
      floor: floorMaterial ? {
        name: floorMaterial.name,
        map: floorMaterial.map?.name,
        normalMap: floorMaterial.normalMap?.name,
        roughnessMap: floorMaterial.roughnessMap?.name
      } : null,
      wall: wallMaterial?.name || null,
      carpet: carpetMaterial?.name || null
    });

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
    updateRevealVisibility();

    status.textContent = `${actions.length} animation clips loaded`;
    setTimeout(() => { status.hidden = true; }, 1000);
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

sizeButtons.forEach(button => {
  button.addEventListener("click", () => {
    const state = STATES[button.dataset.size];
    if (!state) return;

    targetTime = state.time;
    specLength.textContent = `${state.length.toFixed(1)} m`;
    sizeButtons.forEach(item => item.classList.toggle("active", item === button));
  });
});

floorButtons.forEach(button => {
  button.addEventListener("click", () => {
    applyFloorVariant(button.dataset.floor);
    updateFinishButtons(floorButtons, "floor", button.dataset.floor);
  });
});

wallButtons.forEach(button => {
  button.addEventListener("click", () => {
    applyWallVariant(button.dataset.wall);
    updateFinishButtons(wallButtons, "wall", button.dataset.wall);
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

    if (Math.abs(targetTime - currentTime) < 0.01) {
      currentTime = targetTime;
    }

    seekAbsoluteTime(currentTime);
  }

  /* Keep future corrugations and crossmembers hidden even at rest. */
  if (model) updateRevealVisibility();

  controls.update();
  renderer.render(scene, camera);
}

requestAnimationFrame(render);
