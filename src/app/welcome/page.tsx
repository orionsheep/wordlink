import LandingPage from '@/components/welcome/LandingPage';

// 兼容旧链接:middleware 会把 /welcome 重定向到 /,
// 此文件仅作为兜底(直接访问时渲染同一套 Landing Page)。
export default function WelcomePage() {
    return <LandingPage />;
}
