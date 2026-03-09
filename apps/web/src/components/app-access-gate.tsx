import Link from "next/link";

import { ElephantMascot } from "@/components/elephant-mascot";
import { BRAND_DOWNLOAD_URL, BRAND_NAME } from "@/lib/brand";

interface AppAccessGateProps {
  requestHost?: string | null;
}

export function AppAccessGate({ requestHost }: AppAccessGateProps) {
  return (
    <section className="panel overflow-hidden px-6 py-8 sm:px-8 sm:py-10">
      <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <p className="eyebrow">Local App Only</p>
          <h1 className="ui-title-main mt-4 max-w-3xl">
            이 화면은
            <br />
            설치된 컴퓨터에서만 열립니다.
          </h1>
          <p className="ui-copy mt-5 max-w-2xl">
            공개 도메인은 제품 소개용입니다. 실제 {BRAND_NAME} 콘솔은 설치된 장비에서 `localhost`로 열고, 휴대폰에서는 각자 받은 개인 링크로
            접속하는 구조입니다.
          </p>
          {requestHost ? (
            <p className="ui-copy-sm mt-4">
              현재 접속 호스트: <span className="text-ink">{requestHost}</span>
            </p>
          ) : null}
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href={BRAND_DOWNLOAD_URL} className="ui-button-primary">
              Mac용 다운로드
            </Link>
            <Link href="/" className="ui-button-secondary">
              제품 소개 보기
            </Link>
          </div>
        </div>

        <div className="mx-auto w-full max-w-[320px]">
          <ElephantMascot caption="설치된 장비에서만 EleMate 콘솔이 열립니다." />
        </div>
      </div>
    </section>
  );
}
