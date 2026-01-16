import { useParams } from "react-router-dom";
import OnlyOfficeEditor from "./OnlyOfficeEditor";

export default function ReportEditorOnlyPage() {
      const { id } = useParams();

  return (
    <div style={{ height: "100vh", width: "100vw" }}>
      <OnlyOfficeEditor docId={id}/>
    </div>
  );
}
