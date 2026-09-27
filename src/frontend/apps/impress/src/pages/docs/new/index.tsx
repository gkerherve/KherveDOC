import { captureException } from '@sentry/nextjs';
import Head from 'next/head';
import { useSearchParams } from 'next/navigation';
import { useRouter } from 'next/router';
import { ReactElement, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { Loading } from '@/components';
import { LOGIN_URL, setAuthUrl, useAuth } from '@/features/auth';
import {
  LinkReach,
  LinkRole,
  useCreateDoc,
} from '@/features/docs/doc-management';
import { useUpdateDocLink } from '@/features/docs/doc-share/api/useUpdateDocLink';
import { useSkeletonStore } from '@/features/skeletons';
import { MainLayout } from '@/layouts';
import { NextPageWithLayout } from '@/types/next';

const Page: NextPageWithLayout = () => {
  const { t } = useTranslation();
  const { setIsSkeletonVisible } = useSkeletonStore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const linkReach = searchParams.get('link-reach');
  const linkRole = searchParams.get('link-role');
  const title = searchParams.get('title');
  const kindParam = searchParams.get('kind');
  const kind =
    kindParam === 'sheet' ||
    kindParam === 'slide' ||
    kindParam === 'note' ||
    kindParam === 'chat' ||
    kindParam === 'meet' ||
    kindParam === 'folder'
      ? kindParam
      : undefined;
  const { authenticated } = useAuth();

  const { mutateAsync: createDocAsync, data: doc } = useCreateDoc();

  const { mutateAsync: updateDocLinkAsync } = useUpdateDocLink();

  const redirectToDoc = useCallback(
    (docId: string) => {
      // Replaces this page: going Back must not create another one.
      void router.replace(`/docs/${docId}`);
    },
    [router],
  );

  useEffect(() => {
    setIsSkeletonVisible(true);
  }, [setIsSkeletonVisible]);

  useEffect(() => {
    if (doc) {
      return;
    }
    if (!authenticated) {
      setAuthUrl();
      window.location.replace(LOGIN_URL);
      return;
    }

    createDocAsync({
      // A folder is named from the start, as in the Finder.
      title: title || (kind === 'folder' ? t('New folder') : undefined),
      kind,
    })
      .then((createdDoc) => {
        if ((linkReach && linkRole) || linkReach) {
          updateDocLinkAsync({
            id: createdDoc.id,
            link_reach: linkReach as LinkReach,
            link_role: (linkRole as LinkRole | undefined) || undefined,
          })
            .catch((error) => {
              captureException(error, {
                extra: {
                  docId: createdDoc.id,
                  linkReach,
                  linkRole,
                },
              });
            })
            .finally(() => {
              redirectToDoc(createdDoc.id);
            });

          return;
        }

        redirectToDoc(createdDoc.id);
      })
      .catch((error) => {
        captureException(error, {
          extra: {
            title,
          },
        });
      });
  }, [
    kind,
    t,
    authenticated,
    createDocAsync,
    doc,
    linkReach,
    linkRole,
    redirectToDoc,
    title,
    updateDocLinkAsync,
  ]);

  return (
    <>
      <Head>
        <title>{`${t('New document')} - ${t('Docs')}`}</title>
        <meta
          property="og:title"
          content={`${t('New document')} - ${t('Docs')}`}
          key="title"
        />
      </Head>
      <Loading />
    </>
  );
};

Page.getLayout = function getLayout(page: ReactElement) {
  return (
    <>
      <Head>
        <meta name="robots" content="noindex" />
      </Head>

      <MainLayout enableResizablePanel={false}>{page}</MainLayout>
    </>
  );
};

export default Page;
