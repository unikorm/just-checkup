// @ts-check
/**
 * Hand a generated file to the user: a normal download. (On iPhone, an .ics
 * download opens the "Add to Calendar" sheet.)
 * @param {string} filename
 * @param {string} content
 * @param {string} type MIME type
 */
export function downloadFile(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
