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
    __JUMP_PREVIEW__?: DefensePreviewApi;
  }
}

export function DefenseScene({
  playing,
  speed,
  restart,
  onReport,
  assetPath = ANIMATION_PATHS.shaq.defense,
  clipName = DEFENSE_CLIP,
  apiKey = '__DEFENSE_PREVIEW__',
}: {
  playing: boolean;
  speed: number;
  restart: number;
  onReport: (report: DefenseReport) => void;
  assetPath?: string;
  clipName?: string;
  apiKey?: '__DEFENSE_PREVIEW__' | '__JUMP_PREVIEW__';
}) {
  const [active, source] = useGLTF([`${base}${MODEL_PATHS.shaq}`, `${base}${assetPath}`]);
  const model = useMemo(() => {
    const instance = clone(active.scene);
    isolateWalkingCharacter(instance);
    return instance;
  }, [active.scene]);
  const bound = useMemo(() => {
    const clip = source.animations.find((clip) => clip.name === clipName);
    if (!clip) throw new Error(`Missing clip: ${clipName}`);
    return bindAnimationClip(source.scene, model, clip);
  }, [source, model, clipName]);
  const clips = useMemo(() => [bound.clip], [bound]);
  const { actions, mixer } = useAnimations(clips, model);

  useEffect(() => onReport(bound.report), [onReport, bound]);
  useEffect(() => {
    const action = actions[clipName]!;
    action.reset().setLoop(LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();
    return () => {
      action.stop();
    };
  }, [actions, restart, clipName]);
  useEffect(() => {
    const action = actions[clipName]!;
    action.paused = !playing;
    action.setEffectiveTimeScale(speed);
    mixer.update(0);
  }, [actions, mixer, playing, speed, restart, clipName]);
  useEffect(() => {
    const point = new Vector3();
    const api: DefensePreviewApi = {
      report: bound.report,
      seek(time) {
        if (!Number.isFinite(time)) return;
        const action = actions[clipName]!;
        action.time = Math.max(0, Math.min(bound.clip.duration, time));
        mixer.update(0);
        model.updateMatrixWorld(true);
      },
      getState() {
        const action = actions[clipName]!;
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
    window[apiKey] = api;
    return () => {
      if (window[apiKey] === api) delete window[apiKey];
    };
  }, [actions, mixer, bound, model, apiKey, clipName]);
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
