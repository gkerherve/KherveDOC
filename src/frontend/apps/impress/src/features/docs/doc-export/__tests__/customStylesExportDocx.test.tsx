import { describe, expect, it } from 'vitest';

import { docxDocsSchemaMappings } from '../mappingDocx';

// The DOCX exporter lazily imports a browser `buffer/` polyfill that vitest
// cannot resolve, so the run properties are checked at the mapping level.
describe('custom text styles in DOCX export', () => {
  const { styleMapping } = docxDocsSchemaMappings;
  const exporter = {} as never;

  it('maps font family and size (half-points)', () => {
    expect(styleMapping.fontFamily('Liberation Serif', exporter)).toEqual({
      font: 'Liberation Serif',
    });
    expect(styleMapping.fontSize('14pt', exporter)).toEqual({ size: 28 });
    expect(styleMapping.fontSize('10.5pt', exporter)).toEqual({ size: 21 });
    expect(styleMapping.fontSize('big', exporter)).toEqual({});
  });

  it('maps superscript and subscript', () => {
    expect(styleMapping.superscript(true, exporter)).toEqual({
      superScript: true,
    });
    expect(styleMapping.subscript(true, exporter)).toEqual({ subScript: true });
    expect(styleMapping.subscript(false, exporter)).toEqual({});
  });
});
