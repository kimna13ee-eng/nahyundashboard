import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "나의 플래너",
    short_name: "나의 플래너",
    lang: "ko",
    description: "콘텐츠와 요가를 위한 개인 플래너",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#FFF8F1",
    theme_color: "#FFF8F1",
    icons: [192, 512].map((size) => ({
      src: `/icons/my-ops-${size}.png`,
      sizes: `${size}x${size}`,
      type: "image/png",
      purpose: "any",
    })),
  };
}
