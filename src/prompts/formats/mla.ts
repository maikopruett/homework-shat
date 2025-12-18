/**
 * MLA Format (9th Edition) Template
 * Academic essay format for Modern Language Association style
 */

import type { EssayTemplate } from '../builder';

export const MLA_TEMPLATE: EssayTemplate = {
  id: 'preset-mla',
  name: 'MLA Format (9th Edition)',
  type: 'preset',
  htmlContent: `<p><span style="font-family: Times New Roman"><span style="font-size: 12pt">[Your Name]</span></span></p>
<p><span style="font-family: Times New Roman"><span style="font-size: 12pt">[Professor's Name]</span></span></p>
<p><span style="font-family: Times New Roman"><span style="font-size: 12pt">[Class Name]</span></span></p>
<p><span style="font-family: Times New Roman"><span style="font-size: 12pt">[Current Date]</span></span></p>
<p style="text-align: center"><span style="font-family: Times New Roman"><span style="font-size: 12pt">Title of Your Essay</span></span></p>
<p style="text-indent: 0.5in"><span style="font-family: Times New Roman"><span style="font-size: 12pt">This is the first paragraph of your essay. In MLA format, the first line of each paragraph should be indented half an inch (0.5 inches). The entire paper should be double-spaced and use Times New Roman 12-point font. The title should be centered but not bold, italicized, or underlined.</span></span></p>
<p style="text-indent: 0.5in"><span style="font-family: Times New Roman"><span style="font-size: 12pt">Continue with your body paragraphs here. Each paragraph should make a clear point and support your thesis. When citing sources, use parenthetical citations with the author's last name and page number, like this (Smith 42). If you mention the author in the sentence, only include the page number: Smith argues that "quote here" (42).</span></span></p>
<p style="text-indent: 0.5in"><span style="font-family: Times New Roman"><span style="font-size: 12pt">Add more paragraphs as needed to develop your argument. Each paragraph should transition smoothly to the next and contribute to your overall thesis.</span></span></p>
<p style="text-align: center"><span style="font-family: Times New Roman"><span style="font-size: 12pt">Works Cited</span></span></p>
<p style="text-indent: -0.5in; padding-left: 0.5in"><span style="font-family: Times New Roman"><span style="font-size: 12pt">Last Name, First Name. "Title of Article." <em>Journal Name</em>, vol. #, no. #, Year, pp. #-#.</span></span></p>
<p style="text-indent: -0.5in; padding-left: 0.5in"><span style="font-family: Times New Roman"><span style="font-size: 12pt">Last Name, First Name. <em>Title of Book</em>. Publisher, Year.</span></span></p>`,
  formattingInstructions: `## MLA FORMAT (9th Edition) TEMPLATE INSTRUCTIONS:

### DOCUMENT STRUCTURE (in order):
1. YOUR NAME - Left-aligned, Times New Roman 12pt (use [Your Name] if unknown)
2. PROFESSOR'S NAME - Left-aligned, Times New Roman 12pt (use [Professor's Name] if unknown)
3. COURSE NAME - Left-aligned, Times New Roman 12pt (use [Class Name] if unknown)
4. DATE - Left-aligned, Times New Roman 12pt (ALWAYS use current date from system context, format: Day Month Year)
5. TITLE - Centered, Times New Roman 12pt, NOT bold/italic/underlined
6. BODY PARAGRAPHS - First-line indent 0.5in, Times New Roman 12pt
7. WORKS CITED HEADING - Centered, Times New Roman 12pt, NOT bold
8. WORKS CITED ENTRIES - Hanging indent (first line flush left, subsequent lines indented)

### PERSONAL INFO RULES:
- NEVER make up names, professors, or courses
- Use placeholders if info not provided: [Your Name], [Professor's Name], [Class Name]
- ALWAYS use the current date provided in system context for the date field

### FORMATTING RULES:
- Font: Times New Roman, 12pt throughout
- Header block (name, professor, course, date): Left-aligned, single info per line
- Title: Centered, NO bold, NO italics, NO underline
- Body paragraphs: Left-aligned with 0.5 inch first-line indent
- Works Cited heading: Centered, NOT bold (unlike APA)
- Works Cited entries: Hanging indent
- In-text citations: (Author Page) format, no comma
- NEVER use bold text

### REQUIRED TOOL CALLS (in order):
1. format_text with fontFamily="Times New Roman" and target="all"
2. format_text with fontSize="12pt" and target="all"
3. format_text with format_type="align", value="center", and target=THE EXACT TITLE TEXT YOU WROTE
   CRITICAL: Use the actual title text from the document, NOT a placeholder like "Title"
   Example: If you wrote "The Impact of Climate Change", use target="The Impact of Climate Change"
4. indent_body_paragraphs with indent_value="0.5in" and skip_lines=5
5. format_text with format_type="align", value="center", and target="Works Cited"
   CRITICAL: Use exactly "Works Cited" - this text must match exactly (case-sensitive)`,
  createdAt: 0,
};
