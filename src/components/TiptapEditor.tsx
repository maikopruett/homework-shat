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
  // Ghost mode methods
  getCurrentParagraphText: () => string;
  deleteCurrentParagraph: () => void;
  getSelectedTextOrParagraph: () => string;
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
  onGhostSubmit?: (text: string) => void;
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
// Note: We intentionally don't parse text-indent from HTML to prevent accidental indentation
// from pasted content or AI-generated HTML. Text-indent is only applied via explicit commands.
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
            parseHTML: element => {
              // Try element.style first (for proper DOM elements)
              const styleIndent = element.style?.textIndent;
              if (styleIndent && styleIndent.length > 0) {
                return styleIndent;
              }
              // Fallback: parse from style attribute string (for HTML string parsing)
              const styleAttr = element.getAttribute?.('style') || '';
              const match = styleAttr.match(/text-indent:\s*([^;]+)/i);
              return match ? match[1].trim() : null;
            },
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
        return this.options.types
          .map((type: string) => commands.updateAttributes(type, { textIndent: indent }))
          .some((response: boolean) => response);
      },
      unsetTextIndent: () => ({ commands }) => {
        return this.options.types
          .map((type: string) => commands.resetAttributes(type, 'textIndent'))
          .some((response: boolean) => response);
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
  ({ content = '', onUpdate, onBlur, onSelectionUpdate, onGhostSubmit, placeholder = 'Start typing...', className = '' }, ref) => {
    
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
        handleKeyDown: (view, event) => {
          // Handle Ctrl+Enter for Ghost Mode submit
          if (event.ctrlKey && event.key === 'Enter') {
            if (onGhostSubmit && editor) {
              event.preventDefault();
              
              const { state } = view;
              const { selection } = state;
              const { from, to, empty } = selection;
              
              let text: string;
              
              if (!empty) {
                // Has selection - get selected text
                text = state.doc.textBetween(from, to, ' ');
                // Delete the selection
                editor.chain().focus().deleteSelection().run();
              } else {
                // No selection - get current paragraph/block
                const $from = selection.$from;
                const parent = $from.parent;
                text = parent.textContent;
                
                // Find the position range of the current block
                const blockStart = $from.start();
                const blockEnd = $from.end();
                
                // Delete the entire block content
                if (text.trim()) {
                  editor.chain()
                    .focus()
                    .setTextSelection({ from: blockStart, to: blockEnd })
                    .deleteSelection()
                    .run();
                }
              }
              
              // Only submit if there's actual text
              if (text.trim()) {
                onGhostSubmit(text.trim());
              }
              
              return true;
            }
          }
          
          // Handle Tab and Shift+Tab for indentation
          if (event.key === 'Tab') {
            event.preventDefault();

            const { state } = view;
            
            if (event.shiftKey) {
              // Shift+Tab: outdent
              // For list items, lift the item
              if (editor?.isActive('listItem')) {
                editor.chain().focus().liftListItem('listItem').run();
                return true;
              }
              // For regular paragraphs, remove textIndent attribute if present
              const currentNode = state.selection.$from.parent;
              if (currentNode.type.name === 'paragraph' || currentNode.type.name === 'heading') {
                if (currentNode.attrs.textIndent) {
                  editor?.chain().focus().unsetTextIndent().run();
                  return true;
                }
              }
              return true;
            } else {
              // Tab: indent
              // For list items, sink the item
              if (editor?.isActive('listItem')) {
                editor.chain().focus().sinkListItem('listItem').run();
                return true;
              }
              // For regular paragraphs/headings, apply text-indent
              const currentNode = state.selection.$from.parent;
              if (currentNode.type.name === 'paragraph' || currentNode.type.name === 'heading') {
                editor?.chain().focus().setTextIndent('0.5in').run();
                return true;
              }
              return true;
            }
          }
          
          // Handle Backspace at beginning of line to remove textIndent
          if (event.key === 'Backspace') {
            const { state } = view;
            const { selection } = state;
            const { $from } = selection;
            
            // Check if we're at the beginning of a text block (position 1 within parent means start of text)
            const isAtStart = $from.parentOffset === 0;
            
            if (isAtStart && !editor?.isActive('listItem')) {
              const currentNode = $from.parent;
              if ((currentNode.type.name === 'paragraph' || currentNode.type.name === 'heading') && currentNode.attrs.textIndent) {
                // Remove the textIndent instead of default backspace behavior
                editor?.chain().focus().unsetTextIndent().run();
                return true;
              }
            }
          }
          
          return false;
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
      // Ghost mode methods
      getCurrentParagraphText: () => {
        if (!editor) return '';
        const { state } = editor;
        const { selection } = state;
        const $from = selection.$from;
        return $from.parent.textContent;
      },
      deleteCurrentParagraph: () => {
        if (!editor) return;
        const { state } = editor;
        const { selection } = state;
        const $from = selection.$from;
        const blockStart = $from.start();
        const blockEnd = $from.end();
        editor.chain()
          .focus()
          .setTextSelection({ from: blockStart, to: blockEnd })
          .deleteSelection()
          .run();
      },
      getSelectedTextOrParagraph: () => {
        if (!editor) return '';
        const { state } = editor;
        const { selection } = state;
        const { from, to, empty } = selection;
        
        if (!empty) {
          // Has selection - return selected text
          return state.doc.textBetween(from, to, ' ');
        } else {
          // No selection - return current paragraph
          const $from = selection.$from;
          return $from.parent.textContent;
        }
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

