let segmenter: Intl.Segmenter | undefined;

function getGraphemes(value: string): string[] {
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    segmenter ??= new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    return Array.from(segmenter.segment(value), (item) => item.segment);
  }

  return Array.from(value);
}

export function reverseString(input: string): string {
  return getGraphemes(input).reverse().join('');
}
