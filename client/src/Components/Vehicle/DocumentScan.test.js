import { loadStatus } from "./DocumentScan";
import { getExtractStatus } from "../../WebServer/services/vehicle/functionsVehicle.jsx";
import { startDemo, stopDemo } from "../../journey/demoMode";

jest.mock("../../WebServer/services/vehicle/functionsVehicle.jsx", () => ({
  extractVehicleDocument: jest.fn(),
  getExtractStatus: jest.fn(),
}));

afterEach(() => stopDemo());

test("training mode's 'not available' does not stick once real data is back", async () => {
  // In training mode the demo store says document reading is off.
  getExtractStatus.mockResolvedValue({ ok: true, available: false });
  startDemo();
  await expect(loadStatus()).resolves.toBe(false);
  await expect(loadStatus()).resolves.toBe(false);
  expect(getExtractStatus).toHaveBeenCalledTimes(1);

  getExtractStatus.mockResolvedValue({ ok: true, available: true });
  stopDemo();
  await expect(loadStatus()).resolves.toBe(true);
  // Shared again within the same mode.
  await expect(loadStatus()).resolves.toBe(true);
  expect(getExtractStatus).toHaveBeenCalledTimes(2);
});
