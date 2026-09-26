import Head from 'next/head';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { SpreadsheetList } from '@/features/cells';
import { HeaderFloatingBar } from '@/features/header/components/HeaderFloatingBar';
import { MainLayout } from '@/layouts';
import { NextPageWithLayout } from '@/types/next';

const Page: NextPageWithLayout = () => {
  const { t } = useTranslation();
  return (
    <>
      <Head>
        <title>{`${t('Spreadsheets')} - KherveDOC`}</title>
      </Head>
      <HeaderFloatingBar />
      <SpreadsheetList />
    </>
  );
};

Page.getLayout = function getLayout(page: ReactElement) {
  return <MainLayout>{page}</MainLayout>;
};

export default Page;
