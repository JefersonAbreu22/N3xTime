module.exports = {
  apps: [
    {
      name: "n3xtimemulti-api",
      cwd: "./backend",
      script: "dist/api/server.js",
      interpreter: "node",
      watch: false,
      windowsHide: true,
      out_file: "../.pm2-n3xtime-api.out.log",
      error_file: "../.pm2-n3xtime-api.error.log",
      merge_logs: true,
      env: {
        NODE_ENV: "production",
        PORT: 4989
      }
    },
    {
      name: "n3xtimemulti-web",
      cwd: "./frontend",
      script: "server.cjs",
      interpreter: "node",
      watch: false,
      windowsHide: true,
      out_file: "../.pm2-n3xtime-web.out.log",
      error_file: "../.pm2-n3xtime-web.error.log",
      merge_logs: true,
      env: {
        NODE_ENV: "production",
        HOST: "0.0.0.0",
        PORT: 4979
      }
    }
  ]
}
