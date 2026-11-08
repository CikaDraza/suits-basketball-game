import { useEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { OrbitControls, useAnimations, useGLTF } from '@react-three/drei';
import { SkeletonHelper, SkinnedMesh, Vector3 } from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { characterRoot, descendants, previewAssets } from './assets';
import { inspectComparison, type ComparisonReport } from './assetInspection';

export interface PlaybackSettings {
  clip: string;
  playing: boolean;
  speed: number;
  restart: number;
  showAuxiliary: boolean;
  showOriginal: boolean;
  showSkeleton: boolean;
}
export interface AnimationPreviewApi {
  report: ComparisonReport;
  seek: (seconds: number) => void;
  getState: () => {
    clip: string;
    time: number;
    duration: number;
    playing: boolean;
    speed: number;
    loops: number;
    visibleMeshes: string[];
    joints: Record<string, number[]>;
    overlay: { rootError: number; populated: boolean } | null;
  };
}
declare global {
  interface Window {
    __ANIMATION_PREVIEW__?: AnimationPreviewApi;
  }
}

function RigOverlay({ root }: { readonly root: ReturnType<typeof characterRoot> }) {
  const helper = useMemo(() => {
    const overlay = new SkeletonHelper(root);
    overlay.name = 'preview-skeleton';
    return overlay;
  }, [root]);
  useEffect(() => () => helper.dispose(), [helper]);
  return <primitive object={helper} dispose={null} />;
}

export function PreviewScene({
  settings,
  onReport,
}: {
  readonly settings: PlaybackSettings;
  readonly onReport: (report: ComparisonReport) => void;
}) {
  const scene = useThree((state) => state.scene);
  const originalAsset = useGLTF(previewAssets.original);
  const walkingAsset = useGLTF(previewAssets.animated);
  const original = useMemo(() => clone(originalAsset.scene), [originalAsset.scene]);
  const animated = useMemo(() => {
    const instance = clone(walkingAsset.scene);
    const root = characterRoot(instance);
    for (const child of instance.children) child.visible = descendants(child).has(root);
    return instance;
  }, [walkingAsset.scene]);
  const primary = useMemo(() => characterRoot(animated), [animated]);
  const characterNodes = useMemo(() => descendants(primary), [primary]);
  const report = useMemo(
    () =>
      inspectComparison(
        { scene: original, animations: originalAsset.animations },
        { scene: animated, animations: walkingAsset.animations },
      ),
    [original, originalAsset.animations, animated, walkingAsset.animations],
  );
  // Drei owns exactly one AnimationMixer update per R3F frame, including pause/timeScale.
  const { actions, mixer } = useAnimations(walkingAsset.animations, animated);
  const selected = settings.clip || report.defaultClip;
  const loops = useRef(0);

  useEffect(() => onReport(report), [onReport, report]);
  useEffect(() => {
    mixer.stopAllAction();
    loops.current = 0;
    const action = actions[selected];
    action?.reset().play();
    return () => {
      action?.stop();
    };
  }, [actions, mixer, selected, settings.restart]);
  useEffect(() => {
    const action = actions[selected];
    if (action) {
      action.paused = !settings.playing;
      action.setEffectiveTimeScale(settings.speed);
      mixer.update(0); // Evaluate explicit UI changes, never advance a second clock.
    }
  }, [actions, mixer, selected, settings.playing, settings.speed, settings.restart]);
  useEffect(() => {
    for (const child of animated.children)
      child.visible =
        child === primary || descendants(child).has(primary) || settings.showAuxiliary;
  }, [animated, primary, settings.showAuxiliary]);
  useEffect(() => {
    const loop = () => loops.current++;
    mixer.addEventListener('loop', loop);
    return () => mixer.removeEventListener('loop', loop);
  }, [mixer]);
  useEffect(() => {
    const point = new Vector3();
    const api: AnimationPreviewApi = {
      report,
      seek(seconds) {
        if (!Number.isFinite(seconds)) return;
        const action = actions[selected];
        if (!action) return;
        action.time = Math.max(0, Math.min(action.getClip().duration - 1e-6, seconds));
        mixer.update(0);
        animated.updateMatrixWorld(true);
      },
      getState() {
        const action = actions[selected];
        const visibleMeshes: string[] = [];
        animated.traverseVisible((node) => {
          if (node.type === 'Mesh' || node instanceof SkinnedMesh) visibleMeshes.push(node.name);
        });
        const joints: Record<string, number[]> = {};
        primary.updateWorldMatrix(true, true);
        for (const name of ['Hips', 'LeftHand', 'RightHand', 'LeftFoot', 'RightFoot']) {
          const bone = [...characterNodes].find((node) => node.name === `mixamorig${name}`);
          if (bone) joints[name] = bone.getWorldPosition(point).toArray();
        }
        const overlay = scene.getObjectByName('preview-skeleton') as SkeletonHelper | undefined;
        return {
          clip: selected,
          time: action?.time ?? 0,
          duration: action?.getClip().duration ?? 0,
          playing: Boolean(action && !action.paused && action.isRunning()),
          speed: action?.getEffectiveTimeScale() ?? 0,
          loops: loops.current,
          visibleMeshes,
          joints,
          overlay: overlay
            ? {
                rootError: overlay
                  .getWorldPosition(new Vector3())
                  .distanceTo(primary.getWorldPosition(point)),
                populated: overlay.geometry
                  .getAttribute('position')
                  .array.some((v) => Math.abs(v) > 0.01),
              }
            : null,
        };
      },
    };
    window.__ANIMATION_PREVIEW__ = api;
    return () => {
      if (window.__ANIMATION_PREVIEW__ === api) delete window.__ANIMATION_PREVIEW__;
    };
  }, [actions, animated, primary, characterNodes, mixer, selected, report, scene]);
  useEffect(
    () => () => {
      const skeletons = new Set<SkinnedMesh['skeleton']>();
      for (const root of [original, animated])
        root.traverse((node) => {
          if (node instanceof SkinnedMesh) skeletons.add(node.skeleton);
        });
      skeletons.forEach((skeleton) => skeleton.dispose());
    },
    [original, animated],
  );

  return (
    <>
      <color attach="background" args={['#252a31']} />
      <hemisphereLight args={['#edf4ff', '#6e6558', 1.7]} />
      <directionalLight position={[3, 5, 4]} intensity={3} />
      <gridHelper args={[20, 40, '#77828d', '#3d4650']} />
      <group position={[-1.45, 0, 0]} visible={settings.showOriginal}>
        <primitive object={original} dispose={null} />
      </group>
      <group position={[1.45, 0, 0]}>
        <primitive object={animated} dispose={null} />
      </group>
      {settings.showSkeleton && <RigOverlay root={primary} />}
      <OrbitControls makeDefault target={[0, 1.05, 0]} minDistance={1} maxDistance={20} />
    </>
  );
}
