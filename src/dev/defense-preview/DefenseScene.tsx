import { useEffect, useMemo } from 'react';
import { OrbitControls, useAnimations, useGLTF } from '@react-three/drei';
import { LoopOnce, Mesh, SkinnedMesh, Vector3 } from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { ANIMATION_PATHS, MODEL_PATHS } from '../../game/assets/manifest';
import { bindAnimationClip } from '../../game/assets/animationClip';
import { isolateWalkingCharacter } from '../../game/entities/importedWalk';
import { SHAQ_DEFENSE_CLIP } from '../../game/entities/importedDefense';

const base = import.meta.env.BASE_URL;
const DEFENSE_CLIP = SHAQ_DEFENSE_CLIP;
export type DefenseReport = ReturnType<typeof bindAnimationClip>['report'];
export interface DefensePreviewApi {
  report: DefenseReport;
  seek: (time: number) => void;
  getState: () => {
    clip: string;
    time: number;
    duration: number;
    playing: boolean;
    visibleMeshes: string[];
    joints: Record<string, number[]>;
  };
}
declare global {
  interface Window {
    __DEFENSE_PREVIEW__?: DefensePreviewApi;
  }
}

export function DefenseScene({
  playing,
  speed,
  restart,
  onReport,
}: {
  playing: boolean;
  speed: number;
  restart: number;
  onReport: (report: DefenseReport) => void;
}) {
  const [active, source] = useGLTF([
    `${base}${MODEL_PATHS.shaq}`,
    `${base}${ANIMATION_PATHS.shaq.defense}`,
  ]);
  const model = useMemo(() => {
    const instance = clone(active.scene);
    isolateWalkingCharacter(instance);
    return instance;
  }, [active.scene]);
  const bound = useMemo(() => {
    const clip = source.animations.find((clip) => clip.name === DEFENSE_CLIP);
    if (!clip) throw new Error(`Missing clip: ${DEFENSE_CLIP}`);
    return bindAnimationClip(source.scene, model, clip);
  }, [source, model]);
  const clips = useMemo(() => [bound.clip], [bound]);
  const { actions, mixer } = useAnimations(clips, model);

  useEffect(() => onReport(bound.report), [onReport, bound]);
  useEffect(() => {
    const action = actions[DEFENSE_CLIP]!;
    action.reset().setLoop(LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();
    return () => {
      action.stop();
    };
  }, [actions, restart]);
  useEffect(() => {
    const action = actions[DEFENSE_CLIP]!;
    action.paused = !playing;
    action.setEffectiveTimeScale(speed);
    mixer.update(0);
  }, [actions, mixer, playing, speed, restart]);
  useEffect(() => {
    const point = new Vector3();
    const api: DefensePreviewApi = {
      report: bound.report,
      seek(time) {
        if (!Number.isFinite(time)) return;
        const action = actions[DEFENSE_CLIP]!;
        action.time = Math.max(0, Math.min(bound.clip.duration, time));
        mixer.update(0);
        model.updateMatrixWorld(true);
      },
      getState() {
        const action = actions[DEFENSE_CLIP]!;
        model.updateWorldMatrix(true, true);
        const visibleMeshes: string[] = [];
        model.traverseVisible((node) => {
          if (node instanceof Mesh) visibleMeshes.push(node.name);
        });
        const joints: Record<string, number[]> = {};
        for (const name of ['Hips', 'LeftHand', 'RightHand', 'LeftFoot', 'RightFoot']) {
          const bone = model.getObjectByName(`mixamorig${name}`);
          if (bone) joints[name] = bone.getWorldPosition(point).toArray();
        }
        return {
          clip: bound.clip.name,
          time: action.time,
          duration: bound.clip.duration,
          playing: action.isRunning(),
          visibleMeshes,
          joints,
        };
      },
    };
    window.__DEFENSE_PREVIEW__ = api;
    return () => {
      if (window.__DEFENSE_PREVIEW__ === api) delete window.__DEFENSE_PREVIEW__;
    };
  }, [actions, mixer, bound, model]);
  useEffect(
    () => () => {
      const skeletons = new Set<SkinnedMesh['skeleton']>();
      model.traverse((node) => {
        if (node instanceof SkinnedMesh) skeletons.add(node.skeleton);
      });
      skeletons.forEach((skeleton) => skeleton.dispose());
    },
    [model],
  );

  return (
    <>
      <color attach="background" args={['#252a31']} />
      <hemisphereLight args={['#edf4ff', '#6e6558', 1.7]} />
      <directionalLight position={[3, 5, 4]} intensity={3} />
      <gridHelper args={[10, 20, '#77828d', '#3d4650']} />
      <primitive object={model} dispose={null} />
      <OrbitControls makeDefault target={[0, 1.05, 0]} minDistance={1} maxDistance={12} />
    </>
  );
}
