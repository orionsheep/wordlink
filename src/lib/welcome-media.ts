/**
 * Welcome(Landing)页媒体素材统一配置。
 *
 * 当前使用 **RECREATION PROMPT 模板自带的视频素材**(CloudFront CDN)作为临时占位,
 * 正式素材到位后直接替换 URL 即可,组件无需改动。
 * 若置为空字符串 '',页面会自动渲染 liquid-glass 占位面板。
 * 各素材位的具体规格见 docs/媒体素材需求文档.md。
 */

/** 提示词模板自带素材(临时使用) */
const TEMPLATE_ASSETS = {
  heroBackground:
    'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260405_074625_a81f018a-956b-43fb-9aee-4d1508e30e6a.mp4',
  featured:
    'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260402_054547_9875cfc5-155a-4229-8ec8-b7ba7125cbf8.mp4',
  philosophy:
    'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260307_083826_e938b29f-a43a-41ec-a153-3d4730578ab8.mp4',
  serviceCard1:
    'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260314_131748_f2ca2a28-fed7-44c8-b9a9-bd9acdd5ec31.mp4',
  serviceCard2:
    'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260324_151826_c7218672-6e92-402c-9e45-f1e0f454bdc4.mp4',
};

export const MEDIA = {
  /** Section 1 — Hero 全屏背景视频(带淡入淡出无缝循环逻辑,勿设 loop 属性) */
  heroBackgroundVideo: TEMPLATE_ASSETS.heroBackground,

  /** Section 3 — Featured Video 区块主视频(16:9 大幅展示窗) */
  featuredVideo: TEMPLATE_ASSETS.featured,

  /** Section 4 — Philosophy 左侧视频(4:3) */
  philosophyVideo: TEMPLATE_ASSETS.philosophy,

  /** Section 5 — Services 两张卡片顶部视频(16:9) */
  servicesCardVideos: [TEMPLATE_ASSETS.serviceCard1, TEMPLATE_ASSETS.serviceCard2],
} as const;
