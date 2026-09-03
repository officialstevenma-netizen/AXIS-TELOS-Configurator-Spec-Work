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

/*
  These times come from the actual exported GLB key timestamps.
  The Blender scene's three clean product states land at approximately:

  Small   frame 1   ->   3.333333 s
  Medium  frame 60  -> 200.000000 s
  Large   frame 120 -> 400.000000 s

  We seek every exported action on ONE absolute timeline. This is important.
  Normalising each clip to its own duration shifts furniture relative to the cage.
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

function setFrontSide(material) {
  if (!material) return;
  material.side = THREE.FrontSide;
  material.needsUpdate = true;
}

function prepareModel(root) {
  revealMeshes = [];

  root.traverse(object => {
    if (!object.isMesh) return;

    if (Array.isArray(object.material)) {
      object.material.forEach(setFrontSide);
    } else {
      setFrontSide(object.material);
    }

    const repeated =
      object.name.startsWith("Wall_Left_") ||
      object.name.startsWith("Wall_Right_") ||
      object.name.startsWith("Crossmember_");

    if (repeated) revealMeshes.push(object);
  });
}

function seekAbsoluteTime(time) {
  if (!mixer) return;

  for (const { clip, action } of actions) {
    const clipEnd = clip.duration;
    action.time = THREE.MathUtils.clamp(time, 0, clipEnd);
  }

  mixer.update(0);
  updateRevealVisibility();
}

function updateRevealVisibility() {
  for (const object of revealMeshes) {
    const growth = object.scale.y;
    object.visible = growth > 0.015;
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
    centre.y - longest * 1.30,
    centre.z + longest * 0.75
  );
  camera.near = Math.max(longest / 1000, 0.01);
  camera.far = longest * 20;
  camera.updateProjectionMatrix();
}

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

loader.load(
  "./telos.glb",
  gltf => {
    model = gltf.scene;
    scene.add(model);
    prepareModel(model);
    fitCamera(model);

    mixer = new THREE.AnimationMixer(model);
    actions = gltf.animations.map(clip => {
      const action = mixer.clipAction(clip);
      action.play();
      action.paused = true;
      action.clampWhenFinished = true;
      return { clip, action };
    });

    seekAbsoluteTime(STATES.small.time);

    status.textContent = `${actions.length} animation clips loaded`;
    setTimeout(() => { status.hidden = true; }, 1600);

    console.info("TELOS GLB loaded", {
      scenes: gltf.scenes.length,
      animations: gltf.animations.length,
      revealMeshes: revealMeshes.length,
      resolvedStates: STATES
    });
  },
  progress => {
    if (!progress.total) return;
    const percent = Math.round((progress.loaded / progress.total) * 100);
    status.textContent = `Loading model ${percent}%`;
  },
  error => {
    console.error("TELOS GLB load failed", error);
    status.textContent = "Could not load telos.glb";
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
