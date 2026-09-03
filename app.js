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

/* Blender timeline is exported in absolute seconds. */
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
  "carpet", "rug", "curtain", "blind", "shade", "fabric plane", "leaf", "leaves", "paper"
];

function textureLabel(texture) {
  if (!texture) return "";
  return String(texture.name || texture.source?.data?.name || "").toLowerCase();
}

function looksNormal(name) {
  return /(^|[_ .-])(normal|norm|nor|bump)([_ .-]|$)/i.test(name);
}

function looksColour(name) {
  return /(albedo|base.?color|base.?colour|diffuse|color|colour)/i.test(name);
}

function repairObviousTextureSwap(material) {
  if (!material || !material.isMaterial) return false;

  const mapName = textureLabel(material.map);
  const normalName = textureLabel(material.normalMap);

  /*
    A few optimisation/export paths can leave a normal image in the colour slot.
    Only swap when the names make the mistake unambiguous.
  */
  if (material.map && material.normalMap && looksNormal(mapName) && looksColour(normalName)) {
    const oldMap = material.map;
    material.map = material.normalMap;
    material.normalMap = oldMap;
    material.map.colorSpace = THREE.SRGBColorSpace;
    material.normalMap.colorSpace = THREE.NoColorSpace;
    material.needsUpdate = true;
    return true;
  }

  if (material.map) material.map.colorSpace = THREE.SRGBColorSpace;
  if (material.normalMap) material.normalMap.colorSpace = THREE.NoColorSpace;
  return false;
}

function materialList(object) {
  if (!object.material) return [];
  return Array.isArray(object.material) ? object.material : [object.material];
}

function isThinMesh(object) {
  const haystack = `${object.name} ${materialList(object).map(m => m?.name || "").join(" ")}`.toLowerCase();
  return THIN_NAME_HINTS.some(hint => haystack.includes(hint));
}

function isRepeatedPart(object) {
  return object.name.startsWith("Wall_Left_") ||
    object.name.startsWith("Wall_Right_") ||
    object.name.startsWith("Crossmember_");
}

function prepareModel(root) {
  revealMeshes = [];
  const hiddenSources = [];
  const repairedMaterials = [];
  const materialDiagnostics = [];

  /* Ensure normal exported furniture/groups are visible. */
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

      if (repairObviousTextureSwap(material)) {
        repairedMaterials.push(`${object.name} / ${material.name}`);
      }

      material.needsUpdate = true;

      materialDiagnostics.push({
        object: object.name,
        material: material.name,
        side: thin ? "DoubleSide" : "FrontSide",
        map: textureLabel(material.map),
        normalMap: textureLabel(material.normalMap)
      });
    }

    if (isRepeatedPart(object)) revealMeshes.push(object);
  });

  console.info("TELOS model preparation", {
    hiddenSources,
    revealMeshCount: revealMeshes.length,
    repairedMaterials,
    materials: materialDiagnostics
  });
}

function updateRevealVisibility() {
  for (const object of revealMeshes) {
    /* Collapsed Blender state is around 0.001. */
    object.visible = object.scale.y > 0.015;
  }
}

function seekAbsoluteTime(time) {
  if (!mixer) return;

  /*
    Each Blender action contains key times on the same absolute timeline.
    We therefore feed every action the same absolute time. Short actions clamp
    at their final authored state, so furniture stays where Blender left it.
  */
  for (const { clip, action } of actions) {
    action.time = THREE.MathUtils.clamp(time, 0, clip.duration);
  }

  mixer.update(0);
  updateRevealVisibility();
}

function fitCamera(root) {
  /* Fit after Small state has been evaluated, so collapsed future parts do not skew framing. */
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

/* Cache bust during local iteration. */
const MODEL_URL = `./telos.glb?model-rev=20260903-issues-pass-1`;

loader.load(
  MODEL_URL,
  gltf => {
    model = gltf.scene;
    scene.add(model);

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

    prepareModel(model);
    seekAbsoluteTime(STATES.small.time);
    fitCamera(model);

    const meshNames = [];
    model.traverse(object => {
      if (object.isMesh && !object.name.startsWith(SOURCE_PREFIX)) meshNames.push(object.name);
    });

    console.info("TELOS GLB loaded", {
      url: MODEL_URL,
      scene: gltf.scene?.name,
      scenes: gltf.scenes.map(s => s.name),
      animationCount: gltf.animations.length,
      animationNames: gltf.animations.map(a => a.name),
      meshCount: meshNames.length,
      meshNames,
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
