module.exports = {
    apps: [
        {
            name: 'english-word-fission',
            script: 'npm',
            args: 'start',
            env: {
                NODE_ENV: 'production',
                PORT: 3011
            }
        }
    ]
}
