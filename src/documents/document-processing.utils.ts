const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;

const reControlChars = new RegExp(
  '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', // eslint-disable-line no-control-regex
  'g',
);

export function cleanText(text: string): string {
  return text
    .replace(reControlChars, '')
    .replace(/[\uFFFD\uD800-\uDFFF]/g, '')
    .replace(/[\uE000-\uF8FF]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/^ +$/gm, '')
    .trim();
}

export function chunkText(text: string): string[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n/g, ' ').trim())
    .filter((p) => p.length > 30);

  const chunks: string[] = [];
  let current = '';

  for (const paragraph of paragraphs) {
    if ((current + '\n\n' + paragraph).length <= CHUNK_SIZE) {
      current = current ? current + '\n\n' + paragraph : paragraph;
    } else {
      if (current) {
        chunks.push(current.trim());
      }

      if (paragraph.length > CHUNK_SIZE) {
        let start = 0;

        while (start < paragraph.length) {
          chunks.push(paragraph.slice(start, start + CHUNK_SIZE).trim());
          start += CHUNK_SIZE - CHUNK_OVERLAP;
        }
        current = '';
      } else {
        current = paragraph;
      }
    }
  }

  if (current) chunks.push(current.trim());
  return chunks;
}

export function isTextValid(text: string): boolean {
  const printable = text.replace(/\s/g, '');
  if (printable.length === 0) return false;
  const nonLatin = printable.split('').filter((c) => c.charCodeAt(0) > 300).length;
  return nonLatin / printable.length < 0.2;
}
