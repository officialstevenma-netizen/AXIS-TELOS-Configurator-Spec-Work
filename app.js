import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { SSAOPass } from "three/addons/postprocessing/SSAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const viewport = document.getElementById("viewport");
const status = document.getElementById("status");
const specLength = document.getElementById("spec-length");
const resetViewButton = document.getElementById("reset-view");
const sizeButtons = [...document.querySelectorAll(".size-button")];
const floorButtons = [...document.querySelectorAll("[data-floor]")];
const wallButtons = [...document.querySelectorAll("[data-wall]")];

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(34, 1, 0.05, 100);

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

const composer = new EffectComposer(renderer);
composer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
const renderPass = new RenderPass(scene, camera);
const ssaoPass = new SSAOPass(scene, camera, 1, 1);
ssaoPass.kernelRadius = 5;
ssaoPass.minDistance = 0.002;
ssaoPass.maxDistance = 0.075;
ssaoPass.output = SSAOPass.OUTPUT.Default;
const outputPass = new OutputPass();
composer.addPass(renderPass);
composer.addPass(ssaoPass);
composer.addPass(outputPass);

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
  sky.addColorStop(0.00, "#9fabb9");
  sky.addColorStop(0.42, "#cfd6da");
  sky.addColorStop(0.72, "#ece7dd");
  sky.addColorStop(1.00, "#d3cbc0");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const glow = ctx.createRadialGradient(
    canvas.width * 0.70,
    canvas.height * 0.42,
    0,
    canvas.width * 0.70,
    canvas.height * 0.42,
    canvas.width * 0.30
  );
  glow.addColorStop(0, "rgba(255,247,226,0.40)");
  glow.addColorStop(1, "rgba(255,247,226,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

scene.background = createSkyTexture();

const hemi = new THREE.HemisphereLight(0xf8fbff, 0x777066, 1.55);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff6e8, 2.35);
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
sun.shadow.normalBias = 0.02;
scene.add(sun);

const shadowCatcher = new THREE.Mesh(
  new THREE.PlaneGeometry(30, 30),
  new THREE.ShadowMaterial({
    color: 0x000000,
    opacity: 0.19,
    transparent: true,
    depthWrite: false
  })
);
shadowCatcher.rotation.x = -Math.PI / 2;
shadowCatcher.receiveShadow = true;
scene.add(shadowCatcher);

const STATES = {
  small:  { time: 3.333333283662797, length: 2.4, wallCount: 12, crossCount: 7 },
  medium: { time: 199.99999701976782, length: 4.2, wallCount: 22, crossCount: 11 },
  large:  { time: 399.99999403953564, length: 6.0, wallCount: 32, crossCount: 16 }
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

const DEFAULT_CAMERA_TARGET_OFFSET = new THREE.Vector3(0, -0.75, 0);
const CAMERA_LOCAL_DIRECTION = new THREE.Vector3(1.0, 0.30, 1.0).normalize();
const cameraTargetOffset = DEFAULT_CAMERA_TARGET_OFFSET.clone();

let selectedFloor = "smoked-walnut";
let selectedWall = "soft-concrete";
let model = null;
let mixer = null;
let actions = [];
let currentTime = STATES.small.time;
let targetTime = STATES.small.time;
let autoCenterDuringTransition = false;
let floorMaterial = null;
let wallMaterial = null;
let carpetMaterial = null;
let wallInstances = null;
let crossInstances = null;
let wallInstanceData = [];
let crossInstanceData = [];
let fallbackRepeatedMeshes = [];
let furnitureFadeTargets = [];
let cameraResetTween = null;

const materialTweens = new Map();
const tempMatrix = new THREE.Matrix4();
const tempPosition = new THREE.Vector3();
const tempQuaternion = new THREE.Quaternion();
const tempScale = new THREE.Vector3();
const tempScale2 = new THREE.Vector3();

const THIN_NAME_HINTS = [
  "carpet", "rug", "curtain", "blind", "shade", "leaf", "leaves", "paper"
];

const CABIN_MESH_NAMES = new Set([
  "Far_Bottom_Rail", "Far_Top_Rail", "Moving_Bottom_Rail", "Moving_Top_Rail",
  "Post_Far_Left", "Post_Far_Right", "Post_Moving_Left", "Post_Moving_Right",
  "Rail_Bottom_Left", "Rail_Bottom_Right", "Rail_Top_Left", "Rail_Top_Right",
  "Far_End_Wall", "Moving_End_Wall", "Floor", "Roof"
]);

function cubicBezier(p1x, p1y, p2x, p2y) {
  const cx = 3 * p1x;
  const bx = 3 * (p2x - p1x) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * p1y;
  const by = 3 * (p2y - p1y) - cy;
  const ay = 1 - cy - by;

  const sampleX = t => ((ax * t + bx) * t + cx) * t;
  const sampleY = t => ((ay * t + by) * t + cy) * t;
  const sampleDerivativeX = t => (3 * ax * t + 2 * bx) * t + cx;

  function solveX(x) {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const error = sampleX(t) - x;
      const derivative = sampleDerivativeX(t);
      if (Math.abs(error) < 1e-6) return t;
      if (Math.abs(derivative) < 1e-6) break;
      t -= error / derivative;
    }

    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 12; i++) {
      const value = sampleX(t);
      if (Math.abs(value - x) < 1e-6) break;
      if (value < x) lo = t;
      else hi = t;
      t = (lo + hi) * 0.5;
    }
    return t;
  }

  return x => sampleY(solveX(THREE.MathUtils.clamp(x, 0, 1)));
}

const polishEase = cubicBezier(0.4, 0.0, 0.2, 1.0);

function materialList(object) {
  if (!object.material) return [];
  return Array.isArray(object.material) ? object.material : [object.material];
}

function isThinMesh(object) {
  const text = `${object.name} ${materialList(object).map(m => m?.name || "").join(" ")}`.toLowerCase();
  return THIN_NAME_HINTS.some(hint => text.includes(hint));
}

function isFallbackRepeatedPart(object) {
  return object.name.startsWith("Wall_Left_") ||
    object.name.startsWith("Wall_Right_") ||
    object.name.startsWith("Crossmember_");
}

function isInsideContainer(object) {
  let current = object;
  while (current) {
    if (current.name === "CONTAINER_MOCKUP") return true;
    current = current.parent;
  }
  return false;
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

function captureInstanceData(mesh, type) {
  const records = [];
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, tempMatrix);
    tempMatrix.decompose(tempPosition, tempQuaternion, tempScale);
    records.push({
      position: tempPosition.clone(),
      quaternion: tempQuaternion.clone(),
      fullScale: new THREE.Vector3(
        Math.abs(tempScale.x) > 0.00001 ? Math.abs(tempScale.x) : 1,
        Math.abs(tempScale.y) > 0.00001 ? Math.abs(tempScale.y) : 1,
        1
      ),
      localIndex: type === "wall" ? i % Math.max(1, Math.round(mesh.count / 2)) : i
    });
  }
  return records;
}

function prepareModel(root) {
  wallInstances = null;
  crossInstances = null;
  wallInstanceData = [];
  crossInstanceData = [];
  fallbackRepeatedMeshes = [];

  root.traverse(object => {
    if (object.name.startsWith("SOURCE_")) {
      object.visible = false;
      object.castShadow = false;
      return;
    }

    if (!object.isMesh) return;

    const thin = isThinMesh(object);
    for (const material of materialList(object)) {
      if (!material) continue;
      material.side = thin ? THREE.DoubleSide : THREE.FrontSide;
      material.needsUpdate = true;
    }

    const transparent = materialList(object).some(material =>
      (material?.transparent && material.opacity < 0.55) ||
      (material?.transmission || 0) > 0.1
    );

    object.castShadow = !transparent;
    object.receiveShadow = true;

    if (object.isInstancedMesh && object.name === "02_WALL_INSTANCES") {
      wallInstances = object;
      wallInstanceData = captureInstanceData(object, "wall");
      object.castShadow = true;
    } else if (object.isInstancedMesh && object.name === "04_CROSSMEMBER_INSTANCES") {
      crossInstances = object;
      crossInstanceData = captureInstanceData(object, "cross");
      object.castShadow = true;
    } else if (isFallbackRepeatedPart(object)) {
      fallbackRepeatedMeshes.push(object);
    }
  });
}

function smooth01(value) {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function interpolateStateValue(time, key) {
  const s = STATES.small;
  const m = STATES.medium;
  const l = STATES.large;

  if (time <= m.time) {
    const t = THREE.MathUtils.clamp((time - s.time) / (m.time - s.time), 0, 1);
    return THREE.MathUtils.lerp(s[key], m[key], t);
  }

  const t = THREE.MathUtils.clamp((time - m.time) / (l.time - m.time), 0, 1);
  return THREE.MathUtils.lerp(m[key], l[key], t);
}

function updateInstancedGrowth(mesh, data, targetCount) {
  if (!mesh || data.length === 0) return;

  for (let i = 0; i < data.length; i++) {
    const record = data[i];
    const growth = smooth01(targetCount - record.localIndex);
    tempScale2.copy(record.fullScale);

    if (growth <= 0.0005) tempScale2.set(0, 0, 0);
    else tempScale2.z *= growth;

    tempMatrix.compose(record.position, record.quaternion, tempScale2);
    mesh.setMatrixAt(i, tempMatrix);
  }

  mesh.instanceMatrix.needsUpdate = true;
}

function updateRepeatedGeometry() {
  const wallCount = interpolateStateValue(currentTime, "wallCount");
  const crossCount = interpolateStateValue(currentTime, "crossCount");
  updateInstancedGrowth(wallInstances, wallInstanceData, wallCount);
  updateInstancedGrowth(crossInstances, crossInstanceData, crossCount);

  for (const object of fallbackRepeatedMeshes) {
    const sx = Math.abs(object.scale.x);
    const sy = Math.abs(object.scale.y);
    const sz = Math.abs(object.scale.z);
    const visible = Math.min(sx, sy, sz) > 0.01;
    object.visible = visible;
    object.castShadow = visible;
  }
}

function getScaleControllerNames(gltf) {
  const names = new Set();
  for (const clip of gltf.animations) {
    for (const track of clip.tracks) {
      if (!track.name.endsWith(".scale")) continue;
      names.add(track.name.slice(0, -6));
    }
  }
  return names;
}

function cloneMaterialsForFade(object) {
  if (Array.isArray(object.material)) object.material = object.material.map(material => material.clone());
  else if (object.material) object.material = object.material.clone();

  for (const material of materialList(object)) {
    material.userData.telosBaseOpacity = material.opacity;
    material.transparent = true;
    material.needsUpdate = true;
  }
}

function buildFurnitureFadeTargets(gltf) {
  furnitureFadeTargets = [];
  const controllers = getScaleControllerNames(gltf);

  model.traverse(object => {
    if (!object.isMesh || isInsideContainer(object) || object.name.startsWith("SOURCE_")) return;

    let current = object;
    let controller = null;
    while (current && current !== model) {
      if (controllers.has(current.name)) {
        controller = current;
        break;
      }
      current = current.parent;
    }

    if (!controller) return;
    cloneMaterialsForFade(object);
    furnitureFadeTargets.push({ object, controller });
  });
}

function updateFurnitureFades() {
  for (const entry of furnitureFadeTargets) {
    const controller = entry.controller;
    const scaleValue = Math.max(
      Math.abs(controller.scale.x),
      Math.abs(controller.scale.y),
      Math.abs(controller.scale.z)
    );

    const opacity = smooth01((scaleValue - 0.015) / 0.20);
    entry.object.visible = opacity > 0.004;
    entry.object.castShadow = opacity > 0.18;

    for (const material of materialList(entry.object)) {
      const baseOpacity = material.userData.telosBaseOpacity ?? 1;
      material.opacity = baseOpacity * opacity;
    }
  }
}

function seekAbsoluteTime(time) {
  if (!mixer) return;
  for (const { clip, action } of actions) {
    action.time = THREE.MathUtils.clamp(time, 0, clip.duration);
  }
  mixer.update(0);
  updateRepeatedGeometry();
  updateFurnitureFades();
}

function applyCarpetGrayscale(material) {
  if (!material || material.userData.telosGrayscaleApplied) return;
  const previous = material.onBeforeCompile;

  material.onBeforeCompile = shader => {
    if (previous) previous(shader);
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `#include <map_fragment>\n       float telosCarpetGray = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));\n       diffuseColor.rgb = vec3(telosCarpetGray);`
    );
  };

  material.customProgramCacheKey = () => "telos-carpet-grayscale-v3";
  material.color.set(0xffffff);
  material.needsUpdate = true;
  material.userData.telosGrayscaleApplied = true;
}

function makeSofaWhite(root) {
  const names = new Set(["Sofa_BackCushion", "Sofa_Base", "Sofa_Cushion"]);
  root.traverse(object => {
    if (!object.isMesh || !names.has(object.name)) return;

    for (const material of materialList(object)) {
      if (!material) continue;
      material.map = null;
      material.color.setHex(0xf1f0ec);
      material.metalness = 0;
      material.roughness = Math.max(material.roughness ?? 0.65, 0.62);
      if (material.normalMap) {
        material.normalMap.colorSpace = THREE.NoColorSpace;
        if (material.normalScale) material.normalScale.set(0.7, 0.7);
      }
      material.needsUpdate = true;
    }
  });
}

function beginMaterialTween(material, variant) {
  if (!material || !variant) return;
  materialTweens.set(material, {
    start: performance.now(),
    duration: 620,
    startColor: material.color.clone(),
    endColor: new THREE.Color(variant.color),
    startRoughness: material.roughness,
    endRoughness: variant.roughness
  });
}

function updateMaterialTweens(now) {
  for (const [material, tween] of materialTweens) {
    const raw = THREE.MathUtils.clamp((now - tween.start) / tween.duration, 0, 1);
    const t = polishEase(raw);
    material.color.lerpColors(tween.startColor, tween.endColor, t);
    material.roughness = THREE.MathUtils.lerp(tween.startRoughness, tween.endRoughness, t);
    material.needsUpdate = true;

    if (raw >= 1) materialTweens.delete(material);
  }
}

function setFloorVariantImmediate(key) {
  selectedFloor = key;
  const variant = FLOOR_VARIANTS[key];
  if (!variant || !floorMaterial) return;
  floorMaterial.color.setHex(variant.color);
  floorMaterial.metalness = 0;
  floorMaterial.roughness = variant.roughness;
  if (floorMaterial.normalScale) floorMaterial.normalScale.set(0.55, 0.55);
  floorMaterial.needsUpdate = true;
}

function applyFloorVariant(key) {
  selectedFloor = key;
  const variant = FLOOR_VARIANTS[key];
  if (!variant || !floorMaterial) return;
  floorMaterial.metalness = 0;
  if (floorMaterial.normalScale) floorMaterial.normalScale.set(0.55, 0.55);
  beginMaterialTween(floorMaterial, variant);
}

function setWallVariantImmediate(key) {
  selectedWall = key;
  const variant = WALL_VARIANTS[key];
  if (!variant || !wallMaterial) return;
  wallMaterial.color.setHex(variant.color);
  wallMaterial.metalness = 0;
  wallMaterial.roughness = variant.roughness;
  wallMaterial.needsUpdate = true;
}

function applyWallVariant(key) {
  selectedWall = key;
  const variant = WALL_VARIANTS[key];
  if (!variant || !wallMaterial) return;
  wallMaterial.metalness = 0;
  beginMaterialTween(wallMaterial, variant);
}

function updateFinishButtons(buttons, attribute, selected) {
  for (const button of buttons) {
    button.classList.toggle("active", button.dataset[attribute] === selected);
  }
}

function computeCabinBounds() {
  const bounds = new THREE.Box3();
  bounds.makeEmpty();
  if (!model) return bounds;

  model.updateMatrixWorld(true);
  model.traverse(object => {
    if (!object.isMesh || !CABIN_MESH_NAMES.has(object.name)) return;
    bounds.expandByObject(object, true);
  });
  return bounds;
}

function cabinCentreAndSize() {
  const bounds = computeCabinBounds();
  if (bounds.isEmpty()) return null;
  return {
    bounds,
    centre: bounds.getCenter(new THREE.Vector3()),
    size: bounds.getSize(new THREE.Vector3())
  };
}

function attachShadowToCabin() {
  const cabin = cabinCentreAndSize();
  if (!cabin) return;
  shadowCatcher.position.set(
    cabin.centre.x,
    cabin.bounds.min.y - 0.003,
    cabin.centre.z
  );
}

function defaultCameraPose() {
  const cabin = cabinCentreAndSize();
  if (!cabin || !model) return null;

  const containerRoot = model.getObjectByName("CONTAINER_MOCKUP");
  if (!containerRoot) return null;

  containerRoot.updateWorldMatrix(true, false);
  const containerRotation = containerRoot.getWorldQuaternion(new THREE.Quaternion());
  const direction = CAMERA_LOCAL_DIRECTION.clone().applyQuaternion(containerRotation);
  const target = cabin.centre.clone().add(DEFAULT_CAMERA_TARGET_OFFSET);
  const sphere = cabin.bounds.getBoundingSphere(new THREE.Sphere());

  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
  const limitingFov = Math.min(verticalFov, horizontalFov);
  const distance = sphere.radius / Math.sin(limitingFov / 2) * 1.25;
  const position = target.clone().addScaledVector(direction, distance);

  return { cabin, sphere, target, position, distance };
}

function fitCameraToCabin() {
  const pose = defaultCameraPose();
  if (!pose) return;

  cameraTargetOffset.copy(DEFAULT_CAMERA_TARGET_OFFSET);
  controls.target.copy(pose.target);
  camera.position.copy(pose.position);
  controls.minDistance = pose.sphere.radius * 1.1;
  controls.maxDistance = pose.distance * 3;
  camera.near = Math.max(pose.distance / 100, 0.03);
  camera.far = pose.distance * 20;
  camera.updateProjectionMatrix();
  camera.lookAt(pose.target);
  controls.update();
  attachShadowToCabin();
}

function captureCameraTargetOffset() {
  const cabin = cabinCentreAndSize();
  if (!cabin) return;
  cameraTargetOffset.copy(controls.target).sub(cabin.centre);
}

function startResetView() {
  const pose = defaultCameraPose();
  if (!pose) return;

  autoCenterDuringTransition = false;
  cameraResetTween = {
    start: performance.now(),
    duration: 680,
    startPosition: camera.position.clone(),
    startTarget: controls.target.clone(),
    endPosition: pose.position,
    endTarget: pose.target
  };
}

function updateResetView(now) {
  if (!cameraResetTween) return;

  const raw = THREE.MathUtils.clamp(
    (now - cameraResetTween.start) / cameraResetTween.duration,
    0,
    1
  );
  const t = polishEase(raw);

  camera.position.lerpVectors(
    cameraResetTween.startPosition,
    cameraResetTween.endPosition,
    t
  );
  controls.target.lerpVectors(
    cameraResetTween.startTarget,
    cameraResetTween.endTarget,
    t
  );

  if (raw >= 1) {
    cameraTargetOffset.copy(DEFAULT_CAMERA_TARGET_OFFSET);
    cameraResetTween = null;
  }
}

function gentlyTrackCabinCentre() {
  if (!autoCenterDuringTransition) return;
  const cabin = cabinCentreAndSize();
  if (!cabin) return;

  const desiredTarget = cabin.centre.clone().add(cameraTargetOffset);
  const delta = desiredTarget.clone().sub(controls.target).multiplyScalar(0.10);
  controls.target.add(delta);
  camera.position.add(delta);

  if (Math.abs(targetTime - currentTime) < 0.02) {
    const finalDelta = desiredTarget.clone().sub(controls.target);
    controls.target.add(finalDelta);
    camera.position.add(finalDelta);
    autoCenterDuringTransition = false;
  }
}

controls.addEventListener("start", () => {
  cameraResetTween = null;
});
controls.addEventListener("end", captureCameraTargetOffset);
resetViewButton?.addEventListener("click", startResetView);

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const MODEL_URL = `./telos.glb?model-rev=20260903-final-polish-v1`;

loader.load(
  MODEL_URL,
  async gltf => {
    model = gltf.scene;
    scene.add(model);
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

    buildFurnitureFadeTargets(gltf);

    const materials = collectNamedMaterials(model);
    floorMaterial = materials.get("Wood Floor Dark Walnut") || null;
    wallMaterial = materials.get("Concrete wall") || null;
    carpetMaterial = materials.get("Carpet") || null;

    if (carpetMaterial) applyCarpetGrayscale(carpetMaterial);
    makeSofaWhite(model);
    setFloorVariantImmediate(selectedFloor);
    setWallVariantImmediate(selectedWall);

    seekAbsoluteTime(STATES.small.time);
    fitCameraToCabin();

    status.textContent = `${actions.length} animation clips loaded`;
    setTimeout(() => { status.hidden = true; }, 900);
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

    cameraResetTween = null;
    captureCameraTargetOffset();
    targetTime = state.time;
    specLength.textContent = `${state.length.toFixed(1)} m`;
    autoCenterDuringTransition = true;
    sizeButtons.forEach(item => item.classList.toggle("active", item === button));
  });
});

floorButtons.forEach(button => {
  button.addEventListener("click", () => {
    applyFloorVariant(button.dataset.floor);
    updateFinishButtons(floorButtons, "floor", selectedFloor);
  });
});

wallButtons.forEach(button => {
  button.addEventListener("click", () => {
    applyWallVariant(button.dataset.wall);
    updateFinishButtons(wallButtons, "wall", selectedWall);
  });
});

function resize() {
  const width = Math.max(1, viewport.clientWidth);
  const height = Math.max(1, viewport.clientHeight);
  renderer.setSize(width, height, false);
  composer.setSize(width, height);
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
  } else {
    updateRepeatedGeometry();
    updateFurnitureFades();
  }

  updateMaterialTweens(now);
  gentlyTrackCabinCentre();
  updateResetView(now);
  attachShadowToCabin();
  controls.update();
  composer.render();
}

requestAnimationFrame(render);
