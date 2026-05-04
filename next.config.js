const withNextIntl = require('next-intl/plugin')('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
    /* config options here */
    typescript: {
        // Exclude scripts directory from type checking during build
        ignoreBuildErrors: false,
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
