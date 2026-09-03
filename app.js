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
  Blender source of truth:
  TELOS Shipping Container base project v0.0.2.blend
  Main scene saved at frame 128, after the resolved Large state at frame 120.

  The GLB exporter corrupts child local transforms when a parent is keyed to
  an exact zero scale. The reference below was read from the Blender file itself,
  including matrix_parent_inverse, then converted from Blender Z-up to glTF Y-up.
  We restore only direct children of the four affected zero-scale controllers:
  Shelves, Lamp CTRL, Rear end sink scalar transition, Counter_Wood.001.
*/
const BLENDER_LOCAL_REFERENCE = {"Sockets.001":{"position":[-0.282176025,-0.018465459,-1.354482266],"quaternion":[-0.499999981,0.500000019,-0.499999981,-0.500000019],"scale":[1.0,1.0,1.0]},"Lamp":{"position":[3e-08,0.760724306,0.0],"quaternion":[0.0,0.707106754,0.0,0.707106808],"scale":[1.0,1.0,1.0]},"Lamp_Cable":{"position":[-0.191712737,0.575006902,-0.380815864],"quaternion":[0.0,0.707106754,0.0,0.707106808],"scale":[1.0,1.0,1.0]},"Blade_1":{"position":[-0.125874519,1.046576694,-0.115214825],"quaternion":[0.0,0.707106754,0.0,0.707106808],"scale":[1.0,1.0,1.0]},"Blade_2":{"position":[-0.103674412,1.04658325,-0.114626884],"quaternion":[0.0,0.707106754,0.0,0.707106808],"scale":[1.0,1.0,1.0]},"Blade_3":{"position":[-0.081113636,1.046247542,-0.113963127],"quaternion":[0.0,0.707106754,0.0,0.707106808],"scale":[1.0,1.0,1.0]},"Blade_4":{"position":[-0.115256369,1.036004484,-0.088998795],"quaternion":[0.0,0.707106754,0.0,0.707106808],"scale":[1.0,1.0,1.0]},"Blade_5":{"position":[-0.091293454,1.035925031,-0.088520527],"quaternion":[0.0,0.707106754,0.0,0.707106808],"scale":[1.0,1.0,1.0]},"Blade_Board":{"position":[-0.176371813,0.972564757,0.022023439],"quaternion":[0.0,0.707106754,0.0,0.707106808],"scale":[1.0,1.0,1.0]},"Counter":{"position":[-0.647699356,0.2,1.557593346],"quaternion":[0.0,0.707106754,0.0,0.707106808],"scale":[1.0,1.0,1.0]},"Cube.008":{"position":[-0.524344146,0.339001149,1.314740658],"quaternion":[0.0,0.707106754,0.0,0.707106808],"scale":[1.0,1.0,1.0]},"Cube.009":{"position":[-0.329718649,0.339001149,1.314740658],"quaternion":[0.0,0.707106754,0.0,0.707106808],"scale":[1.0,1.0,1.0]},"Cube.010":{"position":[-0.135093153,0.339001149,1.314740658],"quaternion":[0.0,0.707106754,0.0,0.707106808],"scale":[1.0,1.0,1.0]},"Cube.011":{"position":[0.059532344,0.339001149,1.314740658],"quaternion":[0.0,0.707106754,0.0,0.707106808],"scale":[1.0,1.0,1.0]},"Cube.012":{"position":[0.25415784,0.339001149,1.314740658],"quaternion":[0.0,0.707106754,0.0,0.707106808],"scale":[1.0,1.0,1.0]},"Cube.013":{"position":[0.448783337,0.339001149,1.314740658],"quaternion":[0.0,0.707106754,0.0,0.707106808],"scale":[1.0,1.0,1.0]},"Cutboard":{"position":[-0.522475511,0.20733121,1.059550881],"quaternion":[0.0,0.707106754,0.0,0.707106808],"scale":[1.0,1.0,1.0]},"Drawers":{"position":[-0.596973658,0.392637372,1.433046103],"quaternion":[0.0,0.707106754,0.0,0.707106808],"scale":[1.0,1.0,1.0]},"Drawers.001":{"position":[-0.596973658,0.392637372,1.18058455],"quaternion":[0.0,0.707106754,0.0,0.707106808],"scale":[1.0,1.0,1.0]},"Drawers.005":{"position":[0.15073359,0.392637372,1.433046103],"quaternion":[0.0,0.707106754,0.0,0.707106808],"scale":[1.0,1.0,1.0]},"Drawers.006":{"position":[0.15073359,0.392637372,1.18058455],"quaternion":[0.0,0.707106754,0.0,0.707106808],"scale":[1.0,1.0,1.0]},"Grindstone":{"position":[-0.293469548,1.109525323,-0.109328173],"quaternion":[0.0,0.707106754,0.0,0.707106808],"scale":[1.0,1.0,1.0]},"Holder":{"position":[-0.169385374,1.102165103,-0.080539227],"quaternion":[0.0,0.707106754,0.0,0.707106808],"scale":[1.0,1.0,1.0]},"Knife_1":{"position":[-0.129802048,1.116292119,-0.084237814],"quaternion":[0.0,0.707106754,0.0,0.707106808],"scale":[1.0,1.0,1.0]},"Knife_2":{"position":[-0.106500924,1.116353393,-0.083722115],"quaternion":[0.0,0.707106754,0.0,0.707106808],"scale":[1.0,1.0,1.0]},"Knife_3":{"position":[-0.078586698,1.116083408,-0.083022594],"quaternion":[0.0,0.707106754,0.0,0.707106808],"scale":[1.0,1.0,1.0]},"Knife_4":{"position":[-0.118756253,1.105781183,-0.058017254],"quaternion":[0.0,0.707106754,0.0,0.707106808],"scale":[1.0,1.0,1.0]},"Knife_5":{"position":[-0.094801128,1.1057107,-0.057534218],"quaternion":[0.0,0.707106754,0.0,0.707106808],"scale":[1.0,1.0,1.0]},"Knife_Board":{"position":[-0.176371813,0.880634427,0.022023439],"quaternion":[0.0,0.707106754,0.0,0.707106808],"scale":[1.0,1.0,1.0]},"RubberFeet":{"position":[-0.597699821,-0.023412703,1.462095752],"quaternion":[0.0,0.707106754,0.0,0.707106808],"scale":[1.0,1.0,1.0]},"Sink":{"position":[0.441529632,0.747808411,0.165091515],"quaternion":[0.0,0.707106754,0.0,0.707106808],"scale":[1.0,1.0,1.0]},"Sink_Boolean":{"position":[0.378873467,0.754288375,0.100511074],"quaternion":[0.0,0.707106754,0.0,0.707106808],"scale":[1.0,1.0,1.0]},"Sink_Dispenser":{"position":[0.651265502,0.930592716,-0.067873001],"quaternion":[0.0,0.707106754,0.0,0.707106808],"scale":[1.0,1.0,1.0]},"Sink_Drain":{"position":[0.497622013,0.688585877,0.212143898],"quaternion":[0.0,0.707106754,0.0,0.707106808],"scale":[1.0,1.0,1.0]},"Sink_Faucet":{"position":[0.505671501,1.035881042,-0.016259193],"quaternion":[0.0,0.707106754,0.0,0.707106808],"scale":[1.0,1.0,1.0]},"Sink_Valves":{"position":[0.506213188,0.889960609,-0.078857422],"quaternion":[0.0,0.707106754,0.0,0.707106808],"scale":[1.0,1.0,1.0]},"Alarm":{"position":[0.65076748,0.404828876,0.080368042],"quaternion":[0.0,-0.0,0.0,1.0],"scale":[1.0,1.0,1.0]},"Books":{"position":[0.500095844,0.104952812,0.14228039],"quaternion":[0.0,-1.79e-07,0.0,1.0],"scale":[1.0,1.0,1.0]},"Bowls":{"position":[0.189119935,-0.146393523,0.096224785],"quaternion":[0.0,-1.79e-07,0.0,1.0],"scale":[1.0,1.0,1.0]},"Leaf1":{"position":[-0.292082263,0.221918106,-0.186390817],"quaternion":[0.090962664,-0.015302829,-0.01007955,0.995687892],"scale":[1.0,1.0,1.0]},"Leaf1.001":{"position":[-0.313854456,0.236449718,-0.132162899],"quaternion":[0.030145524,-0.073626428,-0.117235053,0.989917674],"scale":[1.0,1.0,1.0]},"Leaf1.002":{"position":[-0.294025421,0.24345231,-0.090116255],"quaternion":[0.081500592,-0.036795895,-0.181586108,0.979264507],"scale":[1.0,1.0,1.0]},"Leaf1.003":{"position":[-0.275058746,0.251404759,-0.054839134],"quaternion":[0.134731218,-0.009088883,-0.196489805,0.971180998],"scale":[1.0,1.0,1.0]},"Leaf1.004":{"position":[-0.255148797,0.269804925,-0.016325027],"quaternion":[0.130249984,0.035722895,-0.211199199,0.967502818],"scale":[1.0,1.0,1.0]},"Leaf1.005":{"position":[-0.22918269,0.292821258,0.031941414],"quaternion":[0.10427147,0.074551817,-0.229253645,0.964920977],"scale":[1.0,1.0,1.0]},"Leaf1.006":{"position":[-0.206425339,0.320904851,0.081092358],"quaternion":[0.089802605,0.126687825,-0.237444669,0.958922624],"scale":[1.0,1.0,1.0]},"Leaf1.007":{"position":[-0.191651702,0.34796834,0.123594761],"quaternion":[0.09453363,0.161832207,-0.239536323,0.952679276],"scale":[1.0,1.0,1.0]},"Leaf1.008":{"position":[-0.181812286,0.381029367,0.16063118],"quaternion":[0.101883567,0.193486313,-0.233139688,0.947468582],"scale":[1.0,1.0,1.0]},"Leaf1.009":{"position":[-0.177821159,0.414116025,0.194320083],"quaternion":[0.096842186,0.22970353,-0.228112452,0.941159504],"scale":[1.0,1.0,1.0]},"Leaf1.010":{"position":[-0.180139065,0.443908691,0.224417686],"quaternion":[0.093796209,0.254020426,-0.227011319,0.935480535],"scale":[1.0,1.0,1.0]},"Leaf1.011":{"position":[-0.187319994,0.469875097,0.248915195],"quaternion":[0.09036781,0.273550787,-0.224488748,0.930914111],"scale":[1.0,1.0,1.0]},"Leaf1.012":{"position":[-0.198442698,0.491806746,0.269376278],"quaternion":[0.091288344,0.287680506,-0.217742641,0.928134091],"scale":[1.0,1.0,1.0]},"Leaf1.013":{"position":[-0.215792179,0.511875391,0.284198701],"quaternion":[0.094244552,0.303162162,-0.209437392,0.924836613],"scale":[1.0,1.0,1.0]},"Leaf2":{"position":[-0.251768827,0.220572829,-0.201416336],"quaternion":[0.036844608,-0.020108387,0.04985942,0.99787724],"scale":[1.0,1.0,1.0]},"Leaf2.001":{"position":[-0.216833115,0.235033989,-0.153887555],"quaternion":[-0.069909339,-0.09107982,-0.04726538,0.992253805],"scale":[1.0,1.0,1.0]},"Leaf2.002":{"position":[-0.187317371,0.247987747,-0.123503685],"quaternion":[-0.070189005,-0.089080988,-0.09355385,0.989122492],"scale":[1.0,1.0,1.0]},"Leaf2.003":{"position":[-0.166802764,0.265364528,-0.09469521],"quaternion":[-0.061167888,-0.082569309,-0.123019477,0.987062156],"scale":[1.0,1.0,1.0]},"Leaf2.004":{"position":[-0.154498458,0.285232544,-0.058905601],"quaternion":[-0.052256955,-0.07090985,-0.151945657,0.984442672],"scale":[1.0,1.0,1.0]},"Leaf2.005":{"position":[-0.145558357,0.307390213,-0.019815922],"quaternion":[-0.039385764,-0.056833684,-0.180799182,0.980461323],"scale":[1.0,1.0,1.0]},"Leaf2.006":{"position":[-0.141428471,0.33042717,0.018453121],"quaternion":[-0.030859823,-0.036846846,-0.204576468,0.977676742],"scale":[1.0,1.0,1.0]},"Leaf2.007":{"position":[-0.142966509,0.355940342,0.052386045],"quaternion":[-0.028069419,-0.014866657,-0.220314845,0.974907632],"scale":[1.0,1.0,1.0]},"Leaf2.008":{"position":[-0.14955318,0.383889854,0.078902912],"quaternion":[-0.027372321,0.005596803,-0.234816172,0.971627911],"scale":[1.0,1.0,1.0]},"Leaf2.009":{"position":[-0.159486294,0.410765648,0.098407984],"quaternion":[-0.030641768,0.023534337,-0.246710389,0.968275988],"scale":[1.0,1.0,1.0]},"Leaf2.010":{"position":[-0.175862312,0.436056137,0.111238003],"quaternion":[-0.030232744,0.042726764,-0.255550392,0.965477564],"scale":[1.0,1.0,1.0]},"Leaf2.011":{"position":[-0.19504118,0.458180189,0.118073463],"quaternion":[-0.026341483,0.058413971,-0.262217623,0.962722156],"scale":[1.0,1.0,1.0]},"Leaf2.012":{"position":[-0.214155734,0.477580547,0.120779991],"quaternion":[-0.021635253,0.069235014,-0.266487303,0.961063221],"scale":[1.0,1.0,1.0]},"Leaf2.013":{"position":[-0.234366655,0.495789915,0.120141506],"quaternion":[-0.016823702,0.079995424,-0.269602367,0.959538886],"scale":[1.0,1.0,1.0]},"Leaf3":{"position":[-0.235630989,0.222462177,-0.20732832],"quaternion":[0.018126233,-0.00256602,0.107144329,0.994074469],"scale":[1.0,1.0,1.0]},"Leaf3.001":{"position":[-0.194431782,0.236379623,-0.166637421],"quaternion":[-0.03497414,-0.057720362,0.066355285,0.995499469],"scale":[1.0,1.0,1.0]},"Leaf3.002":{"position":[-0.161185265,0.251945496,-0.139389515],"quaternion":[-0.030662421,-0.059034441,0.027798001,0.997389374],"scale":[1.0,1.0,1.0]},"Leaf3.003":{"position":[-0.135523319,0.271946907,-0.116411209],"quaternion":[-0.017144482,-0.056227608,-0.000109539,0.998270789],"scale":[1.0,1.0,1.0]},"Leaf3.004":{"position":[-0.115218252,0.293689489,-0.087126255],"quaternion":[-0.003810535,-0.049259334,-0.027456382,0.99840128],"scale":[1.0,1.0,1.0]},"Leaf3.005":{"position":[-0.097085714,0.317349911,-0.053321123],"quaternion":[0.010546979,-0.03829842,-0.05359156,0.997771141],"scale":[1.0,1.0,1.0]},"Leaf3.006":{"position":[-0.083173871,0.34157756,-0.019756317],"quaternion":[0.021550421,-0.023335227,-0.074382232,0.996720019],"scale":[1.0,1.0,1.0]},"Leaf3.007":{"position":[-0.07252796,0.36858654,0.010046959],"quaternion":[0.030093976,-0.006586214,-0.09025916,0.995438351],"scale":[1.0,1.0,1.0]},"Leaf3.008":{"position":[-0.065955639,0.397780895,0.034696579],"quaternion":[0.037767813,0.01016808,-0.102523083,0.993956519],"scale":[1.0,1.0,1.0]},"Leaf3.009":{"position":[-0.063286781,0.426539421,0.052050114],"quaternion":[0.041826937,0.027872195,-0.112655217,0.992358208],"scale":[1.0,1.0,1.0]},"Leaf3.010":{"position":[-0.06428434,0.451815128,0.064377785],"quaternion":[0.04429538,0.043753546,-0.118907018,0.990940043],"scale":[1.0,1.0,1.0]},"Leaf3.011":{"position":[-0.068266273,0.473293304,0.070324898],"quaternion":[0.0460203,0.058548283,-0.122106596,0.989726036],"scale":[1.0,1.0,1.0]},"Leaf3.012":{"position":[-0.074898958,0.490840912,0.071751595],"quaternion":[0.046448026,0.069958345,-0.122372422,0.98892314],"scale":[1.0,1.0,1.0]},"Plant":{"position":[-0.051607132,-0.218917161,-0.270612717],"quaternion":[0.0,-1.79e-07,0.0,1.0],"scale":[1.0,1.0,1.0]}};

const STATES = {
  small:  { time: 3.333333283662797, length: 2.4 },
  medium: { time: 199.99999701976782, length: 4.2 },
  large:  { time: 399.99999403953564, length: 6.0 }
};

let model = null;
let mixer = null;
let actions = [];
let revealMeshes = [];
let referenceObjects = [];
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

function textureName(texture) {
  if (!texture) return "";
  return String(
    texture.name ||
    texture.source?.data?.name ||
    texture.source?.data?.currentSrc ||
    texture.source?.data?.src ||
    ""
  ).toLowerCase();
}

function looksNormal(name) {
  return /(^|[_ .-])(normal|norm|nor|bump)([_ .-]|$)/i.test(name);
}

function looksAlbedo(name) {
  return /(albedo|base.?color|base.?colour|diffuse|color|colour)/i.test(name);
}

/*
  GLTFLoader already reads the Blender material slots correctly. The original
  Blender export defines Fabric 131 as:
    baseColor = fabric_131_albedo-2K
    normal    = fabric_131_normal-2K
    roughness = fabric_131_roughness-2K

  Do not rebuild PBR slots from parser indices here. That previous workaround was
  the reason the couch could wind up purple. This is only a narrow safety check
  in case a post-processing tool has genuinely swapped map and normalMap.
*/
function verifyMaterialTextures(material) {
  if (!material) return;

  const baseName = textureName(material.map);
  const normalName = textureName(material.normalMap);

  if (
    material.map &&
    material.normalMap &&
    looksNormal(baseName) &&
    looksAlbedo(normalName)
  ) {
    const tmp = material.map;
    material.map = material.normalMap;
    material.normalMap = tmp;
  }

  if (material.map) {
    material.map.colorSpace = THREE.SRGBColorSpace;
    material.map.needsUpdate = true;
  }

  if (material.normalMap) {
    material.normalMap.colorSpace = THREE.NoColorSpace;
    material.normalMap.needsUpdate = true;
  }

  if (material.roughnessMap) {
    material.roughnessMap.colorSpace = THREE.NoColorSpace;
    material.roughnessMap.needsUpdate = true;
  }

  if (material.metalnessMap) {
    material.metalnessMap.colorSpace = THREE.NoColorSpace;
    material.metalnessMap.needsUpdate = true;
  }

  material.needsUpdate = true;
}

function prepareModel(root) {
  revealMeshes = [];
  referenceObjects = [];

  const hiddenSources = [];
  const missingReferenceObjects = [];

  root.traverse(object => {
    if (object.name.startsWith(SOURCE_PREFIX)) {
      object.visible = false;
      hiddenSources.push(object.name);
      return;
    }

    object.visible = true;

    const reference = BLENDER_LOCAL_REFERENCE[object.name];
    if (reference) {
      referenceObjects.push({ object, reference });
    }

    if (!object.isMesh) return;

    const thin = isThinMesh(object);

    for (const material of materialList(object)) {
      if (!material) continue;
      material.side = thin ? THREE.DoubleSide : THREE.FrontSide;
      verifyMaterialTextures(material);
    }

    if (isRepeatedPart(object)) revealMeshes.push(object);
  });

  for (const name of Object.keys(BLENDER_LOCAL_REFERENCE)) {
    if (!root.getObjectByName(name)) missingReferenceObjects.push(name);
  }

  console.info("TELOS Blender cross-reference", {
    referenceVersion: "v0.0.2",
    correctedObjectCount: referenceObjects.length,
    missingReferenceObjects,
    hiddenSources
  });
}

/*
  AnimationMixer will re-apply any exported one-key actions every seek. Therefore
  the exact Blender child transforms must be restored AFTER mixer.update(0).
  The parent Empty keeps its original 0 -> 1 scale animation, so the assembly
  still appears and disappears exactly as authored.
*/
function applyBlenderLocalReference() {
  for (const { object, reference } of referenceObjects) {
    object.position.fromArray(reference.position);
    object.quaternion.fromArray(reference.quaternion);
    object.scale.fromArray(reference.scale);
    object.updateMatrix();
  }
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

  applyBlenderLocalReference();
  updateRevealVisibility();
  model.updateMatrixWorld(true);
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

const MODEL_URL = `./telos.glb?model-rev=20260903-blender-v002-reference`;

loader.load(
  MODEL_URL,
  gltf => {
    model = gltf.scene;
    scene.add(model);

    /*
      Keep GLTFLoader's material assignment untouched. The Blender/GLB source
      already has Fabric 131 wired correctly.
    */
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

    const fabricDiagnostics = [];
    model.traverse(object => {
      if (!object.isMesh) return;
      for (const material of materialList(object)) {
        if ((material?.name || "").toLowerCase().includes("fabric 131")) {
          fabricDiagnostics.push({
            object: object.name,
            material: material.name,
            baseColorTexture: textureName(material.map),
            normalTexture: textureName(material.normalMap),
            roughnessTexture: textureName(material.roughnessMap)
          });
        }
      }
    });

    console.info("TELOS Fabric 131 verification", fabricDiagnostics);
    console.info("TELOS GLB loaded", {
      url: MODEL_URL,
      scene: gltf.scene?.name,
      scenes: gltf.scenes.map(s => s.name),
      animationCount: gltf.animations.length,
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

    if (Math.abs(targetTime - currentTime) < 0.01) {
      currentTime = targetTime;
    }

    seekAbsoluteTime(currentTime);
  }

  controls.update();
  renderer.render(scene, camera);
}

requestAnimationFrame(render);
