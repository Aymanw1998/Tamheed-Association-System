// Which screen ("section") each permission module belongs to; null = no screen of its own.
export const SECTIONS = {
  dashboard: { path: "/dashboard", tourId: "dashboard" },
  calendar: { path: "/calendar", tourId: "calendar" },
  students: { path: "/students", tourId: "students" },
  lessons: { path: "/lessons", tourId: "lessons" },
  reports: { path: "/reports", tourId: "reports" },
  vehicles: { path: "/vehicles", tourId: "vehicles" },
  files: { path: "/files", tourId: "files" },
  notices: { path: "/notices", tourId: "notices" },
  users: { path: "/users", tourId: "users" },
  audit: { path: "/audit", tourId: "audit" },
};

export const SECTION_OF = {
  dashboard: "dashboard",
  calendar: "calendar",
  attendance: "calendar",
  students: "students",
  lessons: "lessons",
  reports: "reports",
  vehicles: "vehicles",
  files: "files",
  notices: "notices",
  users: "users",
  permissions: "users",
  audit: "audit",
  ai: null,
  systemRecovery: null,
  sports: null,
  finance: null,
};
