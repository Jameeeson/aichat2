// BVH Animation Handler for Three.js Avatar Projects
// Extracted and adapted from main.tsx for reusable BVH animation functionality
// MODIFIED to include procedural head animation and shoulder adjustments.

import * as THREE from "three";
import { BVHLoader } from "three/examples/jsm/loaders/BVHLoader.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";

// TypeScript interfaces
interface RetargetOptions {
  hip: string;
  names: { [key: string]: string };
  bindTransforms?: any[]; // optional to match usage
  preservePosition?: boolean;
  useFirstFrameAsBindPose?: boolean;
}

const RPM_TPOSE_RETARGET_OPTIONS: RetargetOptions = {
  hip: 'Hips',
  preservePosition: false,
  useFirstFrameAsBindPose: true,
  names: {
    Hips: 'Hips',
    Spine: 'Spine',
    Spine1: 'Spine1',
    Spine2: 'Spine2',
    Neck: 'Neck',
    Head: 'Head',
    LeftShoulder: 'LeftShoulder',
    LeftArm: 'LeftArm',
    LeftForeArm: 'LeftForeArm',
    LeftHand: 'LeftHand',
    RightShoulder: 'RightShoulder',
    RightArm: 'RightArm',
    RightForeArm: 'RightForeArm',
    RightHand: 'RightHand',
    LeftUpLeg: 'LeftUpLeg',
    LeftLeg: 'LeftLeg',
    LeftFoot: 'LeftFoot',
    LeftToe: 'LeftToeBase',
    RightUpLeg: 'RightUpLeg',
    RightLeg: 'RightLeg',
    RightFoot: 'RightFoot',
    RightToe: 'RightToeBase',
    // Fingers intentionally omitted to avoid over-rotation and duplicate tracks
  },
};

const FADE_DURATION = 1.2; // cross-fade between actions (shorter to reduce double-posing)
const HIDE_EXTRA_SECONDS = 0.0; // no extra delay while hidden
const OPACITY_FADE_BVH = 0.0; // keep 0 to avoid ghosting; set to ~0.1 for a subtle fade if desired

export class BVHAnimationPlayer {
  private bvhLoader: BVHLoader;
  
  // --- NEW PROPERTIES FOR PROCEDURAL ANIMATION ---
  private clock: THREE.Clock = new THREE.Clock();
  private headBone: THREE.Bone | null = null;
  private leftShoulder: THREE.Bone | null = null;
  private rightShoulder: THREE.Bone | null = null;
  private bonesFound = false; // Flag to ensure we only search for bones once


  constructor() {
    this.bvhLoader = new BVHLoader();
  }

  // =======================================================================
  // === NEW PUBLIC METHOD for Procedural Head Motion ===
  // =======================================================================
  /**
   * Call this method in your main animation loop, AFTER `mixer.update(delta)`.
   * It applies procedural animation to the character's head to make it look
   * more natural and less stiff, overriding or augmenting the base BVH animation.
   * @param delta - The time delta since the last frame, from your main clock.
   */
  public update(delta: number): void {
      if (this.headBone) {
          const elapsedTime = this.clock.getElapsedTime();

          // --- Parameters to control the head motion ---
          const swayFrequency = 0.5; // Side-to-side tilt frequency
          const swayAmplitude = 0.04; // Side-to-side tilt amount
          const nodFrequency = 0.4;  // Up-down nod frequency
          const nodAmplitude = 0.03;  // Up-down nod amount
          
          // Base angle (0 = straight, negative = chin down, positive = chin up)
          const baseHeadXRotation = -2;

          // 1. SET the up/down rotation directly (overrides the animation).
          // This forces the head to a base angle plus a procedural nod.
          this.headBone.rotation.x = baseHeadXRotation + (Math.sin(elapsedTime * nodFrequency) * nodAmplitude);

          // 2. ADD to the side-to-side tilt (layers on top of the animation).
          // We take the animation's Z-rotation for this frame and add a little extra sway.
          // The `delta` multiplication makes the sway speed-independent of the frame rate.
          this.headBone.rotation.z += Math.sin(elapsedTime * swayFrequency) * swayAmplitude * delta;
      }
  }


  /**
   * Fade all mesh materials on an object to target opacity over duration (s).
   */
  private fadeObjectOpacity = (
    obj: THREE.Object3D | null,
    targetOpacity: number,
    duration: number
  ): Promise<void> => {
    return new Promise((resolve) => {
      if (!obj || duration <= 0) {
        obj?.traverse((child: any) => {
          if (child.isMesh && child.material) {
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach((m: any) => {
              if (m && typeof m.opacity === 'number') {
                m.transparent = targetOpacity < 1;
                m.opacity = targetOpacity;
                m.needsUpdate = true;
              }
            });
          }
        });
        resolve();
        return;
      }

      const materials: { mat: any; start: number }[] = [];
      obj.traverse((child: any) => {
        if (child.isMesh && child.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach((m: any) => {
            if (m && typeof m.opacity === 'number') {
              m.transparent = true;
              materials.push({ mat: m, start: m.opacity ?? 1 });
            }
          });
        }
      });

      const startTime = performance.now();
      const tick = () => {
        const now = performance.now();
        const t = Math.min(1, (now - startTime) / (duration * 1000));
        materials.forEach(({ mat, start }) => {
          mat.opacity = start + (targetOpacity - start) * t;
          // When fully opaque, disable transparency to avoid see-through ghosting
          mat.transparent = mat.opacity < 0.999;
          mat.needsUpdate = true;
        });
        if (t < 1) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
  };

  /** Wait for the next animation frame (allow renderer to present current visibility state) */
  private waitForNextFrame = (): Promise<void> => {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  };

  /**
   * Toggle visibility for all mesh children under an object.
   */
  private setObjectVisibility = (obj: THREE.Object3D | null, visible: boolean) => {
    if (!obj) return;
    obj.traverse((child: any) => {
      if (child.isMesh) child.visible = visible;
    });
  };

  private sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  /**
   * Creates retargeting options for Ready Player Me models
   */
  private createRetargetOptions(targetMesh: THREE.SkinnedMesh): RetargetOptions {
    console.log("Creating retargeting options for RPM model...");
    // For RPM models, bindTransforms are not needed for this retargeting method
    return RPM_TPOSE_RETARGET_OPTIONS;
  }

  /**
   * Fetch and generate BVH animations from a backend API
   * @param backendUrl - The base URL of your backend API
   * @param prompts - Array of motion prompts to generate BVH for
   * @returns Promise<string[]> - Array of generated BVH file names
   */
  async generateBVHAnimations(backendUrl: string, prompts: string[]): Promise<string[]> {
    try {
      const response = await fetch(`${backendUrl}/api/generate_bvh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompts }),
      });

      if (!response.ok) {
        throw new Error(`Failed to generate BVH animations: ${response.statusText}`);
      }

      const result = await response.json();
      return result.files_created || [];
    } catch (error) {
      console.error("Error generating BVH animations:", error);
      throw error;
    }
  }

  /**
   * Load BVH files from URLs
   * @param bvhUrls - Array of BVH file URLs to load
   * @returns Promise<any[]> - Array of loaded BVH clips with skeleton data
   */
  async loadBVHFiles(bvhUrls: string[]): Promise<any[]> {
    try {
      const clips = await Promise.all(
        bvhUrls.map((url) => this.bvhLoader.loadAsync(url))
      );
      
      if (clips.length > 0) {
         const bvhBones = clips[0].skeleton.bones.map((b: THREE.Bone) => b.name);
                console.log("--- INCOMING BVH BONES (SOURCE) ---", bvhBones);
      }
      
      return clips;
    } catch (error) {
      console.error("Failed to load BVH files:", error);
      throw error;
    }
  }

  /**
   * Plays a sequence of BVH animations on a Three.js model.
   * This is the centralized player method.
   * @param animationObjects - The necessary Three.js objects (mixer, model, idleAction).
   * @param bvhUrls - Array of BVH file URLs to play in sequence.
   */
  async play(
    animationObjects: {
      mixer: THREE.AnimationMixer;
      model: THREE.Object3D;
      idleAction: THREE.AnimationAction;
    },
    bvhUrls: string[]
  ): Promise<void> {
    const { mixer, model, idleAction } = animationObjects;

    if (!mixer || !model || !idleAction) {
      console.error("Animation objects not provided!");
      return;
    }

    // --- NEW: Find bones for adjustments and procedural animation (runs only once) ---
    if (!this.bonesFound && model) {
        this.headBone = model.getObjectByName('Head') as THREE.Bone;
        this.leftShoulder = model.getObjectByName('LeftShoulder') as THREE.Bone;
        this.rightShoulder = model.getObjectByName('RightShoulder') as THREE.Bone;
        this.bonesFound = true; // Mark as found so we don't search again

        if (this.headBone) {
            console.log("✅ Head bone found for procedural animation.");
        } else {
            console.warn("⚠️ Could not find 'Head' bone. Head correction will be disabled.");
        }
        
    if (this.leftShoulder && this.rightShoulder) {
      console.log("✅ Shoulder bones found.");
      // Removed shoulder width scaling to avoid arm deformation
    } else {
            console.warn("⚠️ Could not find LeftShoulder/RightShoulder bones for adjustment.");
        }
    }


  try {
      const targetSkinnedMesh = model.getObjectByProperty("isSkinnedMesh", true) as THREE.SkinnedMesh;
      if (!targetSkinnedMesh) {
          throw new Error("No skinned mesh found in the model");
      }

  // 1. Clean Reset: fade the model out (without removing from scene),
  // stop all actions and reset the skeleton to its bind pose while hidden.
  const rootObj = targetSkinnedMesh.parent || targetSkinnedMesh;
  await this.fadeObjectOpacity(rootObj, 0, 0);
  await this.waitForNextFrame();

  mixer.stopAllAction();
  targetSkinnedMesh.skeleton.pose();
  await this.waitForNextFrame();

      // 2. Load all BVH files from the provided URLs.
      const clips = await this.loadBVHFiles(bvhUrls);
      if (clips.length === 0) {
          throw new Error("No BVH clips were loaded from the provided URLs.");
      }

      const retargetOptions = this.createRetargetOptions(targetSkinnedMesh);

      // 3. Retarget each BVH clip to the now-reset model's skeleton.
      const sequenceActions = clips.map((bvh) => {
        const retargetedClip = SkeletonUtils.retargetClip(
          targetSkinnedMesh,
          bvh.skeleton,
          bvh.clip,
          retargetOptions
        );
        // Drop duplicate wrist quaternion tracks to avoid sudden flips
        const seenQuat = new Set<string>();
        const filteredTracks: THREE.KeyframeTrack[] = [];
        for (const track of retargetedClip.tracks) {
          // Optionally drop root position tracks if needed (commented)
          // if (track.name === 'Hips.position') continue;
          if (
            track.name.endsWith('.quaternion') &&
            (track.name.startsWith('LeftHand.') || track.name.startsWith('RightHand.'))
          ) {
            if (seenQuat.has(track.name)) continue;
            seenQuat.add(track.name);
          }
          filteredTracks.push(track);
        }
        (retargetedClip as any).tracks = filteredTracks;

        const action = mixer.clipAction(retargetedClip);
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        return action;
      });
      
      if (sequenceActions.length === 0) {
          throw new Error("Failed to create any animation actions from the BVH clips.");
      }

      // 4. Play the sequence, fading from one action to the next, and resolve when done.
      await new Promise<void>((resolve) => {
        let currentActionIndex = 0;
        const onActionFinished = (e: any) => {
          if (!sequenceActions.includes(e.action) || e.action !== sequenceActions[currentActionIndex]) return;
          currentActionIndex++;
          if (currentActionIndex < sequenceActions.length) {
            const lastAction = sequenceActions[currentActionIndex - 1];
            const nextAction = sequenceActions[currentActionIndex];
            try { lastAction.crossFadeTo(nextAction, FADE_DURATION, true); } catch {}
            try { nextAction.play(); } catch {}
          } else {
            // Sequence complete: fade to idle and resolve.
            try { mixer.removeEventListener('finished', onActionFinished); } catch {}
            try { sequenceActions[sequenceActions.length - 1].fadeOut(FADE_DURATION); } catch {}
            try { idleAction.reset().fadeIn(FADE_DURATION).play(); } catch {}
            resolve();
          }
        };
        try { mixer.addEventListener('finished', onActionFinished); } catch {}

        // 6. Fade the model back in, then start the sequence (keep it in the scene).
        this.fadeObjectOpacity(rootObj, 0, 0)
          .then(() => this.fadeObjectOpacity(rootObj, 1, OPACITY_FADE_BVH))
          .then(() => {
            try { idleAction.fadeOut(FADE_DURATION); } catch {}
            try { sequenceActions[0].play(); } catch {}
          })
          .catch(() => {
            // Even if fade fails, start the sequence to avoid hanging
            try { idleAction.fadeOut(FADE_DURATION); } catch {}
            try { sequenceActions[0].play(); } catch {}
          });
      });
    } catch (error) {
      console.error("Error playing BVH sequence:", error);
      try { mixer.stopAllAction(); } catch {}
      try { idleAction.reset().fadeIn(FADE_DURATION).play(); } catch {}
    }
  }
}

// Export singleton instance for easy use
export const bvhPlayer = new BVHAnimationPlayer();

// Export types for TypeScript users
export type { RetargetOptions };