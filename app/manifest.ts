import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Wild Atlantic Bootcamp",
    short_name: "Bootcamp",
    description: "Premium fitness bootcamp platform",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f7fbff",
    theme_color: "#071120",
    orientation: "portrait",
    icons: [
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
