import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  // 개발 서버(npm run dev)를 같은 와이파이의 태블릿·폰에서 열어볼 수 있게 허용 — 배포본에는 영향 없음
  allowedDevOrigins: ['172.30.1.78', '172.30.*.*', '192.168.*.*', '10.*.*.*'],
};

export default nextConfig;
