const { SYSTEM_ACTOR_NAME } = require("../../../utils/permissions");

// The signed-in user: name, role and effective permissions grouped by module.
module.exports = {
  name: "whoami",
  description: "Who the signed-in user is: name, role and effective permissions grouped by module "
    + "(e.g. { students: [\"view\", \"edit\"] }). Use it before saying what the user can or cannot do.",
  input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
  async run(input, ctx) {
    const { actor } = ctx;
    const permissions = {};
    for (const key of [...actor.permissions].sort()) {
      const [module, leaf] = key.split(".");
      (permissions[module] ||= []).push(leaf);
    }
    return {
      name: actor.isSystem ? SYSTEM_ACTOR_NAME : actor.name || "",
      role: actor.isSystem ? "system" : actor.role || null,
      permissions,
    };
  },
};
