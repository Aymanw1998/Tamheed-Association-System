import React from "react";

// The red star after the label of a field that blocks saving when empty.
export default function RequiredMark() {
  return <span style={{ color: "red" }} aria-hidden="true"> *</span>;
}
