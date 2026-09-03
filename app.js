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
  new THREE.MeshStandardMaterial({
    color: 0xd8d8d3,
    roughness: 0.95,
    side: THREE.FrontSide
  })
);
ground.rotation.x = -Math.PI / 2;
ground.position.z = -0.012;
scene.add(ground);

/*
  These are the authored resolved states on the exported Blender timeline.
  Every animation clip is evaluated against the same absolute time.
*/
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

function prepareModel(root) {
  revealMeshes = [];

  root.traverse(object => {
    /* Blender helper meshes are export references only. */
    if (object.name.startsWith("SOURCE_")) {
      object.visible = false;
      return;
    }

    if (!object.isMesh) return;

    const side = isThinMesh(object) ? THREE.DoubleSide : THREE.FrontSide;

    for (const material of materialList(object)) {
      if (!material) continue;
      material.side = side;
      material.needsUpdate = true;
    }

    if (isRepeatedPart(object)) revealMeshes.push(object);
  });
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

/*
  Keep GLTFLoader's material interpretation intact.

  The current TELOS GLB has one concrete exporter error in Fabric 131:
  baseColorTexture points at a roughness image even though the embedded
  fabric_131_albedo image is present. Repair only unmistakable technical-map
  assignments and leave every healthy material untouched.
*/
async function repairBrokenBaseColourAssignments(gltf) {
  const parser = gltf.parser;
  const repaired = [];
  const seen = new Set();

  for (const object of (() => {
    const meshes = [];
    model.traverse(child => { if (child.isMesh) meshes.push(child); });
    return meshes;
  })()) {
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

      let replacementTextureIndex;

      if (materialName.includes("fabric 131")) {
        replacementTextureIndex = findTextureByImageName(
          parser,
          name => name.includes("fabric_131") && /(albedo|diffuse|base.?color|base.?colour)/i.test(name)
        );
      }

      if (replacementTextureIndex === undefined || replacementTextureIndex < 0) {
        const technicalStem = baseImageName
          .replace(/(?:[_ .-])(normal|norm|roughness|metallic|occlusion|ao|bump)(?:[_ .-].*)?$/i, "")
          .trim();

        if (technicalStem) {
          replacementTextureIndex = findTextureByImageName(
            parser,
            name => name.includes(technicalStem) && /(albedo|diffuse|base.?color|base.?colour)/i.test(name)
          );
        }
      }

      if (replacementTextureIndex === undefined || replacementTextureIndex < 0) continue;

      const replacement = await parser.getDependency("texture", replacementTextureIndex);
      if (!replacement) continue;

      replacement.colorSpace = THREE.SRGBColorSpace;
      replacement.flipY = false;
      replacement.needsUpdate = true;

      material.map = replacement;
      material.needsUpdate = true;

      repaired.push({
        material: material.name,
        badBaseImage: baseImageName,
        replacementImage: imageNameForTexture(parser, replacementTextureIndex)
      });
    }
  }

  console.info("TELOS targeted base-colour repairs", repaired);
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

const MODEL_URL = `./telos.glb?model-rev=20260903-raw-transforms`;

loader.load(
  MODEL_URL,
  async gltf => {
    model = gltf.scene;
    scene.add(model);

    /*
      No hierarchy reconstruction and no Blender-transform interpreter here.
      Object transforms and parent relationships come straight from the GLB.
    */
    prepareModel(model);
    await repairBrokenBaseColourAssignments(gltf);

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

    console.info("TELOS GLB loaded raw", {
      url: MODEL_URL,
      scene: gltf.scene?.name,
      sceneNames: gltf.scenes.map(item => item.name),
      animationNames: gltf.animations.map(item => item.name),
      revealMeshes: revealMeshes.length
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

    if (Math.abs(targetTime - currentTime) < 0.01) {
      currentTime = targetTime;
    }

    seekAbsoluteTime(currentTime);
  }

  controls.update();
  renderer.render(scene, camera);
}

requestAnimationFrame(render);
