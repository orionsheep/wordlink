const withNextIntl = require('next-intl/plugin')('./src/i18n/request.ts');

// 大体积静态资源（视频/图片/字体）一天缓存 + 后台回源校验。
// public/ 默认 max-age=0，浏览器每次访问都要向 Node 发条件请求。
const ASSET_CACHE = 'public, max-age=86400, stale-while-revalidate=604800';

/** @type {import('next').NextConfig} */
const nextConfig = {
    typescript: {
        ignoreBuildErrors: false,
    },
    async headers() {
        return [
            { source: '/videos/:path*', headers: [{ key: 'Cache-Control', value: ASSET_CACHE }] },
            { source: '/images/:path*', headers: [{ key: 'Cache-Control', value: ASSET_CACHE }] },
            { source: '/ambient/:path*', headers: [{ key: 'Cache-Control', value: ASSET_CACHE }] },
            { source: '/fonts/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
            { source: '/templates/:path*', headers: [{ key: 'Cache-Control', value: ASSET_CACHE }] },
        ];
    },
    webpack: (config) => {
        // Exclude scripts directory from webpack compilation
        config.externals = config.externals || [];
        config.externals.push({
            './scripts': 'commonjs ./scripts'
        });
        return config;
    }
};

module.exports = withNextIntl(nextConfig);
