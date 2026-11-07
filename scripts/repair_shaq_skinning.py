#!/usr/bin/env python3
"""Repair the existing Shaq GLB skin attributes without re-exporting its geometry.

Install scripts/requirements-skinning.txt, then run with --write once. A plain run
checks the active and authoring copies against a repair computed from the backup.
The input checksum deliberately binds this operation to the audited asset.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import struct
from pathlib import Path

import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
from scipy.spatial import cKDTree
from scipy.spatial.transform import Rotation

ROOT = Path(__file__).resolve().parents[1]
ACTIVE = ROOT / "public/models/shaquille_oneal.glb"
AUTHORING = ROOT / "Basketball_Characters/models/shaquille_oneal.glb"
BACKUP = ROOT / ".backup/2026-11-07-shaq-fingers/shaquille_oneal.glb"
REPORT = ROOT / "docs/shaq-skinning-report.json"
ORIGINAL_SHA256 = "3d687fbc0d8b47716bd73e255086229a2f134cd118ee54e48a74e54d44e5ee27"
DTYPES = {5121: "u1", 5123: "<u2", 5125: "<u4", 5126: "<f4"}
COMPONENTS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}
SIDES = ("Left", "Right")
FINGERS = ("Thumb", "Index", "Middle", "Ring", "Pinky")


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class Glb:
    def __init__(self, data: bytes):
        if data[:4] != b"glTF" or struct.unpack_from("<I", data, 4)[0] != 2:
            raise ValueError("Expected an uncompressed glTF 2.0 GLB.")
        length, kind = struct.unpack_from("<II", data, 12)
        if kind != 0x4E4F534A:
            raise ValueError("Missing JSON chunk.")
        self.data = data
        self.json = json.loads(data[20:20 + length])
        self.bin_start = 20 + length + 8
        self.world = {}
        self.parents = {child: i for i, node in enumerate(self.json["nodes"])
                        for child in node.get("children", [])}
        self.local = {}
        for i, node in enumerate(self.json["nodes"]):
            if "matrix" in node:
                matrix = np.array(node["matrix"]).reshape(4, 4).T
            else:
                matrix = np.eye(4)
                matrix[:3, :3] = (Rotation.from_quat(node.get("rotation", [0, 0, 0, 1]))
                                 .as_matrix() @ np.diag(node.get("scale", [1, 1, 1])))
                matrix[:3, 3] = node.get("translation", [0, 0, 0])
            self.local[i] = matrix
        self.world = self.pose_world(self.local)

    def accessor(self, index: int, data=None):
        accessor = self.json["accessors"][index]
        if accessor.get("sparse"):
            raise ValueError("Sparse accessors are outside this asset-specific repair.")
        view = self.json["bufferViews"][accessor["bufferView"]]
        dtype = np.dtype(DTYPES[accessor["componentType"]])
        width = COMPONENTS[accessor["type"]]
        return np.ndarray((accessor["count"], width), dtype,
                          buffer=self.data if data is None else data,
                          offset=self.bin_start + view.get("byteOffset", 0) + accessor.get("byteOffset", 0),
                          strides=(view.get("byteStride", width * dtype.itemsize), dtype.itemsize))

    def accessor_range(self, index: int):
        accessor = self.json["accessors"][index]
        view = self.json["bufferViews"][accessor["bufferView"]]
        dtype = np.dtype(DTYPES[accessor["componentType"]])
        width = COMPONENTS[accessor["type"]] * dtype.itemsize
        start = self.bin_start + view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
        return [start, start + (accessor["count"] - 1) * view.get("byteStride", width) + width]

    def pose_world(self, local):
        world = {}
        def visit(index):
            if index not in world:
                world[index] = (visit(self.parents[index]) @ local[index]
                                if index in self.parents else local[index])
            return world[index]
        for index in local:
            visit(index)
        return world

    def body(self):
        node = next(node for node in self.json["nodes"] if node.get("name") == "Shaquille_ONeal_Mesh")
        primitive = self.json["meshes"][node["mesh"]]["primitives"][0]
        return self.json["skins"][node["skin"]], primitive


def edges_of(triangles):
    return np.unique(np.sort(np.concatenate([triangles[:, [0, 1]], triangles[:, [1, 2]],
                                            triangles[:, [2, 0]]]), axis=1), axis=0)


def stress(glb: Glb):
    """Independent matrix skinning of 324 wrist/joint/chain poses, ±70° on all axes."""
    skin, primitive = glb.body()
    attrs = primitive["attributes"]
    positions = glb.accessor(attrs["POSITION"]).astype(float)
    joints = glb.accessor(attrs["JOINTS_0"])
    weights = glb.accessor(attrs["WEIGHTS_0"])
    edges = edges_of(glb.accessor(primitive["indices"]).reshape(-1, 3))
    lengths = np.linalg.norm(positions[edges[:, 0]] - positions[edges[:, 1]], axis=1)
    inverse = glb.accessor(skin["inverseBindMatrices"]).reshape(-1, 4, 4).transpose(0, 2, 1)
    names = [glb.json["nodes"][index]["name"] for index in skin["joints"]]
    points = np.c_[positions, np.ones(len(positions))]
    maximum = 0.0
    ratio_maximum = 0.0
    worst = None
    extreme_edges = 0
    pose_count = 0
    for side in SIDES:
        groups = {"Wrist": [side + "Hand"]}
        for finger in FINGERS:
            for joint in range(1, 5):
                groups[finger + str(joint)] = [side + "Hand" + finger + str(joint)]
            groups[finger] = [side + "Hand" + finger + str(joint) for joint in range(1, 4)]
        groups["ALL"] = [name for finger in FINGERS for name in groups[finger]]
        for group, selected in groups.items():
            for axis in "xyz":
                for angle in (-70, 70):
                    local = dict(glb.local)
                    rotation = np.eye(4)
                    rotation[:3, :3] = Rotation.from_euler(axis, angle, degrees=True).as_matrix()
                    for index, name in zip(skin["joints"], names):
                        if name.replace("mixamorig:", "") in selected:
                            local[index] = local[index] @ rotation
                    world = glb.pose_world(local)
                    matrices = np.array([world[index] @ bind for index, bind in zip(skin["joints"], inverse)])
                    posed = np.zeros_like(positions)
                    for component in range(4):
                        posed += (np.einsum("nij,nj->ni", matrices[joints[:, component]], points)[:, :3]
                                   * weights[:, component, None])
                    deformed = np.linalg.norm(posed[edges[:, 0]] - posed[edges[:, 1]], axis=1)
                    gain = float(np.max(deformed - lengths))
                    ratio_maximum = max(ratio_maximum, float(np.max(deformed / np.maximum(lengths, 1e-5))))
                    extreme_edges += int(np.sum(deformed - lengths > 0.08))
                    pose_count += 1
                    if gain > maximum:
                        maximum = gain
                        worst = {"side": side, "group": group, "axis": axis, "angle": angle}
    return {"poseCount": pose_count, "maximumEdgeGrowthMeters": maximum,
            "maximumEdgeRatio": ratio_maximum, "edgesGrowingOver8cmAcrossPoses": extreme_edges,
            "worstPose": worst}


def repair(glb: Glb):
    skin, primitive = glb.body()
    attrs = primitive["attributes"]
    positions = glb.accessor(attrs["POSITION"]).astype(float)
    old_joints = glb.accessor(attrs["JOINTS_0"]).copy()
    old_weights = glb.accessor(attrs["WEIGHTS_0"]).astype(float)
    names = [glb.json["nodes"][index]["name"] for index in skin["joints"]]
    dense = np.zeros((len(positions), len(names)))
    np.put_along_axis(dense, old_joints, old_weights, axis=1)
    original = dense.copy()
    triangles = glb.accessor(primitive["indices"]).reshape(-1, 3)
    edges = edges_of(triangles)
    wrists = {side: glb.world[skin["joints"][names.index("mixamorig:" + side + "Hand")]][:3, 3]
              for side in SIDES}
    distances = np.array([np.linalg.norm(positions - wrist, axis=1) for wrist in wrists.values()])
    owner = np.argmin(distances, axis=0)
    near = np.min(distances, axis=0) < 0.34
    removed = []

    def remove(rows, columns):
        for joint in columns:
            for vertex in rows[dense[rows, joint] > 0]:
                removed.append({"vertex": int(vertex), "joint": names[joint],
                                "weight": float(dense[vertex, joint])})
            dense[rows, joint] = 0

    for joint, name in enumerate(names):
        if "Hand" not in name:
            continue
        side = 0 if "LeftHand" in name else 1
        remove(np.flatnonzero((owner != side) | ~near), [joint])

    regions = []
    replaced = 0
    for side_index, side in enumerate(SIDES):
        wrist = wrists[side]
        def joint_position(finger):
            return glb.world[skin["joints"][names.index("mixamorig:" + side + "Hand" + finger + "1")]][:3, 3]
        axis = joint_position("Middle") - wrist
        axis /= np.linalg.norm(axis)
        along = (positions - wrist) @ axis
        region = near & (owner == side_index) & (along > -0.025)
        allowed = np.array([side + "Hand" in name or side + "ForeArm" in name for name in names])
        remove(np.flatnonzero(region), np.flatnonzero(~allowed))
        regions.append((region, allowed))

        # Seed distinct finger surfaces beyond the MCP joints. Weld UV/normal seams,
        # but never connect spatially close vertices from separate fingers by proximity.
        roots = np.array([joint_position(finger) for finger in FINGERS[1:]])
        cut = float(np.median((roots - wrist) @ axis) + 0.04)
        vertices = np.flatnonzero(region & (along > cut))
        mapping = np.full(len(positions), -1)
        mapping[vertices] = np.arange(len(vertices))
        tips = triangles[np.all(mapping[triangles] >= 0, axis=1)]
        tip_edges = edges_of(tips)
        _, weld = np.unique(np.round(positions[vertices], 6), axis=0, return_inverse=True)
        pairs = weld[mapping[tip_edges]]
        graph = coo_matrix((np.ones(len(pairs)), (pairs[:, 0], pairs[:, 1])),
                           shape=(int(max(weld)) + 1, int(max(weld)) + 1))
        count, labels = connected_components(graph, directed=False)
        for label in range(count):
            component = vertices[labels[weld] == label]
            if len(component) < 8:
                continue
            digit_joints = {finger: [i for i, name in enumerate(names) if side + "Hand" + finger in name]
                            for finger in FINGERS}
            finger = max(FINGERS, key=lambda digit: float(dense[np.ix_(component, digit_joints[digit])].sum()))
            selected = digit_joints[finger]
            own = dense[np.ix_(component, selected)]
            missing = own.sum(axis=1) < 1e-5
            if np.any(missing):
                valid = ~missing
                tree = cKDTree(positions[component[valid]])
                distance, nearest = tree.query(positions[component[missing]], k=min(4, int(sum(valid))))
                distance = np.asarray(distance).reshape(int(sum(missing)), -1)
                nearest = np.asarray(nearest).reshape(int(sum(missing)), -1)
                factors = 1 / np.maximum(distance, 0.0001) ** 2
                factors /= factors.sum(axis=1)[:, None]
                own[missing] = np.einsum("nk,nkf->nf", factors, own[valid][nearest])
                replaced += int(sum(missing))
            dense[component] = 0
            dense[np.ix_(component, selected)] = own

    # Relax abrupt weight changes over mesh edges, with UV duplicates welded. No
    # position/index/normal data changes and no nearest-neighbour cross-finger links.
    unique, weld = np.unique(np.round(positions, 6), axis=0, return_inverse=True)
    averaged = np.zeros((len(unique), len(names)))
    np.add.at(averaged, weld, dense)
    averaged /= np.bincount(weld)[:, None]
    pairs = np.unique(np.sort(weld[edges], axis=1), axis=0)
    pairs = pairs[pairs[:, 0] != pairs[:, 1]]
    distance = np.linalg.norm(unique[pairs[:, 0]] - unique[pairs[:, 1]], axis=1)
    coefficients = 1 / np.maximum(distance, 0.001)
    graph = coo_matrix((np.r_[coefficients, coefficients],
                        (np.r_[pairs[:, 0], pairs[:, 1]], np.r_[pairs[:, 1], pairs[:, 0]])),
                       shape=(len(unique), len(unique))).tocsr()
    total = np.asarray(graph.sum(axis=1)).ravel()
    total[total == 0] = 1
    relax = np.zeros(len(unique), dtype=bool)
    relax[np.unique(weld[near])] = True
    for _ in range(4):
        neighbour = graph @ averaged / total[:, None]
        averaged[relax] = 0.5 * averaged[relax] + 0.5 * neighbour[relax]
    dense[near] = averaged[weld[near]]
    # Smoothing must not reintroduce forbidden influences through the wrist boundary.
    for region, allowed in regions:
        dense[np.ix_(np.flatnonzero(region), np.flatnonzero(~allowed))] = 0
    if np.any(dense.sum(axis=1) <= 0):
        raise ValueError("Repair would leave a vertex without a valid influence.")
    new_joints = np.argsort(-dense, axis=1, kind="stable")[:, :4]
    new_weights = np.take_along_axis(dense, new_joints, axis=1)
    new_weights /= new_weights.sum(axis=1)[:, None]
    changed = np.max(np.abs(dense / dense.sum(axis=1)[:, None] - original), axis=1) > 1e-7
    result = bytearray(glb.data)
    for semantic, values in (("JOINTS_0", new_joints), ("WEIGHTS_0", new_weights)):
        glb.accessor(attrs[semantic], result)[changed] = values[changed]
    ranges = sorted([glb.accessor_range(attrs[semantic]) for semantic in ("JOINTS_0", "WEIGHTS_0")])
    start = 0
    untouched = bytearray()
    for lo, hi in ranges:
        if result[start:lo] != glb.data[start:lo]:
            raise ValueError("Bytes outside the skin attributes changed.")
        untouched.extend(glb.data[start:lo])
        start = hi
    untouched.extend(glb.data[start:])
    if result[start:] != glb.data[start:]:
        raise ValueError("Bytes outside the skin attributes changed.")
    report = {"sourceSha256": sha256(glb.data), "repairedSha256": sha256(result),
              "byteLength": len(result), "jointCount": len(names),
              "modifiedVertices": int(sum(changed)), "modifiedHandAndWristVertices": int(sum(changed & near)),
              "remoteVerticesWithInvalidHandWeightsRemoved": int(sum(changed & ~near)),
              "verticesReassignedFromWrongFinger": replaced,
              "removedInfluences": len(removed),
              "largestInvalidInfluences": sorted(removed, key=lambda item: -item["weight"])[:10],
              "allowedByteRanges": ranges, "unchangedBytesSha256": sha256(untouched)}
    return bytes(result), report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="Back up and update both matching Shaq copies.")
    args = parser.parse_args()
    source = BACKUP if BACKUP.exists() else ACTIVE
    data = source.read_bytes()
    if sha256(data) != ORIGINAL_SHA256:
        raise SystemExit("Source differs from the audited Shaq asset; refusing an unaudited repair.")
    candidate, report = repair(Glb(data))
    report["before"] = stress(Glb(data))
    report["after"] = stress(Glb(candidate))
    if report["after"]["edgesGrowingOver8cmAcrossPoses"] != 0:
        raise SystemExit("Candidate failed the hand-deformation stress check; nothing was written.")
    if args.write:
        for path in (ACTIVE, AUTHORING):
            if sha256(path.read_bytes()) not in (ORIGINAL_SHA256, report["repairedSha256"]):
                raise SystemExit(f"Refusing to overwrite a separately modified asset: {path}")
        BACKUP.parent.mkdir(parents=True, exist_ok=True)
        if not BACKUP.exists():
            BACKUP.write_bytes(data)
        for path in (ACTIVE, AUTHORING):
            if path.read_bytes() != candidate:
                path.write_bytes(candidate)
        if not REPORT.exists() or json.loads(REPORT.read_text()) != report:
            REPORT.write_text(json.dumps(report, indent=2) + "\n")
    else:
        for path in (ACTIVE, AUTHORING):
            if path.read_bytes() != candidate:
                raise SystemExit(f"Repair not applied to {path.relative_to(ROOT)}; use --write.")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
