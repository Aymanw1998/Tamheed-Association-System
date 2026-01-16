import React, { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";

function Toolbar({ editor }) {
    if (!editor) return null;

    const addImageByUrl = () => {
        const url = window.prompt("Image URL");
        if (!url) return;
        editor.chain().focus().setImage({ src: url }).run();
    };

    const addLink = () => {
        const prev = editor.getAttributes("link").href || "";
        const url = window.prompt("Link URL", prev);
        if (url === null) return; // cancel
        if (url === "") {
        editor.chain().focus().unsetLink().run();
        return;
        }
        editor.chain().focus().setLink({ href: url }).run();
    };

    const setColor = () => {
        const color = window.prompt("Color (e.g. #111111, red)", "#111111");
        if (!color) return;
        editor.chain().focus().setColor(color).run();
    };

    return (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: 8, borderBottom: "1px solid #ddd" }}>
        <button onClick={() => editor.chain().focus().toggleBold().run()} type="button">
            Bold
        </button>
        <button onClick={() => editor.chain().focus().toggleItalic().run()} type="button">
            Italic
        </button>
        <button onClick={() => editor.chain().focus().toggleUnderline().run()} type="button">
            Underline
        </button>
        <button onClick={() => editor.chain().focus().toggleHighlight().run()} type="button">
            Highlight
        </button>
        <button onClick={setColor} type="button">
            Text color
        </button>

        <span style={{ width: 8 }} />

        <button onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} type="button">
            H1
        </button>
        <button onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} type="button">
            H2
        </button>
        <button onClick={() => editor.chain().focus().toggleBulletList().run()} type="button">
            • List
        </button>
        <button onClick={() => editor.chain().focus().toggleOrderedList().run()} type="button">
            1. List
        </button>

        <span style={{ width: 8 }} />

        <button onClick={() => editor.chain().focus().setTextAlign("right").run()} type="button">
            Align Right
        </button>
        <button onClick={() => editor.chain().focus().setTextAlign("center").run()} type="button">
            Align Center
        </button>
        <button onClick={() => editor.chain().focus().setTextAlign("left").run()} type="button">
            Align Left
        </button>

        <span style={{ width: 8 }} />

        <button onClick={addLink} type="button">
            Link
        </button>
        <button onClick={addImageByUrl} type="button">
            Image (URL)
        </button>
        <button onClick={() => editor.chain().focus().undo().run()} type="button">
            Undo
        </button>
        <button onClick={() => editor.chain().focus().redo().run()} type="button">
            Redo
        </button>
        </div>
    );
    }

    export default function TiptapEditor({
    valueHtml,
    onChangeHtml,
    dir = "rtl", // rtl / ltr
    }) {
    const editor = useEditor({
        extensions: [
        StarterKit,
        Underline,
        TextStyle,
        Color,
        Highlight,
        Link.configure({ openOnClick: false }),
        Image.configure({ inline: false }),
        TextAlign.configure({ types: ["heading", "paragraph"] }),
        ],
        content: valueHtml || "<p></p>",
        onUpdate: ({ editor }) => {
        const html = editor.getHTML();
        onChangeHtml?.(html);
        },
    });

    // If parent updates valueHtml later
    useEffect(() => {
        if (!editor) return;
        if (typeof valueHtml === "string") {
        const current = editor.getHTML();
        if (valueHtml !== current) editor.commands.setContent(valueHtml, false);
        }
    }, [valueHtml, editor]);

    return (
        <div style={{ border: "1px solid #ddd", borderRadius: 10, overflow: "hidden" }}>
        <Toolbar editor={editor} />
        <div style={{ padding: 12 }}>
            <EditorContent
            editor={editor}
            style={{
                minHeight: 300,
                outline: "none",
                direction: dir,
                textAlign: dir === "rtl" ? "right" : "left",
            }}
            />
        </div>
        </div>
    );
}
