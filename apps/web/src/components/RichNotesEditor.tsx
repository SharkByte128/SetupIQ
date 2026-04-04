import { useCallback, useRef, useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import TurndownService from "turndown";
import { marked } from "marked";
import { resizeImage } from "../lib/resize-image.js";

// ── Markdown ↔ HTML conversion ────────────────────────────────

const turndown = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
});

function mdToHtml(md: string): string {
  if (!md) return "";
  return marked.parse(md, { async: false }) as string;
}

function htmlToMd(html: string): string {
  if (!html || html === "<p></p>") return "";
  return turndown.turndown(html);
}

// ── Image paste / upload helper ───────────────────────────────

async function fileToBase64DataUrl(file: File): Promise<string> {
  const resized = await resizeImage(file, 800);
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(resized);
  });
}

// ── Toolbar Button ────────────────────────────────────────────

function TbBtn({
  active,
  disabled,
  onClick,
  children,
  title,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      className={`px-1.5 py-1 rounded text-xs font-medium transition-colors ${
        active
          ? "bg-blue-600 text-white"
          : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700"
      } disabled:opacity-30 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  );
}

// ── Toolbar ───────────────────────────────────────────────────

function Toolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const insertImage = useCallback(
    async (file: File) => {
      if (!editor) return;
      const dataUrl = await fileToBase64DataUrl(file);
      editor.chain().focus().setImage({ src: dataUrl }).run();
    },
    [editor],
  );

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file && file.type.startsWith("image/")) {
        insertImage(file);
      }
      e.target.value = "";
    },
    [insertImage],
  );

  if (!editor) return null;

  return (
    <div className="flex items-center gap-0.5 flex-wrap border-b border-neutral-700 px-2 py-1.5 bg-neutral-900/50">
      <TbBtn
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
        title="Bold"
      >
        <strong>B</strong>
      </TbBtn>
      <TbBtn
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title="Italic"
      >
        <em>I</em>
      </TbBtn>
      <TbBtn
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        title="Strikethrough"
      >
        <s>S</s>
      </TbBtn>

      <div className="w-px h-4 bg-neutral-700 mx-1" />

      <TbBtn
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        title="Heading"
      >
        H2
      </TbBtn>
      <TbBtn
        active={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        title="Sub-heading"
      >
        H3
      </TbBtn>

      <div className="w-px h-4 bg-neutral-700 mx-1" />

      <TbBtn
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        title="Bullet list"
      >
        •&thinsp;List
      </TbBtn>
      <TbBtn
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        title="Numbered list"
      >
        1.&thinsp;List
      </TbBtn>

      <div className="w-px h-4 bg-neutral-700 mx-1" />

      <TbBtn
        onClick={() => fileInputRef.current?.click()}
        title="Insert image"
      >
        🖼️
      </TbBtn>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileUpload}
      />
    </div>
  );
}

// ── Main Editor Component ─────────────────────────────────────

interface RichNotesEditorProps {
  /** Markdown string value */
  value: string;
  /** Called with updated markdown string */
  onChange: (md: string) => void;
  /** Placeholder text when empty */
  placeholder?: string;
  /** Minimum height in pixels */
  minHeight?: number;
}

export function RichNotesEditor({
  value,
  onChange,
  placeholder = "Add notes…",
  minHeight = 120,
}: RichNotesEditorProps) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Image.configure({
        inline: false,
        allowBase64: true,
        HTMLAttributes: {
          class: "rounded-lg max-w-full",
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
    ],
    content: mdToHtml(value),
    editorProps: {
      attributes: {
        class: "rich-notes text-sm text-neutral-100 px-3 py-2 min-h-[var(--editor-min-h)] focus:outline-none",
        style: `--editor-min-h: ${minHeight}px`,
      },
      handlePaste(view, event) {
        const items = event.clipboardData?.items;
        if (!items) return false;

        for (const item of items) {
          if (item.type.startsWith("image/")) {
            event.preventDefault();
            const file = item.getAsFile();
            if (file) {
              fileToBase64DataUrl(file).then((dataUrl) => {
                view.dispatch(
                  view.state.tr.replaceSelectionWith(
                    view.state.schema.nodes.image.create({ src: dataUrl }),
                  ),
                );
              });
            }
            return true;
          }
        }
        return false;
      },
      handleDrop(view, event) {
        const files = event.dataTransfer?.files;
        if (!files?.length) return false;

        for (const file of files) {
          if (file.type.startsWith("image/")) {
            event.preventDefault();
            const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
            if (!coords) return false;

            fileToBase64DataUrl(file).then((dataUrl) => {
              const node = view.state.schema.nodes.image.create({ src: dataUrl });
              const tr = view.state.tr.insert(coords.pos, node);
              view.dispatch(tr);
            });
            return true;
          }
        }
        return false;
      },
    },
    onUpdate({ editor: e }) {
      const html = e.getHTML();
      const md = htmlToMd(html);
      onChangeRef.current(md);
    },
  });

  // Sync external value changes (e.g. when switching between setups)
  const lastValueRef = useRef(value);
  useEffect(() => {
    if (editor && value !== lastValueRef.current) {
      lastValueRef.current = value;
      const html = mdToHtml(value);
      if (editor.getHTML() !== html) {
        editor.commands.setContent(html);
      }
    }
  }, [editor, value]);

  return (
    <div className="rounded-lg bg-neutral-900 border border-neutral-700 overflow-hidden focus-within:border-blue-500 transition-colors">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}

// ── Read-only Markdown Display ────────────────────────────────

interface MarkdownDisplayProps {
  /** Markdown string to render */
  content: string;
  /** Additional CSS class */
  className?: string;
}

export function MarkdownDisplay({ content, className = "" }: MarkdownDisplayProps) {
  if (!content) return null;
  const html = mdToHtml(content);

  return (
    <div
      className={`rich-notes text-sm text-neutral-300 ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
