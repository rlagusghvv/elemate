import Link from "next/link";

import { ElephantMascot } from "@/components/elephant-mascot";
import {
  BRAND_DESCRIPTION,
  BRAND_DOWNLOAD_ARM_URL,
  BRAND_DOWNLOAD_INTEL_URL,
  BRAND_MAC_SUPPORT,
  BRAND_NAME,
  BRAND_RELEASES_URL,
  BRAND_WINDOWS_SUPPORT,
} from "@/lib/brand";

const downloadCards = [
  {
    title: "Apple Silicon",
    chip: "M1, M2, M3, M4",
    href: BRAND_DOWNLOAD_ARM_URL,
    detail: "대부분의 최신 Mac은 이 버전을 쓰면 됩니다.",
    action: "DMG 다운로드",
  },
  {
    title: "Intel Mac",
    chip: "Intel",
    href: BRAND_DOWNLOAD_INTEL_URL,
    detail: "구형 Intel Mac을 쓰는 경우 이 버전을 고릅니다.",
    action: "DMG 다운로드",
  },
  {
    title: "Windows",
    chip: "Preview",
    href: BRAND_RELEASES_URL,
    detail: "Windows용 런타임과 빌드 경로는 준비됐고, 공개 설치본은 다음 릴리스에서 바로 내려받을 수 있게 정리 중입니다.",
    action: "릴리스 보기",
  },
];

const steps = [
  "다운로드한 EleMate를 설치하고 바로 엽니다.",
  "OpenAI API 키를 넣거나 ChatGPT 연결을 끝냅니다.",
  "작업할 폴더와 휴대폰 연결만 마칩니다.",
  "그 뒤엔 휴대폰 링크에서 주로 대화합니다.",
];

export function DownloadPage() {
  return (
    <div className="space-y-8 pb-10 sm:space-y-10">
      <section className="panel overflow-hidden px-6 py-8 sm:px-10 sm:py-12">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-center">
          <div>
            <p className="eyebrow">Download</p>
            <h1 className="ui-title-main mt-4 max-w-4xl">
              설치는 다운로드로 끝내고,
              <br />
              터미널은 숨깁니다.
            </h1>
            <p className="ui-copy mt-5 max-w-2xl">
              {BRAND_NAME}는 비개발자를 위한 설치형 개인 에이전트 앱입니다. 우선 Mac 설치본을 바로 내려받을 수 있고, Windows는 공개 프리뷰 직전
              단계까지 정리돼 있습니다. API 키나 ChatGPT 연결을 끝낸 뒤,
              휴대폰에서 내 장비에게 말 거는 방식으로 씁니다.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <span className="ui-chip">{BRAND_MAC_SUPPORT}</span>
              <span className="ui-chip">{BRAND_WINDOWS_SUPPORT}</span>
              <span className="ui-chip">Pro 없이 API 키로 시작 가능</span>
              <span className="ui-chip">내 장비에서 실행</span>
            </div>
            <p className="ui-copy-sm mt-4 max-w-2xl">
              공식 설치본에는 로컬 화면과 엔진이 함께 들어 있습니다. 휴대폰 연결에는 Tailscale이 필요하고, EleMate가 설치와 로그인 안내를 바로
              보여줍니다.
            </p>
          </div>

          <div className="mx-auto w-full max-w-[320px]">
            <ElephantMascot className="w-full" caption={BRAND_DESCRIPTION} />
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {downloadCards.map((card) => (
          <section key={card.title} className="panel px-6 py-6 sm:px-8">
            <p className="eyebrow">{card.chip}</p>
            <h2 className="ui-title-card mt-3">{card.title}용 다운로드</h2>
            <p className="ui-copy-sm mt-3">{card.detail}</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <a href={card.href} className="ui-button-primary">
                {card.action}
              </a>
              <a href={BRAND_RELEASES_URL} className="ui-button-secondary">
                릴리스 노트
              </a>
            </div>
          </section>
        ))}
      </section>

      <section className="panel px-6 py-8 sm:px-10 sm:py-10">
        <p className="eyebrow">After Download</p>
        <h2 className="ui-title-main mt-4 max-w-3xl">
          설치 후에는
          <br />
          세 가지만 하면 됩니다.
        </h2>
        <div className="mt-8 grid gap-4 lg:grid-cols-4">
          {steps.map((step, index) => (
            <article key={step} className="ui-card">
              <p className="eyebrow">{String(index + 1).padStart(2, "0")}</p>
              <p className="ui-copy mt-4">{step}</p>
            </article>
          ))}
        </div>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="/" className="ui-button-secondary">
            제품 소개로 돌아가기
          </Link>
          <Link href="/app" className="ui-button-tertiary">
            설치된 장비에서 열기
          </Link>
        </div>
        <p className="ui-copy-sm mt-4 max-w-2xl">
          휴대폰에도 Tailscale 앱을 설치하고 같은 계정으로 로그인해야 합니다. 자동 연결이 안 되면 EleMate가 Tailscale에서 기기 주소를 어디서
          찾는지 단계별로 보여줍니다.
        </p>
      </section>
    </div>
  );
}
