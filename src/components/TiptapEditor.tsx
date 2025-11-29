import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import FontFamily from '@tiptap/extension-font-family';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { forwardRef, useImperativeHandle, useEffect } from 'react';

export interface TiptapEditorHandle {
  getEditor: () => Editor | null;
  getHTML: () => string;
  getText: () => string;
  setContent: (content: string) => void;
  insertContent: (content: string) => void;
  clearContent: () => void;
  focus: () => void;
  // Formatting commands
  toggleBold: () => void;
  toggleItalic: () => void;
  toggleUnderline: () => void;
  toggleStrike: () => void;
  setTextColor: (color: string) => void;
  setHighlight: (color: string) => void;
  setFontFamily: (font: string) => void;
  setFontSize: (size: string) => void;
  setHeading: (level: 1 | 2 | 3 | 4 | 5 | 6) => void;
  setParagraph: () => void;
  toggleBulletList: () => void;
  toggleOrderedList: () => void;
  toggleBlockquote: () => void;
  toggleCodeBlock: () => void;
  setTextAlign: (align: 'left' | 'center' | 'right' | 'justify') => void;
  setLink: (url: string) => void;
  unsetLink: () => void;
  insertHorizontalRule: () => void;
  clearFormatting: () => void;
  undo: () => void;
  redo: () => void;
  indent: () => void;
  outdent: () => void;
  setTextIndent: (indent: string) => void;
  unsetTextIndent: () => void;
}

export interface EditorState {
  isBold: boolean;
  isItalic: boolean;
  isUnderline: boolean;
  isStrike: boolean;
  textColor: string | null;
  highlightColor: string | null;
  fontFamily: string | null;
  fontSize: string | null;
  headingLevel: number | null; // null = paragraph, 1-6 = heading level
  textAlign: 'left' | 'center' | 'right' | 'justify';
  isBulletList: boolean;
  isOrderedList: boolean;
  isBlockquote: boolean;
  isCodeBlock: boolean;
  isLink: boolean;
}

interface TiptapEditorProps {
  content?: string;
  onUpdate?: (html: string) => void;
  onBlur?: () => void;
  onSelectionUpdate?: (state: EditorState) => void;
  placeholder?: string;
  className?: string;
}

// Custom extension to add font-size support
import { Extension } from '@tiptap/core';

const FontSize = Extension.create({
  name: 'fontSize',

  addOptions() {
    return {
      types: ['textStyle'],
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: element => element.style.fontSize?.replace(/['"]+/g, ''),
            renderHTML: attributes => {
              if (!attributes.fontSize) {
                return {};
              }
              return {
                style: `font-size: ${attributes.fontSize}`,
              };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setFontSize: (fontSize: string) => ({ chain }) => {
        return chain()
          .setMark('textStyle', { fontSize })
          .run();
      },
      unsetFontSize: () => ({ chain }) => {
        return chain()
          .setMark('textStyle', { fontSize: null })
          .removeEmptyTextStyle()
          .run();
      },
    };
  },
});

// Custom extension to add text-indent support for paragraphs (essay-style first-line indentation)
const TextIndent = Extension.create({
  name: 'textIndent',

  addOptions() {
    return {
      types: ['paragraph', 'heading'],
      defaultIndent: '2em',
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          textIndent: {
            default: null,
            parseHTML: element => element.style.textIndent || null,
            renderHTML: attributes => {
              if (!attributes.textIndent) {
                return {};
              }
              return {
                style: `text-indent: ${attributes.textIndent}`,
              };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setTextIndent: (indent: string) => ({ commands }) => {
        return this.options.types.every((type: string) => 
          commands.updateAttributes(type, { textIndent: indent })
        );
      },
      unsetTextIndent: () => ({ commands }) => {
        return this.options.types.every((type: string) => 
          commands.updateAttributes(type, { textIndent: null })
        );
      },
    };
  },
});

// Extend module types for custom commands
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fontSize: {
      setFontSize: (fontSize: string) => ReturnType;
      unsetFontSize: () => ReturnType;
    };
    textIndent: {
      setTextIndent: (indent: string) => ReturnType;
      unsetTextIndent: () => ReturnType;
    };
  }
}

const TiptapEditor = forwardRef<TiptapEditorHandle, TiptapEditorProps>(
  ({ content = '', onUpdate, onBlur, onSelectionUpdate, placeholder = 'Start typing...', className = '' }, ref) => {
    
    // Helper to get current editor state for toolbar sync
    const getEditorState = (editor: Editor): EditorState => {
      const textStyleAttrs = editor.getAttributes('textStyle');
      const highlightAttrs = editor.getAttributes('highlight');
      
      // Determine heading level
      let headingLevel: number | null = null;
      for (let level = 1; level <= 6; level++) {
        if (editor.isActive('heading', { level })) {
          headingLevel = level;
          break;
        }
      }
      
      // Get text alignment
      let textAlign: 'left' | 'center' | 'right' | 'justify' = 'left';
      if (editor.isActive({ textAlign: 'center' })) textAlign = 'center';
      else if (editor.isActive({ textAlign: 'right' })) textAlign = 'right';
      else if (editor.isActive({ textAlign: 'justify' })) textAlign = 'justify';
      
      return {
        isBold: editor.isActive('bold'),
        isItalic: editor.isActive('italic'),
        isUnderline: editor.isActive('underline'),
        isStrike: editor.isActive('strike'),
        textColor: textStyleAttrs.color || null,
        highlightColor: highlightAttrs.color || null,
        fontFamily: textStyleAttrs.fontFamily || null,
        fontSize: textStyleAttrs.fontSize || null,
        headingLevel,
        textAlign,
        isBulletList: editor.isActive('bulletList'),
        isOrderedList: editor.isActive('orderedList'),
        isBlockquote: editor.isActive('blockquote'),
        isCodeBlock: editor.isActive('codeBlock'),
        isLink: editor.isActive('link'),
      };
    };
    
    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          heading: {
            levels: [1, 2, 3, 4, 5, 6],
          },
        }),
        TextStyle,
        Color,
        Highlight.configure({
          multicolor: true,
        }),
        FontFamily,
        FontSize,
        Underline,
        TextAlign.configure({
          types: ['heading', 'paragraph'],
        }),
        Link.configure({
          openOnClick: false,
          HTMLAttributes: {
            class: 'tiptap-link',
          },
        }),
        Placeholder.configure({
          placeholder,
        }),
        TextIndent,
      ],
      content,
      immediatelyRender: false, // Prevents duplicate extension warning in React 18 Strict Mode
      onUpdate: ({ editor }) => {
        onUpdate?.(editor.getHTML());
        onSelectionUpdate?.(getEditorState(editor));
      },
      onSelectionUpdate: ({ editor }) => {
        onSelectionUpdate?.(getEditorState(editor));
      },
      onBlur: () => {
        onBlur?.();
      },
      editorProps: {
        attributes: {
          class: 'tiptap-editor-content',
        },
      },
    });

    // Sync content when it changes externally
    useEffect(() => {
      if (editor && content !== editor.getHTML()) {
        editor.commands.setContent(content, { emitUpdate: false });
      }
    }, [content, editor]);

    // Expose editor methods via ref
    useImperativeHandle(ref, () => ({
      getEditor: () => editor,
      getHTML: () => editor?.getHTML() || '',
      getText: () => editor?.getText() || '',
      setContent: (newContent: string) => {
        editor?.commands.setContent(newContent);
      },
      insertContent: (newContent: string) => {
        editor?.commands.insertContent(newContent);
      },
      clearContent: () => {
        editor?.commands.clearContent();
      },
      focus: () => {
        editor?.commands.focus();
      },
      toggleBold: () => {
        editor?.chain().focus().toggleBold().run();
      },
      toggleItalic: () => {
        editor?.chain().focus().toggleItalic().run();
      },
      toggleUnderline: () => {
        editor?.chain().focus().toggleUnderline().run();
      },
      toggleStrike: () => {
        editor?.chain().focus().toggleStrike().run();
      },
      setTextColor: (color: string) => {
        editor?.chain().focus().setColor(color).run();
      },
      setHighlight: (color: string) => {
        editor?.chain().focus().setHighlight({ color }).run();
      },
      setFontFamily: (font: string) => {
        editor?.chain().focus().setFontFamily(font).run();
      },
      setFontSize: (size: string) => {
        const sizeWithUnit = size.includes('pt') || size.includes('px') ? size : `${size}pt`;
        editor?.chain().focus().setFontSize(sizeWithUnit).run();
      },
      setHeading: (level: 1 | 2 | 3 | 4 | 5 | 6) => {
        editor?.chain().focus().toggleHeading({ level }).run();
      },
      setParagraph: () => {
        editor?.chain().focus().setParagraph().run();
      },
      toggleBulletList: () => {
        editor?.chain().focus().toggleBulletList().run();
      },
      toggleOrderedList: () => {
        editor?.chain().focus().toggleOrderedList().run();
      },
      toggleBlockquote: () => {
        editor?.chain().focus().toggleBlockquote().run();
      },
      toggleCodeBlock: () => {
        editor?.chain().focus().toggleCodeBlock().run();
      },
      setTextAlign: (align: 'left' | 'center' | 'right' | 'justify') => {
        editor?.chain().focus().setTextAlign(align).run();
      },
      setLink: (url: string) => {
        editor?.chain().focus().setLink({ href: url }).run();
      },
      unsetLink: () => {
        editor?.chain().focus().unsetLink().run();
      },
      insertHorizontalRule: () => {
        editor?.chain().focus().setHorizontalRule().run();
      },
      clearFormatting: () => {
        editor?.chain().focus().unsetAllMarks().clearNodes().run();
      },
      undo: () => {
        editor?.chain().focus().undo().run();
      },
      redo: () => {
        editor?.chain().focus().redo().run();
      },
      indent: () => {
        // For lists, sink the list item
        if (editor?.isActive('listItem')) {
          editor?.chain().focus().sinkListItem('listItem').run();
        }
      },
      outdent: () => {
        // For lists, lift the list item
        if (editor?.isActive('listItem')) {
          editor?.chain().focus().liftListItem('listItem').run();
        }
      },
      setTextIndent: (indent: string) => {
        editor?.chain().focus().setTextIndent(indent).run();
      },
      unsetTextIndent: () => {
        editor?.chain().focus().unsetTextIndent().run();
      },
    }), [editor]);

    if (!editor) {
      return null;
    }

    return (
      <EditorContent editor={editor} className={className} />
    );
  }
);

TiptapEditor.displayName = 'TiptapEditor';

export default TiptapEditor;

