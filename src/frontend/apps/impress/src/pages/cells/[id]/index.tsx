import Head from 'next/head';
import { useRouter } from 'next/router';
import { type ReactElement, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { css } from 'styled-components';

import { Box, Text } from '@/components';
import { FloatingBar } from '@/components/FloatingBar';
import { DocLeftPanelCollapseButton } from '@/docs/doc-header/components/DocLeftPanelCollapseButton';
import {
  SpreadsheetFrame,
  SpreadsheetIcon,
  useSpreadsheets,
} from '@/features/cells';
import { MainLayout } from '@/layouts';
import { NextPageWithLayout } from '@/types/next';

const Page: NextPageWithLayout = () => {
  const { t } = useTranslation();
  const { query } = useRouter();
  const id = typeof query.id === 'string' ? query.id : undefined;
  const { data } = useSpreadsheets();
  const [liveTitle, setLiveTitle] = useState<string>();
  const sheet = data?.find(
    (candidate) => candidate.id === id || candidate.docId === id,
  );
  const name = liveTitle ?? sheet?.name ?? t('Spreadsheet');

  return (
    <>
      <Head>
        <title>{`${name} - KherveDOC`}</title>
      </Head>
      <Box
        $height="100%"
        $width="100%"
        $css={css`
          display: flex;
          flex-direction: column;
        `}
      >
        <FloatingBar>
          <DocLeftPanelCollapseButton />
          <Box
            $direction="row"
            $align="center"
            $gap="xs"
            $padding={{ horizontal: 'sm' }}
            $css="flex: 1; min-width: 0;"
          >
            <SpreadsheetIcon size={20} />
            <Text $weight="600" $size="md" $css="white-space: nowrap;">
              {name}
            </Text>
          </Box>
        </FloatingBar>
        {id && <SpreadsheetFrame id={id} onTitle={setLiveTitle} />}
      </Box>
    </>
  );
};

Page.getLayout = function getLayout(page: ReactElement) {
  return <MainLayout enableResizablePanel={true}>{page}</MainLayout>;
};

export default Page;
