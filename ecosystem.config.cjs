module.exports = {
  apps: [
    {
      name: 'ch32v003-journey',
      port: '4365',
      exec_mode: 'cluster',
      instances: '1',
      script: '.output/server/index.mjs'
    }
  ]
}
