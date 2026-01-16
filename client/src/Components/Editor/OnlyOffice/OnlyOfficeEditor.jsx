import { useEffect, useRef, useState } from "react";
import { getConfigOnlyOffice } from "../../../WebServer/services/onlyoffice/functionsOnlyOffice";

export default function OnlyOfficeEditor({ docId }) {
    const [config, setConfig] = useState(null);
    const editorInitedRef = useRef(false);

    useEffect(() => {
        editorInitedRef.current = false;
        setConfig(null);

        const load = async () => {
        console.log("Loading OnlyOffice config for docId:", docId);
        const res = await getConfigOnlyOffice(docId);
        console.log("OnlyOffice config loaded:", res);
        if (res?.ok) setConfig(res.data);
        };

        load();
    }, [docId]);

    useEffect(() => {
        if (!config) return;
        if (editorInitedRef.current) return;

        const scriptId = "onlyoffice-api";
        const scriptSrc = "http://localhost:8088/web-apps/apps/api/documents/api.js";

        const init = () => {
        if (!window.DocsAPI) return;

        // מנקה אם יש עורך קודם
        const container = document.getElementById("oo-editor");
        if (container) container.innerHTML = "";

        // eslint-disable-next-line no-undef
        new DocsAPI.DocEditor("oo-editor", config);
        editorInitedRef.current = true;
        };

        // אם כבר נטען
        if (window.DocsAPI) {
        init();
        return;
        }

        // טען פעם אחת
        let s = document.getElementById(scriptId);
        if (!s) {
        s = document.createElement("script");
        s.id = scriptId;
        s.src = scriptSrc;
        s.onload = init;
        document.body.appendChild(s);
        } else {
        // אם הסקריפט קיים אבל עדיין לא נטען, נחכה
        s.addEventListener("load", init);
        }

        return () => {
        if (s) s.removeEventListener("load", init);
        };
    }, [config]);

    return <div id="oo-editor" style={{ width: "100%", height: "calc(100vh - 200px)" }} />;
}
