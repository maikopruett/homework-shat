/**
 * APA Format (7th Edition) Template
 * Academic essay format for American Psychological Association style
 */

import type { EssayTemplate } from '../builder';

export const APA_TEMPLATE: EssayTemplate = {
  id: 'preset-apa',
  name: 'APA Format (7th Edition)',
  type: 'preset',
  htmlContent: `<p style="text-align: center"><span style="font-family: Times New Roman"><span style="font-size: 12pt"><strong>Title of Your Paper</strong></span></span></p>
<p style="text-align: center"><span style="font-family: Times New Roman"><span style="font-size: 12pt">[Your Name]</span></span></p>
<p style="text-align: center"><span style="font-family: Times New Roman"><span style="font-size: 12pt">[Department], [Institution Name]</span></span></p>
<p style="text-align: center"><span style="font-family: Times New Roman"><span style="font-size: 12pt">[Course Number]: [Class Name]</span></span></p>
<p style="text-align: center"><span style="font-family: Times New Roman"><span style="font-size: 12pt">[Professor's Name]</span></span></p>
<p style="text-align: center"><span style="font-family: Times New Roman"><span style="font-size: 12pt">[Current Date]</span></span></p>
<p><span style="font-family: Times New Roman"><span style="font-size: 12pt"></span></span></p>
<p style="text-indent: 0.5in"><span style="font-family: Times New Roman"><span style="font-size: 12pt">This is the first paragraph of your essay. In APA format, the first line of each paragraph should be indented 0.5 inches. The entire paper should be double-spaced and use Times New Roman 12-point font. Do not add extra space between paragraphs.</span></span></p>
<p style="text-indent: 0.5in"><span style="font-family: Times New Roman"><span style="font-size: 12pt">Continue your essay with additional paragraphs. Each paragraph should develop a specific point and flow logically from one to the next. Remember to cite your sources using in-text citations like (Author, Year) or Author (Year) stated that...</span></span></p>
<p style="text-align: center"><span style="font-family: Times New Roman"><span style="font-size: 12pt"><strong>References</strong></span></span></p>
<p style="text-indent: -0.5in; padding-left: 0.5in"><span style="font-family: Times New Roman"><span style="font-size: 12pt">Author, A. A. (Year). Title of article. <em>Journal Name, Volume</em>(Issue), Page range. https://doi.org/xxxxx</span></span></p>
<p style="text-indent: -0.5in; padding-left: 0.5in"><span style="font-family: Times New Roman"><span style="font-size: 12pt">Author, B. B., & Author, C. C. (Year). <em>Title of book</em>. Publisher.</span></span></p>`,
  formattingInstructions: `## APA FORMAT (7th Edition) TEMPLATE INSTRUCTIONS:

### DOCUMENT STRUCTURE (in order):
1. TITLE - Centered, Bold, Times New Roman 12pt
2. AUTHOR NAME - Centered, Times New Roman 12pt (use [Your Name] if unknown)
3. DEPARTMENT AND INSTITUTION - Centered, Times New Roman 12pt (use [Department], [Institution Name] if unknown)
4. COURSE INFO - Centered, Times New Roman 12pt (use [Course Number]: [Class Name] if unknown)
5. INSTRUCTOR NAME - Centered, Times New Roman 12pt (use [Professor's Name] if unknown)
6. DATE - Centered, Times New Roman 12pt (ALWAYS use current date from system context)
7. BLANK LINE
8. BODY PARAGRAPHS - First-line indent 0.5in, Times New Roman 12pt
9. REFERENCES HEADING - Centered, Bold, Times New Roman 12pt
10. REFERENCE ENTRIES - Hanging indent (first line flush left, subsequent lines indented)

### PERSONAL INFO RULES:
- NEVER make up names, professors, courses, or institutions
- Use placeholders if info not provided: [Your Name], [Professor's Name], [Class Name], [Institution Name]
- ALWAYS use the current date provided in system context for the date field

### FORMATTING RULES:
- Font: Times New Roman, 12pt throughout
- Title: Centered, Bold
- All header info (name, institution, etc.): Centered, NOT bold
- Body paragraphs: Left-aligned with 0.5 inch first-line indent
- References heading: Centered, Bold
- Reference entries: Hanging indent (reverse indent)
- In-text citations: (Author, Year) format

### REQUIRED TOOL CALLS (in order):
1. format_text with fontFamily="Times New Roman" and target="all"
2. format_text with fontSize="12pt" and target="all"
3. format_text with format_type="align", value="center", and target=THE EXACT TITLE TEXT YOU WROTE
   CRITICAL: Use the actual title text from the document, NOT a placeholder
   Example: If you wrote "Effects of Social Media on Mental Health", use that exact text as target
4. format_text with format_type="bold" and target=THE EXACT TITLE TEXT (same as step 3)
5. Center the header lines (author, institution, course, instructor, date) - each needs its own format_text call with the exact text
6. indent_body_paragraphs with indent_value="0.5in" and skip_lines=7
7. format_text with format_type="align", value="center", and target="References"
   CRITICAL: Use exactly "References" - must match exactly (case-sensitive)
8. format_text with format_type="bold" and target="References"`,
  createdAt: 0,
};
