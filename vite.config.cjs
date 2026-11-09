const { defineConfig } = require("vite");

const backendTarget =
    process.env.API_PROXY_TARGET || "http://127.0.0.1:3000";

module.exports = defineConfig({
    server: {
        host: "127.0.0.1",
        port: 5173,
        strictPort: true,
        proxy: {
            "/api": {
                target: backendTarget,
                changeOrigin: true
            },
            "/uploads": {
                target: backendTarget,
                changeOrigin: true
            }
        }
    }
});
