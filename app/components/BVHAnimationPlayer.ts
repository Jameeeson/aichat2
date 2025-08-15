// BVH Animation Handler for Three.js Avatar Projects
// Extracted and adapted from main.tsx for reusable BVH animation functionality

import * as THREE from "three";
import { BVHLoader } from "three/examples/jsm/loaders/BVHLoader.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";

// TypeScript interfaces
interface RetargetOptions {
  hip: string;
  names: { [key: string]: string };
  bindTransforms: any[];
}

const RPM_TPOSE_RETARGET_OPTIONS = {
    preservePosition: false,
    useFirstFrameAsBindPose: true,
    hip: 'Hips',
    names: { 'Hips': 'Hips', 'Spine': 'Spine', 'Spine1': 'Spine1', 'Spine2': 'Spine2', 'Neck': 'Neck', 'Head': 'Head', 'LeftShoulder': 'LeftShoulder', 'LeftArm': 'LeftArm', 'LeftForeArm': 'LeftForeArm', 'LeftHand': 'LeftHand', 'RightShoulder': 'RightShoulder', 'RightArm': 'RightArm', 'RightForeArm': 'RightForeArm', 'RightHand': 'RightHand', 'LeftUpLeg': 'LeftUpLeg', 'LeftLeg': 'LeftLeg', 'LeftFoot': 'LeftFoot', 'LeftToe': 'LeftToeBase', 'RightUpLeg': 'RightUpLeg', 'RightLeg': 'RightLeg', 'RightFoot': 'RightFoot', 'RightToe': 'RightToeBase', 'LeftHandThumb1': 'LeftHand', 'LeftHandThumb2': 'LeftHand', 'LeftHandThumb3': 'LeftHand', 'LeftHandIndex1': 'LeftHand', 'LeftHandIndex2': 'LeftHand', 'LeftHandIndex3': 'LeftHand', 'LeftHandMiddle1': 'LeftHand', 'LeftHandMiddle2': 'LeftHand', 'LeftHandMiddle3': 'LeftHand', 'LeftHandRing1': 'LeftHand', 'LeftHandRing2': 'LeftHand', 'LeftHandRing3': 'LeftHand', 'LeftHandPinky1': 'LeftHand', 'LeftHandPinky2': 'LeftHand', 'LeftHandPinky3': 'LeftHand', 'RightHandThumb1': 'RightHand', 'RightHandThumb2': 'RightHand', 'RightHandThumb3': 'RightHand', 'RightHandIndex1': 'RightHand', 'RightHandIndex2': 'RightHand', 'RightHandIndex3': 'RightHand', 'RightHandMiddle1': 'RightHand', 'RightHandMiddle2': 'RightHand', 'RightHandMiddle3': 'RightHand', 'RightHandRing1': 'RightHand', 'RightHandRing2': 'RightHand', 'RightHandRing3': 'RightHand', 'RightHandPinky1': 'RightHand', 'RightHandPinky2': 'RightHand', 'RightHandPinky3': 'RightHand' }
};

// Fade duration (seconds) used for crossfades and fade in/out when switching
// between generated BVH actions and the idle action. Increased from 0.3 to
// this value to prevent briefly showing the T-pose during resets.
const FADE_DURATION = 4.0;
// Additional seconds to keep the character hidden during skeleton reset to
// ensure the renderer doesn't briefly show the T-pose.
const HIDE_EXTRA_SECONDS = 2.0;

export class BVHAnimationPlayer {
  private bvhLoader: BVHLoader;
  private retargetOptions: RetargetOptions | undefined;

  constructor() {
    this.bvhLoader = new BVHLoader();
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
                m.transparent = true;
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
    return {
      ...RPM_TPOSE_RETARGET_OPTIONS,
      bindTransforms: [], // Provide an empty array for RPM models
    };
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

    try {
      const targetSkinnedMesh = model.getObjectByProperty("isSkinnedMesh", true) as THREE.SkinnedMesh;
      if (!targetSkinnedMesh) {
          throw new Error("No skinned mesh found in the model");
      }

  // 1. Clean Reset: fade the model out, stop all actions and reset the
  // skeleton to its bind pose while hidden to avoid showing the T-pose.
  const rootObj = targetSkinnedMesh.parent || targetSkinnedMesh;
  // Strong-hide: detach the character root from the scene graph so it cannot be rendered
  const parent = rootObj.parent;
  let reattachIndex: number | null = null;
  if (parent) {
    // remember index so we can reinsert near the original spot if desired
    reattachIndex = parent.children.indexOf(rootObj);
    parent.remove(rootObj);
  } else {
    // Fallback to visibility hide if no parent (should be rare)
    this.setObjectVisibility(rootObj, false);
  }

  // Ensure the renderer had a frame with the object removed/hidden
  await this.waitForNextFrame();
  await this.sleep(HIDE_EXTRA_SECONDS * 1000);

  mixer.stopAllAction();
  // Force skeleton to bind pose while the object is detached/hidden
  targetSkinnedMesh.skeleton.pose();
  // Give one frame for the renderer to process the updated skeleton state (still not attached)
  await this.waitForNextFrame();

      // 2. Load all BVH files from the provided URLs.
      const clips = await this.loadBVHFiles(bvhUrls);
      if (clips.length === 0) {
          throw new Error("No BVH clips were loaded from the provided URLs.");
      }

      // 3. Retarget each BVH clip to the now-reset model's skeleton.
      const sequenceActions = clips.map((bvh) => {
          // Now this retargeting will be performed on a clean, neutral skeleton.
          const retargetedClip = SkeletonUtils.retargetClip(
              targetSkinnedMesh,
              bvh.skeleton,
              bvh.clip,
              RPM_TPOSE_RETARGET_OPTIONS 
          );
          const action = mixer.clipAction(retargetedClip);
          action.setLoop(THREE.LoopOnce, 1);
          action.clampWhenFinished = true;
          return action;
      });
      
      if (sequenceActions.length === 0) {
          throw new Error("Failed to create any animation actions from the BVH clips.");
      }

      // 4. Play the sequence, fading from one action to the next.
      let currentActionIndex = 0;
      const onActionFinished = (e: any) => {
          if (!sequenceActions.includes(e.action) || e.action !== sequenceActions[currentActionIndex]) {
              return;
          }

          currentActionIndex++;

          if (currentActionIndex < sequenceActions.length) {
              const lastAction = sequenceActions[currentActionIndex - 1];
              const nextAction = sequenceActions[currentActionIndex];
              lastAction.crossFadeTo(nextAction, FADE_DURATION, true);
              nextAction.play();
          } else {
              // 5. When the sequence is done, fade back to the idle animation.
              mixer.removeEventListener("finished", onActionFinished);
              sequenceActions[sequenceActions.length - 1].fadeOut(FADE_DURATION);
              idleAction.reset().fadeIn(FADE_DURATION).play();
          }
      };

      mixer.addEventListener("finished", onActionFinished);

  // 6. Fade the model back in, then start the sequence by fading out idle
  // and playing the first BVH action.
  // Reattach the object to the scene (or show it) and perform a smooth fade-in
  if (parent) {
    // re-add to the parent. Three.js will append; exact order usually doesn't matter for rendering.
    parent.add(rootObj);
    (rootObj as any).updateMatrixWorld?.(true);
  } else {
    this.setObjectVisibility(rootObj, true);
  }

  // Ensure materials start at 0 opacity for a smooth reveal
  await this.fadeObjectOpacity(rootObj, 0, 0);
  await this.fadeObjectOpacity(rootObj, 1, FADE_DURATION);
  idleAction.fadeOut(FADE_DURATION);
  sequenceActions[0].play();

    } catch (error) {
      console.error("Error playing BVH sequence:", error);
      // Ensure we return to a stable state (idle) on error.
      if (idleAction) {
        mixer.stopAllAction();
  idleAction.reset().fadeIn(FADE_DURATION).play();
      }
    }
  }
}

// Export singleton instance for easy use
export const bvhPlayer = new BVHAnimationPlayer();

// Export types for TypeScript users
export type { RetargetOptions };
