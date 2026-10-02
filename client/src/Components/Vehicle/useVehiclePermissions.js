import { useEffect, useState } from "react";
import { getMyPermissions } from "../../WebServer/services/vehicle/functionsVehicle.jsx";

// What the signed-in user may do in the vehicles section. The server decides
// and enforces this on every request; the answer here only chooses which
// buttons and tabs to show.
export default function useVehiclePermissions() {
  const [state, setState] = useState({ loading: true, permissions: [], isAdmin: false, error: "" });

  useEffect(() => {
    let live = true;
    getMyPermissions().then((res) => {
      if (!live) return;
      setState(
        res.ok
          ? { loading: false, permissions: res.permissions || [], isAdmin: !!res.isAdmin, error: "" }
          : { loading: false, permissions: [], isAdmin: false, error: res.message || "" }
      );
    });
    return () => {
      live = false;
    };
  }, []);

  return { ...state, can: (permission) => state.permissions.includes(permission) };
}
