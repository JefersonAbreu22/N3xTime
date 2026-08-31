module.exports = {
  apps: [
    {
      name: "n3xtimemulti-api",
      cwd: "./apps/api",
      script: "dist/api/server.js",
      interpreter: "node",
      watch: false,
      windowsHide: true,
      out_file: "../../.pm2-n3xtime-api.out.log",
      error_file: "../../.pm2-n3xtime-api.error.log",
      merge_logs: true,
      env: {
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        PORT: 4989,
        APP_PUBLIC_URL: "https://www.n3xtime.com.br"
      }
    },
    {
      name: "n3xtimemulti-web",
      cwd: "./apps/web",
      script: "server.cjs",
      interpreter: "node",
      watch: false,
      windowsHide: true,
      out_file: "../../.pm2-n3xtime-web.out.log",
      error_file: "../../.pm2-n3xtime-web.error.log",
      merge_logs: true,
      env: {
        NODE_ENV: "production",
        HOST: "0.0.0.0",
        PORT: 4979,
        API_PROXY_TARGET: "http://127.0.0.1:4989"
      }
    }
  ]
}
