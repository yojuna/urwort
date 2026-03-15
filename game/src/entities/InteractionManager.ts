/**
 * InteractionManager — handles pointer/tap/keyboard interaction with 3D scene objects.
 *
 * Responsibilities:
 *  - Raycasting pointer events against scene objects (including InstancedMesh)
 *  - Tap vs drag discrimination (8px threshold)
 *  - Word pillar taps → show word card
 *  - Island taps → fly camera + show island card
 *  - Hover effects: scale-up + emissive glow on word pillars, pointer cursor
 *  - Escape key → dismiss card
 */
import * as THREE from 'three';
import { WordCard } from '../ui/word-card';
import { CameraController } from '../player/camera';
import { InstancedPillars, InstanceRecord } from './InstancedPillars';
import type { Island } from '../types';

const TAP_THRESHOLD = 8; // px — distinguish taps from drags
const HOVER_EMISSIVE = new THREE.Color(0x334433);

export class InteractionManager {
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private pointerDownPos = { x: 0, y: 0 };

  // Hover state for instanced meshes
  private hoveredInstanceMesh: THREE.InstancedMesh | null = null;
  private hoveredInstanceId = -1;
  private hoveredBaseColor = new THREE.Color();

  private camera: THREE.PerspectiveCamera;
  private domElement: HTMLCanvasElement;
  private scene: THREE.Scene;
  private wordCard: WordCard;
  private cameraCtrl: CameraController;
  private islandMap: Map<string, Island>;
  private pillars: InstancedPillars;
  private onDirty: (() => void) | null;

  // Bound handlers for cleanup
  private onPointerDown: (e: PointerEvent) => void;
  private onPointerUp: (e: PointerEvent) => void;
  private onPointerMove: (e: PointerEvent) => void;
  private onKeyDown: (e: KeyboardEvent) => void;

  constructor(
    camera: THREE.PerspectiveCamera,
    domElement: HTMLCanvasElement,
    scene: THREE.Scene,
    wordCard: WordCard,
    cameraCtrl: CameraController,
    islandMap: Map<string, Island>,
    pillars: InstancedPillars,
    onDirty?: () => void,
  ) {
    this.camera = camera;
    this.domElement = domElement;
    this.scene = scene;
    this.wordCard = wordCard;
    this.cameraCtrl = cameraCtrl;
    this.islandMap = islandMap;
    this.pillars = pillars;
    this.onDirty = onDirty ?? null;

    this.onPointerDown = (e) => {
      this.pointerDownPos = { x: e.clientX, y: e.clientY };
    };

    this.onPointerUp = (e) => {
      const dx = e.clientX - this.pointerDownPos.x;
      const dy = e.clientY - this.pointerDownPos.y;
      if (Math.sqrt(dx * dx + dy * dy) < TAP_THRESHOLD) {
        this.handleTap(e);
      }
    };

    this.onPointerMove = (e) => {
      this.updateHover(e.clientX, e.clientY);
    };

    this.onKeyDown = (e) => {
      if (e.code === 'Escape') this.wordCard.hide();
    };

    domElement.addEventListener('pointerdown', this.onPointerDown);
    domElement.addEventListener('pointerup', this.onPointerUp);
    domElement.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('keydown', this.onKeyDown);
  }

  // ---------------------------------------------------------------------------
  // Hover
  // ---------------------------------------------------------------------------

  /** Update hover state — per-instance color change on instanced word pillars */
  private updateHover(clientX: number, clientY: number): void {
    this.pointer.x = (clientX / window.innerWidth) * 2 - 1;
    this.pointer.y = -(clientY / window.innerHeight) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const intersects = this.raycaster.intersectObjects(this.scene.children, true);

    // Find first instanced-pillar hit
    let hitRecord: InstanceRecord | null = null;
    let hitMesh: THREE.InstancedMesh | null = null;
    let hitInstanceId = -1;

    for (const hit of intersects) {
      const rec = this.pillars.lookupHit(hit.object, hit.instanceId);
      if (rec) {
        hitRecord = rec;
        hitMesh = hit.object as THREE.InstancedMesh;
        hitInstanceId = hit.instanceId!;
        break;
      }
    }

    const prevMesh = this.hoveredInstanceMesh;
    const prevId = this.hoveredInstanceId;
    const changed = prevMesh !== hitMesh || prevId !== hitInstanceId;

    if (!changed) return;

    // Un-hover previous
    if (prevMesh && prevId >= 0) {
      this.pillars.setInstanceColor(prevMesh, prevId, this.hoveredBaseColor);
    }

    // Hover new
    if (hitMesh && hitRecord && hitInstanceId >= 0) {
      this.hoveredBaseColor.copy(this.pillars.getBaseColor(hitRecord.wort.pos));

      // Brighten: base color + emissive tint
      const hoverColor = this.hoveredBaseColor.clone().lerp(new THREE.Color(0xffffff), 0.3);
      this.pillars.setInstanceColor(hitMesh, hitInstanceId, hoverColor);

      this.hoveredInstanceMesh = hitMesh;
      this.hoveredInstanceId = hitInstanceId;
    } else {
      this.hoveredInstanceMesh = null;
      this.hoveredInstanceId = -1;
    }

    this.domElement.style.cursor = hitRecord ? 'pointer' : '';
    this.onDirty?.();
  }

  // ---------------------------------------------------------------------------
  // Tap
  // ---------------------------------------------------------------------------

  private handleTap(event: PointerEvent): void {
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    this.pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersects = this.raycaster.intersectObjects(this.scene.children, true);

    if (intersects.length === 0) {
      this.wordCard.hide();
      return;
    }

    for (const hit of intersects) {
      // --- Check instanced word pillars first ---
      const rec = this.pillars.lookupHit(hit.object, hit.instanceId);
      if (rec) {
        const island = this.islandMap.get(rec.islandId);
        const cluster = island?.cluster;
        const compound = cluster?.compounds.find(c => c.compound_wort_id === rec.wort.id);
        this.wordCard.showWord(rec.wort, cluster?.wurzel, compound);
        return;
      }

      // --- Check island base meshes (walk up parents) ---
      let obj: THREE.Object3D | null = hit.object;
      while (obj) {
        if (obj.name?.startsWith('island-')) {
          const islandId = obj.name.replace('island-', '');
          const island = this.islandMap.get(islandId);
          if (island) {
            this.cameraCtrl.focusOn(
              new THREE.Vector3(island.position.x, island.position.y, island.position.z),
            );
            this.wordCard.showIsland(
              island.cluster.wurzel,
              island.cluster.words,
              island.cluster.compounds,
              (wort) => {
                const compound = island.cluster.compounds.find(
                  c => c.compound_wort_id === wort.id,
                );
                this.wordCard.showWord(wort, island.cluster.wurzel, compound);
              },
            );
          }
          return;
        }
        obj = obj.parent;
      }
    }

    // Hit something but not a word or island — dismiss
    this.wordCard.hide();
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  /** Remove all event listeners */
  dispose(): void {
    this.domElement.removeEventListener('pointerdown', this.onPointerDown);
    this.domElement.removeEventListener('pointerup', this.onPointerUp);
    this.domElement.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('keydown', this.onKeyDown);
  }
}
