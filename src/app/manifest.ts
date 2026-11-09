import type { MetadataRoute } from "next";

/** Lets phones install the portal as an app (home-screen icon, full screen, shortcuts). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "NLUJA, Assam — Academic & Examination System",
    short_name: "NLUJA AEMS",
    description: "Attendance, examinations, results, certificates and support for students, parents and staff of NLUJA, Assam.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f8f6f3",
    theme_color: "#843f13",
    lang: "en-IN",
    categories: ["education"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "My attendance", url: "/me/attendance", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Exam registration", url: "/me/exams", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Results & grade sheets", url: "/me/results", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
