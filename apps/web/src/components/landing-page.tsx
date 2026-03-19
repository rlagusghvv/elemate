import Link from "next/link";

import { ElephantMascot } from "@/components/elephant-mascot";
import {
  BRAND_CATEGORY,
  BRAND_DESCRIPTION,
  BRAND_DOWNLOAD_URL,
  BRAND_MAC_SUPPORT,
  BRAND_NAME,
  BRAND_RELEASES_URL,
  BRAND_TAGLINE,
  BRAND_WINDOWS_SUPPORT,
} from "@/lib/brand";

const trustPoints = [
  {
    title: "내 장비에서 실행",
    body: "파일 정리, 브라우저 작업, 명령 실행은 공용 서버가 아니라 내 컴퓨터에서 돌아갑니다.",
  },
  {
    title: "휴대폰에서 바로 연결",
    body: "휴대폰에도 Tailscale 앱만 설치하고 같은 계정으로 로그인하면 내 장비 링크가 열립니다.",
  },
  {
    title: "위험한 일은 확인 후",
    body: "삭제, 제출, 배포처럼 위험한 단계만 멈춰서 확인을 요청합니다.",
  },
];

const installSteps = [
  "Mac 또는 Windows용 EleMate를 다운로드합니다.",
  "앱을 열고 OpenAI API 키나 ChatGPT 연결 중 하나만 끝냅니다.",
  "작업할 폴더 하나를 고르고, 휴대폰과 같은 Tailscale 계정으로 로그인합니다.",
  "그 다음부터는 휴대폰 링크에서 내 장비에게 바로 말을 겁니다.",
];

const useCases = [
  "문서 초안 정리",
  "파일 수정 맡기기",
  "사이트 조사",
  "반복 작업 시키기",
];

export function LandingPage() {
  return (
    <div className="space-y-8 pb-10 sm:space-y-10">
      <section id="overview" className="panel overflow-hidden px-6 py-8 sm:px-10 sm:py-12">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center">
          <div>
            <p className="eyebrow">{BRAND_CATEGORY}</p>
            <h1 className="ui-title-hero mt-4 max-w-4xl">
              {BRAND_TAGLINE}
            </h1>
            <p className="ui-copy-lg mt-5 max-w-2xl">
              {BRAND_NAME}는 클라우드 작업실이 아니라 내 컴퓨터 안에 놓는 개인 에이전트입니다. Mac이나 Windows에 설치하고, 내 폴더를 연결하고,
              휴대폰에서 비서처럼 말을 거는 흐름에 맞춰 설계했습니다.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href={BRAND_DOWNLOAD_URL} className="ui-button-primary">
                Mac / Windows 다운로드
              </Link>
              <a href={BRAND_RELEASES_URL} className="ui-button-secondary">
                릴리스 노트
              </a>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="ui-chip">{BRAND_MAC_SUPPORT}</span>
              <span className="ui-chip">{BRAND_WINDOWS_SUPPORT}</span>
              <span className="ui-chip">Pro 없이 API 키로 시작 가능</span>
              <span className="ui-chip">개인 장비 전용</span>
            </div>
            <p className="ui-copy-sm mt-4">
              공개 랜딩은 제품 소개와 다운로드용입니다. 실제 콘솔은 설치된 컴퓨터 안에서만 열리고, 휴대폰은 개인 링크로 접속합니다.
            </p>
            <p className="ui-copy-sm mt-3">
              공식 설치본에는 로컬 화면과 엔진이 함께 들어 있습니다. OpenAI API 키만 있으면 바로 시작할 수 있고, 휴대폰 연결은 Tailscale 로그인만
              끝내면 됩니다.
            </p>
            <div className="mt-6">
              <Link href="/app" className="ui-button-tertiary">
                설치된 장비에서 열기
              </Link>
            </div>
          </div>

          <div className="mx-auto w-full max-w-[380px]">
            <ElephantMascot className="w-full" caption={BRAND_DESCRIPTION} />
          </div>
        </div>
      </section>

      <section className="panel px-6 py-8 text-center sm:px-10 sm:py-12">
        <p className="eyebrow">Why It Feels Simple</p>
        <h2 className="ui-title-main mx-auto mt-4 max-w-4xl">
          복잡한 건 숨기고,
          <br />
          사용자는 말만 하게.
        </h2>
        <p className="ui-copy mt-5 mx-auto max-w-2xl">
          비전공자 기준에서는 모델 이름이나 런타임보다 결과가 먼저 보여야 합니다. EleMate는 설치, 연결, 승인, 링크 복사만 남기고 나머지는 뒤로
          숨기는 쪽으로 설계합니다.
        </p>
        <div className="mt-8 grid gap-4 text-left lg:grid-cols-3">
          {trustPoints.map((item) => (
            <article key={item.title} className="ui-card">
              <p className="ui-title-card">{item.title}</p>
              <p className="ui-copy-sm mt-3">{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="install" className="space-y-5">
        <section className="panel px-6 py-8 sm:px-10 sm:py-10">
          <div className="grid gap-8 xl:grid-cols-[320px_minmax(0,1fr)] xl:items-start">
            <div>
              <p className="eyebrow">Ask Like This</p>
              <h2 className="ui-title-section mt-4 max-w-sm">
                말투는
                <br />
                사람한테 시키듯.
              </h2>
              <p className="ui-copy-sm mt-4 max-w-sm">
                기술 용어를 몰라도 됩니다. 평소 말투로 시키면 EleMate가 파일 읽기, 웹 조사, 초안 만들기 같은 실제 작업으로 바꿔 이어갑니다.
              </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {useCases.map((item) => (
                  <div key={item} className="soft-card flex min-h-[92px] items-center rounded-[24px] bg-white/[0.03] px-5 py-4 text-sm font-medium tracking-[-0.016em] text-ink">
                    {item}
                  </div>
                ))}
              </div>

              <div className="rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] px-5 py-5">
                <p className="text-[12px] font-semibold tracking-[0.14em] text-steel">PUBLIC LANDING</p>
                <p className="ui-copy-sm mt-3">
                  이 페이지는 제품 소개와 다운로드용입니다. 실제 작업은 설치된 장비에서 돌아가고, 휴대폰은 Tailscale로 연결된 개인 링크로 접속합니다.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="panel px-6 py-8 sm:px-10 sm:py-10">
          <p className="eyebrow">Download</p>
          <h2 className="ui-title-main mt-4 max-w-3xl">
            다운로드 후엔
            <br />
            세 단계면 충분합니다.
          </h2>
          <div className="mt-8 grid gap-4 lg:grid-cols-4">
            {installSteps.map((step, index) => (
              <article key={step} className="ui-card">
                <p className="eyebrow">{String(index + 1).padStart(2, "0")}</p>
                <p className="ui-copy mt-4">{step}</p>
              </article>
            ))}
          </div>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href={BRAND_DOWNLOAD_URL} className="ui-button-primary">
              다운로드 페이지 열기
            </Link>
            <a href={BRAND_RELEASES_URL} className="ui-button-secondary">
              모든 릴리스 보기
            </a>
          </div>
          <p className="ui-copy-sm mt-4 max-w-2xl">
            휴대폰에는 Tailscale 앱을 설치하고, 컴퓨터와 같은 계정으로 로그인하면 됩니다. 자동 감지가 안 되면 EleMate가 기기 주소를 어디서 찾는지
            바로 안내합니다.
          </p>
        </section>
      </section>

      <section className="panel overflow-hidden px-6 py-8 sm:px-10 sm:py-12">
        <div className="grid gap-8 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-center">
          <div className="mx-auto w-full max-w-[260px]">
            <ElephantMascot className="w-full" caption="내 장비, 내 계정, 내 링크" />
          </div>
          <div>
            <p className="eyebrow">For Non-Technical Users</p>
            <h2 className="ui-title-main mt-4 max-w-3xl">
              서버를 운영하는 느낌이 아니라,
              <br />
              내 컴퓨터를 비서처럼 쓰는 느낌으로.
            </h2>
            <p className="ui-copy mt-5 max-w-2xl">
              목표는 개발자를 위한 콘솔이 아니라, 컴퓨터를 잘 모르는 사람도 “설치하고, API 키 넣고, 휴대폰으로 말 걸기”만 이해하면 되는 제품입니다.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="#install" className="ui-button-primary">
                설치 시작
              </Link>
              <Link href="/app" className="ui-button-secondary">
                로컬 콘솔 열기
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
