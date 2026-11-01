import { useParams } from "react-router-dom";

// /<entity>/new opens the form (which reads id "new" from the same param);
// any other id opens the record's read-only page. One route keeps the
// forms' existing id handling unchanged.
export default function RecordRoute({ view, form }) {
  const { id } = useParams();
  return id === "new" ? form : view;
}
