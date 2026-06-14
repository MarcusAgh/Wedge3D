import * as THREE from 'three';
import * as CANNON from 'cannon-es';

const DIE_SIZE = 0.85;
const HALF     = DIE_SIZE / 2;

// Floor above tallest tile surface — die never clips ring tiles or hub
const FLOOR_Y = 0.30;

// Park spot: between outer ring tiles and brass rim, front-right quadrant
const PARK_X = 7.8;
const PARK_Z = 2.8;

// Square containment walls — simple axis-aligned planes, definitely correct
const WALL_R = 8.8;

const FACE_NORMALS = [
  { normal: new CANNON.Vec3( 0,  0,  1), pips: 1 },
  { normal: new CANNON.Vec3(-1,  0,  0), pips: 2 },
  { normal: new CANNON.Vec3( 0,  1,  0), pips: 3 },
  { normal: new CANNON.Vec3( 0, -1,  0), pips: 4 },
  { normal: new CANNON.Vec3( 1,  0,  0), pips: 5 },
  { normal: new CANNON.Vec3( 0,  0, -1), pips: 6 },
];

export class DiceSystem {
  constructor(scene, physicsWorld) {
    this.scene = scene;
    this.world = physicsWorld;
    this.mesh  = null;
    this.body  = null;
    this._settling    = false;
    this._settleTimer = 0;
    this._onResult    = null;

    this._buildPhysics();
    this._buildDie();
  }

  _buildPhysics() {
    const mat = new CANNON.Material('boardSurface');

    const addPlane = (x, y, z, ex, ey, ez) => {
      const body = new CANNON.Body({ mass: 0, material: mat });
      body.addShape(new CANNON.Plane());
      body.position.set(x, y, z);
      body.quaternion.setFromEuler(ex, ey, ez);
      this.world.addBody(body);
    };

    // Floor  normal +Y
    addPlane(0, FLOOR_Y, 0,   -Math.PI / 2, 0, 0);
    // Left   x = −WALL_R  normal +X
    addPlane(-WALL_R, 1, 0,    0,  Math.PI / 2, 0);
    // Right  x = +WALL_R  normal −X
    addPlane( WALL_R, 1, 0,    0, -Math.PI / 2, 0);
    // Back   z = −WALL_R  normal +Z
    addPlane(0, 1, -WALL_R,    0, 0, 0);
    // Front  z = +WALL_R  normal −Z
    addPlane(0, 1,  WALL_R,    0, Math.PI, 0);
  }

  _buildDie() {
    const geo = new THREE.BoxGeometry(DIE_SIZE, DIE_SIZE, DIE_SIZE);
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0xf5ede0,
      roughness: 0.24,
      metalness: 0.0,
      clearcoat: 0.32,
      clearcoatRoughness: 0.38,
      envMapIntensity: 0.65,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = true;
    this.scene.add(this.mesh);

    this._addPips();

    this.body = new CANNON.Body({
      mass:           0.6,
      shape:          new CANNON.Box(new CANNON.Vec3(HALF, HALF, HALF)),
      linearDamping:  0.30,
      angularDamping: 0.38,
    });
    this.body.position.set(PARK_X, FLOOR_Y + HALF, PARK_Z);
    this.world.addBody(this.body);

    this.mesh.position.set(PARK_X, FLOOR_Y + HALF, PARK_Z);
  }

  _addPips() {
    const mat = new THREE.MeshPhysicalMaterial({ color: 0x15110d, roughness: 0.65, metalness: 0.0 });
    const geo = new THREE.SphereGeometry(0.065, 8, 8);

    const layouts = {
      1: [[0, 0]],
      2: [[-0.23,  0.23], [ 0.23, -0.23]],
      3: [[-0.23,  0.23], [ 0,     0   ], [ 0.23, -0.23]],
      4: [[-0.23,  0.23], [ 0.23,  0.23], [-0.23, -0.23], [ 0.23, -0.23]],
      5: [[-0.23,  0.23], [ 0.23,  0.23], [ 0,     0   ], [-0.23, -0.23], [ 0.23, -0.23]],
      6: [[-0.23,  0.23], [ 0.23,  0.25], [-0.23,  0   ], [ 0.23,  0   ], [-0.23, -0.23], [ 0.23, -0.23]],
    };
    const faces = [
      { pips: 1, axis: 'z', sign:  1 },
      { pips: 2, axis: 'x', sign: -1 },
      { pips: 3, axis: 'y', sign:  1 },
      { pips: 4, axis: 'y', sign: -1 },
      { pips: 5, axis: 'x', sign:  1 },
      { pips: 6, axis: 'z', sign: -1 },
    ];

    const off = HALF + 0.001;
    faces.forEach(({ pips, axis, sign }) => {
      layouts[pips].forEach(([u, v]) => {
        const pip = new THREE.Mesh(geo, mat);
        if (axis === 'z') pip.position.set(u, v, off * sign);
        if (axis === 'x') pip.position.set(off * sign, v, u);
        if (axis === 'y') pip.position.set(u, off * sign, v);
        this.mesh.add(pip);
      });
    });
  }

  roll(onResult) {
    this._onResult    = onResult;
    this._settling    = true;
    this._settleTimer = 0;

    // Throw from the player's side of the board, high up, toward the center
    const launchX = (Math.random() - 0.5) * 8;
    this.body.position.set(launchX, 5.5, 8.0);

    this.body.velocity.set(
      (Math.random() - 0.5) * 4,
      -1.0,
      -(11 + Math.random() * 5)
    );
    this.body.angularVelocity.set(
      (Math.random() - 0.5) * 34,
      (Math.random() - 0.5) * 34,
      (Math.random() - 0.5) * 34
    );
    this.body.wakeUp();
  }

  update(dt) {
    if (!this.body || !this.mesh) return;

    this.mesh.position.copy(this.body.position);
    this.mesh.quaternion.copy(this.body.quaternion);

    if (!this._settling) return;
    this._settleTimer += dt;

    const speed = this.body.velocity.length() + this.body.angularVelocity.length();
    if (speed < 0.06 || this._settleTimer > 3.5) {
      if (this._settleTimer > 3.5) this._snapToFace();
      this._settling = false;
      if (this._onResult) this._onResult(this._detectFaceUp());
    }
  }

  _snapToFace() {
    const up = new CANNON.Vec3(0, 1, 0);
    let best = -Infinity, bestFN = FACE_NORMALS[0];
    for (const fn of FACE_NORMALS) {
      const d = this.body.quaternion.vmult(fn.normal).dot(up);
      if (d > best) { best = d; bestFN = fn; }
    }
    const axis = bestFN.normal.cross(up);
    if (axis.length() > 0.001) {
      axis.normalize();
      this.body.quaternion.setFromAxisAngle(axis, Math.acos(Math.min(1, best)));
    }
    this.body.velocity.setZero();
    this.body.angularVelocity.setZero();
  }

  _detectFaceUp() {
    const up = new CANNON.Vec3(0, 1, 0);
    let best = -Infinity, bestPips = 1;
    for (const fn of FACE_NORMALS) {
      const d = this.body.quaternion.vmult(fn.normal).dot(up);
      if (d > best) { best = d; bestPips = fn.pips; }
    }
    return bestPips;
  }
}

export function createPhysicsWorld() {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -20, 0) });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.allowSleep = true;
  return world;
}
