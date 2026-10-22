// Which screen ("section") each permission module belongs to; null = no screen of its own.
// `chapterId` is the guided-journey chapter that the new-access card's «أرني» runs.
export const SECTIONS = {
  dashboard: { path: "/dashboard", chapterId: "journey-dashboard" },
  calendar: { path: "/calendar", chapterId: "journey-attendance" },
  students: { path: "/students", chapterId: "journey-students" },
  lessons: { path: "/lessons", chapterId: "journey-lessons" },
  reports: { path: "/reports", chapterId: "journey-reports" },
  vehicles: { path: "/vehicles", chapterId: "journey-vehicles" },
  files: { path: "/files", chapterId: "journey-files" },
  notices: { path: "/notices", chapterId: "journey-notices" },
  users: { path: "/users", chapterId: "journey-users" },
  audit: { path: "/audit", chapterId: "journey-audit" },
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
