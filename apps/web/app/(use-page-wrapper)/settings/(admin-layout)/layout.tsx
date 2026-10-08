import { UserPermissionRole } from "@calcom/prisma/enums";
import SettingsLayoutAppDir from "../(settings-layout)/layout";
import type { AdminLayoutProps } from "./AdminLayoutAppDirClient";
import AdminLayoutAppDirClient from "./AdminLayoutAppDirClient";
import { requireSystemAdmin } from "./requireSystemAdmin";

type AdminLayoutAppDirProps = Omit<AdminLayoutProps, "userRole">;

export default async function AdminLayoutAppDir(props: AdminLayoutAppDirProps) {
  await requireSystemAdmin();

  return await SettingsLayoutAppDir({
    children: <AdminLayoutAppDirClient {...props} userRole={UserPermissionRole.ADMIN} />,
  });
}
