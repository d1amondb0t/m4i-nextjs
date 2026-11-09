import { notFound } from "next/navigation";

import { currentUser } from "@/app/server/auth/session";

export default async function DevLayout({ children }: LayoutProps<"/dev">) {
  if (!(await currentUser())?.isAdmin) notFound();
  return children;
}
