import React from "react";

// Disables every input inside while the lock is lost (status "readonly"); the
// typed values stay on the screen. `style` is merged so a flex or grid layout
// of the parent can be kept.
export default function ReadOnlyArea({ readonly, style, children, ...rest }) {
  return (
    <fieldset
      disabled={Boolean(readonly)}
      style={{ border: 0, padding: 0, margin: 0, minWidth: 0, ...style }}
      {...rest}
    >
      {children}
    </fieldset>
  );
}
