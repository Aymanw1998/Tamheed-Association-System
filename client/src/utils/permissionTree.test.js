import {
  HIDDEN_MODULES, visibleModules, expandKeys, effectiveOf, moduleState, sourceOf,
  toggleModule, toggleKey, diffSummary, isModuleGrantable, isLeafEditable, isResettable,
} from "./permissionTree";
import { PERMISSION_TREE } from "./permissionKeys";

const studentLeaves = PERMISSION_TREE.students.map((l) => `students.${l}`);

describe("visible modules", () => {
  test("only finance is hidden; sports is visible", () => {
    expect(HIDDEN_MODULES).toEqual(["finance"]);
    expect(visibleModules()).toContain("sports");
    expect(visibleModules()).not.toContain("finance");
    expect(visibleModules()).toContain("students");
  });
});

describe("expandKeys / effectiveOf", () => {
  test("a module key expands to its leaves (tree order); unknown keys drop", () => {
    expect(expandKeys(["ai", "x.y", "students.view"])).toEqual(["students.view", "ai.use"]);
  });

  test("effective = (defaults + grants) - revokes", () => {
    const eff = effectiveOf({ defaults: ["students.view", "ai.use"], grants: ["files"], revokes: ["ai.use"] });
    expect(eff).toEqual(["students.view", "files.use", "files.manageAll"]);
  });
});

describe("moduleState is tri-state", () => {
  test("all, some and none", () => {
    expect(moduleState("students", studentLeaves)).toBe("all");
    expect(moduleState("students", ["students.view"])).toBe("some");
    expect(moduleState("students", ["ai.use"])).toBe("none");
    expect(moduleState("students", undefined)).toBe("none");
  });
});

describe("sourceOf", () => {
  const state = { defaults: ["students.view", "students.edit"], grants: ["files.use"], revokes: ["students.edit"] };
  test("role, granted, revoked, none", () => {
    expect(sourceOf("students.view", state)).toBe("role");
    expect(sourceOf("files.use", state)).toBe("granted");
    expect(sourceOf("students.edit", state)).toBe("revoked");
    expect(sourceOf("students.delete", state)).toBe("none");
  });
  test("a module grant or revoke covers its leaves", () => {
    expect(sourceOf("ai.use", { defaults: [], grants: ["ai"], revokes: [] })).toBe("granted");
    expect(sourceOf("students.view", { defaults: ["students.view"], grants: [], revokes: ["students"] })).toBe("revoked");
  });
});

describe("toggleKey", () => {
  const base = { defaults: ["students.view"], grants: [], revokes: [] };

  test("turning a default key off adds a revoke; on again removes it without a grant", () => {
    const off = toggleKey(base, "students.view", false);
    expect(off).toEqual({ grants: [], revokes: ["students.view"] });
    const on = toggleKey({ ...base, ...off }, "students.view", true);
    expect(on).toEqual({ grants: [], revokes: [] });
  });

  test("turning a non-default key on grants it; off removes the grant without a revoke", () => {
    const on = toggleKey(base, "students.delete", true);
    expect(on).toEqual({ grants: ["students.delete"], revokes: [] });
    const off = toggleKey({ ...base, ...on }, "students.delete", false);
    expect(off).toEqual({ grants: [], revokes: [] });
  });

  test("splits a module revoke, keeping only revokes that still matter", () => {
    const state = { defaults: ["students.view", "students.edit"], grants: [], revokes: ["students"] };
    expect(toggleKey(state, "students.view", true)).toEqual({ grants: [], revokes: ["students.edit"] });
  });

  test("splits a module grant into the leaves that are not defaults", () => {
    const state = { defaults: ["files.use"], grants: ["files"], revokes: [] };
    expect(toggleKey(state, "files.manageAll", false)).toEqual({ grants: [], revokes: [] });
  });

  test("leaves unrelated entries alone", () => {
    const state = { defaults: [], grants: ["ai.use"], revokes: ["lessons.view"] };
    expect(toggleKey(state, "files.use", true)).toEqual({ grants: ["ai.use", "files.use"], revokes: ["lessons.view"] });
  });
});

describe("toggleModule", () => {
  test("module off writes one module revoke and drops child grants", () => {
    const state = { defaults: ["students.view"], grants: ["students.delete", "ai.use"], revokes: ["students.edit"] };
    expect(toggleModule(state, "students", false)).toEqual({ grants: ["ai.use"], revokes: ["students"] });
  });

  test("module on drops its revokes and grants only the non-default leaves", () => {
    const state = { defaults: ["ai.use", "files.use"], grants: [], revokes: ["files"] };
    expect(toggleModule(state, "files", true)).toEqual({ grants: ["files.manageAll"], revokes: [] });
  });

  test("module on with no defaults grants the module key", () => {
    expect(toggleModule({ defaults: [], grants: ["files.use"], revokes: [] }, "files", true))
      .toEqual({ grants: ["files"], revokes: [] });
  });

  test("module on when every leaf is a default adds no grant", () => {
    expect(toggleModule({ defaults: ["ai.use"], grants: [], revokes: ["ai"] }, "ai", true))
      .toEqual({ grants: [], revokes: [] });
  });
});

describe("isModuleGrantable", () => {
  test("needs every leaf", () => {
    expect(isModuleGrantable("files", ["files.use", "files.manageAll"])).toBe(true);
    expect(isModuleGrantable("files", ["files.use"])).toBe(false);
  });
});

describe("diffSummary", () => {
  test("lists exact keys added and removed, in tree order", () => {
    expect(diffSummary(["students.view", "ai.use"], ["files.use", "students.view", "students.edit"]))
      .toEqual({ added: ["students.edit", "files.use"], removed: ["ai.use"] });
  });
  test("no change gives empty lists", () => {
    expect(diffSummary(["ai.use"], ["ai.use"])).toEqual({ added: [], removed: [] });
  });
});

describe("fix round 1", () => {
  test("splitting a module revoke keeps leaves that are defaults or currently granted", () => {
    const state = { defaults: ["students.view"], grants: ["students.delete"], revokes: ["students"] };
    expect(toggleKey(state, "students.view", true))
      .toEqual({ grants: ["students.delete"], revokes: ["students.delete"] });
  });

  test("splitting a module grant drops leaves that are defaults or revoked", () => {
    const state = { defaults: ["files.use"], grants: ["vehicles"], revokes: ["vehicles.archive"] };
    expect(toggleKey(state, "vehicles.delete", false)).toEqual({
      grants: ["vehicles.view", "vehicles.edit", "vehicles.compliance", "vehicles.documents"],
      revokes: ["vehicles.archive"],
    });
  });

  test("module off with no default leaves only drops its grants (no module revoke)", () => {
    const state = { defaults: ["ai.use"], grants: ["vehicles.view", "ai.use"], revokes: ["vehicles.edit"] };
    expect(toggleModule(state, "vehicles", false)).toEqual({ grants: ["ai.use"], revokes: [] });
  });

  test("isLeafEditable: a bare module grant/revoke the viewer cannot fully grant locks its leaves", () => {
    const grantable = ["files.use"];
    expect(isLeafEditable("files", { grants: ["files"], revokes: [] }, grantable)).toBe(false);
    expect(isLeafEditable("files", { grants: [], revokes: ["files"] }, grantable)).toBe(false);
    expect(isLeafEditable("files", { grants: ["files.manageAll"], revokes: [] }, grantable)).toBe(true);
    expect(isLeafEditable("files", { grants: ["files"], revokes: [] }, ["files.use", "files.manageAll"])).toBe(true);
  });

  test("isResettable: every existing grant and revoke must be grantable", () => {
    expect(isResettable({ grants: ["ai.use"], revokes: ["files"] }, ["ai.use", "files.use", "files.manageAll"])).toBe(true);
    expect(isResettable({ grants: ["ai.use"], revokes: ["files"] }, ["ai.use", "files.use"])).toBe(false);
    expect(isResettable({ grants: [], revokes: [] }, [])).toBe(true);
  });
});
