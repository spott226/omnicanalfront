import type { Metadata } from "next";
import NexoApp from "./NexoApp";

export const metadata: Metadata = {
  title: "next.io by Mercadia — AI customer ops",
  description: "Bandeja omnicanal y automatización comercial con inteligencia artificial.",
};

export default function Home() {
  return <NexoApp />;
}
