"use client";

import {
  BtnBold,
  BtnBulletList,
  BtnClearFormatting,
  BtnItalic,
  BtnLink,
  BtnNumberedList,
  BtnUnderline,
  Editor,
  EditorProvider,
  Separator,
  Toolbar,
} from "react-simple-wysiwyg";

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  minHeight?: number;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  readOnly = false,
  minHeight = 200,
}: RichTextEditorProps) {
  return (
    <EditorProvider>
      <div className="rich-text-editor rounded-md border border-input overflow-hidden bg-background">
        {!readOnly ? (
          <Toolbar>
            <BtnBold />
            <BtnItalic />
            <BtnUnderline />
            <Separator />
            <BtnNumberedList />
            <BtnBulletList />
            <Separator />
            <BtnLink />
            <BtnClearFormatting />
          </Toolbar>
        ) : null}
        <Editor
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          containerProps={{ style: { minHeight } }}
          disabled={readOnly}
        />
      </div>
    </EditorProvider>
  );
}
