const rules = require("../../../utils/vehicleRules");
const { rows } = require("./_shared");

const MAX = 50;
const SEVERITY = { expired: 0, due0: 1, due7: 2, due14: 3, due30: 4, due60: 5, missing: 6 };

// Licence, test and insurance alerts, exactly as GET /api/vehicles/alerts:
// vehicles.view sees every alert; anyone else only the vehicles assigned to
// them (often none). The responsible user's id is left out.
module.exports = {
  name: "vehicle_alerts",
  description: "Vehicle document alerts (licence, periodic test, insurance): expired, due soon (level due0/due7/due14/due30/due60) "
    + "or missing. Users with vehicle access see all vehicles; others only the vehicles assigned to them. "
    + "Each alert: vehicleId, plate, nickname, kind, level, dueDate, daysLeft.",
  input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
  async run(input, ctx) {
    const today = rules.todayInJerusalem(ctx.now);
    const all = rows(await ctx.models.Vehicle.get({})).flatMap((v) => rules.buildAlerts(v, today));
    const alerts = rules.hasVehiclePermission(ctx.actor, "view") ? all : rules.filterAlertsForUser(all, ctx.actor);
    alerts.sort((a, b) => SEVERITY[a.level] - SEVERITY[b.level] || (a.daysLeft ?? 0) - (b.daysLeft ?? 0));
    return {
      today,
      count: alerts.length,
      alerts: alerts.slice(0, MAX).map((a) => ({
        vehicleId: a.vehicleId, plate: a.plate, nickname: a.nickname, kind: a.kind,
        level: a.level, dueDate: a.dueDate, daysLeft: a.daysLeft ?? null,
      })),
    };
  },
};
