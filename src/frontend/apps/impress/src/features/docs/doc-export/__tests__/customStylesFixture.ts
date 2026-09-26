export const styledBlocks = [
  {
    id: 'p1',
    type: 'paragraph',
    props: {
      backgroundColor: 'default',
      textColor: 'default',
      textAlignment: 'left',
    },
    content: [
      {
        type: 'text',
        text: 'E=mc',
        styles: { fontFamily: 'Liberation Serif', fontSize: '14pt' },
      },
      { type: 'text', text: '2', styles: { superscript: true } },
      { type: 'text', text: ' H', styles: {} },
      { type: 'text', text: '2', styles: { subscript: true } },
      { type: 'text', text: 'O', styles: {} },
    ],
    children: [],
  },
] as never;
