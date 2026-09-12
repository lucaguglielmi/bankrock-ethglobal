import { redirect } from "next/navigation";

export default function DemoPage() {
  redirect("/rock/420?demo=true");
}
